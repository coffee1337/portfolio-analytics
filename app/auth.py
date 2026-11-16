"""Admin authentication: one shared token, an HttpOnly cookie, constant-time compare."""

from __future__ import annotations

import hmac
import os

from fastapi import HTTPException, Request, Response

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")  # empty = auth disabled (local dev)
COOKIE_NAME = "pa_auth"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30


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
    return bool(cookie) and hmac.compare_digest(cookie, ADMIN_TOKEN)


def require_auth(request: Request) -> None:
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="auth required")


def set_auth_cookie(response: Response, request: Request) -> None:
    response.set_cookie(
        COOKIE_NAME,
        ADMIN_TOKEN,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
