"""
Chat Sender Service

Consumes chat message events from Pub/Sub and sends them to Twitch chat.

Message format:
{
    "userId": "user-uuid",
    "streamId": "stream-id",
    "sessionId": "session-uuid",
    "messageType": "affiliate",
    "content": "Affiliate Link 🔗 Product: https://...",
    "affiliateLinkId": "link-uuid",
    "productId": "product-id or affiliate link id for cooldown"
}
"""
import asyncio
import json
import os
import sys
import base64
from concurrent.futures import TimeoutError as FuturesTimeoutError

import structlog
from google.cloud import pubsub_v1
import psycopg2
from psycopg2.extras import RealDictCursor
from aiohttp import web

from config import settings
from twitch_client import TwitchChatClient, TwitchTokens
from rate_limiter import RateLimiter

# Configure logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(colors=True),
    ]
)
logger = structlog.get_logger()


class ChatSenderService:
    """Main service that processes chat message events."""
    
    def __init__(self):
        self.twitch = TwitchChatClient(
            client_id=settings.twitch_client_id,
            client_secret=settings.twitch_client_secret,
        )
        self.rate_limiter = RateLimiter(
            product_cooldown_seconds=settings.product_cooldown_seconds,
            max_messages_per_hour=settings.stream_max_messages_per_hour,
        )
        self.db_conn = None
    
    def get_db_connection(self):
        """Get or create a database connection."""
        if self.db_conn is None or self.db_conn.closed:
            self.db_conn = psycopg2.connect(
                settings.database_url,
                cursor_factory=RealDictCursor,
            )
        return self.db_conn
    
    def get_user_twitch_tokens(self, user_id: str) -> TwitchTokens | None:
        """Fetch user's Twitch OAuth tokens from database."""
        conn = self.get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    access_token, 
                    refresh_token,
                    platform_user_id
                FROM platform_connections
                WHERE user_id = %s AND platform = 'TWITCH'
            """, (user_id,))
            
            row = cur.fetchone()
            if not row:
                logger.warning("[DB] No Twitch connection for user", user_id=user_id)
                return None
            
            return TwitchTokens(
                access_token=row["access_token"],
                refresh_token=row.get("refresh_token"),
                broadcaster_id=row["platform_user_id"],
            )
    
    def update_user_tokens(self, user_id: str, access_token: str, refresh_token: str):
        """Update user's tokens after refresh."""
        conn = self.get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE platform_connections
                SET access_token = %s, refresh_token = %s, updated_at = NOW()
                WHERE user_id = %s AND platform = 'TWITCH'
            """, (access_token, refresh_token, user_id))
        conn.commit()
        logger.info("[DB] Updated tokens for user", user_id=user_id)
    
    def check_auto_send_enabled(self, user_id: str) -> bool:
        """Check if user has auto-send enabled (default: True)."""
        conn = self.get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT auto_send_affiliate_links
                FROM user_settings
                WHERE user_id = %s
            """, (user_id,))
            
            row = cur.fetchone()
            # Default to True if column doesn't exist or is null
            if not row:
                return True
            return row.get("auto_send_affiliate_links", True)
    
    async def process_message(self, message_data: dict) -> bool:
        """
        Process a chat message event.
        
        Returns True if message was sent successfully, False otherwise.
        """
        user_id = message_data.get("userId")
        stream_id = message_data.get("streamId")
        product_id = message_data.get("affiliateLinkId") or message_data.get("productId")
        content = message_data.get("content", "")
        
        if not all([user_id, stream_id, content]):
            logger.error("[Process] Missing required fields", data=message_data)
            return False
        
        # Check auto-send setting
        if not self.check_auto_send_enabled(user_id):
            logger.info("[Process] Auto-send disabled for user", user_id=user_id)
            return False
        
        # Check rate limits
        can_send, reason = self.rate_limiter.can_send(stream_id, product_id or "unknown")
        if not can_send:
            logger.info("[Process] Rate limited", reason=reason)
            return False
        
        # Get Twitch tokens
        tokens = self.get_user_twitch_tokens(user_id)
        if not tokens:
            return False
        
        # Dry run mode
        if settings.dry_run:
            logger.info(
                "[DRY RUN] Would send message",
                broadcaster_id=tokens.broadcaster_id,
                message=content[:100],
            )
            self.rate_limiter.record_send(stream_id, product_id or "unknown")
            return True
        
        # Send message
        result = await self.twitch.send_message(tokens, content)
        
        if result.get("success"):
            self.rate_limiter.record_send(stream_id, product_id or "unknown")
            return True
        
        # Handle token refresh
        if result.get("error") == "token_expired" and tokens.refresh_token:
            new_tokens = await self.twitch.refresh_token(tokens.refresh_token)
            if new_tokens:
                self.update_user_tokens(
                    user_id,
                    new_tokens["access_token"],
                    new_tokens["refresh_token"],
                )
                # Retry with new token
                tokens.access_token = new_tokens["access_token"]
                retry_result = await self.twitch.send_message(tokens, content)
                if retry_result.get("success"):
                    self.rate_limiter.record_send(stream_id, product_id or "unknown")
                    return True
        
        # Drop on non-recoverable errors
        logger.warning(
            "[Process] Message dropped",
            error=result.get("error"),
            user_id=user_id,
        )
        return False
    
    def callback(self, message: pubsub_v1.subscriber.message.Message):
        """Pub/Sub message callback."""
        try:
            data = json.loads(message.data.decode("utf-8"))
            logger.info("[PubSub] Received message", message_id=message.message_id)
            
            # Run async processing
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                success = loop.run_until_complete(self.process_message(data))
            finally:
                loop.close()
            
            # Always ack - we don't retry dropped messages
            message.ack()
            logger.info("[PubSub] Message processed", success=success)
            
        except json.JSONDecodeError as e:
            logger.error("[PubSub] Invalid JSON", error=str(e))
            message.ack()  # Don't retry invalid messages
        except Exception as e:
            logger.exception("[PubSub] Processing error", error=str(e))
            message.ack()  # Drop on error per design
    
    def run(self):
        """Start the Pub/Sub subscriber."""
        subscriber = pubsub_v1.SubscriberClient()
        subscription_path = subscriber.subscription_path(
            settings.gcp_project_id,
            settings.pubsub_subscription,
        )
        
        logger.info(
            "[ChatSender] Starting service",
            subscription=subscription_path,
            dry_run=settings.dry_run,
        )
        
        streaming_pull_future = subscriber.subscribe(
            subscription_path,
            callback=self.callback,
        )
        
        try:
            streaming_pull_future.result()
        except FuturesTimeoutError:
            streaming_pull_future.cancel()
            streaming_pull_future.result()
        except KeyboardInterrupt:
            streaming_pull_future.cancel()
            logger.info("[ChatSender] Shutting down")
        finally:
            asyncio.run(self.twitch.close())

    async def handle_push(self, request: web.Request) -> web.Response:
        """Handle Pub/Sub push messages."""
        try:
            data = await request.json()
            if "message" in data and "data" in data["message"]:
                payload = base64.b64decode(data["message"]["data"]).decode("utf-8")
                body = json.loads(payload)
                success = await self.process_message(body)
                if success:
                    return web.Response(status=200)
                else:
                    return web.Response(status=500)
            else:
                return web.Response(status=400, text="Invalid message format")
        except Exception as e:
            logger.exception("[Push] Processing error", error=str(e))
            return web.Response(status=500)

    async def start_push_server(self):
        """Start the HTTP server for Pub/Sub push messages."""
        app = web.Application()
        app.router.add_post('/pubsub/push', self.handle_push)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0', settings.port)
        logger.info("[ChatSender] Starting HTTP Push Server", port=settings.port)
        await site.start()
        
        while True:
            await asyncio.sleep(3600)

    def start(self):
        """Start the service based on configured mode."""
        if settings.pubsub_mode == "push":
            try:
                asyncio.run(self.start_push_server())
            except KeyboardInterrupt:
                logger.info("[ChatSender] Shutting down")
            finally:
                asyncio.run(self.twitch.close())
        else:
            self.run()


if __name__ == "__main__":
    service = ChatSenderService()
    service.start()
