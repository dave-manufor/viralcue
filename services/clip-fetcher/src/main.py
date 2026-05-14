"""
Sniper Service - VOD clip fetcher and processor
Cloud Run Job triggered by Pub/Sub viral-candidate messages
"""
import asyncio
import os
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Optional
from pathlib import Path

# IMPORTANT: Fix STORAGE_EMULATOR_HOST before importing google.cloud.storage
# The library caches this value at import time
_emulator_host = os.getenv("STORAGE_EMULATOR_HOST")
if _emulator_host:
    # Ensure http:// prefix is present
    if not _emulator_host.startswith("http://") and not _emulator_host.startswith("https://"):
        _emulator_host = f"http://{_emulator_host}"
    os.environ["STORAGE_EMULATOR_HOST"] = _emulator_host

import aiohttp
import structlog
from google.cloud import pubsub_v1, storage
from google.auth import credentials as auth_credentials


from .config import settings

logger = structlog.get_logger()


@dataclass
class ViralCandidate:
    """Represents a viral moment to fetch."""
    user_id: str
    session_id: str
    stream_id: str
    timestamp_start: float  # Seconds from stream start
    timestamp_end: float
    viral_score: float
    reason: str
    platform: str = "TWITCH"  # TWITCH or KICK
    vod_url: Optional[str] = None
    channel_name: Optional[str] = None
    caption: Optional[str] = None
    hashtags: Optional[list[str]] = None


@dataclass
class ProcessedClip:
    """Result from processing a clip."""
    gcs_url: str
    duration: float
    file_size: int
    format: str  # "mp4", "webm"
    thumbnail_url: Optional[str] = None


class TwitchVODFetcher:
    """Fetches VOD segments from Twitch."""
    
    def __init__(self):
        self.access_token: Optional[str] = None
        
    async def get_access_token(self) -> str:
        """Get Twitch OAuth token."""
        if self.access_token:
            return self.access_token
            
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://id.twitch.tv/oauth2/token",
                data={
                    "client_id": settings.twitch_client_id,
                    "client_secret": settings.twitch_client_secret,
                    "grant_type": "client_credentials",
                }
            ) as resp:
                data = await resp.json()
                self.access_token = data.get("access_token")
                return self.access_token

    async def get_vod_url(self, channel_name: str, stream_id: str, target_timestamp: float = 0.0) -> Optional[tuple[str, float]]:
        """
        Get VOD URL and creation timestamp for a stream.
        
        Args:
            channel_name: Twitch username
            stream_id: Internal stream ID (likely UUID, so strict matching might fail)
            target_timestamp: Unix timestamp of the event to find the containing VOD
            
        Returns:
            Tuple of (vod_url, created_at_timestamp) or None if not found
        """
        token = await self.get_access_token()
        
        async with aiohttp.ClientSession() as session:
            # Get user ID from username
            async with session.get(
                f"https://api.twitch.tv/helix/users?login={channel_name}",
                headers={
                    "Client-ID": settings.twitch_client_id,
                    "Authorization": f"Bearer {token}",
                }
            ) as resp:
                data = await resp.json()
                users = data.get("data", [])
                if not users:
                    logger.error("User not found", channel=channel_name)
                    return None
                user_id = users[0]["id"]

            # Get recent VODs (fetched 20 to cover older streams)
            async with session.get(
                f"https://api.twitch.tv/helix/videos?user_id={user_id}&type=archive&first=20",
                headers={
                    "Client-ID": settings.twitch_client_id,
                    "Authorization": f"Bearer {token}",
                }
            ) as resp:
                data = await resp.json()
                videos = data.get("data", [])
                
                if not videos:
                    logger.warning("No VODs found for user", user_id=user_id)
                    return None
                
                from datetime import datetime

                # Iterate through VODs to find the one containing the timestamp
                for vod in videos:
                    created_at = vod.get("created_at")
                    if not created_at:
                        continue
                        
                    vod_start_time = datetime.fromisoformat(created_at.replace("Z", "+00:00")).timestamp()
                    
                    # If target_timestamp is provided, check if this VOD started before the event
                    # Since videos are sorted by date (newest first), the first one we find
                    # that started BEFORE our timestamp is the correct one.
                    if target_timestamp > 0:
                        if vod_start_time <= target_timestamp:
                            logger.info("Found VOD matching timestamp", 
                                      url=vod.get("url"), 
                                      vod_start=vod_start_time, 
                                      target=target_timestamp)
                            return (vod.get("url"), vod_start_time)
                        else:
                            # This VOD started AFTER our event, so keep looking older
                            continue
                    else:
                        # Fallback for old behavior (if no timestamp provided) - return most recent
                        logger.info("Found VOD (most recent)", url=vod.get("url"), vod_start=vod_start_time)
                        return (vod.get("url"), vod_start_time)
                    
        logger.warning("No matching VOD found for timestamp", target=target_timestamp)            
        return None

    async def download_segments(
        self,
        vod_url: str,
        start_time: float,
        end_time: float,
        output_dir: Path,
    ) -> list[Path]:
        """
        Download VOD segments for a specific time range using yt-dlp.
        """
        # yt-dlp output template
        output_file = output_dir / "clip.mp4"
        
        # Construct yt-dlp command
        # --download-sections "*start-end" downloads only that range
        # --force-keyframes-at-cuts ensures accurate cuts (requires re-encoding sometimes)
        cmd = [
            "yt-dlp",
            "--download-sections", f"*{start_time}-{end_time}",
            "-f", "bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "-o", str(output_file),
            "--force-keyframes-at-cuts",
            vod_url
        ]
        
        logger.info("Downloading clip with yt-dlp", start=start_time, end=end_time, url=vod_url)
        
        try:
            # yt-dlp can be slow, run in thread pool
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                logger.error("yt-dlp failed", stderr=stderr.decode())
                return []
                
            logger.info("yt-dlp download complete")
            return [output_file] if output_file.exists() else []
            
        except Exception as e:
            logger.error("yt-dlp execution error", error=str(e))
            return []


