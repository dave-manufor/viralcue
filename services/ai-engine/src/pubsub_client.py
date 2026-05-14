"""AI Engine - Pub/Sub client for consuming transcripts and publishing drafts."""

import json
import asyncio
from typing import Callable, Optional, List, Dict, Any

import structlog
from google.cloud import pubsub_v1
from google.cloud.pubsub_v1.subscriber.message import Message
from google.auth import credentials as auth_credentials
import google.auth
import os


from .config import Settings

logger = structlog.get_logger()


class PubSubClient:
    """Pub/Sub client wrapper for transcript consumption and draft publishing."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._subscriber: Optional[pubsub_v1.SubscriberClient] = None
        self._publisher: Optional[pubsub_v1.PublisherClient] = None
        self._streaming_pull_future = None
        self.running = False

    @property
    def subscriber(self) -> pubsub_v1.SubscriberClient:
        if self._subscriber is None:
            if os.getenv("PUBSUB_EMULATOR_HOST"):
                self._subscriber = pubsub_v1.SubscriberClient(
                    credentials=auth_credentials.AnonymousCredentials()
                )
            else:
                self._subscriber = pubsub_v1.SubscriberClient()
        return self._subscriber

    @property
    def publisher(self) -> pubsub_v1.PublisherClient:
        if self._publisher is None:
            publisher_options = pubsub_v1.types.PublisherOptions(enable_message_ordering=True)
            if os.getenv("PUBSUB_EMULATOR_HOST"):
                self._publisher = pubsub_v1.PublisherClient(
                    credentials=auth_credentials.AnonymousCredentials(),
                    publisher_options=publisher_options
                )
            else:
                self._publisher = pubsub_v1.PublisherClient(
                    publisher_options=publisher_options
                )
        return self._publisher

    def _subscription_path(self, subscription_name: str) -> str:
        return self.subscriber.subscription_path(
            self.settings.gcp_project_id,
            subscription_name
        )

    def _topic_path(self, topic_name: str) -> str:
        return self.publisher.topic_path(
            self.settings.gcp_project_id,
            topic_name
        )

    def receive_transcripts(
        self, 
        max_messages: int = 10,
        timeout: float = 5.0
    ) -> List[Dict[str, Any]]:
        """
        Receive transcript messages from Pub/Sub (synchronous pull).
        
        Args:
            max_messages: Maximum number of messages to receive
            timeout: Timeout in seconds
            
        Returns:
            List of messages with body and ack_id
        """
        subscription_path = self._subscription_path(self.settings.transcripts_subscription)
        
        try:
            response = self.subscriber.pull(
                request={
                    "subscription": subscription_path,
                    "max_messages": max_messages,
                },
                timeout=timeout,
            )
            
            messages = []
            for received_message in response.received_messages:
                try:
                    body = json.loads(received_message.message.data.decode("utf-8"))
                    messages.append({
                        "ack_id": received_message.ack_id,
                        "body": body,
                        "message_id": received_message.message.message_id,
                        "attributes": dict(received_message.message.attributes),
                    })
                except json.JSONDecodeError as e:
                    logger.warning("Failed to decode message", error=str(e))
                    # Ack invalid messages to prevent redelivery
                    self.acknowledge_message(received_message.ack_id)
            
            return messages
            
        except Exception as e:
            if "deadline exceeded" not in str(e).lower():
                logger.exception("Error receiving transcripts", error=str(e))
            return []

    def acknowledge_message(self, ack_id: str) -> None:
        """Acknowledge a processed message."""
        subscription_path = self._subscription_path(self.settings.transcripts_subscription)
        
        try:
            self.subscriber.acknowledge(
                request={
                    "subscription": subscription_path,
                    "ack_ids": [ack_id],
                }
            )
        except Exception as e:
            logger.exception("Error acknowledging message", error=str(e))

    def nack_message(self, ack_id: str) -> None:
        """Negative acknowledge a message (will be redelivered)."""
        subscription_path = self._subscription_path(self.settings.transcripts_subscription)
        
        try:
            self.subscriber.modify_ack_deadline(
                request={
                    "subscription": subscription_path,
                    "ack_ids": [ack_id],
                    "ack_deadline_seconds": 0,
                }
            )
        except Exception as e:
            logger.exception("Error nacking message", error=str(e))

    def publish_draft(self, user_id: str, stream_id: str, draft: dict) -> bool:
        """
        Publish a generated draft to the drafts topic.
        
        Args:
            user_id: The user ID
            stream_id: The stream ID
            draft: The draft data
            
        Returns:
            True if published successfully
        """
        topic_path = self._topic_path(self.settings.drafts_topic)
        
        try:
            message_data = json.dumps({
                "userId": user_id,
                "streamId": stream_id,
                "draft": draft,
            }).encode("utf-8")
            
            future = self.publisher.publish(
                topic_path,
                message_data,
                # Use stream_id as ordering key
                ordering_key=stream_id,
            )
            
            message_id = future.result()
            logger.info(
                "Published draft",
                message_id=message_id,
                user_id=user_id,
                draft_type=draft.get("draft_type"),
            )
            return True
            
        except Exception as e:
            logger.exception("Error publishing draft", error=str(e))
            return False

    async def publish_draft_async(
        self, 
        user_id: str, 
        stream_id: str, 
        draft: dict
    ) -> bool:
        """Async version of publish_draft."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.publish_draft(user_id, stream_id, draft)
        )

    def publish_viral_candidate(
        self,
        user_id: str,
        session_id: str,
        stream_id: str,
        channel_name: str,
        platform: str,
        timestamp_start: float,
        timestamp_end: float,
        viral_score: float,
        reason: str,
        caption: Optional[str] = None,
        hashtags: Optional[List[str]] = None,
    ) -> bool:
        """
        Publish a viral candidate to trigger clip fetching.
        
        Args:
            user_id: The user ID
            session_id: The streaming session ID
            stream_id: The stream ID
            channel_name: The channel name (for VOD lookup)
            platform: The streaming platform (TWITCH or KICK)
            timestamp_start: Start timestamp (Unix epoch)
            timestamp_end: End timestamp (Unix epoch)
            viral_score: Confidence score (0.0 - 1.0)
            reason: Reason for viral detection (Voice Command / High Content Score)
            caption: Optional caption/title for the clip
            hashtags: Optional list of hashtags
            
        Returns:
            True if published successfully
        """
        topic_path = self._topic_path("viralcue-viral-candidates")
        
        try:
            message_data = json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "streamId": stream_id,
                "channelName": channel_name,
                "platform": platform,
                "timestampStart": timestamp_start,
                "timestampEnd": timestamp_end,
                "viralScore": viral_score,
                "reason": reason,
                "caption": caption,
                "hashtags": hashtags or [],
            }).encode("utf-8")
            
            future = self.publisher.publish(
                topic_path,
                message_data,
                ordering_key=stream_id,
            )
            
            message_id = future.result()
            logger.info(
                "Published viral candidate from AI Engine",
                message_id=message_id,
                reason=reason,
                viral_score=viral_score,
            )
            return True
            
        except Exception as e:
            logger.exception("Error publishing viral candidate", error=str(e))
            return False

    def close(self) -> None:
        """Close the client connections."""
        if self._subscriber:
            self._subscriber.close()
        if self._publisher:
            self._publisher.transport.close()
