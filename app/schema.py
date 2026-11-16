from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

MAX_BATCH = 25

STRING_PROP_FALLBACKS = ("session", "sid", "visitor", "lang", "screen", "viewport", "tz")


class CollectIn(BaseModel):
    """One beacon. Extra fields live in ``props`` so the schema stays stable."""

    key: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=32)
    path: str = Field(default="", max_length=255)
    title: str = Field(default="", max_length=255)
    referrer: str = Field(default="", max_length=512)
    session: str = Field(default="", max_length=64)
    visitor: str = Field(default="", max_length=40)
    me: bool = False
    lang: str = Field(default="", max_length=16)
    screen: str = Field(default="", max_length=32)
    viewport: str = Field(default="", max_length=32)
    tz: str = Field(default="", max_length=48)
    client_ts: float | None = None
    props: dict[str, Any] | None = None


class CollectBatch(BaseModel):
    events: list[CollectIn] = Field(min_length=1, max_length=MAX_BATCH)


class PayloadError(ValueError):
    """Raised for a malformed or oversized beacon payload."""


def _lift(data: dict[str, Any]) -> dict[str, Any]:
    """Older beacons put session/lang/... inside ``props`` — accept both shapes."""
    props = data.get("props")
    if not isinstance(props, dict):
        return data
    for key in STRING_PROP_FALLBACKS:
        if not data.get(key) and props.get(key) not in (None, ""):
            data[key] = props[key]
    return data


def parse_payload(raw: bytes | str) -> list[CollectIn]:
    """Decode a single event or a batch of up to :data:`MAX_BATCH` events."""
    try:
        decoded = json.loads(raw or b"{}")
    except (ValueError, TypeError) as exc:  # malformed JSON
        raise PayloadError("invalid json") from exc
    items: list[Any]
    if isinstance(decoded, list):
        items = decoded
    elif isinstance(decoded, dict) and isinstance(decoded.get("events"), list):
        items = decoded["events"]
    elif isinstance(decoded, dict):
        items = [decoded]
    else:
        raise PayloadError("unsupported payload")
    if not items:
        raise PayloadError("empty payload")
    if len(items) > MAX_BATCH:
        raise PayloadError(f"batch larger than {MAX_BATCH}")
    events: list[CollectIn] = []
    for item in items:
        if not isinstance(item, dict):
            raise PayloadError("event is not an object")
        events.append(CollectIn.model_validate(_lift(dict(item))))
    return events