class ClipProcessor:
    """Processes raw video segments into final clips."""
    
    def __init__(self):
        # STORAGE_EMULATOR_HOST is fixed at module load (top of file)
        emulator_host = os.getenv("STORAGE_EMULATOR_HOST")
        if emulator_host:
            self.gcs_client = storage.Client(
                project=settings.gcp_project_id,
                credentials=auth_credentials.AnonymousCredentials(),
            )
            logger.info("GCS client configured for emulator", host=emulator_host)
        else:
            self.gcs_client = storage.Client(project=settings.gcp_project_id)

    def stitch_segments(
        self,
        segment_files: list[Path],
        output_path: Path,
    ) -> bool:
        """Concatenate multiple segments into one file."""
        if len(segment_files) == 1:
            # Just copy the single segment
            segment_files[0].rename(output_path)
            return True
            
        # Create concat file list
        list_file = output_path.parent / "concat_list.txt"
        with open(list_file, "w") as f:
            for seg in segment_files:
                f.write(f"file '{seg}'\n")
        
        cmd = [
            "ffmpeg",
            "-f", "concat",
            "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            "-y",
            str(output_path),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0

    def _get_video_dimensions(self, video_path: Path) -> tuple[int, int]:
        """Get video width and height using ffprobe."""
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0",
            str(video_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error("ffprobe failed", stderr=result.stderr)
            return (0, 0)
        try:
            # Output may have trailing 'x' like "1280x720x", so filter out empty strings
            parts = [p for p in result.stdout.strip().split("x") if p]
            if len(parts) >= 2:
                return (int(parts[0]), int(parts[1]))
            else:
                logger.error("Failed to parse dimensions - unexpected format", output=result.stdout)
                return (0, 0)
        except ValueError:
            logger.error("Failed to parse dimensions", output=result.stdout)
            return (0, 0)

    def transcode_to_mp4(
        self,
        input_path: Path,
        output_path: Path,
        target_resolution: str = "1080p",
    ) -> bool:
        """
        Transcode to H.264/AAC for web compatibility.
        Outputs 9:16 aspect ratio (1080x1920) for shorts.
        
        If source is not 9:16, applies blurred background fill:
        - Background: scaled and blurred version of video
        - Foreground: video scaled to fit width, centered
        """
        # Get source dimensions
        src_width, src_height = self._get_video_dimensions(input_path)
        if src_width == 0 or src_height == 0:
            logger.error("Could not determine video dimensions")
            return False
        
        src_aspect = src_width / src_height
        target_width, target_height = 1080, 1920
        target_aspect = target_width / target_height  # 0.5625 (9:16)
        
        logger.info(
            "Video dimensions",
            src_width=src_width,
            src_height=src_height,
            src_aspect=f"{src_aspect:.4f}",
            target_aspect=f"{target_aspect:.4f}"
        )
        
        # Check if already 9:16 (with 5% tolerance)
        is_already_vertical = abs(src_aspect - target_aspect) < 0.05
        
        if is_already_vertical:
            # Already 9:16, just scale to target resolution
            logger.info("Source is already 9:16, scaling to 1080x1920")
            filter_complex = f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black"
        else:
            # Apply blurred background fill
            logger.info("Applying blurred background fill for 9:16 output")
            # Filter chain:
            # [bg]: Scale to cover 1080x1920, crop to exact size, apply gaussian blur
            # [fg]: Scale to fit width (1080px), maintain aspect ratio
            # overlay: Center foreground on blurred background
            filter_complex = (
                f"[0:v]scale={target_width}:{target_height}:force_original_aspect_ratio=increase,"
                f"crop={target_width}:{target_height},gblur=sigma=50[bg];"
                f"[0:v]scale={target_width}:-2[fg];"
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2"
            )
        
        cmd = [
            "ffmpeg",
            "-i", str(input_path),
            "-filter_complex", filter_complex,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            "-y",
            str(output_path),
        ]
        
        logger.info("Transcoding clip to 9:16 H.264", input=str(input_path))
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error("Transcode failed", stderr=result.stderr)
            return False
        
        file_size_mb = output_path.stat().st_size / (1024 * 1024)
        logger.info("Transcode complete", output=str(output_path), size_mb=round(file_size_mb, 2))
        return True

    def upload_to_gcs(
        self,
        local_path: Path,
        bucket_name: str,
        blob_name: str,
    ) -> str:
        """Upload file to GCS and return URL."""
        emulator_host = os.getenv("STORAGE_EMULATOR_HOST")
        
        logger.info("Starting GCS upload", bucket=bucket_name, blob=blob_name, file=str(local_path))
        
        if emulator_host:
            # Use simple HTTP upload for emulator (avoids resumable upload issues)
            import requests
            url = f"{emulator_host}/upload/storage/v1/b/{bucket_name}/o?uploadType=media&name={blob_name}"
            
            with open(local_path, 'rb') as f:
                response = requests.post(
                    url,
                    data=f,
                    headers={'Content-Type': 'video/mp4'},
                    timeout=300  # 5 min timeout for large files
                )
            
            if response.status_code not in (200, 201):
                raise Exception(f"GCS upload failed: {response.status_code} - {response.text}")
            
            logger.info("GCS upload complete", bucket=bucket_name, blob=blob_name)
            # Return browser-accessible URL using GCS emulator download format
            public_host = emulator_host.replace("gcs-emulator", "localhost")
            # URL-encode the blob name for the download URL
            from urllib.parse import quote
            encoded_blob = quote(blob_name, safe='')
            return f"{public_host}/download/storage/v1/b/{bucket_name}/o/{encoded_blob}?alt=media"
        else:
            # Production: use SDK
            bucket = self.gcs_client.bucket(bucket_name)
            blob = bucket.blob(blob_name)
            blob.upload_from_filename(str(local_path))
            logger.info("GCS upload complete", bucket=bucket_name, blob=blob_name)
            
            # Try to generate Signed URL (valid for 7 days)
            # Falls back to public URL if signing fails (e.g. using ADC User Creds)
            try:
                from datetime import timedelta
                url = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(days=7),
                    method="GET"
                )
                return url
            except Exception as e:
                logger.warning(f"Could not generate signed URL (likely due to ADC): {e}. Falling back to public URL.")
                # Return standard public URL (User must make bucket public)
                return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"

    def generate_thumbnail(self, video_path: Path, output_path: Path) -> bool:
        """Generate a thumbnail from the video."""
        try:
            # Get video duration first to pick a middle frame
            probe_cmd = [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)
            ]
            result = subprocess.run(probe_cmd, capture_output=True, text=True)
            duration = float(result.stdout.strip())
            timestamp = duration / 2

            cmd = [
                "ffmpeg", "-y",
                "-ss", str(timestamp),
                "-i", str(video_path),
                "-vframes", "1",
                "-q:v", "2",
                str(output_path)
            ]
            
            logger.info("Generating thumbnail", command=" ".join(cmd))
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error("Thumbnail generation failed", stderr=result.stderr)
                return False
                
            return True
        except Exception as e:
            logger.error("Thumbnail generation error", error=str(e))
            return False


