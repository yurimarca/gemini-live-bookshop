"""
Backend-side execution of searchBooks and getBookDetails.

Uses the local book catalog (books-enriched.json) so results go straight
to the model through ADK's internal path — no frontend round-trip, no
unreliable send_content() hop.

Result format matches the frontend FunctionExecutor output so the model's
system instruction (which references result.data.messageForUser, etc.)
still works unchanged.
"""

import logging
import time
from typing import Any

from app.data.catalog import get_books
from app.tools.cart_cache import (
    get_cached_cart,
    current_session_id,
    add_to_cart as _add_to_cart_cache,
    remove_from_cart as _remove_from_cart_cache,
    clear_cart as _clear_cart_cache,
)
from app.tools.user_cache import get_cached_user, set_user as _set_user_cache
from app.tools.notifications import notify_frontend

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _search_books(query: str = "", category: str = "") -> list[dict[str, Any]]:
    """Filter the catalog by query and/or category."""
    books = get_books()
    results = books

    if category and category.strip():
        cat = category.strip().lower()
        results = [b for b in results if b.get("category", "").lower() == cat]

    if query and query.strip():
        q = query.strip().lower()
        results = [
            b for b in results
            if q in b.get("title", "").lower() or q in b.get("category", "").lower()
        ]

    return results


def _get_book_by_id(book_id: str) -> dict[str, Any] | None:
    """Find a book by its exact ID."""
    for b in get_books():
        if b.get("id") == book_id:
            return b
    return None


def _get_book_by_title(title: str) -> dict[str, Any] | None:
    """Find a book by exact or partial title match (case-insensitive)."""
    title_lower = title.lower()
    books = get_books()
    # Exact match first
    for b in books:
        if b.get("title", "").lower() == title_lower:
            return b
    # Partial match fallback
    for b in books:
        if title_lower in b.get("title", "").lower():
            return b
    return None


# ---------------------------------------------------------------------------
# Public API — called by tool functions in ecommerce_tools.py
# ---------------------------------------------------------------------------

def run_search_books(query: str = "", category: str = "") -> dict[str, Any]:
    """Execute searchBooks and return structured result matching frontend format."""
    books = _search_books(query, category)
    summary = [
        {
            "index": i + 1,
            "id": b["id"],
            "title": b["title"],
            "price": b["price"],
            "category": b.get("category", ""),
        }
        for i, b in enumerate(books[:20])
    ]

    if not books:
        message_for_user = "No books found."
    else:
        lines = "; ".join(
            f"{s['index']}. {s['title']} (${s['price']})" for s in summary
        )
        message_for_user = f"Found {len(books)} books. First results: {lines}"

    result: dict[str, Any] = {
        "success": True,
        "data": {
            "total": len(books),
            "books": summary,
            "messageForUser": message_for_user,
        },
    }

    logger.info("searchBooks(query=%r, category=%r) → %d results", query, category, len(books))
    notify_frontend("searchBooks", {"query": query, "category": category}, result)
    return result


def run_get_book_details(book_id: str = "", title: str = "") -> dict[str, Any]:
    """Execute getBookDetails and return structured result matching frontend format."""
    book: dict[str, Any] | None = None

    if book_id:
        book = _get_book_by_id(book_id)
    elif title:
        book = _get_book_by_title(title)

    params = {"bookId": book_id, "title": title}

    if not book:
        result: dict[str, Any] = {
            "success": False,
            "error": f"Book not found: {book_id or title}",
            "suggestions": ["Try searchBooks to find valid book IDs or titles."],
        }
        logger.info("getBookDetails(%r, %r) → not found", book_id, title)
        notify_frontend("getBookDetails", params, result)
        return result

    desc = book.get("description", "")
    desc_preview = (desc[:120] + "...") if len(desc) > 120 else desc
    stock_text = "In stock." if book.get("stock") else "Low stock."
    message_for_user = f"{book['title']}, ${book['price']}. {stock_text} {desc_preview}"

    result = {
        "success": True,
        "data": {
            "id": book["id"],
            "title": book["title"],
            "price": book["price"],
            "rating": book.get("rating"),
            "category": book.get("category", ""),
            "stock": book.get("stock", ""),
            "book_url": book.get("book_url", ""),
            "messageForUser": message_for_user,
            "description": book.get("description"),
            "productInformation": book.get("productInformation"),
            "imageUrl": book.get("imageUrl"),
        },
    }

    logger.info("getBookDetails(%r, %r) → %s", book_id, title, book["title"])
    notify_frontend("getBookDetails", params, result)
    return result


def run_get_cart_details() -> dict[str, Any]:
    """Return cached cart and user for current session. Used by getCartDetails tool."""
    result = get_cached_cart()
    session_id = current_session_id.get()
    user = get_cached_user(session_id) if session_id else None
    if user and isinstance(result.get("data"), dict):
        result["data"] = {**result["data"], "user": user}
    logger.info("getCartDetails() → %d items", len(result.get("data", {}).get("items", [])))
    return result


