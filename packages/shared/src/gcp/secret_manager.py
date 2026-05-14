"""
Secret Manager Client - Secure credential retrieval for GCP services.

Provides a unified interface for accessing secrets with:
- Auto-detection of local development (uses .env)
- Caching to minimize API calls
- Version support for secret rotation
"""
import os
from typing import Optional
from functools import lru_cache


class SecretManagerClient:
    """
    Google Cloud Secret Manager client with local development fallback.
    
    In local development (when no GCP credentials are available),
    falls back to environment variables for secrets.
    """
    
    def __init__(self, project_id: Optional[str] = None):
        self.project_id = project_id or os.getenv("GCP_PROJECT_ID", "viralcue-local")
        self._client = None
        self._use_env_fallback = os.getenv("USE_SECRET_MANAGER", "false").lower() != "true"
    
    @property
    def client(self):
        """Lazy-load the Secret Manager client."""
        if self._client is None and not self._use_env_fallback:
            try:
                from google.cloud import secretmanager
                self._client = secretmanager.SecretManagerServiceClient()
            except Exception as e:
                print(f"[SecretManager] Failed to initialize, using env fallback: {e}")
                self._use_env_fallback = True
        return self._client
    
    def get_secret(
        self,
        secret_id: str,
        version: str = "latest",
        env_fallback: Optional[str] = None,
    ) -> str:
        """
        Retrieve a secret value.
        
        Args:
            secret_id: The secret ID in Secret Manager
            version: Version to retrieve (default: "latest")
            env_fallback: Environment variable name for local fallback
            
        Returns:
            The secret value as a string
        """
        # Local development fallback
        if self._use_env_fallback:
            env_var = env_fallback or secret_id.upper().replace("-", "_")
            value = os.getenv(env_var, "")
            if not value:
                print(f"[SecretManager] Warning: {env_var} not set in environment")
            return value
        
        # Build the secret version name
        name = f"projects/{self.project_id}/secrets/{secret_id}/versions/{version}"
        
        try:
            response = self.client.access_secret_version(request={"name": name})
            return response.payload.data.decode("UTF-8")
        except Exception as e:
            print(f"[SecretManager] Error accessing {secret_id}: {e}")
            # Fallback to environment variable
            env_var = env_fallback or secret_id.upper().replace("-", "_")
            return os.getenv(env_var, "")
    
    def create_secret(self, secret_id: str, secret_value: str) -> bool:
        """
        Create a new secret (for initialization/migration).
        
        Args:
            secret_id: The secret ID to create
            secret_value: The secret value
            
        Returns:
            True if created successfully
        """
        if self._use_env_fallback:
            print(f"[SecretManager] Skipping create in local mode: {secret_id}")
            return True
        
        parent = f"projects/{self.project_id}"
        
        try:
            # Create the secret
            self.client.create_secret(
                request={
                    "parent": parent,
                    "secret_id": secret_id,
                    "secret": {"replication": {"automatic": {}}},
                }
            )
            
            # Add the secret version
            secret_name = f"{parent}/secrets/{secret_id}"
            self.client.add_secret_version(
                request={
                    "parent": secret_name,
                    "payload": {"data": secret_value.encode("UTF-8")},
                }
            )
            
            print(f"[SecretManager] Created secret: {secret_id}")
            return True
            
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"[SecretManager] Secret {secret_id} already exists")
                return True
            print(f"[SecretManager] Error creating {secret_id}: {e}")
            return False


# Singleton instance
_client: Optional[SecretManagerClient] = None


def get_secret_manager(project_id: Optional[str] = None) -> SecretManagerClient:
    """Get the singleton Secret Manager client."""
    global _client
    if _client is None:
        _client = SecretManagerClient(project_id)
    return _client


# Convenience functions for common secrets
@lru_cache(maxsize=32)
def get_twitch_client_id() -> str:
    """Get Twitch Client ID."""
    return get_secret_manager().get_secret("twitch-client-id", env_fallback="TWITCH_CLIENT_ID")


@lru_cache(maxsize=32)
def get_twitch_client_secret() -> str:
    """Get Twitch Client Secret."""
    return get_secret_manager().get_secret("twitch-client-secret", env_fallback="TWITCH_CLIENT_SECRET")


@lru_cache(maxsize=32)
def get_deepgram_api_key() -> str:
    """Get Deepgram API Key."""
    return get_secret_manager().get_secret("deepgram-api-key", env_fallback="DEEPGRAM_API_KEY")


@lru_cache(maxsize=32)
def get_clerk_secret_key() -> str:
    """Get Clerk Secret Key."""
    return get_secret_manager().get_secret("clerk-secret-key", env_fallback="CLERK_SECRET_KEY")


def clear_secret_cache() -> None:
    """Clear the secret cache (use after rotation)."""
    get_twitch_client_id.cache_clear()
    get_twitch_client_secret.cache_clear()
    get_deepgram_api_key.cache_clear()
    get_clerk_secret_key.cache_clear()
