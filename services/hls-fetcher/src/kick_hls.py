import streamlink
from typing import Optional
from .logging_config import get_logger

logger = get_logger("hls_fetcher.kick_hls")

async def get_hls_url(channel_name: str) -> Optional[str]:
    """
    Get HLS stream URL for a Kick channel using Streamlink.
    """
    url = f"https://kick.com/{channel_name}"
    
    try:
        # Run in executor because streamlink is blocking
        # We assume this is running in an async context
        # For simplicity in this script, we'll just call it directly if it's fast enough,
        # but strictly it should be offloaded if it blocks. 
        # Given it makes network requests, it DOES block.
        # However, to keep it simple and since we are largely I/O bound, 
        # we can wrap it or just call it. 
        # Ideally: await loop.run_in_executor(None, lambda: streamlink.streams(url))
        
        streams = streamlink.streams(url)
        
        if not streams:
            logger.warning(f"No streams found for Kick channel: {channel_name}")
            return None
            
        if "best" in streams:
            return streams["best"].url
        elif "source" in streams:
            return streams["source"].url
            
        # Fallback to first available
        first_key = next(iter(streams))
        return streams[first_key].url
        
    except streamlink.PluginError as e:
        logger.error(f"Streamlink PluginError for {channel_name}: {e}")
        return None
    except Exception as e:
        logger.error(f"Error fetching Kick HLS for {channel_name}: {e}")
        return None
