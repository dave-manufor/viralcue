"""
HLS Fetcher - Main entry point and job management
"""
import asyncio
import aiohttp
from typing import Optional
from dataclasses import dataclass

# Initialize logging first
from .logging_config import get_logger
from .config import settings
from .twitch_hls import get_audio_stream_url as get_twitch_hls
from .kick_hls import get_hls_url as get_kick_hls
from .audio_stream import stream_audio_segments, extract_audio_from_ts
from .deepgram_client import DeepgramStreamer

logger = get_logger("hls_fetcher.main")


@dataclass
class CaptureJob:
    """Represents an active stream capture job."""
    user_id: str
    session_id: str
    channel_name: str
    platform: str  # TWITCH or KICK
    stop_event: asyncio.Event
    task: Optional[asyncio.Task] = None


# Active capture jobs
active_jobs: dict[str, CaptureJob] = {}


async def notify_api(endpoint: str, data: dict) -> None:
    """Send notification to the API server."""
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                f"{settings.api_url}/internal/{endpoint}",
                json=data,
                headers={"X-Internal-Key": settings.internal_api_key}
            )
    except Exception as e:
        logger.error(f"API notify error: {e}")


async def run_capture_job(job: CaptureJob) -> None:
    """
    Run a stream capture job.
    Fetches HLS audio, transcribes via Deepgram, sends to AI engine.
    
    Handles:
    - Manual stop (via stop_event)
    - Stream ending naturally
    - Errors during capture
    """
    logger.info(f"[Job {job.session_id}] Starting capture for {job.channel_name} ({job.platform})")
    
    end_reason = "unknown"
    
    # Buffer for accumulating transcript
    transcript_buffer: list[str] = []
    last_flush_time = asyncio.get_event_loop().time()
    current_segment_timestamp = 0.0  # Track timestamp from HLS segments
    
    # Import messaging client based on feature flag
    if settings.use_gcp_pubsub:
        from .pubsub_client import publish_transcript
        logger.info(f"[Job {job.session_id}] Using Pub/Sub for transcripts")
    else:
        from .sqs_client import publish_transcript
        logger.info(f"[Job {job.session_id}] Using SQS for transcripts")
    
    def on_transcript(text: str, confidence: float) -> None:
        nonlocal last_flush_time, current_segment_timestamp
        transcript_buffer.append(text)
        logger.debug(f"[Job {job.session_id}] Transcript: {text[:50]}...")
        
        # Flush to messaging system every 60 seconds or 1000 chars (cost optimized)
        current_time = asyncio.get_event_loop().time()
        buffer_text = " ".join(transcript_buffer)
        
        if current_time - last_flush_time > 60 or len(buffer_text) > 1000:
            logger.info(f"[Job {job.session_id}] Flushing {len(buffer_text)} chars")
            
            # Helper to send
            task_args = {
               "user_id": job.user_id,
               "session_id": job.session_id,
               "transcript": buffer_text,
            }
            if settings.use_gcp_pubsub:
                task_args.update({
                    "stream_id": job.session_id,
                    "channel_name": job.channel_name,
                    "platform": job.platform,  # Pass platform through
                    "confidence": confidence,
                    "timestamp": current_segment_timestamp,
                })
            
            asyncio.create_task(publish_transcript(**task_args))
            
            transcript_buffer.clear()
            last_flush_time = current_time
    
    def on_error(error: Exception) -> None:
        logger.error(f"[Job {job.session_id}] Deepgram error: {error}")
    
    # Track Deepgram disconnect
    deepgram_disconnected = asyncio.Event()
    
    def on_disconnect() -> None:
        logger.warning(f"[Job {job.session_id}] Deepgram disconnected!")
        deepgram_disconnected.set()
    
    try:
        # Get HLS stream URL based on platform
        stream_url = None
        url_fetch_attempts = 0
        max_url_retries = 3
        deepgram_reconnect_attempts = 0
        max_deepgram_reconnects = 3
        
        async def fetch_stream_url():
            """Helper to fetch/refresh stream URL"""
            nonlocal stream_url
            if job.platform == "KICK":
                stream_url = await get_kick_hls(job.channel_name)
            else:
                stream_url = await get_twitch_hls(job.channel_name)
            return stream_url
        
        async def connect_deepgram():
            """Helper to connect/reconnect Deepgram"""
            nonlocal deepgram_disconnected
            deepgram_disconnected.clear()
            dg = DeepgramStreamer(
                on_transcript=on_transcript,
                on_error=on_error,
                on_disconnect=on_disconnect,
            )
            if await dg.connect():
                return dg
            return None

        stream_url = await fetch_stream_url()

        if not stream_url:
            logger.error(f"[Job {job.session_id}] Failed to get stream URL - stream may have ended")
            end_reason = "stream_not_found"
            return
        
        logger.info(f"[Job {job.session_id}] Got stream URL: {stream_url[:80]}...")
        
        # Connect to Deepgram
        deepgram = await connect_deepgram()
        
        if not deepgram:
            logger.error(f"[Job {job.session_id}] Failed to connect to Deepgram")
            end_reason = "deepgram_connection_failed"
            return
        
        logger.info(f"[Job {job.session_id}] Connected to Deepgram, streaming audio...")
        
        segment_count = 0
        consecutive_failures = 0
        max_consecutive_failures = 10
        last_activity_time = asyncio.get_event_loop().time()
        heartbeat_interval = 30  # Log heartbeat every 30 seconds
        
        # Stream audio segments with URL refresh on failure
        while not job.stop_event.is_set():
            # Check if Deepgram disconnected
            if deepgram_disconnected.is_set():
                deepgram_reconnect_attempts += 1
                logger.warning(f"[Job {job.session_id}] Deepgram disconnected, attempting reconnect {deepgram_reconnect_attempts}/{max_deepgram_reconnects}")
                
                if deepgram_reconnect_attempts > max_deepgram_reconnects:
                    logger.error(f"[Job {job.session_id}] Max Deepgram reconnect attempts reached, stopping")
                    end_reason = "deepgram_disconnected"
                    break
                
                # Close old connection and reconnect
                await deepgram.close()
                await asyncio.sleep(2)  # Brief pause before reconnect
                
                deepgram = await connect_deepgram()
                if not deepgram:
                    logger.error(f"[Job {job.session_id}] Deepgram reconnect failed")
                    continue
                
                logger.info(f"[Job {job.session_id}] Deepgram reconnected successfully")
            
            try:
                async for segment in stream_audio_segments(stream_url, job.stop_event):
                    # Check for Deepgram disconnect mid-stream
                    if deepgram_disconnected.is_set():
                        logger.warning(f"[Job {job.session_id}] Deepgram disconnect detected mid-stream, breaking to reconnect")
                        break
                    
                    # Extract PCM audio from TS segment
                    pcm_data = await extract_audio_from_ts(segment.data)
                    
                    if pcm_data:
                        # Send to Deepgram
                        sent = await deepgram.send_audio(pcm_data)
                        if not sent:
                            logger.warning(f"[Job {job.session_id}] Failed to send audio to Deepgram")
                            deepgram_disconnected.set()
                            break
                        
                        segment_count += 1
                        consecutive_failures = 0
                        url_fetch_attempts = 0  # Reset on success
                        deepgram_reconnect_attempts = 0  # Reset on success
                        current_segment_timestamp = segment.timestamp
                        last_activity_time = asyncio.get_event_loop().time()
                        
                        if segment_count % 10 == 0:
                            logger.debug(f"[Job {job.session_id}] Processed {segment_count} segments")
                    else:
                        consecutive_failures += 1
                        logger.warning(f"[Job {job.session_id}] Segment {segment_count} failed to extract audio (failures: {consecutive_failures})")
                        if consecutive_failures >= max_consecutive_failures:
                            logger.warning(f"[Job {job.session_id}] Too many segment failures, attempting URL refresh...")
                            break  # Break inner loop to trigger URL refresh
                    
                    # Heartbeat logging (based on time, not last_activity)
                    current_time = asyncio.get_event_loop().time()
                    time_since_last_flush = current_time - last_flush_time
                    if segment_count % 50 == 0:  # Every 50 segments (~100 seconds)
                        logger.info(f"[Job {job.session_id}] Heartbeat: {segment_count} segments, {time_since_last_flush:.0f}s since last flush, deepgram_connected={not deepgram_disconnected.is_set()}")
                
                # If we exit the generator normally, stream likely ended
                if not job.stop_event.is_set() and consecutive_failures < max_consecutive_failures:
                    logger.info(f"[Job {job.session_id}] Stream generator ended naturally")
                    end_reason = "stream_ended"
                    break
                    
            except Exception as stream_error:
                logger.error(f"[Job {job.session_id}] Stream error: {stream_error}")
                consecutive_failures += 1
            
            # URL refresh logic for Kick (if we broke out due to failures)
            if job.platform == "KICK" and consecutive_failures >= max_consecutive_failures:
                url_fetch_attempts += 1
                if url_fetch_attempts > max_url_retries:
                    logger.error(f"[Job {job.session_id}] Max URL refresh attempts reached, stopping")
                    end_reason = "url_refresh_failed"
                    break
                
                logger.info(f"[Job {job.session_id}] Refreshing Kick HLS URL (attempt {url_fetch_attempts}/{max_url_retries})...")
                new_url = await fetch_stream_url()
                
                if new_url and new_url != stream_url:
                    logger.info(f"[Job {job.session_id}] Got new URL, resuming capture")
                    stream_url = new_url
                    consecutive_failures = 0
                    continue
                elif not new_url:
                    logger.error(f"[Job {job.session_id}] Failed to refresh URL, stream may have ended")
                    end_reason = "stream_ended"
                    break
            elif consecutive_failures >= max_consecutive_failures:
                # For Twitch or if not handling Kick refresh
                end_reason = "stream_ended"
                break
        
        # Determine end reason if not already set
        if job.stop_event.is_set():
            end_reason = "user_stopped"
        elif end_reason == "unknown":
            end_reason = "stream_ended"
        
        # Close Deepgram
        await deepgram.close()
        
        # Flush remaining buffer
        if transcript_buffer:
            buffer_text = " ".join(transcript_buffer)
            args = {"user_id": job.user_id, "session_id": job.session_id, "transcript": buffer_text}
            if settings.use_gcp_pubsub:
                args.update({"stream_id": job.session_id, "channel_name": job.channel_name, "confidence": 0.0, "timestamp": current_segment_timestamp})
            await publish_transcript(**args)
        
        logger.info(f"[Job {job.session_id}] Capture ended ({end_reason}), processed {segment_count} segments")
        
    except asyncio.CancelledError:
        end_reason = "cancelled"
        logger.info(f"[Job {job.session_id}] Capture cancelled")
    except Exception as e:
        end_reason = "error"
        logger.exception(f"[Job {job.session_id}] Error: {e}")
    finally:
        # Remove from active jobs
        if job.session_id in active_jobs:
            del active_jobs[job.session_id]
        
        # Notify API that job ended with reason
        await notify_api("capture/ended", {
            "sessionId": job.session_id,
            "reason": end_reason,
        })


