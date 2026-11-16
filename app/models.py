from __future__ import annotations

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
    name: Mapped[str] = mapped_column(String(32), index=True)
    path: Mapped[str] = mapped_column(String(255), default="")
    title: Mapped[str] = mapped_column(String(255), default="")
    session_id: Mapped[str] = mapped_column(String(64), index=True, default="")
    visitor: Mapped[str] = mapped_column(String(40), index=True, default="")
    is_me: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_datacenter: Mapped[bool] = mapped_column(Boolean, default=False)
    ip_masked: Mapped[str] = mapped_column(String(48), default="")
    ip_hash: Mapped[str] = mapped_column(String(32), default="", index=True)
    referrer: Mapped[str] = mapped_column(String(512), default="")
    utm_source: Mapped[str] = mapped_column(String(64), default="")
    utm_medium: Mapped[str] = mapped_column(String(64), default="")
    utm_campaign: Mapped[str] = mapped_column(String(64), default="")
    country: Mapped[str] = mapped_column(String(8), default="")
    region: Mapped[str] = mapped_column(String(64), default="")
    city: Mapped[str] = mapped_column(String(64), default="")
    asn: Mapped[str] = mapped_column(String(32), default="")
    isp: Mapped[str] = mapped_column(String(128), default="")
    device: Mapped[str] = mapped_column(String(16), default="")
    os_name: Mapped[str] = mapped_column(String(32), default="")
    browser: Mapped[str] = mapped_column(String(32), default="")
    lang: Mapped[str] = mapped_column(String(16), default="")
    screen: Mapped[str] = mapped_column(String(32), default="")
    viewport: Mapped[str] = mapped_column(String(32), default="")
    tz: Mapped[str] = mapped_column(String(48), default="")
    props_json: Mapped[str] = mapped_column(String(2048), default="")

    __table_args__ = (
        Index("ix_events_key_ts", "site_key", "ts"),
        Index("ix_events_session", "session_id"),
        Index("ix_events_visitor_ts", "visitor", "ts"),
        Index("ix_events_iphash_ts", "ip_hash", "ts"),
    )


class IgnoredIdentity(Base):
    """Visitors / IP hashes the owner marked as "that's me"."""

    __tablename__ = "ignored_identities"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)  # visitor | ip_hash
    value: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    label: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
