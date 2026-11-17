"""Admin authentication: one shared token, an HttpOnly cookie, constant-time compare."""

from __future__ import annotations

import hashlib
import hmac
import os

from fastapi import HTTPException, Request, Response

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")  # empty = auth disabled (local dev)
COOKIE_NAME = "pa_auth"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30
COOKIE_CONTEXT = b"pa-cookie-v1"


def cookie_value() -> str:
    """The cookie never carries the raw admin token."""
    return hmac.new(ADMIN_TOKEN.encode(), COOKIE_CONTEXT, hashlib.sha256).hexdigest()


def is_https(request: Request) -> bool:
    """Render terminates TLS in front of the app: trust X-Forwarded-Proto."""
    if request.url.scheme == "https":
        return True
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    return proto == "https"


def auth_enabled() -> bool:
    return bool(ADMIN_TOKEN)


def token_matches(candidate: str) -> bool:
    if not ADMIN_TOKEN:
        return True
    return hmac.compare_digest((candidate or "").strip(), ADMIN_TOKEN)


def is_authenticated(request: Request) -> bool:
    if not ADMIN_TOKEN:
        return True
    cookie = request.cookies.get(COOKIE_NAME, "")
    if not cookie:
        return False
    return hmac.compare_digest(cookie, cookie_value())


def require_auth(request: Request) -> None:
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="auth required")


def set_auth_cookie(response: Response, request: Request) -> None:
    response.set_cookie(
        COOKIE_NAME,
        cookie_value(),
        httponly=True,
        secure=is_https(request),
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
