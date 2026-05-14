"""
HLS Fetcher - Audio segment streaming and processing
"""
import asyncio
import aiohttp
import m3u8
from typing import AsyncGenerator, Optional
from dataclasses import dataclass


@dataclass
class AudioSegment:
    """Represents a single audio segment from HLS stream."""
    sequence: int
    duration: float
    data: bytes
    timestamp: float = 0.0  # Unix epoch timestamp from program_date_time


async def stream_audio_segments(
    stream_url: str,
    stop_event: asyncio.Event
) -> AsyncGenerator[AudioSegment, None]:
    """
    Stream audio segments from an HLS playlist.
    Yields AudioSegment objects containing the raw audio data.
    """
    seen_sequences: set[int] = set()
    consecutive_errors = 0
    max_consecutive_errors = 5  # Stop after ~10 seconds of failures
    
    async with aiohttp.ClientSession() as session:
        while not stop_event.is_set():
            try:
                # Fetch current playlist
                async with session.get(stream_url) as response:
                    if response.status != 200:
                        print(f"[Stream] Playlist fetch failed: {response.status}")
                        consecutive_errors += 1
                        if consecutive_errors >= max_consecutive_errors:
                            print(f"[Stream] Too many playlist failures ({consecutive_errors}), stopping")
                            break
                        await asyncio.sleep(2)
                        continue
                    
                    # Reset error count on success
                    consecutive_errors = 0
                    playlist_text = await response.text()
                
                playlist = m3u8.loads(playlist_text)
                
                if playlist.is_variant:
                     # If we somehow got a master playlist instead of media playlist
                     print("[Stream] Unexpected variant playlist")
                     break

                # Process new segments
                for i, segment in enumerate(playlist.segments):
                    seq = playlist.media_sequence + i
                    
                    if seq in seen_sequences:
                        continue
                    
                    seen_sequences.add(seq)
                    
                    # Fetch segment data
                    segment_url = segment.absolute_uri
                    async with session.get(segment_url) as seg_response:
                        if seg_response.status != 200:
                            continue
                        
                        data = await seg_response.read()
                        
                        # Extract timestamp from HLS playlist (program_date_time)
                        import time
                        segment_timestamp = time.time()  # Default to now
                        if hasattr(segment, 'program_date_time') and segment.program_date_time:
                            segment_timestamp = segment.program_date_time.timestamp()
                        
                        yield AudioSegment(
                            sequence=seq,
                            duration=segment.duration,
                            data=data,
                            timestamp=segment_timestamp
                        )
                
                # Check for stream end tag
                if getattr(playlist, 'is_endlist', False):
                    print("[Stream] Stream ended (EXT-X-ENDLIST)")
                    break

                # Wait before checking for new segments
                # Target duration is usually 2 seconds for Twitch
                target_duration = playlist.target_duration or 2
                await asyncio.sleep(target_duration / 2)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[Stream] Error: {e}")
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    break
                await asyncio.sleep(2)


async def extract_audio_from_ts(ts_data: bytes) -> Optional[bytes]:
    """
    Extract raw audio from MPEG-TS segment.
    Uses FFmpeg via subprocess.
    Returns PCM audio data.
    """
    import subprocess
    import tempfile
    import os
    
    # Write TS to temp file
    with tempfile.NamedTemporaryFile(suffix=".ts", delete=False) as f:
        f.write(ts_data)
        ts_path = f.name
    
    pcm_path = ts_path.replace(".ts", ".pcm")
    
    try:
        # Extract audio with FFmpeg
        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-i", ts_path,
            "-vn",  # No video
            "-acodec", "pcm_s16le",  # PCM 16-bit
            "-ar", "16000",  # 16kHz sample rate (Deepgram optimal)
            "-ac", "1",  # Mono
            "-f", "s16le",  # Raw PCM
            pcm_path,
            "-y",  # Overwrite
            "-loglevel", "error",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        
        await process.wait()
        
        if process.returncode != 0:
            return None
        
        # Read PCM data
        with open(pcm_path, "rb") as f:
            return f.read()
    
    finally:
        # Cleanup temp files
        for path in [ts_path, pcm_path]:
            if os.path.exists(path):
                os.unlink(path)
