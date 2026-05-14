"""
Vertex AI Client - Shared wrapper for Gemini models with mock support.

Provides a unified interface for Vertex AI Gemini models with:
- Automatic emulator/mock detection for local development
- Native video analysis capabilities
- Structured JSON output enforcement
"""
import os
import json
from typing import Optional, Union, Any
from dataclasses import dataclass, asdict


@dataclass
class VideoInput:
    """Represents a video input for multimodal analysis."""
    gcs_uri: str
    mime_type: str = "video/mp4"


@dataclass
class AnalysisResult:
    """Result from AI analysis."""
    viral_score: float
    is_viral: bool
    moment_description: str
    category: str
    social_copy: dict[str, str]
    recommended_crop: Optional[str] = None
    timestamps: Optional[dict[str, str]] = None
    
    def to_dict(self) -> dict:
        return asdict(self)


class VertexAIClient:
    """
    Shared Vertex AI Gemini client with mock support.
    
    Auto-detects mock mode via USE_VERTEX_AI environment variable.
    When USE_VERTEX_AI=false, returns plausible mock responses.
    """
    
    def __init__(
        self,
        project_id: Optional[str] = None,
        location: str = "us-central1",
        model_name: str = "gemini-1.5-pro",
    ):
        self.project_id = project_id or os.getenv("GCP_PROJECT_ID", "viralcue-local")
        self.location = location
        self.model_name = model_name
        self.use_real_api = os.getenv("USE_VERTEX_AI", "false").lower() == "true"
        
        self._model = None
    
    @property
    def model(self):
        """Lazy-load the Gemini model."""
        if self._model is None and self.use_real_api:
            import vertexai
            from vertexai.generative_models import GenerativeModel
            
            vertexai.init(project=self.project_id, location=self.location)
            self._model = GenerativeModel(self.model_name)
        
        return self._model
    
    def generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
    ) -> str:
        """
        Generate text response.
        
        Args:
            prompt: The user prompt
            system_prompt: Optional system instructions
            max_tokens: Maximum tokens to generate
            
        Returns:
            Generated text
        """
        if not self.use_real_api:
            return self._mock_generate_text(prompt, system_prompt)
        
        from vertexai.generative_models import GenerationConfig
        
        config = GenerationConfig(max_output_tokens=max_tokens)
        
        full_prompt = prompt
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n{prompt}"
        
        response = self.model.generate_content(full_prompt, generation_config=config)
        return response.text
    
    def analyze_video(
        self,
        video: Union[VideoInput, str],
        streamer_name: str = "the streamer",
        persona_tags: Optional[list[str]] = None,
    ) -> AnalysisResult:
        """
        Analyze a video for viral moments.
        
        Args:
            video: VideoInput object or GCS URI string
            streamer_name: Name of the streamer for persona
            persona_tags: List of persona descriptors
            
        Returns:
            AnalysisResult with viral score and social copy
        """
        if not self.use_real_api:
            return self._mock_analyze_video(video, streamer_name, persona_tags)
        
        from vertexai.generative_models import GenerationConfig, Part
        
        # Handle string URI
        if isinstance(video, str):
            video = VideoInput(gcs_uri=video)
        
        # Build prompt
        persona_str = ", ".join(persona_tags) if persona_tags else "Entertaining, Authentic"
        
        prompt = f"""You are the social media manager for a streamer named {streamer_name}.
Persona: {persona_str}

Analyze this video clip for viral potential.

1. Rate viral potential (0-100)
2. Identify the key moment
3. Draft social posts matching the persona

Output STRICT JSON:
{{
  "viral_score": 0-100,
  "moment_description": "what happened",
  "category": "Funny/Epic/Fail/Clutch/Wholesome",
  "recommended_crop": "16:9" or "9:16",
  "social_copy": {{
    "twitter": "tweet text",
    "tiktok": "caption"
  }},
  "timestamps": {{
    "start_cut": "0:00",
    "end_cut": "0:30"
  }}
}}"""
        
        video_part = Part.from_uri(uri=video.gcs_uri, mime_type=video.mime_type)
        
        config = GenerationConfig(
            response_mime_type="application/json",
            max_output_tokens=1024,
        )
        
        response = self.model.generate_content(
            [video_part, prompt],
            generation_config=config,
        )
        
        # Parse response
        result_data = json.loads(response.text)
        
        return AnalysisResult(
            viral_score=result_data.get("viral_score", 0),
            is_viral=result_data.get("viral_score", 0) >= 40,
            moment_description=result_data.get("moment_description", ""),
            category=result_data.get("category", "General"),
            social_copy=result_data.get("social_copy", {}),
            recommended_crop=result_data.get("recommended_crop"),
            timestamps=result_data.get("timestamps"),
        )
    
    def _mock_generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
    ) -> str:
        """Return mock text response for local development."""
        return json.dumps({
            "response": "This is a mock response from the Vertex AI client.",
            "prompt_length": len(prompt),
            "has_system_prompt": system_prompt is not None,
        })
    
    def _mock_analyze_video(
        self,
        video: Union[VideoInput, str],
        streamer_name: str,
        persona_tags: Optional[list[str]],
    ) -> AnalysisResult:
        """Return mock video analysis for local development."""
        import random
        
        categories = ["Funny", "Epic", "Fail", "Clutch", "Wholesome"]
        
        return AnalysisResult(
            viral_score=random.randint(50, 95),
            is_viral=True,
            moment_description=f"An exciting moment from {streamer_name}'s stream",
            category=random.choice(categories),
            social_copy={
                "twitter": f"Can't believe that just happened! 🔥 #{streamer_name}",
                "tiktok": "Wait for it... 😱",
            },
            recommended_crop="9:16",
            timestamps={"start_cut": "0:00", "end_cut": "0:30"},
        )


# Singleton instance
_client: Optional[VertexAIClient] = None


def get_vertex_client(
    project_id: Optional[str] = None,
    location: str = "us-central1",
    model_name: str = "gemini-1.5-pro",
) -> VertexAIClient:
    """Get the singleton Vertex AI client."""
    global _client
    if _client is None:
        _client = VertexAIClient(
            project_id=project_id,
            location=location,
            model_name=model_name,
        )
    return _client


def analyze_video_clip(
    gcs_uri: str,
    streamer_name: str = "the streamer",
    persona_tags: Optional[list[str]] = None,
) -> dict:
    """
    Convenience function to analyze a video clip.
    
    Args:
        gcs_uri: GCS URI of the video (gs://bucket/path/video.mp4)
        streamer_name: Name of the streamer
        persona_tags: List of persona descriptors
        
    Returns:
        Dictionary with analysis results
    """
    client = get_vertex_client()
    result = client.analyze_video(gcs_uri, streamer_name, persona_tags)
    return result.to_dict()
