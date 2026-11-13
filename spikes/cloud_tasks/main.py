"""Spike 6: does a Cloud Tasks job reach Cloud Run after the service has scaled to zero, with OIDC?

A throwaway service with one route. It verifies the OIDC token the same way the gateway's
/internal/tasks/cart-expiry handler does, and logs how late the task arrived.
Deploy and enqueue commands are in planning/owner-instructions.md (section "Spikes").
"""

import os
import time

from fastapi import FastAPI, Header, HTTPException, Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

app = FastAPI()
AUDIENCE = os.environ["PUBLIC_BASE_URL"].rstrip("/")
CALLER = os.environ["TASKS_SERVICE_ACCOUNT"]
STARTED = time.time()


@app.post("/fire")
async def fire(request: Request, authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(403, "no token")
    try:
        claims = id_token.verify_oauth2_token(authorization[7:], google_requests.Request(), audience=AUDIENCE)
    except Exception:
        raise HTTPException(403, "bad token") from None
    if claims.get("email") != CALLER:
        raise HTTPException(403, "unexpected caller")
    body = await request.json()
    late = time.time() - float(body.get("due", time.time()))
    print(f"SPIKE6 fired: {late:.1f}s after its due time; instance age {time.time() - STARTED:.1f}s "
          f"(a small age means the task woke a cold instance); retry={request.headers.get('x-cloudtasks-taskretrycount')}")
    return {"status": "ok", "late_seconds": round(late, 1)}
