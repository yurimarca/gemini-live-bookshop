"""
Application settings using Pydantic Settings for environment variable management.
"""

from pathlib import Path
from typing import List, Union
import logging
import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env into os.environ BEFORE anything else.
# ADK's google.genai.Client reads GOOGLE_API_KEY / GOOGLE_GENAI_USE_VERTEXAI
# directly from os.environ, so they must be there before ADK initialises.
load_dotenv()

logger = logging.getLogger(__name__)


class VoiceConfig(BaseModel):
    """Voice configuration for the AI agent."""
    name: str = "Aoede"


class GenerationConfig(BaseModel):
    """Generation configuration for AI responses."""
    response_modalities: List[str] = ["AUDIO"]


class AgentConfig(BaseModel):
    """AI Agent configuration loaded from YAML file."""
    system_instruction: str
    voice: VoiceConfig = VoiceConfig()
    generation: GenerationConfig = GenerationConfig()


def load_agent_config() -> AgentConfig:
    """Load agent configuration from YAML file or return defaults."""
    config_path = Path(__file__).parent / "agent_config.yaml"

    # Default configuration
    default_config = {
        "system_instruction": (
            "You are a friendly voice assistant for BookShop, an online bookstore.\n"
            "You help customers browse books, find what they're looking for, "
            "manage their cart, and complete purchases."
        ),
        "voice": {"name": "Aoede"},
        "generation": {"response_modalities": ["AUDIO"]}
    }

    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
                if config:
                    return AgentConfig(**config)
                else:
                    logger.warning("agent_config.yaml is empty. Using defaults.")
                    return AgentConfig(**default_config)
        except Exception as e:
            logger.warning(f"Failed to load agent_config.yaml: {e}. Using defaults.")
            return AgentConfig(**default_config)
    else:
        logger.info(f"agent_config.yaml not found at {config_path}. Using defaults.")
        return AgentConfig(**default_config)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Google AI / Vertex AI Configuration
    google_api_key: str = ""
    google_genai_use_vertexai: bool = False
    google_cloud_project: str = ""
    google_cloud_location: str = "us-central1"
    ai_model_name: str = "gemini-live-2.5-flash-native-audio"

    # CORS Configuration
    cors_origins: Union[List[str], str] = "http://localhost:5173,http://localhost:3000"

    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000

    # Agent Configuration
    agent_config: AgentConfig = Field(default_factory=load_agent_config)

    @model_validator(mode="after")
    def validate_auth(self):
        """Validate that appropriate auth is configured."""
        if self.google_genai_use_vertexai:
            if not self.google_cloud_project:
                raise ValueError(
                    "GOOGLE_CLOUD_PROJECT must be set when GOOGLE_GENAI_USE_VERTEXAI=TRUE"
                )
        else:
            if not self.google_api_key:
                raise ValueError(
                    "GOOGLE_API_KEY must be set when not using Vertex AI"
                )
        return self

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )


# Global settings instance
settings = Settings()
