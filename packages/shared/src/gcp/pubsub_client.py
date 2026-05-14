"""
GCP Pub/Sub Client with Emulator Support

Automatically connects to emulator when PUBSUB_EMULATOR_HOST is set.
"""

import os
import json
import asyncio
from typing import Any, Callable, Optional, Dict, List
from dataclasses import dataclass
from concurrent.futures import TimeoutError

from google.cloud import pubsub_v1
from google.cloud.pubsub_v1.subscriber.message import Message
from google.auth import credentials as auth_credentials
import google.auth



@dataclass
class PubSubConfig:
    project_id: str = "viralcue-local"
    
    @classmethod
    def from_env(cls) -> "PubSubConfig":
        return cls(
            project_id=os.getenv("GCP_PROJECT_ID", "viralcue-local")
        )


# Topic names
class Topics:
    AUDIO_CHUNKS = "viralcue-audio-chunks"
    TRANSCRIPTS = "viralcue-transcripts"
    VIRAL_CANDIDATES = "viralcue-viral-candidates"
    CLIP_DOWNLOADED = "viralcue-clip-downloaded"
    DRAFTS = "viralcue-drafts"
    CARD_APPROVED = "viralcue-card-approved"
    AFFILIATE_TRIGGER = "viralcue-affiliate-trigger"
    # Dead letter topics
    AUDIO_CHUNKS_DLQ = "viralcue-audio-chunks-dlq"
    TRANSCRIPTS_DLQ = "viralcue-transcripts-dlq"
    VIRAL_CANDIDATES_DLQ = "viralcue-viral-candidates-dlq"


# Subscription names
class Subscriptions:
    AUDIO_PROCESSOR = "audio-processor-sub"
    AI_ENGINE = "ai-engine-sub"
    SNIPER = "sniper-sub"
    DIRECTOR = "director-sub"
    DASHBOARD = "dashboard-sub"
    PUBLISHER = "publisher-sub"
    AFFILIATE = "affiliate-sub"


class PubSubClient:
    """Pub/Sub client wrapper with emulator support."""
    
    def __init__(self, config: Optional[PubSubConfig] = None):
        self.config = config or PubSubConfig.from_env()
        self._publisher: Optional[pubsub_v1.PublisherClient] = None
        self._subscriber: Optional[pubsub_v1.SubscriberClient] = None
        
        emulator_host = os.getenv("PUBSUB_EMULATOR_HOST")
        self.is_emulator = bool(emulator_host)
        env_type = "emulator" if self.is_emulator else "production"
        print(f"[PubSub] Connecting to {env_type} (project: {self.config.project_id})")
    
    @property
    def publisher(self) -> pubsub_v1.PublisherClient:
        if self._publisher is None:
            if self.is_emulator:
                self._publisher = pubsub_v1.PublisherClient(
                    credentials=auth_credentials.AnonymousCredentials()
                )
            else:
                self._publisher = pubsub_v1.PublisherClient()
        return self._publisher
    
    @property
    def subscriber(self) -> pubsub_v1.SubscriberClient:
        if self._subscriber is None:
            if self.is_emulator:
                self._subscriber = pubsub_v1.SubscriberClient(
                    credentials=auth_credentials.AnonymousCredentials()
                )
            else:
                self._subscriber = pubsub_v1.SubscriberClient()
        return self._subscriber
    
    def topic_path(self, topic_name: str) -> str:
        return self.publisher.topic_path(self.config.project_id, topic_name)
    
    def subscription_path(self, subscription_name: str) -> str:
        return self.subscriber.subscription_path(self.config.project_id, subscription_name)
    
    def publish(
        self, 
        topic_name: str, 
        data: Dict[str, Any],
        ordering_key: Optional[str] = None,
        attributes: Optional[Dict[str, str]] = None
    ) -> str:
        """Publish a message to a topic."""
        topic_path = self.topic_path(topic_name)
        message_bytes = json.dumps(data).encode("utf-8")
        
        kwargs: Dict[str, Any] = {
            "data": message_bytes
        }
        if ordering_key:
            kwargs["ordering_key"] = ordering_key
        if attributes:
            kwargs["attributes"] = attributes
        
        future = self.publisher.publish(topic_path, **kwargs)
        message_id = future.result()
        
        return message_id
    
    async def publish_async(
        self, 
        topic_name: str, 
        data: Dict[str, Any],
        ordering_key: Optional[str] = None,
        attributes: Optional[Dict[str, str]] = None
    ) -> str:
        """Publish a message asynchronously."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            lambda: self.publish(topic_name, data, ordering_key, attributes)
        )
    
    def subscribe(
        self,
        subscription_name: str,
        callback: Callable[[Message, Any], None],
        auto_ack: bool = True,
        timeout: Optional[int] = None
    ) -> None:
        """Subscribe to a subscription and process messages."""
        subscription_path = self.subscription_path(subscription_name)
        
        def wrapped_callback(message: Message) -> None:
            try:
                data = json.loads(message.data.decode("utf-8"))
                callback(message, data)
                if auto_ack:
                    message.ack()
            except Exception as e:
                print(f"[PubSub] Error processing message {message.message_id}: {e}")
                message.nack()
        
        streaming_pull_future = self.subscriber.subscribe(
            subscription_path, 
            callback=wrapped_callback
        )
        
        print(f"[PubSub] Listening on subscription: {subscription_name}")
        
        try:
            if timeout:
                streaming_pull_future.result(timeout=timeout)
            else:
                streaming_pull_future.result()
        except TimeoutError:
            streaming_pull_future.cancel()
            streaming_pull_future.result()
        except KeyboardInterrupt:
            streaming_pull_future.cancel()
            streaming_pull_future.result()
    
    def close(self) -> None:
        """Close the client connections."""
        if self._publisher:
            self._publisher.transport.close()
        if self._subscriber:
            self._subscriber.close()


# Singleton instance
_client: Optional[PubSubClient] = None


def get_pubsub_client() -> PubSubClient:
    """Get the singleton Pub/Sub client."""
    global _client
    if _client is None:
        _client = PubSubClient()
    return _client


def publish_message(
    topic_name: str, 
    data: Dict[str, Any],
    ordering_key: Optional[str] = None
) -> str:
    """Convenience function to publish a message."""
    client = get_pubsub_client()
    return client.publish(topic_name, data, ordering_key)


async def publish_message_async(
    topic_name: str, 
    data: Dict[str, Any],
    ordering_key: Optional[str] = None
) -> str:
    """Convenience function to publish a message asynchronously."""
    client = get_pubsub_client()
    return await client.publish_async(topic_name, data, ordering_key)
