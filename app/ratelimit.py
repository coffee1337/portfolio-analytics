"""Tiny in-process rate limiting: no Redis, no external dependencies.

Two sliding windows guard the public edges:

* ``/collect`` — every request counts against a per-IP budget;
* ``/api/login`` — only failed attempts count, a success clears the bucket.

Everything is keyed in memory with a hard cap on the number of tracked keys, so
a hostile client cannot grow the dictionary without bound.
"""

from __future__ import annotations

import os
import threading
import time
from collections import deque

# Defensive ceiling: ~4096 keys x a small deque is a few hundred KB at most.
MAX_KEYS = 4096
COLLECT_WINDOW = 60
LOGIN_WINDOW = 300
LOGIN_LIMIT = 8


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


COLLECT_LIMIT = _env_int("COLLECT_RATE_LIMIT", 120)


class SlidingWindow:
    """Thread-safe sliding window over monotonic timestamps."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit = max(1, int(limit))
        self.window = float(window)
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, bucket: deque[float], now: float) -> None:
        while bucket and now - bucket[0] >= self.window:
            bucket.popleft()

    def _evict(self, now: float) -> None:
        """Drop expired buckets, then the oldest ones if the map is still full."""
        stale = [key for key, bucket in self._hits.items() if not bucket or now - bucket[-1] >= self.window]
        for key in stale:
            self._hits.pop(key, None)
        while len(self._hits) >= MAX_KEYS:
            self._hits.pop(next(iter(self._hits)))

    def retry_after(self, key: str) -> float | None:
        """Seconds to wait when the key is already over the limit, else None."""
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.get(key)
            if not bucket:
                return None
            self._prune(bucket, now)
            if len(bucket) < self.limit:
                return None
            return max(1.0, self.window - (now - bucket[0]))

    def hit(self, key: str) -> float | None:
        """Count one attempt. Returns retry_after when it exceeds the limit."""
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.get(key)
            if bucket is None:
                if len(self._hits) >= MAX_KEYS:
                    self._evict(now)
                bucket = deque()
                self._hits[key] = bucket
            self._prune(bucket, now)
            if len(bucket) >= self.limit:
                return max(1.0, self.window - (now - bucket[0]))
            bucket.append(now)
            return None

    def record(self, key: str) -> None:
        """Count a failure without enforcing (the caller checked first)."""
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.get(key)
            if bucket is None:
                if len(self._hits) >= MAX_KEYS:
                    self._evict(now)
                bucket = deque()
                self._hits[key] = bucket
            self._prune(bucket, now)
            bucket.append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._hits)


collect_limiter = SlidingWindow(COLLECT_LIMIT, COLLECT_WINDOW)
login_limiter = SlidingWindow(LOGIN_LIMIT, LOGIN_WINDOW)


def reset_rate_limits() -> None:
    """Test hook: forget every counter."""
    collect_limiter.reset()
    login_limiter.reset()