# ---------------------------------------------------------------------------
# Formerly-frontend tools — now backend-executed regular functions
# ---------------------------------------------------------------------------

def run_add_to_cart(book_id: str, quantity: int = 1) -> dict[str, Any]:
    """Add a book to the backend cart cache and notify the frontend for UI sync."""
    session_id = current_session_id.get()
    params = {"bookId": book_id, "quantity": quantity}

    book = _get_book_by_id(book_id)
    if not book:
        result: dict[str, Any] = {
            "success": False,
            "error": f"Book not found: {book_id}",
            "suggestions": ["Call searchBooks first to find valid book IDs."],
        }
        logger.info("addToCart(bookId=%r) → not found", book_id)
        notify_frontend("addToCart", params, result)
        return result

    qty = max(1, int(quantity))
    if session_id:
        _add_to_cart_cache(session_id, book_id, book["title"], book["price"], qty)
    else:
        logger.warning("addToCart: no session_id in context — cart cache not updated")

    cart = get_cached_cart()
    items = cart.get("data", {}).get("items", [])
    total = cart.get("data", {}).get("total", 0)
    msg = f'Added "{book["title"]}" to cart (quantity: {qty})'
    result = {
        "success": True,
        "data": {
            "bookId": book_id,
            "title": book["title"],
            "quantity": qty,
            "messageForUser": msg,
            "items": items,
            "total": total,
        },
    }
    logger.info("addToCart(bookId=%r, quantity=%d) → %s", book_id, qty, book["title"])
    notify_frontend("addToCart", params, result)
    return result


def run_remove_from_cart(book_id: str = "", index: int = 0) -> dict[str, Any]:
    """Remove an item from the backend cart cache and notify the frontend."""
    session_id = current_session_id.get()
    params = {"bookId": book_id, "index": index}

    if not book_id and index < 1:
        result: dict[str, Any] = {
            "success": False,
            "error": "Provide bookId or index (1-based position in cart).",
            "suggestions": ["Use getCart to see items, then remove by bookId or index."],
        }
        notify_frontend("removeFromCart", params, result)
        return result

    if session_id:
        _remove_from_cart_cache(session_id, book_id, index)
    else:
        logger.warning("removeFromCart: no session_id in context — cart cache not updated")

    cart = get_cached_cart()
    items = cart.get("data", {}).get("items", [])
    total = cart.get("data", {}).get("total", 0)
    msg = "Removed item from cart"
    result = {
        "success": True,
        "data": {"messageForUser": msg, "items": items, "total": total},
    }
    logger.info("removeFromCart(bookId=%r, index=%d)", book_id, index)
    notify_frontend("removeFromCart", params, result)
    return result


def run_get_cart() -> dict[str, Any]:
    """Return current cart + user (alias for run_get_cart_details)."""
    return run_get_cart_details()


def run_set_user_info(name: str, email: str, address: str = "") -> dict[str, Any]:
    """Store user info in the backend cache and notify the frontend."""
    if not name or not email:
        return {
            "success": False,
            "error": "name and email are required.",
            "suggestions": ["Ask the user for their full name and email."],
        }
    session_id = current_session_id.get()
    if session_id:
        _set_user_cache(session_id, name, email, address)
    else:
        logger.warning("setUserInfo: no session_id in context — user cache not updated")

    user: dict[str, Any] = {"name": name, "email": email}
    if address:
        user["address"] = address
    msg = f"Saved: {name}, {email}" + (f", {address}" if address else "")
    result: dict[str, Any] = {
        "success": True,
        "data": {"user": user, "messageForUser": msg},
    }
    params = {"name": name, "email": email, "address": address}
    logger.info("setUserInfo(name=%r, email=%r)", name, email)
    notify_frontend("setUserInfo", params, result)
    return result


def run_navigate_to(path: str) -> dict[str, Any]:
    """Notify the frontend to navigate to a path."""
    if not path:
        return {
            "success": False,
            "error": "path is required.",
            "suggestions": ["Use paths like /cart, /book/<bookId>, /checkout, /register, or /."],
        }
    normalized = path if path.startswith("/") else f"/{path}"
    msg = f"Navigating to {normalized}"
    result: dict[str, Any] = {
        "success": True,
        "data": {"path": normalized, "messageForUser": msg},
    }
    logger.info("navigateTo(path=%r)", normalized)
    notify_frontend("navigateTo", {"path": normalized}, result)
    return result


def run_highlight_capabilities() -> dict[str, Any]:
    """Notify the frontend to highlight the capabilities section."""
    msg = "Highlighting capabilities on the home page."
    result: dict[str, Any] = {
        "success": True,
        "data": {"messageForUser": msg},
    }
    logger.info("highlightCapabilities()")
    notify_frontend("highlightCapabilities", {}, result)
    return result