async def process_viral_candidate(candidate: ViralCandidate) -> Optional[ProcessedClip]:
    """
    Main processing function for a viral candidate.
    
    1. Fetch VOD segments
    2. Stitch together
    3. Transcode to MP4
    4. Upload to GCS
    5. Publish clips-ready event
    """
    logger.info(
        "Processing viral candidate",
        session_id=candidate.session_id,
        stream_id=candidate.stream_id,
        platform=candidate.platform,
        timestamp_start=candidate.timestamp_start,
        timestamp_end=candidate.timestamp_end,
        viral_score=candidate.viral_score,
    )
    
    # Check if platform is Kick - VOD API is not available for Kick
    if candidate.platform == "KICK":
        logger.warning(
            "Kick VOD fetching not yet supported - skipping clip",
            session_id=candidate.session_id,
            channel_name=candidate.channel_name,
        )
        # TODO: Implement Kick VOD fetching when API is available
        # For now, return None to skip clip processing
        return None
    
    fetcher = TwitchVODFetcher()
    processor = ClipProcessor()
    
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        
        # Get VOD URL and start time if not provided
        vod_url = candidate.vod_url
        vod_start_time = 0.0
        
        if not vod_url and candidate.channel_name:
            vod_result = await fetcher.get_vod_url(
                candidate.channel_name,
                candidate.stream_id,
                target_timestamp=candidate.timestamp_start
            )
            if vod_result:
                vod_url, vod_start_time = vod_result
            
        if not vod_url:
            logger.error("No VOD URL available", session_id=candidate.session_id)
            return None
        
        # Convert Unix timestamps to relative offsets from VOD start
        # yt-dlp expects seconds from start of video, not Unix epoch
        if vod_start_time > 0:
            relative_start = candidate.timestamp_start - vod_start_time
            relative_end = candidate.timestamp_end - vod_start_time
            logger.info(
                "Converting timestamps",
                unix_start=candidate.timestamp_start,
                unix_end=candidate.timestamp_end,
                vod_start=vod_start_time,
                relative_start=relative_start,
                relative_end=relative_end,
            )
        else:
            # Fallback: assume timestamps are already relative
            relative_start = candidate.timestamp_start
            relative_end = candidate.timestamp_end
        
        # Calculate time range with buffer
        start_time = max(0, relative_start - settings.clip_duration_before)
        end_time = relative_end + settings.clip_duration_after
        
        # Enforce max duration
        if end_time - start_time > settings.max_clip_duration:
            end_time = start_time + settings.max_clip_duration
        
        # Safety check: Validate end_time isn't too far in the future
        # For live streams, the VOD might not have caught up yet
        current_time = asyncio.get_event_loop().time()
        expected_vod_duration = current_time - vod_start_time if vod_start_time > 0 else 0
        
        if vod_start_time > 0 and end_time > expected_vod_duration:
            # The clip we need is beyond what the VOD currently has available
            # This can happen for very recent viral moments on live streams
            time_to_wait = end_time - expected_vod_duration + 30  # Add 30s buffer
            
            if time_to_wait > 300:  # Max 5 minutes wait
                logger.error(
                    "Clip too far in future, cannot wait",
                    end_time=end_time,
                    expected_vod_duration=expected_vod_duration,
                    time_to_wait=time_to_wait,
                )
                return None
            
            logger.warning(
                "VOD hasn't caught up yet, waiting",
                end_time=end_time,
                expected_vod_duration=expected_vod_duration,
                wait_seconds=time_to_wait,
            )
            await asyncio.sleep(time_to_wait)
        
        logger.info("Downloading clip", start=start_time, end=end_time)
        
        # Download segments
        segments = await fetcher.download_segments(
            vod_url,
            start_time,
            end_time,
            tmp_path,
        )
        
        if not segments:
            logger.error("Failed to download segments")
            return None
        
        # Stitch segments (yt-dlp produces one file, so this just renames)
        stitched_path = tmp_path / "stitched.ts"
        if not processor.stitch_segments(segments, stitched_path):
            logger.error("Failed to stitch segments")
            return None
        
        # Transcode to MP4
        output_path = tmp_path / "final.mp4"
        if not processor.transcode_to_mp4(stitched_path, output_path):
            logger.error("Failed to transcode")
            return None
        
        # Upload to GCS
        blob_name = f"clips/{candidate.user_id}/{candidate.stream_id}/{candidate.session_id}.mp4"
        gcs_url = processor.upload_to_gcs(
            output_path,
            settings.processed_clips_bucket,
            blob_name,
        )
        
        # Generate & Upload Thumbnail
        thumbnail_url = None
        thumb_path = tmp_path / "thumb.jpg"
        if processor.generate_thumbnail(output_path, thumb_path):
            thumb_blob = f"thumbnails/{candidate.user_id}/{candidate.stream_id}/{candidate.session_id}.jpg"
            try:
                thumbnail_url = processor.upload_to_gcs(
                    thumb_path,
                    settings.thumbnails_bucket,
                    thumb_blob
                )
                logger.info("Thumbnail uploaded", url=thumbnail_url)
            except Exception as e:
                logger.error("Failed to upload thumbnail", error=str(e))
        
        file_size = output_path.stat().st_size
        duration = end_time - start_time
        
        logger.info(
            "Clip processed successfully",
            gcs_url=gcs_url,
            duration=duration,
            size_mb=file_size / (1024 * 1024),
        )
        
        return ProcessedClip(
            gcs_url=gcs_url,
            duration=duration,
            file_size=file_size,
            format="mp4",
            thumbnail_url=thumbnail_url,
        )


