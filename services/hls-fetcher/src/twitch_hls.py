"""
HLS Fetcher - Twitch HLS URL Fetching
"""
import aiohttp
import json
from typing import Optional
from .config import settings


async def get_playback_access_token(channel_name: str) -> Optional[dict]:
    """
    Get Twitch playback access token using GQL API.
    This is required to access the HLS stream.
    
    Note: We use Twitch's public web player Client-ID, not our OAuth app ID.
    This is what browsers use when watching Twitch - it's for playback access.
    """
    query = """
    query PlaybackAccessToken($login: String!) {
        streamPlaybackAccessToken(
            channelName: $login,
            params: {
                platform: "web",
                playerBackend: "mediaplayer",
                playerType: "site"
            }
        ) {
            value
            signature
        }
    }
    """
    
    # Twitch's public web player Client-ID (used by browsers)
    # This is NOT our OAuth app ID - it's for public playback access
    TWITCH_WEB_CLIENT_ID = "ue6666qo983tsx6so1t0vnawi233wa"
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://gql.twitch.tv/gql",
            json={
                "query": query,
                "variables": {"login": channel_name}
            },
            headers={
                "Client-ID": TWITCH_WEB_CLIENT_ID,
                "Content-Type": "application/json",
            }
        ) as response:
            if response.status != 200:
                text = await response.text()
                print(f"[Twitch GQL] Error {response.status}: {text[:200]}")
                return None
            
            data = await response.json()
            token_data = data.get("data", {}).get("streamPlaybackAccessToken")
            
            if not token_data:
                print(f"[Twitch GQL] No token returned for {channel_name}")
                return None
            
            return token_data


async def get_hls_url(channel_name: str) -> Optional[str]:
    """
    Get the HLS manifest URL for a Twitch channel.
    Returns the audio-only URL if available.
    """
    token_data = await get_playback_access_token(channel_name)
    
    if not token_data:
        return None
    
    # Build HLS URL
    import urllib.parse
    
    token = urllib.parse.quote(token_data["value"])
    sig = token_data["signature"]
    
    hls_url = (
        f"https://usher.ttvnw.net/api/channel/hls/{channel_name}.m3u8"
        f"?token={token}&sig={sig}&allow_source=true&allow_audio_only=true"
    )
    
    return hls_url


async def get_audio_stream_url(channel_name: str) -> Optional[str]:
    """
    Get the audio-only stream URL from the HLS manifest.
    Falls back to lowest quality video if audio-only not available.
    """
    import m3u8
    
    master_url = await get_hls_url(channel_name)
    if not master_url:
        return None
    
    async with aiohttp.ClientSession() as session:
        async with session.get(master_url) as response:
            if response.status != 200:
                print(f"[HLS] Failed to fetch manifest: {response.status}")
                return None
            
            manifest_text = await response.text()
    
    try:
        playlist = m3u8.loads(manifest_text)
        
        # Look for audio-only stream first
        for pl in playlist.playlists:
            if "audio_only" in (pl.stream_info.video or ""):
                return pl.absolute_uri
        
        # Fall back to lowest bandwidth (usually audio or 160p)
        if playlist.playlists:
            sorted_playlists = sorted(
                playlist.playlists,
                key=lambda p: p.stream_info.bandwidth or 0
            )
            return sorted_playlists[0].absolute_uri
        
        return None
    except Exception as e:
        print(f"[HLS] Error parsing manifest: {e}")
        return None
