from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    site_key: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(32), index=True)  # pageview|click|ui|section|scroll|ping|exit|lang_switch
    path: Mapped[str] = mapped_column(String(255), default="")
    title: Mapped[str] = mapped_column(String(255), default="")
    session_id: Mapped[str] = mapped_column(String(64), index=True, default="")
    is_me: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    visitor: Mapped[str] = mapped_column(String(40), index=True, default="")  # salted hash, never raw IP
    referrer: Mapped[str] = mapped_column(String(512), default="")
    country: Mapped[str] = mapped_column(String(8), default="")
    city: Mapped[str] = mapped_column(String(64), default="")
    device: Mapped[str] = mapped_column(String(16), default="")  # desktop | mobile | tablet | bot
    os_name: Mapped[str] = mapped_column(String(32), default="")
    browser: Mapped[str] = mapped_column(String(32), default="")
    lang: Mapped[str] = mapped_column(String(16), default="")
    screen: Mapped[str] = mapped_column(String(32), default="")
    props_json: Mapped[str] = mapped_column(String(1024), default="")  # compact JSON of extra props

    __table_args__ = (
        Index("ix_events_key_ts", "site_key", "ts"),
        Index("ix_events_session", "session_id"),
    )


# Tiny helpers so the dashboard does not need a heavy geo/ua dependency.
BOT_MARKERS = ("bot", "crawler", "spider", "curl", "wget", "python-requests", "headless")


def parse_device(ua: str) -> str:
    ua_l = (ua or "").lower()
    if any(m in ua_l for m in BOT_MARKERS):
        return "bot"
    if "ipad" in ua_l or "tablet" in ua_l:
        return "tablet"
    if "mobile" in ua_l or "iphone" in ua_l or "android" in ua_l:
        return "mobile"
    return "desktop"


def parse_os(ua: str) -> str:
    ua_l = (ua or "").lower()
    if "iphone" in ua_l or "ipad" in ua_l:
        return "iOS"
    if "android" in ua_l:
        return "Android"
    if "windows" in ua_l:
        return "Windows"
    if "mac os" in ua_l or "macintosh" in ua_l:
        return "macOS"
    if "cros" in ua_l:
        return "ChromeOS"
    if "linux" in ua_l:
        return "Linux"
    return ""


def parse_browser(ua: str) -> str:
    ua_l = (ua or "").lower()
    if "edg/" in ua_l:
        return "Edge"
    if "opr/" in ua_l or "opera" in ua_l:
        return "Opera"
    if "yabrowser" in ua_l:
        return "Yandex"
    if "firefox/" in ua_l:
        return "Firefox"
    if "chrome/" in ua_l or "crios/" in ua_l:
        return "Chrome"
    if "safari/" in ua_l:
        return "Safari"
    return ""


def country_from_headers(headers) -> str:
    for header in ("cf-ipcountry", "x-vercel-ip-country", "x-geo-country"):
        value = headers.get(header)
        if value and value.lower() not in ("xx", "t1"):
            return value[:8].upper()
    return ""
