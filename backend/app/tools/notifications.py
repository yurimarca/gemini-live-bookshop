"""
Frontend notification queue for backend-executed tools.

When a regular (non-LongRunning) tool executes on the backend, it pushes a
notification here so the WebSocket handler can forward it to the frontend
for UI sync.  The model gets its result through ADK's internal path;
this queue is only for keeping the frontend in the loop.
"""

import asyncio
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_queue: Optional[asyncio.Queue] = None


def set_notification_queue(queue: asyncio.Queue) -> None:
    """Set the notification queue for the current connection."""
    global _queue
    _queue = queue


def clear_notification_queue() -> None:
    """Clear the notification queue (call on disconnect)."""
    global _queue
    _queue = None


def notify_frontend(name: str, parameters: dict[str, Any], result: dict[str, Any]) -> None:
    """Push a notification for the frontend.  Non-blocking, safe to call from sync code."""
    if _queue is not None:
        try:
            _queue.put_nowait({
                "type": "function_executed",
                "name": name,
                "parameters": parameters,
                "result": result,
            })
        except Exception:
            logger.warning("Failed to queue frontend notification for %s", name, exc_info=True)
