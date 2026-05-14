"""
Publisher Webhook Cloud Function
Triggered by Pub/Sub when user approves a card for publishing

Handles:
- Posting to Twitter/X via API
- Posting to Threads via Graph API
- Posting to TikTok via API
- Posting to Instagram via Graph API
- Posting to YouTube Shorts via Data API
- Rate limiting via Redis
"""
import json
import os
import base64
import time
import io
import requests
import psycopg2
import redis
import functions_framework
from typing import Optional, Tuple
import google.oauth2.credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload


class IdempotencyChecker:
    """
    Redis-based idempotency checker to prevent duplicate social media posts.
    Uses card_id + platform as deduplication key.
    """
    
    KEY_PREFIX = "publisher:idempotent"
    PROCESSING_TTL = 600  # 10 minutes - max expected processing time
    COMPLETED_TTL = 86400  # 24 hours - remember completed posts
    
    def __init__(self, redis_url: Optional[str] = None):
        url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis = redis.from_url(url, decode_responses=True)
    
    def _key(self, card_id: str, platform: str) -> str:
        return f"{self.KEY_PREFIX}:{card_id}:{platform}"
    
    def check_and_mark_processing(self, card_id: str, platform: str) -> Tuple[bool, str]:
        """
        Check if this card+platform has been processed.
        Returns (should_process, status) where:
        - should_process=True: First time seeing this, marked as PROCESSING
        - should_process=False: Already processed or in progress
        """
        key = self._key(card_id, platform)
        status = self.redis.get(key)
        
        if status == "COMPLETED":
            return (False, "already_completed")
        
        if status == "PROCESSING":
            return (False, "in_progress")
        
        # Mark as processing with TTL (in case of crash/timeout)
        self.redis.set(key, "PROCESSING", ex=self.PROCESSING_TTL)
        return (True, "new")
    
    def mark_completed(self, card_id: str, platform: str):
        """Mark card+platform as successfully completed."""
        key = self._key(card_id, platform)
        self.redis.set(key, "COMPLETED", ex=self.COMPLETED_TTL)
    
    def clear(self, card_id: str, platform: str):
        """Clear the key to allow retry (e.g., on failure)."""
        key = self._key(card_id, platform)
        self.redis.delete(key)


class RateLimiter:
    """Rate limiter using Redis for stateless Cloud Function compatibility."""
    
    # Platform-specific rate limits (requests per hour)
    LIMITS = {
        "twitter": 50,
        "threads": 50,
        "tiktok": 20,
        "instagram": 25,
        "youtube": 10,
    }
    
    KEY_PREFIX = "publisher"  # Namespace for this service
    
    def __init__(self, redis_url: Optional[str] = None):
        url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis = redis.from_url(url, decode_responses=True)
    
    def _limit_key(self, user_id: str, platform: str) -> str:
        """Key for user+platform rate limit counter."""
        return f"{self.KEY_PREFIX}:limit:{user_id}:{platform}"
    
    def check_and_increment(self, user_id: str, platform: str) -> Tuple[bool, str]:
        """
        Check if request is allowed and increment counter.
        Returns (allowed, reason).
        """
        limit = self.LIMITS.get(platform, 30)
        key = self._limit_key(user_id, platform)
        
        # Get current count
        current = self.redis.get(key)
        current_count = int(current) if current else 0
        
        if current_count >= limit:
            ttl = self.redis.ttl(key)
            return False, f"Rate limited: {current_count}/{limit} requests this hour. Resets in {ttl}s."
        
        # Increment with 1 hour TTL
        pipe = self.redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, 3600)  # 1 hour window
        pipe.execute()
        
        return True, "ok"


def update_connection_tokens(user_id: str, platform: str, new_tokens: dict) -> None:
    """Update connection tokens in the database."""
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()
        
        # Determine what fields to update
        # Token endpoints return different expirations
        expires_in = new_tokens.get("expires_in")
        expires_at = None
        if expires_in:
            expires_at = int(time.time()) + int(expires_in)
            
        cursor.execute("""
            UPDATE connections
            SET access_token = %s,
                refresh_token = COALESCE(%s, refresh_token),
                expires_at = COALESCE(to_timestamp(%s), expires_at),
                updated_at = NOW()
            WHERE user_id = %s AND provider = %s
        """, (
            new_tokens["access_token"], 
            new_tokens.get("refresh_token"), 
            expires_at, 
            user_id, 
            platform.upper()
        ))
        conn.commit()
        conn.close()
        print(f"Updated tokens for {platform}")
    except Exception as e:
        print(f"Failed to update tokens: {e}")


