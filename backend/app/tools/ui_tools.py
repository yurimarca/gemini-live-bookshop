"""BLOCKING tools that move the shopper's screen. They return at once; the browser does the work."""

from __future__ import annotations

from google.adk.tools import ToolContext

from .. import services
from ..protocol.events import UiCommand
from ._context import session_of


async def show_books(tool_context: ToolContext, book_ids: list[str], title: str = "") -> dict:
    """Show a set of books on the shopper's screen, for example the results of a search.

    Args:
        book_ids: Up to 6 book ids, in the order to show them.
        title: Optional short heading for the set (at most 60 characters).
    """
    session = session_of(tool_context)
    catalog = services.get().catalog
    ids = [b for b in book_ids if catalog.entry(b)][:6]
    if not ids:
        return {"error": "no_known_books"}
    session.bus.publish(UiCommand(command="show_books", book_ids=ids, title=title[:60] or None))
    return {"status": "shown", "count": len(ids)}


async def open_book(tool_context: ToolContext, book_id: str) -> dict:
    """Open the detail page of one book on the shopper's screen.

    Args:
        book_id: The book id to open.
    """
    session = session_of(tool_context)
    if not services.get().catalog.entry(book_id):
        return {"error": "unknown_book"}
    session.bus.publish(UiCommand(command="open_book", book_id=book_id))
    return {"status": "opened"}


async def open_cart(tool_context: ToolContext) -> dict:
    """Open the cart drawer on the shopper's screen."""
    session_of(tool_context).bus.publish(UiCommand(command="open_cart"))
    return {"status": "opened"}
