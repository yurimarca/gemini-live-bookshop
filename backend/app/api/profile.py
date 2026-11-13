"""Taste profile REST: only "forget". The profile is read and written by the gateway during a session."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from ..auth.firebase import current_uid
from ..tools.specialist_tools import forget_profile

router = APIRouter(prefix="/api/profile")


@router.delete("", status_code=204)
async def forget(uid: str = Depends(current_uid)) -> Response:
    """Delete the stored taste profile. Also clears it from this user's live session, if any."""
    await forget_profile(uid)
    return Response(status_code=204)
