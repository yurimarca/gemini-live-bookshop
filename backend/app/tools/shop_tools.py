"""Fast, BLOCKING tools: catalog search, book details and the cart.

Search runs on the in-memory index. The model may be steered by voice, so every
argument is validated by the policy plugin before a tool body runs, and the
bodies still treat arguments as untrusted.
"""

from __future__ import annotations

from google.adk.tools import ToolContext

from .. import services
from ..cart.service import CartError
from ..catalog.models import IndexEntry
from ._context import call_id_of, session_of

MAX_RESULTS = 6


def _brief(e: IndexEntry) -> dict:
    return {"id": e.id, "title": e.title, "title_pt": e.title_pt, "authors": e.author_names[:2],
            "category": e.category, "year": e.year, "languages": e.languages,
            "price_cents": e.price_cents}


def _cart_payload(view) -> dict:
    return {"items": [{"id": i.id, "title": i.title, "quantity": i.quantity,
                       "price_cents": i.price_cents} for i in view.items],
            "total_cents": view.total_cents,
            "note": "Demo prices; nothing is charged.",
            "hold_seconds_left": max(0, int(view.hold_expires_at - services.get().cart._clock()))
            if view.hold_expires_at else None}


async def search_books(tool_context: ToolContext, query: str = "", subject: str = "", language: str = "",
                       max_results: int = 5) -> dict:
    """Search the bookshop catalog.

    Args:
        query: Words from a title, an author or a topic. Leave empty to list the most read books.
        subject: Optional subject or category filter, for example "poetry" or "science fiction".
        language: Optional language filter: "en" for English or "pt" for Portuguese.
        max_results: How many books to return, 1 to 6.
    """
    session = session_of(tool_context)
    limit = max(1, min(int(max_results), MAX_RESULTS))
    results = services.get().catalog.index.search(query, subject=subject or None, language=language or None,
                                                  limit=limit)
    session.shown_book_ids = [e.id for e in results]
    return {"count": len(results), "books": [_brief(e) for e in results],
            "note": "Use show_books with these ids to put them on screen." if results
            else "Nothing matched. Offer a broader search."}


async def get_book_details(tool_context: ToolContext, book_id: str) -> dict:
    """Get the details of one book by its id (an id looks like OL12345W, taken from a search result).

    Args:
        book_id: The book id from a search result or a recommendation.
    """
    session_of(tool_context)
    book = await services.get().catalog.get(book_id)
    if book is None:
        return {"error": "unknown_book"}
    return {"id": book.id, "title": book.title, "title_pt": book.title_pt, "authors": book.author_names,
            "year": book.first_publish_year, "category": book.category, "subjects": book.subjects[:6],
            "languages": book.languages, "description": (book.description or "")[:600] or None,
            "rating": book.rating.model_dump() if book.rating else None,
            "price_cents": book.price_cents}


async def add_to_cart(tool_context: ToolContext, book_id: str, quantity: int = 1) -> dict:
    """Put a book in the shopper's cart with the given number of copies. Calling it again with the
    same book sets the quantity; it does not add more copies.

    Args:
        book_id: The book id from a search result or a recommendation.
        quantity: Number of copies, 1 to 5.
    """
    session = session_of(tool_context)
    try:
        view = await services.get().cart.set_item(session.uid, book_id, int(quantity),
                                                  op_id=f"voice-{call_id_of(tool_context)}")
    except CartError as exc:
        return {"error": exc.code}
    return {"status": "ok", "cart": _cart_payload(view)}


async def remove_from_cart(tool_context: ToolContext, book_id: str) -> dict:
    """Remove a book from the shopper's cart.

    Args:
        book_id: The id of a book that is in the cart.
    """
    session = session_of(tool_context)
    try:
        view = await services.get().cart.remove_item(session.uid, book_id,
                                                     op_id=f"voice-{call_id_of(tool_context)}")
    except CartError as exc:
        return {"error": exc.code}
    return {"status": "ok", "cart": _cart_payload(view)}


async def get_cart(tool_context: ToolContext) -> dict:
    """Read the shopper's cart: items, total and how long the hold on the cart has left."""
    session = session_of(tool_context)
    return {"cart": _cart_payload(await services.get().cart.get(session.uid))}
