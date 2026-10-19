from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    site_key: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(32), index=True)  # pageview | click | section | lang_switch
    path: Mapped[str] = mapped_column(String(255), default="")
    visitor: Mapped[str] = mapped_column(String(40), index=True, default="")  # salted daily hash, never raw IP
    referrer: Mapped[str] = mapped_column(String(255), default="")
    country: Mapped[str] = mapped_column(String(8), default="")
    device: Mapped[str] = mapped_column(String(16), default="")  # desktop | mobile | tablet | bot
    props_json: Mapped[str] = mapped_column(String(1024), default="")  # compact JSON of extra props

    __table_args__ = (Index("ix_events_key_ts", "site_key", "ts"),)


# Tiny helpers so the dashboard does not need a heavy geo/ua dependency.
BOT_MARKERS = ("bot", "crawler", "spider", "curl", "wget", "python-requests", "headless")


def parse_device(ua: str) -> str:
    ua_l = ua.lower()
    if any(m in ua_l for m in BOT_MARKERS):
        return "bot"
    if "ipad" in ua_l or ("tablet" in ua_l):
        return "tablet"
    if "mobile" in ua_l or "iphone" in ua_l or "android" in ua_l:
        return "mobile"
    return "desktop"


def country_from_headers(headers) -> str:
    for header in ("cf-ipcountry", "x-vercel-ip-country", "x-geo-country"):
        value = headers.get(header)
        if value:
            return value[:8]
    return ""
