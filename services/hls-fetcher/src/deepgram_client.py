"""
HLS Fetcher - Deepgram streaming client
"""
import asyncio
import aiohttp
from typing import Callable, Optional
from .config import settings
from .logging_config import get_logger

logger = get_logger("hls_fetcher.deepgram")


class DeepgramStreamer:
    """
    Streams audio to Deepgram for real-time transcription.
    Uses Deepgram's WebSocket API.
    """
    
    def __init__(
        self,
        on_transcript: Callable[[str, float], None],
        on_error: Optional[Callable[[Exception], None]] = None,
        on_disconnect: Optional[Callable[[], None]] = None,
    ):
        self.on_transcript = on_transcript
        self.on_error = on_error
        self.on_disconnect = on_disconnect
        self._ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._receive_task: Optional[asyncio.Task] = None
        self._connected = False
        self._last_message_time: float = 0
        
    @property
    def is_connected(self) -> bool:
        """Check if WebSocket is still connected."""
        return self._connected and self._ws is not None and not self._ws.closed
        
    async def connect(self) -> bool:
        """Connect to Deepgram WebSocket API."""
        try:
            self._session = aiohttp.ClientSession()
            
            # Deepgram WebSocket URL with options
            url = (
                "wss://api.deepgram.com/v1/listen"
                "?model=nova-2"
                "&language=en"
                "&smart_format=true"
                "&punctuate=true"
                "&diarize=true"
                "&utterances=true"
                "&encoding=linear16"
                "&sample_rate=16000"
                "&channels=1"
            )
            
            self._ws = await self._session.ws_connect(
                url,
                headers={
                    "Authorization": f"Token {settings.deepgram_api_key}",
                },
                heartbeat=30,  # Send ping every 30 seconds
            )
            
            self._connected = True
            self._last_message_time = asyncio.get_event_loop().time()
            
            # Start receiving transcripts
            self._receive_task = asyncio.create_task(self._receive_loop())
            
            logger.info("Connected to Deepgram")
            return True
            
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            if self.on_error:
                self.on_error(e)
            return False
    
    async def send_audio(self, audio_data: bytes) -> bool:
        """Send audio chunk to Deepgram. Returns False if disconnected."""
        if self._ws and not self._ws.closed:
            try:
                await self._ws.send_bytes(audio_data)
                return True
            except Exception as e:
                logger.error(f"Send error: {e}")
                self._connected = False
                return False
        return False
    
    async def close(self) -> None:
        """Close the connection."""
        self._connected = False
        
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        
        if self._ws:
            await self._ws.close()
        
        if self._session:
            await self._session.close()
        
        logger.info("Disconnected")
    
    async def _receive_loop(self) -> None:
        """Receive transcripts from Deepgram."""
        if not self._ws:
            return
        
        try:
            async for msg in self._ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    import json
                    data = json.loads(msg.data)
                    self._last_message_time = asyncio.get_event_loop().time()
                    
                    # Handle transcript
                    if data.get("type") == "Results":
                        channel = data.get("channel", {})
                        alternatives = channel.get("alternatives", [])
                        
                        if alternatives:
                            transcript = alternatives[0].get("transcript", "")
                            confidence = alternatives[0].get("confidence", 0.0)
                            
                            if transcript.strip():
                                self.on_transcript(transcript, confidence)
                    
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error(f"WebSocket error: {msg.data}")
                    break
                    
                elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED):
                    logger.warning("WebSocket closed by server")
                    break
                    
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Receive error: {e}")
            if self.on_error:
                self.on_error(e)
        finally:
            # Mark as disconnected and notify
            self._connected = False
            logger.warning("Receive loop ended, connection lost")
            if self.on_disconnect:
                self.on_disconnect()

