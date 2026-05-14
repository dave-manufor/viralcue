"""
HLS Fetcher - Configuration
"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # API URLs
    api_url: str = "http://localhost:3001"
    internal_api_key: str = ""
    
    # Twitch
    twitch_client_id: str = ""
    twitch_client_secret: str = ""
    
    # Deepgram
    deepgram_api_key: str = ""
    
    # Redis for job management
    redis_url: str = "redis://localhost:6379"

    # GCP
    gcp_project_id: str = "viralcue-local"
    
    # Pub/Sub
    transcripts_topic: str = "viralcue-transcripts"
    
    # Feature flags
    use_gcp_pubsub: bool = True  # Set to True to use Pub/Sub instead of SQS
    use_gcs_storage: bool = True  # Set to True to use GCS instead of S3
    
    # AWS/SQS (legacy)
    aws_region: str = "us-east-1"
    aws_endpoint_url: str = ""  # http://localhost:4566 for LocalStack
    transcripts_queue: str = "viralcue-transcripts"
    
    # Processing settings
    segment_duration: int = 2  # seconds per HLS segment
    max_concurrent_streams: int = 10
    
    class Config:
        env_file = ".env"


settings = Settings()

