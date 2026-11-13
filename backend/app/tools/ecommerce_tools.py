"""
E-commerce tool definitions for the BookShop voice agent.

All tools are REGULAR async functions — they execute on the backend and ADK feeds
results to the model through its reliable internal path.  No LongRunningFunctionTool,
no send_content() round-trip.  Each formerly-frontend tool now calls a run_*
function in backend_executor.py which updates backend state and pushes a
function_executed notification to the frontend for UI sync.

Uses camelCase function names to match the frontend FunctionExecutor switch cases exactly.
"""

from app.tools.backend_executor import (
    run_get_book_details,
    run_get_cart_details,
    run_search_books,
    run_add_to_cart,
    run_remove_from_cart,
    run_get_cart,
    run_set_user_info,
    run_focus_password_field,
    run_checkout,
    run_confirm_purchase,
    run_navigate_to,
    run_get_view_details,
    run_highlight_capabilities,
    run_highlight_why_voice,
    run_highlight_demo_step,
    run_highlight_demo_flow_scroll,
)


# ---------------------------------------------------------------------------
# Backend-executed tools — ADK feeds results to model through internal path
# ---------------------------------------------------------------------------

async def searchBooks(query: str = "", category: str = "") -> dict:
    """Search for books in the bookshop by title or category.

    Args:
        query: Search text to match against book titles (optional).
        category: Filter by book category, e.g. "Fiction", "Science" (optional).
    """
    return run_search_books(query, category)


async def getBookDetails(bookId: str = "", title: str = "") -> dict:
    """Get detailed information about a specific book.

    Args:
        bookId: The book's unique ID (from search results).
        title: The book's title (alternative to bookId, supports partial match).
    """
    return run_get_book_details(bookId, title)


async def getCartDetails() -> dict:
    """Return the list of books in the cart and the total amount (backend-cached from session)."""
    return run_get_cart_details()


async def addToCart(bookId: str, quantity: int = 1) -> dict:
    """Add a book to the shopping cart.

    Args:
        bookId: The book's unique ID to add.
        quantity: Number of copies to add (default 1).
    """
    return run_add_to_cart(bookId, quantity)


async def removeFromCart(bookId: str = "", index: int = 0) -> dict:
    """Remove a book from the shopping cart.

    Args:
        bookId: The book's unique ID to remove.
        index: 1-based position in cart to remove (alternative to bookId).
    """
    return run_remove_from_cart(bookId, index)


async def getCart() -> dict:
    """Get the current shopping cart contents, item details, and total price. Result may include user if set."""
    return run_get_cart()


async def setUserInfo(name: str, email: str, address: str = "") -> dict:
    """Store the user's name, email, and optional address for this session (registration/checkout).

    Call this when the user provides their name, email, or address. The frontend and backend
    will remember them for the rest of the run so you do not need to ask again.

    Args:
        name: Full name.
        email: Email address.
        address: Delivery address (optional).
    """
    return run_set_user_info(name, email, address)


async def focusPasswordField() -> dict:
    """Focus the password input on the registration page so the user can type their password.

    Call this when on the registration page and the user needs to enter a password. Do not
    ask for or store the password; after calling this, tell the user to type it in the
    focused field.
    """
    return run_focus_password_field()


async def checkout() -> dict:
    """Navigate to the checkout page with the current cart.

    Does not complete the purchase. If the user has not yet provided name, email, and
    address, getCartDetails will show whether they are already set; if not, ask for them
    and call setUserInfo, then navigate to /register or /checkout as needed. After the
    user is on the checkout page and says they are ready, call confirmPurchase to
    complete the order and send the mock confirmation email.
    """
    return run_checkout()


async def confirmPurchase() -> dict:
    """Confirm the purchase and send the mock confirmation email.

    Call this when the user is on the checkout page and says they want to confirm,
    complete the order, or similar. This clears the cart and completes the order
    (mock: no real email is sent).
    """
    return run_confirm_purchase()


async def navigateTo(path: str) -> dict:
    """Navigate to a page in the bookshop.

    Args:
        path: URL path to navigate to (e.g. /cart, /book/<id>, /register, /checkout, /).
    """
    return run_navigate_to(path)


async def getViewDetails(bookId: str) -> dict:
    """Navigate to the view-details page for a book so the user can see it on screen.

    Args:
        bookId: The book's unique ID (from search results or getBookDetails).
    """
    return run_get_view_details(bookId)


async def highlightCapabilities() -> dict:
    """Highlight the 'What the agent can do' section on the home page.

    Call this when the user asks who you are, what you can do, or what your
    capabilities are, so they can see the four capabilities on screen while
    you describe them.
    """
    return run_highlight_capabilities()


async def highlightWhyVoice() -> dict:
    """Highlight the 'Why Voice + LLM?' section on the home page.

    Call this when the user asks why they should use the agent, why voice, or
    what the benefits are, so they can see the benefits on screen while you
    describe them.
    """
    return run_highlight_why_voice()


async def highlightDemoStep(step: int = 1) -> dict:
    """Highlight step N (1-6) of the demo flow on the home page.

    Call this when guiding the user through the demo (e.g. after completing
    a step or when describing the next step). Steps: 1=Search, 2=View details,
    3=Add to cart, 4=View cart, 5=Register, 6=Complete purchase.
    """
    return run_highlight_demo_step(step)


async def highlightDemoFlowScroll() -> dict:
    """Scroll the demo flow section on the home page slowly from top to bottom.

    Call this when the user asks to be shown the full flow, e.g. "How should we
    proceed?", "Guide me", or "Walk me through the demo". The frontend will
    scroll the "How the demo works" section once from start to end — one call,
    no need to perform each step or call highlightDemoStep. Prefer this over
    walking through steps and calling highlightDemoStep(1)..(6).
    """
    return run_highlight_demo_flow_scroll()


# ---------------------------------------------------------------------------
# Tool list for Agent — all async functions (no LongRunningFunctionTool)
# ---------------------------------------------------------------------------

ECOMMERCE_TOOLS = [
    searchBooks,
    getBookDetails,
    getCartDetails,
    addToCart,
    removeFromCart,
    getCart,
    setUserInfo,
    focusPasswordField,
    checkout,
    confirmPurchase,
    navigateTo,
    getViewDetails,
    highlightCapabilities,
    highlightWhyVoice,
    highlightDemoStep,
    highlightDemoFlowScroll,
]