async def start_capture(
    user_id: str,
    session_id: str,
    channel_name: str,
    platform: str = "TWITCH",  # Default for backward compat
) -> bool:
    """Start a new capture job."""
    if session_id in active_jobs:
        logger.warning(f"[Job {session_id}] Already running")
        return False
    
    job = CaptureJob(
        user_id=user_id,
        session_id=session_id,
        channel_name=channel_name,
        platform=platform,
        stop_event=asyncio.Event(),
    )
    
    job.task = asyncio.create_task(run_capture_job(job))
    active_jobs[session_id] = job
    
    logger.info(f"[Job {session_id}] Started for channel {channel_name} ({platform})")
    return True


async def stop_capture(session_id: str) -> bool:
    """Stop a running capture job."""
    job = active_jobs.get(session_id)
    if not job:
        return False
    
    logger.info(f"[Job {session_id}] Stopping...")
    job.stop_event.set()
    
    if job.task:
        job.task.cancel()
        try:
            await job.task
        except asyncio.CancelledError:
            pass
    
    return True


# HTTP server for receiving commands from API
from aiohttp import web


async def handle_start(request: web.Request) -> web.Response:
    """Handle start capture request."""
    data = await request.json()
    
    success = await start_capture(
        user_id=data["userId"],
        session_id=data["sessionId"],
        channel_name=data["channelName"],
        platform=data.get("platform", "TWITCH"),
    )
    
    return web.json_response({"success": success})


async def handle_stop(request: web.Request) -> web.Response:
    """Handle stop capture request."""
    data = await request.json()
    success = await stop_capture(data["sessionId"])
    return web.json_response({"success": success})


async def handle_status(request: web.Request) -> web.Response:
    """Get status of all active jobs."""
    return web.json_response({
        "activeJobs": [
            {
                "sessionId": job.session_id,
                "userId": job.user_id,
                "channelName": job.channel_name,
            }
            for job in active_jobs.values()
        ]
    })


def create_app() -> web.Application:
    """Create the aiohttp application."""
    app = web.Application()
    app.router.add_post("/capture/start", handle_start)
    app.router.add_post("/capture/stop", handle_stop)
    app.router.add_get("/status", handle_status)
    return app


if __name__ == "__main__":
    app = create_app()
    logger.info("Starting HLS Fetcher on port 3003...")
    web.run_app(app, port=3003)
