"""
Twitch Helix API Client for sending chat messages.
"""
import httpx
import structlog
from typing import Optional
from dataclasses import dataclass

logger = structlog.get_logger()


@dataclass
class TwitchTokens:
    """User's Twitch OAuth tokens."""
    access_token: str
    refresh_token: Optional[str]
    broadcaster_id: str


class TwitchChatClient:
    """
    Client for sending messages to Twitch chat via Helix API.
    
    Endpoint: POST https://api.twitch.tv/helix/chat/messages
    Required scopes: user:write:chat, user:bot, channel:bot (or mod status)
    """
    
    BASE_URL = "https://api.twitch.tv/helix"
    
    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self._http_client: Optional[httpx.AsyncClient] = None
    
    @property
    def http_client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=10.0)
        return self._http_client
    
    async def send_message(
        self,
        tokens: TwitchTokens,
        message: str,
    ) -> dict:
        """
        Send a chat message to the broadcaster's channel.
        
        Args:
            tokens: User's Twitch OAuth tokens
            message: The message to send (max 500 chars)
            
        Returns:
            API response dict or error info
        """
        # Truncate message if needed (Twitch limit is 500 chars)
        if len(message) > 500:
            message = message[:497] + "..."
        
        headers = {
            "Authorization": f"Bearer {tokens.access_token}",
            "Client-Id": self.client_id,
            "Content-Type": "application/json",
        }
        
        payload = {
            "broadcaster_id": tokens.broadcaster_id,
            "sender_id": tokens.broadcaster_id,  # Send as the broadcaster
            "message": message,
        }
        
        try:
            response = await self.http_client.post(
                f"{self.BASE_URL}/chat/messages",
                headers=headers,
                json=payload,
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(
                    "[Twitch] Message sent successfully",
                    broadcaster_id=tokens.broadcaster_id,
                    message_id=data.get("data", [{}])[0].get("message_id"),
                )
                return {"success": True, "data": data}
            
            elif response.status_code == 401:
                logger.warning("[Twitch] Token expired, needs refresh")
                return {"success": False, "error": "token_expired", "status": 401}
            
            elif response.status_code == 429:
                logger.warning("[Twitch] Rate limited")
                return {"success": False, "error": "rate_limited", "status": 429}
            
            else:
                error_text = response.text
                logger.error(
                    "[Twitch] Failed to send message",
                    status=response.status_code,
                    error=error_text[:200],
                )
                return {"success": False, "error": error_text, "status": response.status_code}
                
        except httpx.TimeoutException:
            logger.error("[Twitch] Request timed out")
            return {"success": False, "error": "timeout"}
        except Exception as e:
            logger.exception("[Twitch] Unexpected error", error=str(e))
            return {"success": False, "error": str(e)}
    
    async def refresh_token(self, refresh_token: str) -> Optional[dict]:
        """
        Refresh an expired access token.
        
        Returns new tokens or None if refresh failed.
        """
        try:
            response = await self.http_client.post(
                "https://id.twitch.tv/oauth2/token",
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info("[Twitch] Token refreshed successfully")
                return {
                    "access_token": data["access_token"],
                    "refresh_token": data.get("refresh_token", refresh_token),
                }
            else:
                logger.error("[Twitch] Token refresh failed", status=response.status_code)
                return None
                
        except Exception as e:
            logger.exception("[Twitch] Token refresh error", error=str(e))
            return None
    
    async def close(self):
        """Close the HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
