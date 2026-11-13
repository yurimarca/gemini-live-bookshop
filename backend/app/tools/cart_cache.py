"""
Session-scoped cart cache for backend cart management.

Written directly by run_add_to_cart / run_remove_from_cart / run_confirm_purchase
in backend_executor.py (backend-authoritative after native-audio model switch).
Read by getCartDetails() via current_session_id context var set in the run_live loop.
"""

import contextvars
from typing import Any

# Session ID for the current run_live iteration (set in websocket before loop)
current_session_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "cart_cache_session_id", default=None
)

# session_id -> { "items": [...], "total": number, "messageForUser": str }
_session_cart_cache: dict[str, dict[str, Any]] = {}


def set_session_for_cart(session_id: str) -> None:
    """Set the current session ID (call before entering run_live loop)."""
    current_session_id.set(session_id)


def add_to_cart(session_id: str, book_id: str, title: str, price: float, quantity: int = 1) -> None:
    """Add or increment a book in the cart cache."""
    if session_id not in _session_cart_cache:
        _session_cart_cache[session_id] = {"items": [], "total": 0.0, "messageForUser": "Your cart is empty."}
    cache = _session_cart_cache[session_id]
    items = cache["items"]
    for item in items:
        if item.get("bookId") == book_id:
            item["quantity"] += quantity
            item["subtotal"] = round(item["price"] * item["quantity"], 2)
            break
    else:
        items.append({
            "bookId": book_id,
            "title": title,
            "price": price,
            "quantity": quantity,
            "subtotal": round(price * quantity, 2),
        })
    total = round(sum(i["subtotal"] for i in items), 2)
    cache["total"] = total
    cache["messageForUser"] = f"Cart has {len(items)} item(s), total ${total:.2f}."
    for i, item in enumerate(items):
        item["index"] = i + 1


def remove_from_cart(session_id: str, book_id: str = "", index: int = 0) -> None:
    """Remove an item from the cart cache by book_id or 1-based index."""
    if session_id not in _session_cart_cache:
        return
    cache = _session_cart_cache[session_id]
    old_items = cache["items"]
    if book_id:
        new_items = [item for item in old_items if item.get("bookId") != book_id]
    elif 1 <= index <= len(old_items):
        new_items = [item for i, item in enumerate(old_items, 1) if i != index]
    else:
        return
    cache["items"] = new_items
    total = round(sum(item["subtotal"] for item in new_items), 2)
    cache["total"] = total
    cache["messageForUser"] = (
        f"Cart has {len(new_items)} item(s), total ${total:.2f}." if new_items else "Your cart is empty."
    )
    for i, item in enumerate(new_items):
        item["index"] = i + 1


def clear_cart(session_id: str) -> None:
    """Empty the cart for a session (called after confirmPurchase)."""
    _session_cart_cache[session_id] = {"items": [], "total": 0.0, "messageForUser": "Your cart is empty."}


def get_cached_cart() -> dict[str, Any]:
    """Return cached cart for the current session (from context var)."""
    session_id = current_session_id.get()
    if not session_id:
        return _empty_cart_result()
    cached = _session_cart_cache.get(session_id)
    if not cached:
        return _empty_cart_result()
    return {
        "success": True,
        "data": {
            "items": cached["items"],
            "total": cached["total"],
            "messageForUser": cached["messageForUser"],
            "itemCount": len(cached["items"]),
        },
    }


def _empty_cart_result() -> dict[str, Any]:
    return {
        "success": True,
        "data": {
            "items": [],
            "total": 0,
            "messageForUser": "Your cart is empty.",
            "itemCount": 0,
        },
    }