async def publish_clip_ready(candidate: ViralCandidate, clip: ProcessedClip) -> None:
    """Publish a clips-ready event to Pub/Sub."""
    import json
    
    publisher = None
    if os.getenv("PUBSUB_EMULATOR_HOST"):
        publisher = pubsub_v1.PublisherClient(
            credentials=auth_credentials.AnonymousCredentials()
        )
    else:
        publisher = pubsub_v1.PublisherClient()
    topic_path = publisher.topic_path(
        settings.gcp_project_id,
        settings.clips_ready_topic
    )
    
    message = {
        "userId": candidate.user_id,
        "streamId": candidate.stream_id,
        "sessionId": candidate.session_id,
        "clipUrl": clip.gcs_url,
        "duration": clip.duration,
        "viralScore": candidate.viral_score,
        "reason": candidate.reason,
        "caption": candidate.caption,
        "hashtags": candidate.hashtags,
    }
    
    future = publisher.publish(
        topic_path,
        json.dumps(message).encode("utf-8"),
    )
    
    message_id = future.result()
    logger.info("Published clips-ready event", message_id=message_id)

    # Notify API directly (to update DB/UI immediately)
    if settings.api_url:
        try:
            async with aiohttp.ClientSession() as session:
                api_payload = {
                    "userId": candidate.user_id,
                    "sessionId": candidate.session_id,
                    "streamId": candidate.stream_id,
                    "clipUrl": clip.gcs_url,
                    "duration": clip.duration,
                    "viralScore": candidate.viral_score,
                    "caption": candidate.caption,
                    "hashtags": candidate.hashtags,
                }
                headers = {"x-internal-key": settings.internal_api_key}
                logger.info("Notifying API", payload=api_payload)
                async with session.post(
                    f"{settings.api_url}/internal/clips/ready",
                    json=api_payload,
                    headers=headers
                ) as resp:
                    if resp.status == 200:
                        logger.info("Notified API of clip ready")
                    else:
                        body = await resp.text()
                        logger.error("Failed to notify API", status=resp.status, body=body)
        except Exception as e:
            logger.error("Error notifying API", error=str(e))


