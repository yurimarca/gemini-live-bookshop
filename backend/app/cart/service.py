"""Cart: one document per user, written in a transaction, idempotent by design.

Two layers of idempotency, because the Live model may issue a call twice:
``set_item`` sets a quantity rather than adding to it, and every write carries
an operation ID that is remembered, so a replay returns the stored cart.
"""

from __future__ import annotations

import time
from typing import Awaitable, Callable

from pydantic import BaseModel

from ..catalog.repository import CatalogRepository
from ..state import DocState

COLLECTION = "carts"
REMEMBERED_OPS = 30


class CartError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class CartItem(BaseModel):
    id: str
    title: str
    author: str
    cover_id: int | None = None
    price_cents: int
    quantity: int


class CartView(BaseModel):
    items: list[CartItem] = []
    total_cents: int = 0
    hold_expires_at: float | None = None  # epoch seconds
    currency: str = "USD"
    prices_are_fictional: bool = True


Listener = Callable[[str, CartView, str | None], Awaitable[None]]
HoldScheduler = Callable[[str, float], Awaitable[None]]


def _view(doc: dict | None) -> CartView:
    if not doc or not doc.get("items"):
        return CartView()
    items = [CartItem(**item) for item in doc["items"].values()]
    items.sort(key=lambda i: i.title)
    return CartView(items=items, total_cents=sum(i.price_cents * i.quantity for i in items),
                    hold_expires_at=doc.get("hold_expires_at"))


class CartService:
    def __init__(self, state: DocState, catalog: CatalogRepository, *, hold_seconds: int,
                 max_items: int, max_quantity: int, clock: Callable[[], float] = time.time) -> None:
        self._state, self._catalog = state, catalog
        self._hold_seconds, self._max_items, self._max_quantity = hold_seconds, max_items, max_quantity
        self._clock = clock
        self._listeners: list[Listener] = []
        self._schedule_hold: HoldScheduler | None = None

    def on_change(self, listener: Listener) -> None:
        self._listeners.append(listener)

    def set_hold_scheduler(self, scheduler: HoldScheduler) -> None:
        self._schedule_hold = scheduler

    async def _notify(self, uid: str, view: CartView, op_id: str | None) -> None:
        for listener in self._listeners:
            await listener(uid, view, op_id)

    async def get(self, uid: str) -> CartView:
        doc = await self._state.get(COLLECTION, uid)
        if doc and doc.get("hold_expires_at") and doc["hold_expires_at"] <= self._clock():
            return await self.expire(uid)  # lazy expiry covers a lost or late timer
        return _view(doc)

    async def set_item(self, uid: str, book_id: str, quantity: int, op_id: str) -> CartView:
        """Put ``book_id`` in the cart with exactly ``quantity`` copies. Quantity 0 removes it."""
        if not 0 <= quantity <= self._max_quantity:
            raise CartError("bad_quantity", f"quantity must be between 0 and {self._max_quantity}")
        entry = self._catalog.entry(book_id)
        if entry is None:
            raise CartError("unknown_book", "that book is not in the catalog")
        now = self._clock()
        schedule_until: list[float] = []

        def mutate(doc: dict | None):
            doc = doc or {"items": {}, "ops": []}
            if doc.get("hold_expires_at") and doc["hold_expires_at"] <= now:
                doc = {"items": {}, "ops": doc.get("ops", [])}
            if op_id in doc.get("ops", []):
                return doc, (_view(doc), False)
            items = doc["items"]
            if quantity == 0:
                items.pop(book_id, None)
            else:
                if book_id not in items and len(items) >= self._max_items:
                    raise CartError("cart_full", f"the cart holds at most {self._max_items} different books")
                items[book_id] = CartItem(
                    id=book_id, title=entry.title, author=", ".join(entry.author_names[:2]),
                    cover_id=entry.cover_id, price_cents=entry.price_cents, quantity=quantity).model_dump()
            if items:
                had_hold = bool(doc.get("hold_expires_at"))
                doc["hold_expires_at"] = now + self._hold_seconds  # every change renews the hold
                if not had_hold or quantity > 0:
                    schedule_until.append(doc["hold_expires_at"])
            else:
                doc.pop("hold_expires_at", None)
            doc["ops"] = (doc.get("ops", []) + [op_id])[-REMEMBERED_OPS:]
            doc["updated_at"] = now
            return doc, (_view(doc), True)

        view, changed = await self._state.transact(COLLECTION, uid, mutate)
        if changed:
            if schedule_until and self._schedule_hold:
                await self._schedule_hold(uid, schedule_until[-1])
            await self._notify(uid, view, op_id)
        return view

    async def remove_item(self, uid: str, book_id: str, op_id: str) -> CartView:
        return await self.set_item(uid, book_id, 0, op_id)

    async def expire(self, uid: str, *, expected_expiry: float | None = None) -> CartView:
        """Empty the cart if its hold has run out. A stale timer (the hold was renewed) is a no-op."""
        now = self._clock()

        def mutate(doc: dict | None):
            if not doc or not doc.get("items"):
                return doc, (CartView(), False)
            expiry = doc.get("hold_expires_at")
            if expiry is None or expiry > now + 1:
                return doc, (_view(doc), False)
            if expected_expiry is not None and abs(expiry - expected_expiry) > 1:
                return doc, (_view(doc), False)
            return {"items": {}, "ops": doc.get("ops", []), "updated_at": now, "expired_at": now}, (CartView(), True)

        view, changed = await self._state.transact(COLLECTION, uid, mutate)
        if changed:
            await self._notify(uid, view, "hold-expired")
        return view
