"""Configuration settings for the AI engine."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # AWS (legacy - for backwards compatibility)
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_endpoint_url: str = ""  # http://localhost:4566 for LocalStack

    # GCP
    gcp_project_id: str = "viralcue-local"
    
    # Pub/Sub
    transcripts_subscription: str = "ai-engine-sub"
    drafts_topic: str = "viralcue-drafts"
    
    # Feature flags
    use_gcp_pubsub: bool = True  # Set to True to use Pub/Sub instead of SQS
    use_vertex_ai: bool = True  # Enable Vertex AI Gemini (cost optimized)
    pubsub_mode: str = "pull"  # "pull" or "push"
    port: int = 8080  # Port for HTTP server in push mode

    # Bedrock (legacy)
    bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"
    bedrock_max_tokens: int = 300

    # LLM Provider
    llm_provider: str = "vertex"  # "aws", "ollama", or "vertex" (vertex = Gemini Flash)
    
    # Ollama
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_model_id: str = "deepseek-v3.1:671b-cloud"
    
    # Vertex AI
    vertex_ai_location: str = "us-central1"
    vertex_ai_model: str = "gemini-2.0-flash-exp"  # Cost-optimized: 95% cheaper than Claude

    # SQS Queues (legacy)
    transcripts_queue: str = "viralcue-transcripts"
    drafts_queue: str = "viralcue-drafts"

    # API callback
    api_base_url: str = "http://localhost:3001"
    internal_api_key: str = ""
    internal_api_secret: str = ""  # For internal API authentication

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/viralcue"

    # Processing
    context_window_seconds: int = 60  # Rolling 60s context buffer
    min_confidence_score: float = 0.7
    poll_interval_seconds: float = 1.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
