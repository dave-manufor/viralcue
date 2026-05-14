"""
Rate Limiter for affiliate chat messages using Redis.

Implements:
- Per-product cooldown (5 minutes default)
- Per-stream hourly limit (10 messages/hour default)

Keys are namespaced to avoid conflicts with other services:
- chat:limit:{stream_id}:hour  -> Counter for hourly messages
- chat:cooldown:{stream_id}:{product_id} -> Product cooldown flag
"""
import os
from typing import Optional, Tuple

import redis
import structlog

logger = structlog.get_logger()


class RateLimiter:
    """
    Rate limiter for affiliate chat messages using Redis.
    
    Rules:
    - 5 minute cooldown per product per stream
    - Max 10 messages per hour per stream
    """
    
    KEY_PREFIX = "chat"  # Namespace for this service
    
    def __init__(
        self,
        redis_url: Optional[str] = None,
        product_cooldown_seconds: int = 300,  # 5 minutes
        max_messages_per_hour: int = 10,
    ):
        self.product_cooldown = product_cooldown_seconds
        self.max_per_hour = max_messages_per_hour
        
        # Connect to Redis
        url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis = redis.from_url(url, decode_responses=True)
        logger.info("[RateLimiter] Connected to Redis", url=url)
    
    def _hourly_key(self, stream_id: str) -> str:
        """Key for hourly message counter."""
        return f"{self.KEY_PREFIX}:limit:{stream_id}:hour"
    
    def _cooldown_key(self, stream_id: str, product_id: str) -> str:
        """Key for product cooldown."""
        return f"{self.KEY_PREFIX}:cooldown:{stream_id}:{product_id}"
    
    def can_send(self, stream_id: str, product_id: str) -> Tuple[bool, Optional[str]]:
        """
        Check if a message can be sent for this product in this stream.
        
        Returns:
            (can_send, reason) - reason is None if can_send is True
        """
        # Check hourly limit
        hourly_key = self._hourly_key(stream_id)
        current_count = self.redis.get(hourly_key)
        current_count = int(current_count) if current_count else 0
        
        if current_count >= self.max_per_hour:
            ttl = self.redis.ttl(hourly_key)
            logger.info(
                "[RateLimiter] Hourly limit reached",
                stream_id=stream_id,
                remaining_seconds=ttl,
            )
            return False, f"Hourly limit reached ({self.max_per_hour}/hour)"
        
        # Check product cooldown
        cooldown_key = self._cooldown_key(stream_id, product_id)
        if self.redis.exists(cooldown_key):
            remaining = self.redis.ttl(cooldown_key)
            logger.info(
                "[RateLimiter] Product on cooldown",
                stream_id=stream_id,
                product_id=product_id,
                remaining_seconds=remaining,
            )
            return False, f"Product cooldown ({remaining}s remaining)"
        
        return True, None
    
    def record_send(self, stream_id: str, product_id: str) -> None:
        """Record that a message was sent for this product."""
        # Increment hourly counter with 1 hour TTL
        hourly_key = self._hourly_key(stream_id)
        pipe = self.redis.pipeline()
        pipe.incr(hourly_key)
        pipe.expire(hourly_key, 3600)  # 1 hour TTL
        pipe.execute()
        
        # Set product cooldown
        cooldown_key = self._cooldown_key(stream_id, product_id)
        self.redis.setex(cooldown_key, self.product_cooldown, "1")
        
        new_count = self.redis.get(hourly_key)
        logger.info(
            "[RateLimiter] Message recorded",
            stream_id=stream_id,
            product_id=product_id,
            messages_this_hour=new_count,
        )
