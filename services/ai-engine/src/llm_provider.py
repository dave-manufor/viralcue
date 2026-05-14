"""
LLM Provider Abstraction Layer.
Supports AWS Bedrock and Ollama.
"""

import json
import abc
import boto3
import aiohttp
import structlog
from typing import Optional, Dict, Any, List

from .config import Settings

logger = structlog.get_logger()


class LLMProvider(abc.ABC):
    """Abstract base class for LLM providers."""

    def __init__(self, settings: Settings):
        self.settings = settings

    @abc.abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """Generate text from the LLM."""
        pass


class AWSBedrockProvider(LLMProvider):
    """Provider for AWS Bedrock (Claude)."""

    def __init__(self, settings: Settings):
        super().__init__(settings)
        # Check if we are in a "force real AWS" mode versus localstack
        # The previous logic handled "test" keys specially.
        
        endpoint_url = None
        # If using LocalStack/Fake credentials, we might want to fail or warn?
        # But per requirements, production uses AWS Bedrock.
        
        if settings.aws_access_key_id == "test":
             # Fallback or specific handling if needed, but per request we use AWS for prod.
             pass

        self.client = boto3.client(
            "bedrock-runtime",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            endpoint_url=endpoint_url,
        )

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        messages = [{"role": "user", "content": prompt}]

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens or self.settings.bedrock_max_tokens,
            "messages": messages,
        }

        if system_prompt:
            body["system"] = system_prompt

        try:
            # Note: boto3 call is blocking. In a high-throughput async app, 
            # this should ideally be run in a thread pool executor.
            response = self.client.invoke_model(
                modelId=self.settings.bedrock_model_id,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )

            response_body = json.loads(response["body"].read())
            content = response_body.get("content", [])

            if content and len(content) > 0:
                return content[0].get("text", "")

            return ""

        except Exception as e:
            logger.exception("AWS Bedrock LLM error", error=str(e))
            raise


class OllamaProvider(LLMProvider):
    """
    Provider for Ollama (local LLM).
    Uses the /api/generate or /api/chat endpoint.
    """

    def __init__(self, settings: Settings):
        super().__init__(settings)
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_model_id

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        url = f"{self.base_url}/api/chat"
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "num_predict": max_tokens or 300
            }
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if response.status != 200:
                        text = await response.text()
                        logger.error("Ollama API error", status=response.status, body=text)
                        raise Exception(f"Ollama API returned {response.status}: {text}")
                    
                    data = await response.json()
                    # Ollama chat response structure
                    # { "model": "...", "created_at": "...", "message": { "role": "assistant", "content": "..." }, ... }
                    
                    return data.get("message", {}).get("content", "")
                    
        except Exception as e:
            logger.exception("Ollama LLM error", error=str(e))
            # Fallback for dev experience if Ollama is down?
            # Or just re-raise.
            raise


class LLMFactory:
    """Factory for creating LLM providers."""
    
    @staticmethod
    def get_provider(settings: Settings) -> LLMProvider:
        provider_type = settings.llm_provider.lower()
        
        if provider_type == "aws":
            logger.info("Using AWS Bedrock LLM Provider")
            return AWSBedrockProvider(settings)
        elif provider_type == "ollama":
            logger.info("Using Ollama LLM Provider", model=settings.ollama_model_id)
            return OllamaProvider(settings)
        elif provider_type == "vertex":
            logger.info("Using Vertex AI Gemini Provider", model=settings.vertex_ai_model)
            from .vertex_ai_provider import get_gemini_provider
            return get_gemini_provider(settings)
        else:
            logger.warning(f"Unknown LLM provider '{provider_type}', defaulting to Ollama")
            return OllamaProvider(settings)

