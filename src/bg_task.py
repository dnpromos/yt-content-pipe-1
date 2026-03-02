"""Background task runner that survives Streamlit reruns.

Streamlit reruns the entire script on every widget interaction.
By running async generation in a daemon thread, we ensure it
continues even when the UI refreshes.
"""
from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine


@dataclass
class TaskState:
    """Shared state for a background task."""

    running: bool = False
    done: bool = False
    error: str | None = None
    result: Any = None
    label: str = ""


def start_task(
    coro_fn: Callable[..., Coroutine],
    args: tuple = (),
    kwargs: dict | None = None,
    label: str = "",
    on_done: Callable[[TaskState], None] | None = None,
) -> TaskState:
    """Launch *coro_fn* in a background thread and return a TaskState.

    Store the returned TaskState in st.session_state so you can poll it
    across Streamlit reruns.
    """
    state = TaskState(running=True, label=label)
    kwargs = kwargs or {}

    def _worker():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(coro_fn(*args, **kwargs))
            state.result = result
        except Exception as e:
            state.error = str(e)
        finally:
            state.running = False
            state.done = True
            if on_done:
                on_done(state)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return state
