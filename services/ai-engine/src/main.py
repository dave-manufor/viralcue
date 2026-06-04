"""ViralCue AI Engine - Viral moment detection and draft generation."""

import asyncio
import signal
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Union
import json
import base64
from aiohttp import web

import structlog
from dotenv import load_dotenv

from .config import Settings
from .bedrock_client import AIService
from .db_client import DatabaseClient

load_dotenv()

logger = structlog.get_logger()


@dataclass
class TranscriptEntry:
    """A single transcript entry with timestamp."""

    text: str
    timestamp: datetime
    confidence: float


class AIEngine:
    """AI engine for analyzing transcripts and generating drafts."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.ai_service = AIService(settings)
        self.db_client = DatabaseClient(settings)
        self.running = False

        # Rolling context buffer (60 seconds)
        self.context_buffer: deque[TranscriptEntry] = deque()
        
        # Cache for user contexts (avoid querying DB on every transcript)
        self._context_cache: dict[str, tuple[float, Optional[dict]]] = {}
        
        # Initialize messaging client based on feature flag
        if settings.use_gcp_pubsub:
            from .pubsub_client import PubSubClient
            self.messaging_client = PubSubClient(settings)
            logger.info("Using GCP Pub/Sub for messaging")
        else:
            from .sqs_client import SQSClient
            self.messaging_client = SQSClient(settings)
            logger.info("Using AWS SQS for messaging")

    def _get_context(self) -> str:
        """Get the rolling context from recent transcripts."""
        now = datetime.now()
        cutoff = self.settings.context_window_seconds

        # Remove old entries
        while self.context_buffer:
            entry = self.context_buffer[0]
            age = (now - entry.timestamp).total_seconds()
            if age > cutoff:
                self.context_buffer.popleft()
            else:
                break

        # Combine remaining entries
        return " ".join(entry.text for entry in self.context_buffer)

    async def _get_user_context(self, user_id: str) -> Optional[dict]:
        """Get user context with caching (5 minute TTL)."""
        import time
        cache_ttl = 300  # 5 minutes
        now = time.time()
        
        if user_id in self._context_cache:
            cached_time, cached_context = self._context_cache[user_id]
            if now - cached_time < cache_ttl:
                return cached_context
        
        # Fetch fresh context directly from database
        context = await self.db_client.get_user_context(user_id)
        self._context_cache[user_id] = (now, context)
        return context

    async def process_transcript(
        self,
        transcript_text: str,
        confidence: float,
        session_id: str,
        stream_id: str,
        user_id: str,
        timestamp: float,
        channel_name: str,
        platform: str,
        affiliate_keywords: list[str],
    ) -> Optional[dict]:
        """
        Process a transcript and generate drafts if viral.

        Args:
            transcript_text: The transcript text
            confidence: STT confidence score
            session_id: The streaming session ID
            stream_id: The stream ID
            user_id: The user ID
            timestamp: Unix epoch timestamp of the transcript
            channel_name: The channel name (for clip fetcher)
            platform: The streaming platform (TWITCH or KICK)
            affiliate_keywords: User's affiliate keywords

        Returns:
            Draft data if viral moment detected, None otherwise
        """
        # Add to context buffer
        entry = TranscriptEntry(
            text=transcript_text,
            timestamp=datetime.now(),
            confidence=confidence,
        )
        self.context_buffer.append(entry)

        # Get rolling context
        context = self._get_context()
        
        # Get user context for personalization
        user_context = await self._get_user_context(user_id)
        
        # === Voice Command Detection ===
        voice_command_detected = self._check_voice_command(transcript_text)
        if voice_command_detected:
            logger.info("Voice command detected: 'Clip that'", session_id=session_id)

        # Analyze with AI Service (now with user context)
        analysis = await self.ai_service.analyze_transcript(
            transcript=transcript_text,
            context=context,
            affiliate_keywords=affiliate_keywords,
            user_context=user_context,
        )

        logger.info(
            "Transcript analyzed",
            viral_score=analysis.get("viral_score"),
            is_viral=analysis.get("is_viral"),
            has_user_context=user_context is not None,
        )
        
        # === Trigger Clip Fetcher ===
        viral_score = analysis.get("viral_score", 0.0)
        high_viral_content = viral_score > 0.7
        
        if voice_command_detected or high_viral_content:
            reason = "Voice Command" if voice_command_detected else f"High Viral Content Score ({viral_score:.2f})"
            logger.info("Triggering clip fetch", reason=reason, timestamp=timestamp)
            
            # Non-blocking: trigger clip fetch in background
            # Timestamp is the END of the 60s transcript window, so we need to go back further
            # Window: 70s before (60s transcript + 10s buffer) → 15s after (reaction time)
            if self.settings.use_gcp_pubsub:
                self.messaging_client.publish_viral_candidate(
                    user_id=user_id,
                    session_id=session_id,
                    stream_id=stream_id,
                    channel_name=channel_name,
                    platform=platform,
                    timestamp_start=timestamp - 70,  # 70s before (covers full 60s window + buffer)
                    timestamp_end=timestamp + 15,    # 15s after (capture reaction)
                    viral_score=viral_score,
                    reason=reason,
                    caption=analysis.get("tweet_draft") or analysis.get("title"),
                    hashtags=analysis.get("hashtags", []),
                )

        # If viral or has affiliate match, create draft (non-blocking, always runs)
        if analysis.get("is_viral") or analysis.get("matched_affiliate_keywords"):
            draft = {
                "session_id": session_id,
                "stream_id": stream_id,
                "draft_type": "TWEET" if analysis.get("tweet_draft") else "AFFILIATE",
                "content": analysis.get("tweet_draft") or analysis.get("chat_message") or analysis.get("title"),
                "confidence_score": analysis.get("viral_score", 0.5),
                "transcript_snippet": transcript_text[:200],
                "affiliate_keywords": analysis.get("matched_affiliate_keywords", []),
                "viral_reason": analysis.get("viral_reason"),
            }

            logger.info(
                "Draft generated",
                type=draft["draft_type"],
                content=draft["content"][:50] if draft["content"] else None,
            )

            return draft

        return None
    
    def _check_voice_command(self, text: str) -> bool:
        """Check if transcript contains a clip trigger phrase."""
        trigger_phrases = [
            "clip that",
            "clip it",
            "save that",
            "that's a clip",
            "clip this",
        ]
        text_lower = text.lower()
        return any(phrase in text_lower for phrase in trigger_phrases)

    async def start(self) -> None:
        """Start the AI engine - poll for transcripts."""
        self.running = True
        
        if self.settings.use_gcp_pubsub:
            logger.info("AI Engine started - polling Pub/Sub")
        else:
            logger.info("AI Engine started - polling SQS")
        
        while self.running:
            try:
                # Receive transcript messages
                if self.settings.use_gcp_pubsub:
                    messages = self.messaging_client.receive_transcripts(max_messages=10)
                else:
                    messages = self.messaging_client.receive_transcripts(max_messages=10)
                
                for msg in messages:
                    body = msg["body"]
                    user_id = body.get("userId")
                    session_id = body.get("sessionId")
                    stream_id = body.get("streamId", session_id)  # Fallback to session_id
                    transcript = body.get("transcript")
                    
                    if not all([user_id, session_id, transcript]):
                        logger.warning("Invalid message", body=body)
                        self._ack_message(msg)
                        continue
                    
                    logger.info(
                        "Processing transcript",
                        session_id=session_id,
                        stream_id=stream_id,
                        length=len(transcript),
                    )
                    
                    # Process and generate draft
                    import time
                    transcript_timestamp = body.get("timestamp", time.time())
                    channel_name = body.get("channelName", "")
                    
                    # Fetch affiliate keywords from database
                    affiliate_keywords = await self.db_client.get_user_affiliate_keywords(user_id)
                    
                    draft = await self.process_transcript(
                        transcript_text=transcript,
                        confidence=body.get("confidence", 1.0),
                        session_id=session_id,
                        stream_id=stream_id,
                        user_id=user_id,
                        timestamp=transcript_timestamp,
                        channel_name=channel_name,
                        platform=body.get("platform", "TWITCH"),
                        affiliate_keywords=affiliate_keywords,
                    )
                    
                    # Publish draft if generated
                    if draft:
                        if self.settings.use_gcp_pubsub:
                            self.messaging_client.publish_draft(user_id, stream_id, draft)
                        else:
                            self.messaging_client.publish_draft(user_id, draft)
                    
                    # Acknowledge processed message
                    self._ack_message(msg)
                
                # Small delay between polls
                await asyncio.sleep(self.settings.poll_interval_seconds)
                
            except Exception as e:
                logger.exception("Error processing transcripts", error=str(e))
                await asyncio.sleep(5)  # Back off on error

    async def handle_push(self, request: web.Request) -> web.Response:
        """Handle Pub/Sub push messages."""
        try:
            data = await request.json()
            if "message" in data and "data" in data["message"]:
                payload = base64.b64decode(data["message"]["data"]).decode("utf-8")
                body = json.loads(payload)

                user_id = body.get("userId")
                session_id = body.get("sessionId")
                stream_id = body.get("streamId", session_id)
                transcript = body.get("transcript")

                if not all([user_id, session_id, transcript]):
                    logger.warning("Invalid message via push", body=body)
                    return web.Response(status=400)

                logger.info(
                    "Processing transcript (Push)",
                    session_id=session_id,
                    stream_id=stream_id,
                    length=len(transcript),
                )

                import time
                transcript_timestamp = body.get("timestamp", time.time())
                channel_name = body.get("channelName", "")

                affiliate_keywords = await self.db_client.get_user_affiliate_keywords(user_id)

                draft = await self.process_transcript(
                    transcript_text=transcript,
                    confidence=body.get("confidence", 1.0),
                    session_id=session_id,
                    stream_id=stream_id,
                    user_id=user_id,
                    timestamp=transcript_timestamp,
                    channel_name=channel_name,
                    platform=body.get("platform", "TWITCH"),
                    affiliate_keywords=affiliate_keywords,
                )

                if draft:
                    if self.settings.use_gcp_pubsub:
                        self.messaging_client.publish_draft(user_id, stream_id, draft)
                    else:
                        self.messaging_client.publish_draft(user_id, draft)

                return web.Response(status=200)
            else:
                return web.Response(status=400, text="Invalid message format")
        except Exception as e:
            logger.exception("Error handling push message", error=str(e))
            return web.Response(status=500)

    def _ack_message(self, msg: dict) -> None:
        """Acknowledge a message based on the messaging system."""
        if self.settings.use_gcp_pubsub:
            self.messaging_client.acknowledge_message(msg["ack_id"])
        else:
            self.messaging_client.delete_message(msg["receipt_handle"])

    async def stop(self) -> None:
        """Stop the AI engine."""
        self.running = False
        
        # Close database connection
        await self.db_client.close()
        
        if hasattr(self.messaging_client, 'close'):
            self.messaging_client.close()
        
        logger.info("AI Engine stopped")


async def main() -> None:
    """Main entry point."""
    settings = Settings()
    engine = AIEngine(settings)

    # Handle graceful shutdown
    loop = asyncio.get_running_loop()

    def shutdown_handler():
        logger.info("Received shutdown signal")
        asyncio.create_task(engine.stop())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, shutdown_handler)

    try:
        if settings.pubsub_mode == "push":
            engine.running = True
            app = web.Application()
            app.router.add_post('/pubsub/push', engine.handle_push)
            runner = web.AppRunner(app)
            await runner.setup()
            site = web.TCPSite(runner, '0.0.0.0', settings.port)
            logger.info("Starting AI Engine HTTP Push Server", port=settings.port)
            await site.start()
            
            # Keep running until stopped
            while engine.running:
                await asyncio.sleep(1)
        else:
            await engine.start()
    except Exception as e:
        logger.exception("AI Engine error", error=str(e))
        raise
    finally:
        await engine.stop()


if __name__ == "__main__":
    asyncio.run(main())

