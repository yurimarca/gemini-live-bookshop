import os

# Keep a developer's backend/.env from leaking into the tests.
for key in ("CATALOG_SOURCE", "STATE_BACKEND", "AUTH_MODE", "TASKS_BACKEND", "SPECIALISTS_BACKEND",
            "SPECIALISTS_LLM", "ALLOWED_ORIGINS", "K_SERVICE"):
    os.environ.pop(key, None)
os.environ.update(AUTH_MODE="dev", SPECIALISTS_LLM="off", ALLOWED_ORIGINS="http://localhost:5173")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config.settings import Settings  # noqa: E402
from main import create_app  # noqa: E402

ORIGIN = {"origin": "http://localhost:5173"}


def make_settings(**overrides) -> Settings:
    base = dict(auth_mode="dev", specialists_llm="off", catalog_source="fixture", state_backend="memory",
                tasks_backend="local", allowed_origins="http://localhost:5173", _env_file=None)
    return Settings(**{**base, **overrides})


@pytest.fixture()
def settings() -> Settings:
    return make_settings()


@pytest.fixture()
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture()
def svc(client):
    return client.app.state.services


def auth(uid: str = "tester1") -> dict:
    return {"Authorization": f"Bearer dev:{uid}"}
