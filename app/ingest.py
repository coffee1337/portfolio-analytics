"""Ingest pipeline for POST /collect.

Responsibilities: validate IDs, stop self-referrals, trust the client clock
within a sane window, mark bots/owner, persist instantly and schedule geo
enrichment so the request never waits for a network round-trip.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from . import geo, ua
from .db import SessionLocal
from .models import Event, IgnoredIdentity, utcnow
from .schema import CollectIn

log = logging.getLogger("portfolio.ingest")

CLIENT_TS_BACK = timedelta(minutes=15)
CLIENT_TS_FORWARD = timedelta(minutes=2)
SELF_HOSTS = {"coffee1337.github.io", "www.coffee1337.github.io", "localhost", "127.0.0.1", "0.0.0.0"}
REFERRER_MAX = 512


def as_utc(value: datetime | None) -> datetime:
    """SQLite hands back naive datetimes; everything downstream is UTC-aware."""
    if value is None:
        return utcnow()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def clean_referrer(value: str, extra_hosts: set[str] | None = None) -> str:
    """Drop in-site navigation so the entry source is never the site itself."""
    raw = (value or "").strip()
    if not raw:
        return ""
    host = ""
    try:
        host = (urlparse(raw).hostname or "").lower().removeprefix("www.")
    except ValueError:
        return ""
    blocked = SELF_HOSTS | (extra_hosts or set())
    if host and host in blocked:
        return ""
    if not host and not raw.startswith(("http://", "https://")):
        return ""
    return raw[:REFERRER_MAX]


def resolve_ts(client_ts: float | None, now: datetime | None = None) -> datetime:
    """Trust the client clock only inside −15 min … +2 min of server time.

    Render free tier sleeps: the first events after a cold start carry a client
    timestamp that is 30–50 s older than the server's ``utcnow()``. Honouring it
    keeps visit durations realistic instead of collapsing every event to 0 s.
    """
    server_now = now or utcnow()
    if client_ts is None:
        return server_now
    try:
        value = float(client_ts)
    except (TypeError, ValueError):
        return server_now
    if value > 10_000_000_000:  # milliseconds
        value = value / 1000.0
    if value <= 0:
        return server_now
    try:
        candidate = datetime.fromtimestamp(value, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return server_now
    if server_now - CLIENT_TS_BACK <= candidate <= server_now + CLIENT_TS_FORWARD:
        return candidate
    return server_now


def normalise_visitor(value: str) -> str:
    return "".join(ch for ch in (value or "") if ch.isalnum() or ch in "-_")[:40]


def fallback_visitor(ip_hash: str, ua_string: str) -> str:
    seed = f"{ip_hash}|{ua_string}"
    return hashlib.sha256(seed.encode()).hexdigest()[:16]


def anonymous_session(visitor: str, now: datetime) -> str:
    stamp = now.astimezone(timezone.utc).strftime("%Y%m%d%H")
    return f"anon-{(visitor or 'unknown')[:10]}-{stamp}"


def utm_from_props(props: dict) -> tuple[str, str, str]:
    def pick(*keys: str) -> str:
        for key in keys:
            value = props.get(key)
            if isinstance(value, str) and value:
                return value[:64]
        return ""

    return (
        pick("utm_source"),
        pick("utm_medium"),
        pick("utm_campaign"),
    )


def ignored_values(db: Session) -> set[str]:
    return set(db.scalars(select(IgnoredIdentity.value)).all())


def is_owner(visitor: str, ip_hash: str, ignored: set[str], client_flag: bool) -> bool:
    if client_flag:
        return True
    return bool(visitor and visitor in ignored) or bool(ip_hash and ip_hash in ignored)


def props_json(props: dict | None, limit: int = 2048) -> str:
    return json.dumps(props or {}, separators=(",", ":"), ensure_ascii=False)[:limit]


def build_rows(
    events: list[CollectIn],
    *,
    request_headers,
    client_ip: str,
    ignored: set[str],
    own_hosts: set[str] | None = None,
) -> tuple[list[dict], list[tuple[str, str, str]]]:
    """Turn validated payloads into insertable dicts.

    Returns the rows plus the list of ``(ip, session_id, ip_hash)`` triples that
    still need an async geo lookup.
    """
    now = utcnow()
    ip_hash = geo.hash_ip(client_ip)
    masked = geo.mask_ip(client_ip)
    info, needs_lookup = geo.resolve_geo_now(client_ip, request_headers)
    ua_string = request_headers.get("user-agent", "")
    device, bot, os_name, browser = ua.describe(ua_string, request_headers, info.is_datacenter)

    rows: list[dict] = []
    pending: dict[str, tuple[str, str, str]] = {}
    for payload in events:
        props = dict(payload.props or {})
        visitor = normalise_visitor(payload.visitor) or fallback_visitor(ip_hash, ua_string)
        ts = resolve_ts(payload.client_ts, now)
        sid = payload.session.strip()[:64] or anonymous_session(visitor, ts)
        utm_source, utm_medium, utm_campaign = utm_from_props(props)
        referrer = ""
        if payload.name == "pageview":
            referrer = clean_referrer(payload.referrer, own_hosts)
        rows.append(
            {
                "ts": ts,
                "site_key": payload.key,
                "name": payload.name[:32],
                "path": (payload.path or "")[:255],
                "title": (payload.title or "")[:255],
                "session_id": sid,
                "visitor": visitor,
                "is_me": is_owner(visitor, ip_hash, ignored, bool(payload.me)),
                "is_bot": bot,
                "is_datacenter": info.is_datacenter,
                "ip_masked": masked,
                "ip_hash": ip_hash,
                "referrer": referrer,
                "utm_source": utm_source,
                "utm_medium": utm_medium,
                "utm_campaign": utm_campaign,
                "country": info.country,
                "region": info.region,
                "city": info.city,
                "asn": info.asn,
                "isp": info.isp,
                "device": device,
                "os_name": os_name,
                "browser": browser,
                "lang": (payload.lang or "")[:16],
                "screen": (payload.screen or "")[:32],
                "viewport": (payload.viewport or "")[:32],
                "tz": (payload.tz or "")[:48],
                "props_json": props_json(props),
            }
        )
        if needs_lookup and client_ip:
            pending[sid] = (client_ip, sid, ip_hash)
    return rows, list(pending.values())


def insert_rows(rows: list[dict]) -> None:
    if not rows:
        return
    with SessionLocal() as db:
        db.execute(Event.__table__.insert(), rows)
        db.commit()


def mark_ignored(visitor: str, ip_hash: str) -> int:
    """Flag every stored event of this identity as owner traffic."""
    if not visitor and not ip_hash:
        return 0
    updated = 0
    with SessionLocal() as db:
        if visitor:
            result = db.execute(
                update(Event).where(Event.visitor == visitor, Event.is_me.is_(False)).values(is_me=True)
            )
            updated += result.rowcount or 0
        if ip_hash:
            result = db.execute(
                update(Event)
                .where(Event.ip_hash == ip_hash, Event.is_me.is_(False))
                .values(is_me=True)
            )
            updated += result.rowcount or 0
        db.commit()
    return updated


async def enrich_and_backfill(ip: str, session_id: str, ip_hash: str, headers: dict | None = None) -> None:
    """Background task: resolve geo/ISP once, then patch the rows it belongs to."""
    if not ip:
        return
    info = await geo.enrich_geo_async(ip, headers)
    if not info.country:
        return
    try:
        with SessionLocal() as db:
            values: dict[str, object] = {"is_datacenter": info.is_datacenter}
            if info.country:
                values["country"] = info.country
            if info.region:
                values["region"] = info.region
            if info.city:
                values["city"] = info.city
            if info.asn:
                values["asn"] = info.asn
            if info.isp:
                values["isp"] = info.isp
            # Only fill gaps: never mix a country from one source with a city
            # from another, and never rewrite a pair that is already complete.
            db.execute(
                update(Event)
                .where(
                    Event.ip_hash == ip_hash,
                    (Event.city == "") | (Event.session_id == session_id),
                )
                .values(**values)
            )
            db.commit()
        from .analytics import invalidate_overview_cache

        invalidate_overview_cache()
    except Exception:  # noqa: BLE001 - background task must never crash the loop
        log.exception("geo backfill failed for %s", ip_hash)
