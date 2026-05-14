"""
Sniper Service Configuration
Cloud Run Job for fetching viral video clips from VODs
"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # GCP
    gcp_project_id: str = "viralcue-local"
    
    # Pub/Sub
    viral_candidates_subscription: str = "clip-fetcher-sub"
    clips_ready_topic: str = "viralcue-clips-ready"
    
    # GCS Buckets
    raw_clips_bucket: str = "viralcue-raw-clips"
    processed_clips_bucket: str = "viralcue-processed-clips"
    thumbnails_bucket: str = "viralcue-thumbnails"
    
    # Twitch
    twitch_client_id: str = ""
    twitch_client_secret: str = ""
    
    # Processing
    clip_duration_before: int = 5  # Seconds before viral moment
    clip_duration_after: int = 25  # Seconds after viral moment
    ffmpeg_threads: int = 2
    max_clip_duration: int = 120  # Maximum clip duration in seconds
    
    # API callback (optional)
    api_url: str = ""
    internal_api_key: str = ""
    
    class Config:
        env_file = ".env"


settings = Settings()
