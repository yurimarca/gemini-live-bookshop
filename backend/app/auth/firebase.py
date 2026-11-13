"""Identity checks: Firebase ID token, optional App Check, WebSocket origin, Cloud Tasks OIDC.

Dev mode accepts ``dev:<uid>`` tokens so the stack runs with no Firebase project.
Settings refuse dev mode on Cloud Run.
"""

from __future__ import annotations

import asyncio
import logging
import re

from fastapi import Header, HTTPException, Request

from ..config.settings import Settings

log = logging.getLogger(__name__)
_DEV_TOKEN = re.compile(r"^dev:([A-Za-z0-9_-]{4,64})$")
_firebase_app = None


class AuthError(Exception):
    pass


def _app():
    global _firebase_app
    if _firebase_app is None:
        import firebase_admin

        _firebase_app = firebase_admin.initialize_app()
    return _firebase_app


async def verify_id_token(token: str, settings: Settings) -> str:
    """Return the uid, or raise AuthError. Never logs the token."""
    if not token or len(token) > 4096:
        raise AuthError("missing token")
    if settings.auth_mode == "dev":
        match = _DEV_TOKEN.match(token)
        if not match:
            raise AuthError("dev tokens look like dev:<uid>")
        return "dev-" + match.group(1)
    from firebase_admin import auth

    try:
        claims = await asyncio.to_thread(auth.verify_id_token, token, _app())
    except Exception as exc:  # firebase_admin raises several unrelated types
        raise AuthError("invalid token") from exc
    return claims["uid"]


async def verify_app_check(token: str | None, settings: Settings) -> None:
    if not settings.app_check_required or settings.auth_mode == "dev":
        return
    if not token:
        raise AuthError("missing App Check token")
    from firebase_admin import app_check

    try:
        await asyncio.to_thread(app_check.verify_token, token, _app())
    except Exception as exc:
        raise AuthError("invalid App Check token") from exc


def origin_allowed(origin: str | None, settings: Settings) -> bool:
    """CORS does not apply to WebSockets, so the gateway checks Origin itself."""
    return bool(origin) and origin.rstrip("/") in settings.allowed_origins


async def current_uid(request: Request, authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency for the cart REST endpoints."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="sign-in required")
    try:
        return await verify_id_token(authorization[7:].strip(), request.app.state.settings)
    except AuthError:
        raise HTTPException(status_code=401, detail="sign-in required") from None


async def verify_tasks_oidc(authorization: str | None, settings: Settings) -> None:
    """The service is public, so Cloud Run's invoker check does not protect the tasks route."""
    if settings.tasks_backend == "local" and not settings.on_cloud_run:
        raise AuthError("the tasks endpoint is disabled with the local timer")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("missing token")
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    def _verify() -> dict:
        return id_token.verify_oauth2_token(
            authorization[7:].strip(), google_requests.Request(), audience=settings.public_base_url.rstrip("/"))

    try:
        claims = await asyncio.to_thread(_verify)
    except Exception as exc:
        raise AuthError("invalid OIDC token") from exc
    if claims.get("email") != settings.tasks_service_account or not claims.get("email_verified"):
        raise AuthError("unexpected caller")
