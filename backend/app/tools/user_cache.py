"""
Session-scoped user cache for backend user management.

Written directly by run_set_user_info in backend_executor.py
(backend-authoritative after native-audio model switch).
Read by get_cached_user() for the current session.
"""

from typing import Any

# session_id -> { "name": str, "email": str, "address": str | None }
_user_cache: dict[str, dict[str, Any]] = {}


def set_user(session_id: str, name: str, email: str, address: str = "") -> None:
    """Store user info directly for the session."""
    _user_cache[session_id] = {
        "name": name,
        "email": email,
        "address": address if address else None,
    }


def get_cached_user(session_id: str | None) -> dict[str, Any] | None:
    """Return cached user for the given session, or None."""
    if not session_id:
        return None
    return _user_cache.get(session_id)
