"""
Chat Sender Service Configuration
"""
import os
from dataclasses import dataclass


@dataclass
class Settings:
    """Service configuration loaded from environment."""
    
    # GCP Settings
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "viralcue-local")
    pubsub_subscription: str = os.getenv("PUBSUB_SUBSCRIPTION", "chat-sender-sub")
    pubsub_mode: str = os.getenv("PUBSUB_MODE", "pull")
    port: int = int(os.getenv("PORT", "8080"))
    
    # Database
    database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/viralcue")
    
    # Twitch API
    twitch_client_id: str = os.getenv("TWITCH_CLIENT_ID", "")
    twitch_client_secret: str = os.getenv("TWITCH_CLIENT_SECRET", "")
    
    # Cooldown Settings
    product_cooldown_seconds: int = int(os.getenv("PRODUCT_COOLDOWN_SECONDS", "300"))  # 5 minutes
    stream_max_messages_per_hour: int = int(os.getenv("STREAM_MAX_MESSAGES_PER_HOUR", "10"))
    
    # Feature Flags
    dry_run: bool = os.getenv("DRY_RUN", "false").lower() == "true"


settings = Settings()
