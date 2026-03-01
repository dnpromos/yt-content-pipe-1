from __future__ import annotations

import time
from typing import Callable

_callbacks: list[Callable[[str], None]] = []


def add_callback(fn: Callable[[str], None]):
    _callbacks.append(fn)


def clear_callbacks():
    _callbacks.clear()


def emit(msg: str):
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    for cb in _callbacks:
        try:
            cb(line)
        except Exception:
            pass