async def handle_message(message_data: dict) -> bool:
    """Handle a single Pub/Sub message."""
    try:
        candidate = ViralCandidate(
            user_id=message_data["userId"],
            session_id=message_data["sessionId"],
            stream_id=message_data["streamId"],
            timestamp_start=message_data["timestampStart"],
            timestamp_end=message_data["timestampEnd"],
            viral_score=message_data.get("viralScore", 0.8),
            reason=message_data.get("reason", ""),
            platform=message_data.get("platform", "TWITCH"),
            vod_url=message_data.get("vodUrl"),
            channel_name=message_data.get("channelName"),
            caption=message_data.get("caption"),
            hashtags=message_data.get("hashtags", []),
        )
        
        clip = await process_viral_candidate(candidate)
        
        if clip:
            await publish_clip_ready(candidate, clip)
            return True
        else:
            # If processing returned None, it means a logical failure (e.g. no VOD, download failed)
            # We should ACK this to prevent infinite retries of bad data
            logger.warning("Message processing failed (logical), dropping", session_id=candidate.session_id)
            return True
            
    except KeyError as e:
        logger.error("Message missing required key", key=str(e))
        return True  # ACK to drop invalid message
    except Exception as e:
        logger.exception("Error processing message", error=str(e))
        return False


async def main():
    """
    Main entry point for Cloud Run Job.
    
    In Cloud Run Jobs mode, this pulls a batch of messages
    and processes them, then exits.
    """
    import json
    
    logger.info("Sniper Service starting...")
    
    # Check for single message mode (test/debug)
    test_message = os.getenv("TEST_MESSAGE")
    if test_message:
        message_data = json.loads(test_message)
        await handle_message(message_data)
        return
    
    # Setup subscriber
    emulator_host = os.getenv("PUBSUB_EMULATOR_HOST")
    if emulator_host:
        subscriber = pubsub_v1.SubscriberClient(
            credentials=auth_credentials.AnonymousCredentials()
        )
    else:
        subscriber = pubsub_v1.SubscriberClient()
        
    subscription_path = subscriber.subscription_path(
        settings.gcp_project_id,
        settings.viral_candidates_subscription
    )

    # Main processing function
    async def process_batch():
        response = subscriber.pull(
            request={
                "subscription": subscription_path,
                "max_messages": 10,
            },
            timeout=30,
        )
        
        if not response.received_messages:
            return 0
            
        logger.info(f"Received {len(response.received_messages)} messages")
        
        processed_count = 0
        for received_message in response.received_messages:
            try:
                message_data = json.loads(
                    received_message.message.data.decode("utf-8")
                )
                
                success = await handle_message(message_data)
                
                if success:
                    # ACK immediately after successful processing
                    subscriber.acknowledge(
                        request={
                            "subscription": subscription_path,
                            "ack_ids": [received_message.ack_id],
                        }
                    )
                    logger.info("Message acknowledged", session_id=message_data.get("sessionId"))
                    processed_count += 1
                else:
                    # Nack to allow retry
                    subscriber.modify_ack_deadline(
                        request={
                            "subscription": subscription_path,
                            "ack_ids": [received_message.ack_id],
                            "ack_deadline_seconds": 0,
                        }
                    )
                    
            except Exception as e:
                logger.exception("Message processing error", error=str(e))
                # Nack on exception to allow retry
                try:
                    subscriber.modify_ack_deadline(
                        request={
                            "subscription": subscription_path,
                            "ack_ids": [received_message.ack_id],
                            "ack_deadline_seconds": 0,
                        }
                    )
                except Exception:
                    pass
        
        logger.info(f"Processed {processed_count}/{len(response.received_messages)} messages")
            
        return len(response.received_messages)

    # If running locally/emulator, loop forever
    if emulator_host:
        logger.info("Running in long-polling mode (Emulator detected)")
        while True:
            try:
                await process_batch()
                await asyncio.sleep(1) # Sleep to avoid hammering empty queue
            except Exception as e:
                # Timeout is normal when no messages
                # Ignore 504 Deadline Exceeded (emulator timeout)
                err_str = str(e)
                if "DeadlineExceeded" in err_str or "504 Deadline Exceeded" in err_str:
                    pass
                else:
                    logger.error("Error in polling loop", error=err_str)
                await asyncio.sleep(1)
    else:
        # Standard Cloud Run Job behavior (one batch then exit)
        try:
            await process_batch()
        except Exception as e:
             logger.error("Error in job execution", error=str(e))

    logger.info("Sniper Service completed")


if __name__ == "__main__":
    asyncio.run(main())
