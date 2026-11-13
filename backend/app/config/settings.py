"""Settings from environment variables. No secrets or project IDs live in code."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# google-genai and ADK read GOOGLE_* straight from os.environ, so .env must be loaded first.
load_dotenv()
# ADK captures prompt and response text in trace spans unless told otherwise.
os.environ.setdefault("ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS", "false")

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # Wiring
    catalog_source: Literal["fixture", "cloud"] = "fixture"
    catalog_fixture_path: str = str(REPO_ROOT / "fixtures" / "catalog-fixture.json")
    catalog_bucket: str = ""
    state_backend: Literal["memory", "firestore"] = "memory"
    firestore_database: str = "(default)"
    auth_mode: Literal["dev", "firebase"] = "firebase"
    app_check_required: bool = False
    tasks_backend: Literal["local", "cloud_tasks"] = "local"
    tasks_queue: str = "cart-expiry"
    tasks_service_account: str = ""
    public_base_url: str = ""
    specialists_backend: Literal["local", "agent_runtime"] = "local"
    specialists_llm: Literal["on", "off"] = "on"
    specialists_agent_resource: str = ""
    specialist_timeout_seconds: float = 12.0
    allowed_origins: list[str] | str = "http://localhost:5173"

    # Models
    google_cloud_project: str = ""
    google_cloud_location: str = "us-central1"
    live_model: str = "gemini-3.8-live"
    specialist_model: str = "gemini-3.5-flash"
    voice_name: str = "Erinome"

    # Limits
    session_max_seconds: int = 300
    session_warn_seconds: int = 270
    sessions_per_user_per_day: int = 5
    sessions_global_per_day: int = 100
    max_concurrent_sessions: int = 10
    cart_hold_seconds: int = 600
    cart_max_items: int = 10
    cart_max_quantity: int = 5
    announce_cart_expiry: bool = False  # needs spike 2 (unsolicited content) before it is turned on

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _origins(cls, v):
        if isinstance(v, str):
            return [o.strip().rstrip("/") for o in v.split(",") if o.strip()]
        return v

    @property
    def on_cloud_run(self) -> bool:
        return bool(os.environ.get("K_SERVICE"))

    @model_validator(mode="after")
    def _safe_on_cloud_run(self):
        if self.on_cloud_run:
            problems = []
            if self.auth_mode != "firebase":
                problems.append("AUTH_MODE must be firebase")
            if self.state_backend != "firestore":
                problems.append("STATE_BACKEND must be firestore")
            if self.catalog_source != "cloud":
                problems.append("CATALOG_SOURCE must be cloud")
            if any("localhost" in o or o == "*" for o in self.allowed_origins):
                problems.append("ALLOWED_ORIGINS may not contain localhost or *")
            if problems:
                raise ValueError("unsafe settings on Cloud Run: " + "; ".join(problems))
        if self.session_warn_seconds >= self.session_max_seconds:
            raise ValueError("SESSION_WARN_SECONDS must be below SESSION_MAX_SECONDS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
