"""Cart REST. The browser reads the cart here and over the socket; Firestore client rules deny all."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field

from ..auth.firebase import current_uid
from ..cart.service import CartError, CartView
from .catalog import BOOK_ID

router = APIRouter(prefix="/api/cart")
OP_ID = r"^[A-Za-z0-9_-]{8,64}$"


class SetItem(BaseModel):
    olid: str = Field(pattern=BOOK_ID)
    quantity: int = Field(default=1, ge=1, le=5)
    op_id: str = Field(pattern=OP_ID)


@router.get("", response_model=CartView)
async def get_cart(request: Request, uid: str = Depends(current_uid)) -> CartView:
    return await request.app.state.services.cart.get(uid)


@router.post("/items", response_model=CartView)
async def set_item(body: SetItem, request: Request, uid: str = Depends(current_uid)) -> CartView:
    try:
        return await request.app.state.services.cart.set_item(uid, body.olid, body.quantity, f"rest-{body.op_id}")
    except CartError as exc:
        raise HTTPException(status_code=404 if exc.code == "unknown_book" else 409, detail=exc.code) from None


@router.delete("/items/{olid}", response_model=CartView)
async def remove_item(request: Request, olid: str = Path(pattern=BOOK_ID),
                      op_id: str = Query(pattern=OP_ID), uid: str = Depends(current_uid)) -> CartView:
    try:
        return await request.app.state.services.cart.remove_item(uid, olid, f"rest-{op_id}")
    except CartError as exc:
        raise HTTPException(status_code=404, detail=exc.code) from None
