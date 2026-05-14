"""
HLS Fetcher - Pub/Sub client for publishing transcripts
"""
import os
import json
import asyncio
from typing import Optional

from google.cloud import pubsub_v1
from google.auth import credentials as auth_credentials
from .config import settings
from .logging_config import get_logger

logger = get_logger("hls_fetcher.pubsub")


class PubSubClient:
    """Pub/Sub client wrapper with emulator support."""

    def __init__(self):
        self.project_id = settings.gcp_project_id
        self._publisher: Optional[pubsub_v1.PublisherClient] = None
        
        is_emulator = bool(os.getenv("PUBSUB_EMULATOR_HOST"))
        env_type = "emulator" if is_emulator else "production"
        logger.info(f"[PubSub] Connecting to {env_type} (project: {self.project_id})")

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

    def _topic_path(self, topic_name: str) -> str:
        return self.publisher.topic_path(self.project_id, topic_name)

    def publish(
        self,
        topic_name: str,
        data: dict,
        ordering_key: Optional[str] = None,
    ) -> str:
        """Publish a message to a topic."""
        topic_path = self._topic_path(topic_name)
        message_bytes = json.dumps(data).encode("utf-8")
        
        kwargs = {"data": message_bytes}
        if ordering_key:
            kwargs["ordering_key"] = ordering_key
        
        future = self.publisher.publish(topic_path, **kwargs)
        message_id = future.result()
        
        return message_id

    async def publish_async(
        self,
        topic_name: str,
        data: dict,
        ordering_key: Optional[str] = None,
    ) -> str:
        """Publish a message asynchronously."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.publish(topic_name, data, ordering_key)
        )

    def close(self) -> None:
        """Close the publisher."""
        if self._publisher:
            self._publisher.transport.close()


# Singleton instance
_pubsub_client: Optional[PubSubClient] = None


def get_pubsub_client() -> PubSubClient:
    """Get the singleton Pub/Sub client."""
    global _pubsub_client
    if _pubsub_client is None:
        _pubsub_client = PubSubClient()
    return _pubsub_client


async def publish_transcript(
    user_id: str,
    session_id: str,
    stream_id: str,
    transcript: str,
    channel_name: str = "",
    platform: str = "TWITCH",  # Add platform parameter
    confidence: float = 1.0,
    timestamp: float = 0.0,
) -> bool:
    """
    Publish transcript to Pub/Sub topic for AI Engine.
    
    Args:
        user_id: The user ID
        session_id: The streaming session ID
        stream_id: The stream ID (used as ordering key)
        transcript: The transcript text
        channel_name: The channel name (for clip fetcher)
        platform: The streaming platform (TWITCH or KICK)
        confidence: STT confidence score
        timestamp: Unix epoch timestamp of when the audio was captured
        
    Returns:
        True if published successfully
    """
    try:
        client = get_pubsub_client()
        
        import time
        actual_timestamp = timestamp if timestamp > 0 else time.time()
        
        message_id = await client.publish_async(
            topic_name=settings.transcripts_topic,
            data={
                "userId": user_id,
                "sessionId": session_id,
                "streamId": stream_id,
                "channelName": channel_name,
                "platform": platform,
                "transcript": transcript,
                "confidence": confidence,
                "timestamp": actual_timestamp,
            },
            ordering_key=stream_id,
        )
        
        logger.info(f"[PubSub] Published transcript for session {session_id} (msg: {message_id})")
        return True
        
    except Exception as e:
        logger.error(f"[PubSub] Error publishing transcript: {e}")
        return False


async def publish_viral_candidate(
    user_id: str,
    session_id: str,
    stream_id: str,
    timestamp_start: float,
    timestamp_end: float,
    viral_score: float,
    reason: str,
) -> bool:
    """
    Publish a viral candidate to Pub/Sub for video fetching.
    
    Args:
        user_id: The user ID
        session_id: The streaming session ID
        stream_id: The stream ID
        timestamp_start: Start timestamp of the viral moment
        timestamp_end: End timestamp of the viral moment
        viral_score: Confidence score for virality
        reason: Reason for viral detection
        
    Returns:
        True if published successfully
    """
    try:
        client = get_pubsub_client()
        
        message_id = await client.publish_async(
            topic_name="viralcue-viral-candidates",
            data={
                "userId": user_id,
                "sessionId": session_id,
                "streamId": stream_id,
                "timestampStart": timestamp_start,
                "timestampEnd": timestamp_end,
                "viralScore": viral_score,
                "reason": reason,
            },
            ordering_key=stream_id,
        )
        
        logger.info(f"[PubSub] Published viral candidate for session {session_id}")
        return True
        
    except Exception as e:
        logger.error(f"[PubSub] Error publishing viral candidate: {e}")
        return False