def refresh_access_token(user_id: str, platform: str, refresh_token: str) -> dict | None:
    """Refresh the access token for the given platform."""
    print(f"Refreshing token for {platform}...")
    
    try:
        if platform == "tiktok":
            # TikTok Refresh
            # Needs client_key and client_secret from env
            resp = requests.post(
                "https://open.tiktokapis.com/v2/oauth/token/",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "client_key": os.getenv("TIKTOK_CLIENT_KEY"),
                    "client_secret": os.getenv("TIKTOK_CLIENT_SECRET"),
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token
                }
            )
            data = resp.json()
            if resp.ok and "access_token" in data:
                return data
                
        elif platform == "instagram" or platform == "threads":
            # Instagram/Threads Refresh (Graph API)
            # Long-lived tokens are refreshed by exchanging the *valid* access token, 
            # OR (if we implemented it) exchanging a refresh_token. 
            # Standard Instagram Graph API uses: GET /refresh_access_token?grant_type=ig_refresh_token&access_token={long-lived-token}
            # Note: The DB 'refresh_token' might be the same as 'access_token' for IG if stored that way, 
            # or we are using the actual logic.
            # Assuming we are refreshing a Long-Lived User Access Token:
            
            # Note: We need the CURRENT access token to refresh it, OR a specific refresh token if the flow supports it.
            # For IG Graph API: "You can refresh long-lived tokens... by querying the GET /refresh_access_token endpoint"
            # It accepts the OLD token.
            
            # Since we only passed refresh_token here, we might need to change signature or 
            # assume refresh_token in DB holds the token to be refreshed (if they are the same).
            # Let's assume we pass the current access token as 'refresh_token' for IG if strictly needed, 
            # BUT usually standard OAuth uses the refresh_token field.
            
            # Let's try the standard refresh flow via graph api:
            resp = requests.get(
                "https://graph.instagram.com/refresh_access_token",
                params={
                    "grant_type": "ig_refresh_token",
                    "access_token": refresh_token # In IG, you refresh the token itself often
                }
            )
            data = resp.json()
            if resp.ok and "access_token" in data:
                return data

        elif platform == "youtube":
            # Google/YouTube Refresh
            resp = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": os.getenv("YOUTUBE_CLIENT_ID"),
                    "client_secret": os.getenv("YOUTUBE_CLIENT_SECRET"),
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token"
                }
            )
            data = resp.json()
            if resp.ok and "access_token" in data:
                return data

        elif platform == "twitter":
            # Twitter/X Refresh (OAuth 2.0)
            # Requires Basic Auth with Client ID:Secret
            client_id = os.getenv("TWITTER_CLIENT_ID")
            client_secret = os.getenv("TWITTER_CLIENT_SECRET")
            auth_str = f"{client_id}:{client_secret}"
            b64_auth = base64.b64encode(auth_str.encode()).decode()
            
            resp = requests.post(
                "https://api.twitter.com/2/oauth2/token",
                headers={
                    "Authorization": f"Basic {b64_auth}",
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                data={
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                    "client_id": client_id # explicitly required in body sometimes too
                }
            )
            data = resp.json()
            if resp.ok and "access_token" in data:
                return data
                
    except Exception as e:
        print(f"Error refreshing {platform}: {e}")
        
    print(f"Failed to refresh {platform} token")
    return None


def get_connection_tokens(user_id: str, platform: str) -> dict | None:
    """Fetch OAuth tokens directly from PostgreSQL and refresh if needed."""
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()
        db_platform = platform.upper()
        
        cursor.execute("""
            SELECT access_token, refresh_token, expires_at, platform_user_id
            FROM connections
            WHERE user_id = %s AND provider = %s
        """, (user_id, db_platform))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            print(f"No connection found for user {user_id} and platform {platform}")
            return None
            
        access_token, refresh_token, expires_at_val, platform_user_id = row
        
        # Handle datetime object from psycopg2
        expires_at = None
        if expires_at_val:
            if hasattr(expires_at_val, 'timestamp'):
                expires_at = int(expires_at_val.timestamp())
            else:
                expires_at = int(expires_at_val)

        # Check if expired (or expiring in < 5 mins)
        # For Instagram/Threads, also refresh proactively if the token is "old" (> 10 days used)
        # Long-lived tokens last 60 days. If expires_at is < 50 days from now, it's > 10 days old.
        # 50 days = 4320000 seconds.
        now = int(time.time())
        should_refresh = False
        
        if expires_at and now > (expires_at - 300):
            should_refresh = True
        elif (platform == "instagram" or platform == "threads") and expires_at and now > (expires_at - 4320000):
             # Token is still valid but older than 10 days. Refresh it to stay "indefinite".
             print(f"Token is >10 days old for {platform}, refreshing proactively...")
             should_refresh = True
            
        if should_refresh and refresh_token:
            print(f"Token expired for {platform}, attempting refresh...")
            # For IG, we might use access_token as the refresh source depending on flow. 
            # Standardizing: Pass refresh_token. If IG, ensure DB stores valid token in refresh_token column?
            # Actually IG Graph API uses the access_token to refresh itself. 
            # If our DB refresh_token is null for IG, we use access_token.
            refresh_source = refresh_token
            if (platform == "instagram" or platform == "threads") and not refresh_source:
                 refresh_source = access_token
                 
            new_tokens = refresh_access_token(user_id, platform, refresh_source)
            if new_tokens:
                update_connection_tokens(user_id, platform, new_tokens)
                return {
                    "accessToken": new_tokens["access_token"],
                    "refreshToken": new_tokens.get("refresh_token") or refresh_token,
                    "expiresAt": int(time.time()) + new_tokens.get("expires_in", 3600),
                    "platformUserId": platform_user_id
                }
            else:
                print("Refresh failed, attempting with old token...")
        
        return {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "expiresAt": expires_at,
            "platformUserId": platform_user_id
        }
    except Exception as e:
        print(f"Database error: {e}")
        return None


# ============================================================================
# Caption Preparation with Platform Limits
# ============================================================================

# Platform-specific character limits
PLATFORM_LIMITS = {
    "tiktok": 150,      # Title only, very strict
    "twitter": 280,     # Standard tweet limit
    "threads": 500,     # Meta's limit for threads
    "instagram": 2200,  # Very generous for reels
    "youtube": 100,     # Title limit (description is separate)
}

# Branded watermark - shown for free tier users
BRANDED_WATERMARK = "🎬 Clipped by ViralCue AI"


def get_user_subscription_tier(user_id: str) -> str:
    """
    Get user's subscription tier from database.
    Returns tier name (e.g., 'free', 'pro', 'business') or 'free' if not found.
    """
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sp.name 
            FROM users u
            LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
            WHERE u.id = %s
        """, (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row and row[0]:
            return row[0].lower()
        return "free"
    except Exception as e:
        print(f"Error getting subscription tier: {e}")
        return "free"


def prepare_caption(
    text: str, 
    platform: str, 
    stream_url: str | None = None,
    include_stream_link: bool = True,
    user_tier: str = "free"
) -> str:
    """
    Prepare caption with stream link and watermark, respecting platform limits.
    
    Args:
        text: Original caption text
        platform: Target platform (tiktok, twitter, etc.)
        stream_url: Optional stream URL to append
        include_stream_link: Whether to include stream link
        user_tier: User's subscription tier (free users get watermark)
    
    Returns:
        Prepared caption within platform character limit
    """
    limit = PLATFORM_LIMITS.get(platform, 280)  # Default to Twitter limit
    
    # Build suffix (stream link + watermark)
    suffix_parts = []
    
    # Add stream link if requested and URL provided
    if include_stream_link and stream_url:
        suffix_parts.append(f"🔴 {stream_url}")
    
    # Add watermark for free tier only
    if user_tier == "free":
        suffix_parts.append(BRANDED_WATERMARK)
    
    suffix = ""
    if suffix_parts:
        suffix = "\n\n" + "\n".join(suffix_parts) if text else "\n".join(suffix_parts)
    
    # Calculate available space for main text
    available = limit - len(suffix)
    
    if available < 50:
        # If suffix takes too much space, prioritize content over stream link
        # Keep watermark for free tier, drop stream link
        suffix_parts = [BRANDED_WATERMARK] if user_tier == "free" else []
        suffix = "\n\n" + "\n".join(suffix_parts) if suffix_parts else ""
        available = limit - len(suffix)
    
    # Truncate text if needed
    if len(text) > available:
        # Try to break at word boundary
        truncated = text[:available - 3]
        last_space = truncated.rfind(' ')
        if last_space > available - 30:  # Only use word break if reasonably close
            truncated = truncated[:last_space]
        text = truncated.rstrip() + "..."
    
    return text + suffix


def post_to_tiktok(access_token: str, video_url: str, caption: str) -> dict:
    """
    Post video to TikTok using FILE_UPLOAD method.
    This streams the video from GCS to TikTok without downloading to disk.
    Uses FILE_UPLOAD instead of PULL_FROM_URL to avoid domain verification issues.
    """
    print("Initializing TikTok upload with FILE_UPLOAD method...")
    
    # Step 1: Get file size from GCS via HEAD request
    try:
        head_resp = requests.head(video_url, allow_redirects=True)
        if not head_resp.ok:
            return {"success": False, "error": f"Failed to get video metadata: {head_resp.status_code}"}
        
        file_size = int(head_resp.headers.get('Content-Length', 0))
        if file_size == 0:
            return {"success": False, "error": "Could not determine video file size"}
        
        print(f"Video size: {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
    except Exception as e:
        return {"success": False, "error": f"Failed to get video size: {str(e)}"}
    
    # Determine privacy level based on environment
    # In development (unaudited app), use SELF_ONLY
    # In production (audited app), use PUBLIC_TO_EVERYONE
    is_production = os.getenv("ENV", "development").lower() == "production"
    privacy_level = "PUBLIC_TO_EVERYONE" if is_production else "SELF_ONLY"
    
    # Step 2: Initialize upload with FILE_UPLOAD source type (with retries for CDN issues)
    import time
    max_init_retries = 3
    init_data = None
    
    for init_attempt in range(1, max_init_retries + 1):
        print(f"TikTok init attempt {init_attempt}/{max_init_retries}...")
        try:
            init_response = requests.post(
                "https://open.tiktokapis.com/v2/post/publish/video/init/",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "post_info": {
                        "title": caption[:150],  # TikTok max title length
                        "privacy_level": privacy_level,
                        "disable_duet": False,
                        "disable_stitch": False,
                        "disable_comment": False,
                        "video_cover_timestamp_ms": 1000
                    },
                    "source_info": {
                        "source": "FILE_UPLOAD",
                        "video_size": file_size,
                        "chunk_size": file_size,  # Single chunk upload for simplicity
                        "total_chunk_count": 1
                    }
                },
                timeout=30
            )
            
            # Check for transient errors worth retrying
            if not init_response.ok:
                error_text = init_response.text.lower()
                if "service unavailable" in error_text or "zero size" in error_text or init_response.status_code >= 500:
                    print(f"TikTok init transient error on attempt {init_attempt}: {init_response.status_code}")
                    if init_attempt < max_init_retries:
                        time.sleep(2 ** init_attempt)
                        continue
                return {"success": False, "error": f"TikTok init failed: {init_response.text}"}
            
            init_data = init_response.json()
            if init_data.get("error", {}).get("code") == "ok":
                break  # Success, exit retry loop
            
            # API returned an error response
            error_code = init_data.get("error", {}).get("code", "")
            if init_attempt < max_init_retries:
                time.sleep(2 ** init_attempt)
                continue
            return {"success": False, "error": f"TikTok init error: {init_data}"}
            
        except requests.exceptions.Timeout:
            print(f"TikTok init timeout on attempt {init_attempt}")
            if init_attempt < max_init_retries:
                time.sleep(2 ** init_attempt)
                continue
            return {"success": False, "error": "TikTok init timed out"}
        except Exception as e:
            return {"success": False, "error": f"TikTok init exception: {str(e)}"}
    
    if not init_data:
        return {"success": False, "error": "TikTok init failed after max retries"}
    
    upload_url = init_data.get("data", {}).get("upload_url")
    publish_id = init_data.get("data", {}).get("publish_id")
    
    if not upload_url:
        return {"success": False, "error": "No upload URL returned from TikTok"}
    
    print(f"Got TikTok upload URL, streaming video (publish_id: {publish_id})...")
    
    # Step 3: Download video to memory first (streaming can cause CloudFront issues)
    try:
        print("Downloading video from GCS to memory...")
        video_response = requests.get(video_url, timeout=120)
        video_response.raise_for_status()
        video_data = video_response.content
        actual_size = len(video_data)
        print(f"Downloaded {actual_size} bytes ({actual_size / (1024*1024):.2f} MB)")
    except Exception as e:
        return {"success": False, "error": f"Failed to download video from GCS: {str(e)}"}
    
    # Step 4: Upload to TikTok with retries
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            print(f"Uploading to TikTok (attempt {attempt}/{max_retries})...")
            upload_response = requests.put(
                upload_url,
                data=video_data,
                headers={
                    "Content-Type": "video/mp4",
                    "Content-Length": str(actual_size),
                    "Content-Range": f"bytes 0-{actual_size - 1}/{actual_size}"
                },
                timeout=180  # 3 minute timeout for upload
            )
            
            if upload_response.ok:
                print(f"TikTok upload successful (publish_id: {publish_id})")
                return {"success": True, "publishId": publish_id}
            
            # Check if it's a transient error worth retrying
            if upload_response.status_code in [500, 502, 503, 504] or "cloudfront" in upload_response.text.lower():
                print(f"Transient error on attempt {attempt}: {upload_response.status_code}")
                if attempt < max_retries:
                    import time
                    time.sleep(2 ** attempt)  # Exponential backoff
                    continue
            
            return {"success": False, "error": f"TikTok upload failed: {upload_response.text}"}
            
        except requests.exceptions.Timeout:
            print(f"Timeout on attempt {attempt}")
            if attempt < max_retries:
                continue
            return {"success": False, "error": "TikTok upload timed out after 3 minutes"}
        except Exception as e:
            return {"success": False, "error": f"Failed to upload to TikTok: {str(e)}"}
    
    return {"success": False, "error": "TikTok upload failed after max retries"}


def post_to_youtube(access_token: str, video_url: str, title: str, description: str) -> dict:
    print("Uploading to YouTube Shorts...")
    # Improve reliability
    import socket
    import random
    socket.setdefaulttimeout(120)  # 2 minutes global timeout
    
    try:
        credentials = google.oauth2.credentials.Credentials(token=access_token)
        youtube = build("youtube", "v3", credentials=credentials)
        
        # Stream video from URL to memory (no disk write)
        # Fix for Docker internal networking: replace localhost with service name
        internal_url = video_url.replace("localhost:4443", "gcs-emulator:4443")
        print(f"Streaming video from {internal_url}...")
        
        video_response = requests.get(internal_url, stream=True)
        video_response.raise_for_status()
        video_bytes = io.BytesIO(video_response.content)
        
        # Upload as Short
        # Use 1MB chunks for better speed/reliability balance
        chunk_size = 1024 * 1024 
        media = MediaIoBaseUpload(video_bytes, mimetype="video/mp4", resumable=True, chunksize=chunk_size)
        
        request = youtube.videos().insert(
            part="snippet,status",
            body={
                "snippet": {
                    "title": f"{title[:90]} #Shorts",  # Ensure #Shorts in title
                    "description": f"{description}\n\n#Shorts",
                    "categoryId": "22" # People & Blogs
                },
                "status": {
                    "privacyStatus": "public", # 'public', 'private', or 'unlisted'
                    "selfDeclaredMadeForKids": False
                }
            },
            media_body=media
        )
        
        # Execute upload with retries
        response = None
        while response is None:
            status, response = None, None
            retry_count = 0
            max_retries = 5
            
            while retry_count < max_retries:
                try:
                    status, response = request.next_chunk()
                    if status:
                        print(f"Uploaded {int(status.progress() * 100)}%")
                    break # Success, move to next chunk or finish
                except Exception as e:
                    print(f"Chunk upload failed (attempt {retry_count+1}/{max_retries}): {e}")
                    retry_count += 1
                    if retry_count >= max_retries:
                        raise e
                    sleep_time = (2 ** retry_count) + random.uniform(0, 1)
                    print(f"Retrying in {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
        
        print("YouTube upload complete")
        return {"success": True, "videoId": response["id"], "url": f"https://youtube.com/shorts/{response['id']}"}
        
    except Exception as e:
        print(f"YouTube upload failed: {e}")
        return {"success": False, "error": str(e)}


def post_to_instagram(access_token: str, ig_user_id: str, video_url: str, caption: str) -> dict:
    print("Posting to Instagram Reels...")
    
    # Step 1: Create container
    print("Creating media container...")
    # NOTE: Using graph.instagram.com for "Instagram Login" tokens (not Facebook Login)
    container_res = requests.post(
        f"https://graph.instagram.com/v21.0/{ig_user_id}/media",
        data={
            "media_type": "REELS",
            "video_url": video_url,
            "caption": caption,
            "access_token": access_token
        }
    )
    container_data = container_res.json()
    
    container_id = container_data.get("id")
    if not container_id:
        return {"success": False, "error": container_data}
    
    print(f"Container created: {container_id}. Waiting for processing...")
    
    # Step 2: Poll for processing (max 60s)
    # Instagram requires the media to be 'FINISHED' before publishing
    published = False
    for _ in range(12):
        time.sleep(5)
        status_res = requests.get(
            f"https://graph.instagram.com/v21.0/{container_id}",
            params={"fields": "status_code", "access_token": access_token}
        )
        status_data = status_res.json()
        code = status_data.get("status_code")
        print(f"Processing status: {code}")
        
        if code == "FINISHED":
            # Step 3: Publish
            print("Publishing container...")
            publish_res = requests.post(
                f"https://graph.instagram.com/v21.0/{ig_user_id}/media_publish",
                data={"creation_id": container_id, "access_token": access_token}
            )
            result = publish_res.json()
            if result.get("id"):
                return {"success": True, "mediaId": result.get("id")}
            else:
                return {"success": False, "error": result}
        elif code == "ERROR":
            return {"success": False, "error": "Media processing failed"}
            
    return {"success": False, "error": "Timed out waiting for media processing"}


def post_to_twitter(access_token: str, text: str) -> dict:
    print("Posting to Twitter (X)...")
    # Note: Video upload requires media/upload (v1.1) which is complex with OAuth 2.0
    # For MVP we just post text (with link if present in text)
    response = requests.post(
        "https://api.twitter.com/2/tweets",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        },
        json={"text": text}
    )
    
    if not response.ok:
        return {"success": False, "error": response.text}
        
    data = response.json()
    return {"success": True, "tweetId": data.get("data", {}).get("id")}


def post_to_threads(access_token: str, threads_user_id: str, text: str, video_url: str = None) -> dict:
    print("Posting to Threads...")
    media_type = "VIDEO" if video_url else "TEXT"
    
    # Step 1: Create container
    payload = {
        "media_type": media_type,
        "text": text,
        "access_token": access_token
    }
    if video_url:
        payload["video_url"] = video_url
        
    container_res = requests.post(
        f"https://graph.threads.net/v1.0/{threads_user_id}/threads",
        data=payload
    )
    container_data = container_res.json()
    container_id = container_data.get("id")
    
    if not container_id:
        return {"success": False, "error": container_data}
        
    # Waiting logic might be needed for threads video too, similar to IG?
    # Docs say "check status" but often it's faster. Let's wait a bit if video.
    if video_url:
        print("Waiting for Threads media processing...")
        time.sleep(10) # Simple wait for now

    # Step 2: Publish
    print("Publishing Thread...")
    publish_res = requests.post(
        f"https://graph.threads.net/v1.0/{threads_user_id}/threads_publish",
        data={"creation_id": container_id, "access_token": access_token}
    )
    result = publish_res.json()
    
    if result.get("id"):
        return {"success": True, "postId": result.get("id")}
    return {"success": False, "error": result}


def record_post_result(
    user_id: str,
    card_id: str,
    platform: str,
    result: dict,
) -> None:
    """Record the result of a post attempt."""
    # This implies we have a table or endpoint to store "PostHistory"
    # For now, just logging. 
    # Real implementation would INSERT into a PostHistory table via psycopg2 or API
    print(f"[PostResult] User {user_id}, Card {card_id}, Platform {platform}: {result}")
    
    try:
         # Optional: Update status in DB if needed, or create a 'Post' record
         pass
    except Exception as e:
        print(f"Failed to record result: {e}")


@functions_framework.cloud_event
def publisher_webhook(cloud_event):
    """
    Cloud Function triggered by Pub/Sub draft-approved topic.
    """
    print(f"Received publisher webhook event: {cloud_event}")
    
    # Decode Pub/Sub message
    message_data = base64.b64decode(cloud_event.data["message"]["data"])
    message = json.loads(message_data)
    
    user_id = message.get("userId")
    card_id = message.get("cardId")
    platform = message.get("platform")
    
    if not (user_id and platform):
        print("Missing userId or platform")
        return "Missing params"
    
    # Idempotency check - prevent duplicate posts
    if card_id:
        idempotency = IdempotencyChecker()
        should_process, idempotency_status = idempotency.check_and_mark_processing(card_id, platform)
        
        if not should_process:
            print(f"[Idempotent] Card {card_id} on {platform}: {idempotency_status}")
            return f"Skipped: {idempotency_status}"

    content = message.get("content", {})
    
    # Stream link settings
    include_stream_link = message.get("includeStreamLink", True)
    stream_url = message.get("streamUrl", None)
    
    # Get user's subscription tier for watermark decision
    user_tier = get_user_subscription_tier(user_id)
    print(f"User tier: {user_tier}")
    
    # Prepare content with platform-appropriate caption
    text_content = content.get('text') or content.get('caption') or ''
    video_url = content.get('videoUrl')
    
    # Use prepare_caption for platform-specific limits and tier-based watermark
    final_text = prepare_caption(
        text=text_content,
        platform=platform,
        stream_url=stream_url,
        include_stream_link=include_stream_link,
        user_tier=user_tier
    )
    print(f"Final caption ({len(final_text)} chars): {final_text[:100]}...")
    
    # Rate Limiting
    rate_limiter = RateLimiter()
    allowed, reason = rate_limiter.check_and_increment(user_id, platform)
    if not allowed:
        print(f"Rate limited: {reason}")
        # Clear idempotency to allow retry after rate limit expires
        if card_id:
            idempotency.clear(card_id, platform)
        return "Rate Limited"

    # Get Tokens
    tokens = get_connection_tokens(user_id, platform)
    if not tokens:
        print(f"No tokens found for {platform}")
        record_post_result(user_id, card_id, platform, {"success": False, "error": "No connection tokens found"})
        # Clear idempotency to allow retry after connecting account
        if card_id:
            idempotency.clear(card_id, platform)
        return "No Tokens"
        
    access_token = tokens["accessToken"]
    platform_user_id = tokens["platformUserId"]
    
    # Perform Posting
    result = {"success": False, "error": "Unknown platform"}
    
    if platform == "tiktok":
        if not video_url:
            result = {"success": False, "error": "No video URL for TikTok"}
        else:
            result = post_to_tiktok(access_token, video_url, final_text)
            
    elif platform == "instagram":
        if not video_url:
             result = {"success": False, "error": "No video URL for Instagram Reels"}
        else:
            result = post_to_instagram(access_token, platform_user_id, video_url, final_text)
            
    elif platform == "youtube":
        if not video_url:
            result = {"success": False, "error": "No video URL for YouTube"}
        else:
            result = post_to_youtube(access_token, video_url, final_text, final_text)
            
    elif platform == "twitter":
        result = post_to_twitter(access_token, final_text)
        
    elif platform == "threads":
        result = post_to_threads(access_token, platform_user_id, final_text, video_url)
    
    # Record Result
    record_post_result(user_id, card_id, platform, result)
    
    # Mark as completed if successful, clear if failed to allow retry
    if card_id:
        if result.get("success"):
            idempotency.mark_completed(card_id, platform)
        else:
            idempotency.clear(card_id, platform)
    
    print(f"Post result: {result}")
    return json.dumps(result)