def run_highlight_why_voice() -> dict[str, Any]:
    """Notify the frontend to highlight the 'Why Voice + LLM?' section."""
    msg = "Highlighting why voice + LLM on the home page."
    result: dict[str, Any] = {
        "success": True,
        "data": {"messageForUser": msg},
    }
    logger.info("highlightWhyVoice()")
    notify_frontend("highlightWhyVoice", {}, result)
    return result


def run_highlight_demo_step(step: int) -> dict[str, Any]:
    """Notify the frontend to highlight the given step (1-6) of the demo flow on the home page."""
    step = max(1, min(6, int(step)))
    msg = f"Highlighting demo step {step} on the home page."
    result: dict[str, Any] = {
        "success": True,
        "data": {"step": step, "messageForUser": msg},
    }
    logger.info("highlightDemoStep(step=%s)", step)
    notify_frontend("highlightDemoStep", {"step": step}, result)
    return result


def run_highlight_demo_flow_scroll() -> dict[str, Any]:
    """Notify the frontend to slowly scroll the demo flow section from top to bottom (one continuous scroll)."""
    msg = "Scrolling through the demo flow on the home page."
    result: dict[str, Any] = {
        "success": True,
        "data": {"messageForUser": msg},
    }
    logger.info("highlightDemoFlowScroll()")
    notify_frontend("highlightDemoFlowScroll", {}, result)
    return result


def run_focus_password_field() -> dict[str, Any]:
    """Notify the frontend to focus the password input field."""
    msg = "The password field is focused. Please type your password there; I won't see or store it."
    result: dict[str, Any] = {
        "success": True,
        "data": {"messageForUser": msg},
    }
    logger.info("focusPasswordField()")
    notify_frontend("focusPasswordField", {}, result)
    return result


def run_get_view_details(book_id: str) -> dict[str, Any]:
    """Validate book_id and notify the frontend to navigate to the book details page."""
    if not book_id:
        return {
            "success": False,
            "error": "bookId is required to open the book details page.",
            "suggestions": ["Use the book id from search results or getBookDetails."],
        }
    book = _get_book_by_id(book_id)
    if not book:
        return {
            "success": False,
            "error": f"Book not found: {book_id}",
            "suggestions": ["Use a valid bookId from searchBooks or getBookDetails."],
        }
    path = f"/book/{book_id}"
    msg = f"Opening book details for {book['title']}"
    result: dict[str, Any] = {
        "success": True,
        "data": {"path": path, "bookId": book_id, "messageForUser": msg},
    }
    logger.info("getViewDetails(bookId=%r)", book_id)
    notify_frontend("getViewDetails", {"bookId": book_id}, result)
    return result


def run_checkout() -> dict[str, Any]:
    """Validate cart is not empty, user is registered, and notify the frontend to navigate to checkout."""
    cart = get_cached_cart()
    items = cart.get("data", {}).get("items", [])
    if not items:
        result: dict[str, Any] = {
            "success": False,
            "error": "Your cart is empty. Add items before checking out.",
            "suggestions": ["Add books to cart first, or navigate to search."],
        }
        notify_frontend("checkout", {}, result)
        return result
    session_id = current_session_id.get()
    user = get_cached_user(session_id) if session_id else None
    if not user or not (user.get("name") and user.get("email")):
        result = {
            "success": False,
            "error": "The user must register before checking out.",
            "suggestions": [
                "Call navigateTo('/register') and guide the user to provide name, email, and address, then setUserInfo. After they submit, they can check out.",
            ],
        }
        notify_frontend("checkout", {}, result)
        return result
    msg = "You're on the checkout page. Say 'confirm purchase' when you're ready."
    result = {
        "success": True,
        "data": {"path": "/checkout", "messageForUser": msg},
    }
    logger.info("checkout() → navigating to /checkout")
    notify_frontend("checkout", {}, result)
    return result


def run_confirm_purchase() -> dict[str, Any]:
    """Generate order, clear backend cart, and notify the frontend. Requires user to be registered."""
    session_id = current_session_id.get()
    user = get_cached_user(session_id) if session_id else None
    if not user or not (user.get("name") and user.get("email")):
        result: dict[str, Any] = {
            "success": False,
            "error": "The user must be registered before completing the purchase.",
            "suggestions": [
                "Navigate to /register and guide the user to provide name, email, and address, then call setUserInfo. After they submit, they can complete the purchase.",
            ],
        }
        notify_frontend("confirmPurchase", {}, result)
        return result

    cart = get_cached_cart()
    cart_data = cart.get("data", {})
    total = cart_data.get("total", 0)
    order_id = f"ord-{int(time.time() * 1000)}"
    email = user.get("email", "")
    msg = (
        f"Order complete. A confirmation email would be sent to {email} with payment instructions (mock)."
    )
    result = {
        "success": True,
        "data": {"orderComplete": True, "orderId": order_id, "messageForUser": msg},
    }

    if session_id:
        _clear_cart_cache(session_id)

    logger.info("confirmPurchase() → order %s, total $%.2f", order_id, total)
    notify_frontend("confirmPurchase", {}, result)
    return result
