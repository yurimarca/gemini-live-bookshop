"""Cloud Tasks callback for the cart-hold timer.

The Cloud Run service is public, so its invoker check does not protect this
route. The handler verifies the OIDC token itself: signature, audience and the
calling service account.
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth.firebase import AuthError, verify_tasks_oidc
from ..cart.timer import HANDLER_PATH

router = APIRouter()


class CartExpiry(BaseModel):
    uid: str = Field(min_length=1, max_length=128)
    expires_at: float


@router.post(HANDLER_PATH)
async def cart_expiry(body: CartExpiry, request: Request, authorization: str | None = Header(default=None)) -> dict:
    svc = request.app.state.services
    try:
        await verify_tasks_oidc(authorization, svc.settings)
    except AuthError:
        raise HTTPException(status_code=403, detail="forbidden") from None
    # A stale task (the hold was renewed since) is a no-op, so retries and duplicates are safe.
    await svc.cart.expire(body.uid, expected_expiry=body.expires_at)
    return {"status": "ok"}
