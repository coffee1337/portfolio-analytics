"""Analytics service: session assembly, KPI, funnels, breakdowns, exports.

Everything here works on a bounded slice of time: events are read with the SQL
filters that are cheap (period, site, bot/owner flags) and the rest is computed
in one pass over grouped sessions. No endpoint loads the whole table, and the
overview answer is memoised for a few seconds so auto-refresh does not hammer
the database.
"""

from __future__ import annotations

import csv
import io
import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from sqlalchemy import Select, delete, func, select
from sqlalchemy.orm import Session

from .ingest import as_utc
from .models import Event, IgnoredIdentity, utcnow

MSK = ZoneInfo("Europe/Moscow")
LIVE_WINDOW = timedelta(minutes=5)
MAX_ROWS = 200_000
ENGAGED_SECONDS = 15
ENGAGED_SCROLL = 50
ENGAGED_SECTIONS = 3
GAP_CAP = 60  # seconds; a forgotten background tab must not add hours

RANGE_KEYS = ("today", "yesterday", "7d", "30d", "90d", "all")
PROJECT_IDS = (
    "ai-python-mentor",
    "ngie",
    "transaction-monitor",
    "neural-astar",
    "knn",
    "portfolio-analytics",
)
PROJECT_ALIASES = {
    "ai-python-mentor": "ai-python-mentor",
    "pyai-python-mentor": "ai-python-mentor",
    "ngie": "ngie",
    "ngieuapp": "ngie",
    "transaction-monitor": "transaction-monitor",
    "transactionmonitor": "transaction-monitor",
    "neural-astar": "neural-astar",
    "knn": "knn",
    "portfolio-analytics": "portfolio-analytics",
}
SECTIONS = ("top", "entry", "about", "stack", "projects", "reviews", "resume", "contact")
HOME_PATHS = ("/", "/ru/", "/index.html", "/ru/index.html", "")
GOAL_KEYS = ("resume", "contact", "contact_copy", "social", "entry_cta", "project")
INTERACTION_EVENTS = {
    "project_select",
    "project_details",
    "project_action",
    "project_filter",
    "stack_key",
    "assistant",
    "cmdk",
}

EVENT_COLUMNS = (
    Event.id,
    Event.ts,
    Event.name,
    Event.path,
    Event.title,
    Event.session_id,
    Event.visitor,
    Event.is_me,
    Event.is_bot,
    Event.is_datacenter,
    Event.ip_masked,
    Event.ip_hash,
    Event.referrer,
    Event.utm_source,
    Event.utm_medium,
    Event.utm_campaign,
    Event.country,
    Event.region,
    Event.city,
    Event.asn,
    Event.isp,
    Event.device,
    Event.os_name,
    Event.browser,
    Event.lang,
    Event.screen,
    Event.viewport,
    Event.tz,
    Event.props_json,
)
COLUMN_KEYS = [
    "id",
    "ts",
    "name",
    "path",
    "title",
    "session_id",
    "visitor",
    "is_me",
    "is_bot",
    "is_datacenter",
    "ip_masked",
    "ip_hash",
    "referrer",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "country",
    "region",
    "city",
    "asn",
    "isp",
    "device",
    "os_name",
    "browser",
    "lang",
    "screen",
    "viewport",
    "tz",
    "props_json",
]


# --------------------------------------------------------------------------- #
# filters
# --------------------------------------------------------------------------- #


def _clean(value: str | None, limit: int = 64) -> str:
    return (value or "").strip()[:limit]


@dataclass(slots=True)
class Filters:
    range_key: str = "7d"
    date_from: str = ""
    date_to: str = ""
    show_me: bool = False
    show_bots: bool = False
    source: str = ""
    utm: str = ""
    country: str = ""
    city: str = ""
    isp: str = ""
    device: str = ""
    os: str = ""
    browser: str = ""
    path: str = ""
    project: str = ""
    goal: str = ""
    engaged: bool = False

    @classmethod
    def from_query(cls, params: Any) -> "Filters":
        def get(name: str, limit: int = 64) -> str:
            return _clean(params.get(name, ""), limit)

        def flag(name: str) -> bool:
            return str(params.get(name, "0")).lower() in ("1", "true", "yes", "on")

        range_key = get("range") or "all" if (get("from") and get("to")) else (get("range") or "7d")
        if range_key not in RANGE_KEYS:
            range_key = "7d"
        return cls(
            range_key=range_key,
            date_from=get("from", 10),
            date_to=get("to", 10),
            show_me=flag("me"),
            show_bots=flag("bots"),
            source=get("source", 255),
            utm=get("utm", 128),
            country=get("country", 8).upper(),
            city=get("city"),
            isp=get("isp", 128),
            device=get("device"),
            os=get("os"),
            browser=get("browser"),
            path=get("path", 255),
            project=PROJECT_ALIASES.get(get("project").lower(), get("project")),
            goal=get("goal"),
            engaged=flag("engaged"),
        )

    def as_dict(self) -> dict[str, str]:
        data = {
            "range": self.range_key,
            "from": self.date_from,
            "to": self.date_to,
            "me": "1" if self.show_me else "0",
            "bots": "1" if self.show_bots else "0",
            "source": self.source,
            "utm": self.utm,
            "country": self.country,
            "city": self.city,
            "isp": self.isp,
            "device": self.device,
            "os": self.os,
            "browser": self.browser,
            "path": self.path,
            "project": self.project,
            "goal": self.goal,
            "engaged": "1" if self.engaged else "0",
        }
        return {key: value for key, value in data.items() if value not in ("", "0")} | {
            "range": self.range_key
        }

    def cache_key(self) -> str:
        return json.dumps(self.as_dict(), sort_keys=True)


def _parse_day(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=MSK)
    except (TypeError, ValueError):
        return None


def range_bounds(db: Session, filters: Filters) -> tuple[datetime, datetime, datetime, datetime, str]:
    """Return ``(start, end, prev_start, prev_end, bucket)`` in UTC."""
    now = datetime.now(timezone.utc)
    today_msk = datetime.now(MSK).replace(hour=0, minute=0, second=0, microsecond=0)
    key = filters.range_key
    end = now
    if key == "today":
        start = today_msk
    elif key == "yesterday":
        start = today_msk - timedelta(days=1)
        end = today_msk
    elif key == "all":
        earliest = db.scalar(select(func.min(Event.ts)))
        start = as_utc(earliest) if earliest else today_msk - timedelta(days=29)
    elif filters.date_from and filters.date_to:
        parsed_from = _parse_day(filters.date_from)
        parsed_to = _parse_day(filters.date_to)
        if parsed_from and parsed_to:
            start = parsed_from
            end = min(parsed_to + timedelta(days=1), now)
        else:
            start = now - timedelta(days=7)
    else:
        days = int(key[:-1]) if key[:-1].isdigit() else 7
        start = today_msk - timedelta(days=days - 1)
    start = start.astimezone(timezone.utc)
    end = end.astimezone(timezone.utc)
    if end <= start:
        end = start + timedelta(hours=1)
    span = end - start
    prev_end = start
    prev_start = start - span
    if key in ("today", "yesterday"):
        bucket = "hour" if span <= timedelta(hours=36) else "day"
    elif span <= timedelta(days=92):
        bucket = "day"
    elif span <= timedelta(days=370):
        bucket = "week"
    else:
        bucket = "month"
    if key == "today":
        prev_start = start - timedelta(days=1)
        prev_end = end - timedelta(days=1)
    return start, end, prev_start, prev_end, bucket


# --------------------------------------------------------------------------- #
# rows and sessions
# --------------------------------------------------------------------------- #


def load_rows(
    db: Session,
    start: datetime,
    end: datetime,
    *,
    show_me: bool,
    show_bots: bool,
) -> tuple[list[dict], bool]:
    query: Select = (
        select(*EVENT_COLUMNS)
        .where(Event.ts >= start, Event.ts < end)
        .order_by(Event.ts.asc(), Event.id.asc())
    )
    if not show_me:
        query = query.where(Event.is_me.is_(False))
    if not show_bots:
        query = query.where(Event.is_bot.is_(False))
    rows: list[dict] = []
    truncated = False
    result = db.execute(query.execution_options(yield_per=2000))
    for row in result:
        if len(rows) >= MAX_ROWS:
            truncated = True
            break
        item = dict(zip(COLUMN_KEYS, row, strict=False))
        item["ts"] = as_utc(item["ts"])
        item["p"] = _props(item.pop("props_json", ""))
        rows.append(item)
    return rows, truncated


def _props(raw: Any) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def scroll_percent(row: dict) -> float:
    props = row["p"]
    for key in ("max_scroll", "scroll", "depth", "percent"):
        if key in props:
            value = num(props[key])
            if value <= 1.0:
                value *= 100
            return max(0.0, min(100.0, value))
    return 0.0


def normalise_project(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    if text in PROJECT_ALIASES:
        return PROJECT_ALIASES[text]
    slug = "".join(ch if ch.isalnum() else "-" for ch in text).strip("-")
    slug = "-".join(part for part in slug.split("-") if part)
    if slug in PROJECT_ALIASES:
        return PROJECT_ALIASES[slug]
    for alias, project in PROJECT_ALIASES.items():
        if alias in slug:
            return project
    return slug


def project_from_path(path: str) -> str:
    lowered = (path or "").lower()
    marker = "/projects/"
    if marker not in lowered:
        return ""
    tail = lowered.split(marker, 1)[1]
    slug = tail.split("/")[0]
    return normalise_project(slug)


def goal_of(row: dict) -> str:
    name = row["name"]
    props = row["p"]
    if name == "resume":
        return "resume"
    if name == "contact_submit":
        return "contact"
    if name == "contact_copy":
        return "contact_copy"
    if name == "social_click":
        return "social"
    if name == "entry_cta":
        return "entry_cta"
    if name == "project_action" and str(props.get("action")) in ("github", "demo", "clone_copy"):
        return "project"
    if name == "pageview" and project_from_path(row["path"]):
        return "project"
    # Legacy beacons: downloads were reported as generic clicks.
    if name == "click" and str(props.get("kind")) in ("download", "resume"):
        return "resume"
    if name == "click" and str(props.get("kind")) == "mailto":
        return "social"
    return ""


def source_of(referrer: str) -> str:
    raw = (referrer or "").strip()
    if not raw:
        return "direct"
    try:
        host = (urlparse(raw).hostname or "").lower()
    except ValueError:
        return "direct"
    host = host.removeprefix("www.")
    if not host or host in ("coffee1337.github.io", "localhost", "127.0.0.1"):
        return "direct"
    return host


@dataclass(slots=True)
class SessionRow:
    sid: str
    visitor: str
    start: datetime
    end: datetime
    events: list[dict] = field(default_factory=list)
    duration: float = 0.0
    pageviews: int = 0
    pages: set[str] = field(default_factory=set)
    max_scroll: float = 0.0
    sections: set[str] = field(default_factory=set)
    goals: set[str] = field(default_factory=set)
    projects: set[str] = field(default_factory=set)
    interaction: bool = False
    loader: str = ""
    country: str = ""
    region: str = ""
    city: str = ""
    asn: str = ""
    isp: str = ""
    ip_masked: str = ""
    ip_hash: str = ""
    is_datacenter: bool = False
    is_me: bool = False
    is_bot: bool = False
    device: str = ""
    os_name: str = ""
    browser: str = ""
    screen: str = ""
    viewport: str = ""
    tz: str = ""
    lang: str = ""
    referrer: str = ""
    utm_source: str = ""
    utm_medium: str = ""
    utm_campaign: str = ""
    entry_path: str = ""
    first_title: str = ""

    @property
    def source(self) -> str:
        return source_of(self.referrer)

    @property
    def engaged(self) -> bool:
        return (
            self.duration >= ENGAGED_SECONDS
            or self.max_scroll >= ENGAGED_SCROLL
            or len(self.sections) >= ENGAGED_SECTIONS
            or self.pageviews >= 2
            or self.interaction
            or bool(self.goals)
        )

    @property
    def bounce(self) -> bool:
        return not self.engaged

    @property
    def live(self) -> bool:
        return (datetime.now(timezone.utc) - self.end) <= LIVE_WINDOW

    @property
    def home(self) -> bool:
        return self.entry_path in HOME_PATHS

    def visit_index(self, counter: Counter) -> int:
        return counter[self.visitor]

    def to_dict(self, *, visit_index: int = 1, counter: Counter | None = None) -> dict:
        return {
            "sid": self.sid,
            "visitor": self.visitor,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "duration": round(self.duration, 1),
            "pageviews": self.pageviews,
            "pages": sorted(self.pages)[:12],
            "max_scroll": round(self.max_scroll),
            "sections": len(self.sections),
            "goals": sorted(self.goals),
            "projects": sorted(self.projects),
            "country": self.country,
            "region": self.region,
            "city": self.city,
            "asn": self.asn,
            "isp": self.isp,
            "ip_masked": self.ip_masked,
            "ip_hash": self.ip_hash,
            "is_datacenter": self.is_datacenter,
            "is_me": self.is_me,
            "is_bot": self.is_bot,
            "device": self.device,
            "os": self.os_name,
            "browser": self.browser,
            "screen": self.screen,
            "viewport": self.viewport,
            "tz": self.tz,
            "lang": self.lang,
            "referrer": self.referrer,
            "source": self.source,
            "utm": {
                "source": self.utm_source,
                "medium": self.utm_medium,
                "campaign": self.utm_campaign,
            },
            "entry_path": self.entry_path,
            "title": self.first_title,
            "engaged": self.engaged,
            "bounce": self.bounce,
            "live": self.live,
            "visit_index": visit_index,
        }


def build_sessions(rows: Iterable[dict]) -> list[SessionRow]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        sid = row["session_id"] or f"legacy:{row['visitor']}:{row['ts'].date().isoformat()}"
        row["session_id"] = sid
        grouped[sid].append(row)
    sessions: list[SessionRow] = []
    for sid, items in grouped.items():
        items.sort(key=lambda item: item["ts"])
        first = items[0]
        session = SessionRow(
            sid=sid,
            visitor=first["visitor"] or "unknown",
            start=first["ts"],
            end=items[-1]["ts"],
        )
        session.events = items
        _fill_session_metrics(session)
        sessions.append(session)
    sessions.sort(key=lambda item: item.start, reverse=True)
    return sessions


def _fill_session_metrics(session: SessionRow) -> None:
    items = session.events
    active_by_page: dict[str, float] = {}
    gaps = 0.0
    previous: datetime | None = None
    for row in items:
        props = row["p"]
        if "active_sec" in props:
            page = row["path"] or "/"
            active_by_page[page] = max(active_by_page.get(page, 0.0), num(props["active_sec"]))
        if previous is not None:
            delta = (row["ts"] - previous).total_seconds()
            if 0 <= delta:
                gaps += min(delta, GAP_CAP)
        previous = row["ts"]
        name = row["name"]
        session.max_scroll = max(session.max_scroll, scroll_percent(row))
        if name == "pageview":
            session.pageviews += 1
            session.pages.add(row["path"] or "/")
            if not session.entry_path:
                session.entry_path = row["path"] or "/"
                session.first_title = row["title"]
                session.referrer = row["referrer"] or session.referrer
        elif name == "section":
            section = str(props.get("id") or props.get("section") or "")
            if section:
                session.sections.add(section)
        elif name == "loader":
            action = str(props.get("action") or "")
            if action and not session.loader:
                session.loader = action
        elif name in ("project_select", "project_details", "project_action"):
            project = normalise_project(props.get("project"))
            if project:
                session.projects.add(project)
        if name in INTERACTION_EVENTS:
            session.interaction = True
        goal = goal_of(row)
        if goal:
            session.goals.add(goal)
        if name in ("click", "ui"):
            session.interaction = True
    if active_by_page:
        session.duration = round(sum(active_by_page.values()), 1)
    else:
        session.duration = round(min(gaps, 4 * 3600), 1)
    # Header fields describe the visit as a whole: first non-empty wins.
    for key in (
        "country",
        "region",
        "city",
        "asn",
        "isp",
        "ip_masked",
        "ip_hash",
        "device",
        "os_name",
        "browser",
        "screen",
        "viewport",
        "tz",
        "lang",
        "utm_source",
        "utm_medium",
        "utm_campaign",
    ):
        if getattr(session, key):
            continue
        for row in items:
            value = row.get(key)
            if value:
                setattr(session, key, value)
                break
    session.is_datacenter = any(row["is_datacenter"] for row in items)
    session.is_me = any(row["is_me"] for row in items)
    session.is_bot = any(row["is_bot"] for row in items)


def session_matches(session: SessionRow, filters: Filters) -> bool:
    if filters.source:
        wanted = filters.source.lower()
        actual = session.source
        if wanted in ("direct", "прямой"):
            if actual != "direct":
                return False
        elif wanted not in actual:
            return False
    if filters.utm:
        wanted = filters.utm.lower()
        haystack = " ".join(
            filter(None, (session.utm_source, session.utm_medium, session.utm_campaign))
        ).lower()
        if wanted not in haystack:
            return False
    if filters.country and session.country.upper() != filters.country:
        return False
    if filters.city and session.city.lower() != filters.city.lower():
        return False
    if filters.isp and filters.isp.lower() not in session.isp.lower():
        return False
    if filters.device and session.device != filters.device:
        return False
    if filters.os and session.os_name.lower() != filters.os.lower():
        return False
    if filters.browser and session.browser.lower() != filters.browser.lower():
        return False
    if filters.path:
        wanted = filters.path
        if wanted not in session.pages and wanted != session.entry_path:
            return False
    if filters.project and filters.project not in session.projects:
        if not any(project_from_path(page) == filters.project for page in session.pages):
            return False
    if filters.goal and filters.goal not in session.goals:
        return False
    if filters.engaged and not session.engaged:
        return False
    return True


# --------------------------------------------------------------------------- #
# aggregation
# --------------------------------------------------------------------------- #


def pct(part: float, total: float) -> float:
    if not total:
        return 0.0
    return round(part / total * 100, 1)


def delta(current: float, previous: float) -> float | None:
    if previous <= 0:
        return None
    return round((current - previous) / previous * 100, 1)


def summarise(sessions: list[SessionRow]) -> dict:
    visitors = {session.visitor for session in sessions}
    returning = Counter(session.visitor for session in sessions)
    engaged = [session for session in sessions if session.engaged]
    bounced = [session for session in sessions if session.bounce]
    with_goals = [session for session in sessions if session.goals]
    durations = [session.duration for session in sessions]
    goals_total = sum(len(session.goals) for session in sessions)
    return {
        "sessions": len(sessions),
        "visitors": len(visitors),
        "returning": sum(1 for count in returning.values() if count > 1),
        "engaged": len(engaged),
        "bounces": len(bounced),
        "bounce_rate": pct(len(bounced), len(sessions)),
        "engaged_rate": pct(len(engaged), len(sessions)),
        "avg_sec": round(sum(durations) / len(durations), 1) if durations else 0.0,
        "max_sec": round(max(durations), 1) if durations else 0.0,
        "pageviews": sum(session.pageviews for session in sessions),
        "avg_scroll": round(sum(session.max_scroll for session in sessions) / len(sessions), 1)
        if sessions
        else 0.0,
        "goals": goals_total,
        "goal_sessions": len(with_goals),
        "conversion_rate": pct(len(with_goals), len(sessions)),
    }


def build_buckets(start: datetime, end: datetime, bucket: str) -> list[datetime]:
    points: list[datetime] = []
    cursor = start.astimezone(MSK)
    if bucket == "hour":
        cursor = cursor.replace(minute=0, second=0, microsecond=0)
        while cursor.astimezone(timezone.utc) < end:
            points.append(cursor)
            cursor = cursor + timedelta(hours=1)
    elif bucket == "week":
        cursor = (cursor - timedelta(days=cursor.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor.astimezone(timezone.utc) < end:
            points.append(cursor)
            cursor = cursor + timedelta(days=7)
    elif bucket == "month":
        cursor = cursor.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        while cursor.astimezone(timezone.utc) < end:
            points.append(cursor)
            year, month = cursor.year, cursor.month + 1
            if month > 12:
                year, month = year + 1, 1
            cursor = cursor.replace(year=year, month=month)
    else:
        cursor = cursor.replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor.astimezone(timezone.utc) < end:
            points.append(cursor)
            cursor = cursor + timedelta(days=1)
    return points[:400]


def bucket_start(value: datetime, bucket: str, origin: datetime) -> datetime:
    local = value.astimezone(MSK)
    if bucket == "hour":
        return local.replace(minute=0, second=0, microsecond=0)
    if bucket == "week":
        day = (local - timedelta(days=local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        return day
    if bucket == "month":
        return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def bucket_label(value: datetime, bucket: str) -> str:
    if bucket == "hour":
        return value.strftime("%H:00")
    return value.strftime("%d.%m")


def timeseries(sessions: list[SessionRow], start: datetime, end: datetime, bucket: str) -> dict:
    points = build_buckets(start, end, bucket)
    index = {point: position for position, point in enumerate(points)}
    visitors: list[set[str]] = [set() for _ in points]
    counters = [
        {"visits": 0, "pageviews": 0, "goals": 0, "engaged": 0, "duration": 0.0}
        for _ in points
    ]
    for session in sessions:
        key = bucket_start(session.start, bucket, start)
        position = index.get(key)
        if position is None:
            continue
        counters[position]["visits"] += 1
        counters[position]["pageviews"] += session.pageviews
        counters[position]["goals"] += len(session.goals)
        counters[position]["engaged"] += 1 if session.engaged else 0
        counters[position]["duration"] += session.duration
        visitors[position].add(session.visitor)
    out = []
    for position, point in enumerate(points):
        item = counters[position]
        out.append(
            {
                "t": point.astimezone(timezone.utc).isoformat(),
                "label": bucket_label(point, bucket),
                "visits": item["visits"],
                "visitors": len(visitors[position]),
                "engaged": item["engaged"],
                "pageviews": item["pageviews"],
                "goals": item["goals"],
                "avg_sec": round(item["duration"] / item["visits"], 1) if item["visits"] else 0.0,
            }
        )
    return {"bucket": bucket, "points": out}


def funnel(sessions: list[SessionRow]) -> dict:
    home = [session for session in sessions if session.home]
    loader_complete = sum(1 for session in home if session.loader == "complete")
    loader_skip = sum(1 for session in home if session.loader == "skip")
    steps = [{"key": "loader", "sessions": loader_complete + loader_skip, "complete": loader_complete, "skip": loader_skip}]
    previous = len(home)
    for section in SECTIONS:
        reached = sum(1 for session in home if section in session.sections)
        steps.append({"key": section, "sessions": reached})
        previous = reached
    steps[0]["sessions"] = steps[0]["sessions"]
    for position, step in enumerate(steps):
        step["share"] = pct(step["sessions"], len(home))
        step["drop"] = pct(step["sessions"] - steps[position - 1]["sessions"], steps[position - 1]["sessions"]) if position else 0.0
    return {
        "home_sessions": len(home),
        "loader": {
            "complete": loader_complete,
            "skip": loader_skip,
            "complete_pct": pct(loader_complete, len(home)),
            "skip_pct": pct(loader_skip, len(home)),
        },
        "steps": steps,
    }


def project_matrix(sessions: list[SessionRow]) -> list[dict]:
    stats: dict[str, Counter] = {project: Counter() for project in PROJECT_IDS}
    for session in sessions:
        for row in session.events:
            name = row["name"]
            props = row["p"]
            project = normalise_project(props.get("project"))
            if not project and name == "pageview":
                project = project_from_path(row["path"])
            if not project:
                continue
            bucket = stats.setdefault(project, Counter())
            if name == "project_select":
                bucket["select"] += 1
            elif name == "project_details":
                bucket["details"] += 1
            elif name == "project_action":
                action = str(props.get("action") or "")
                if action in ("github", "demo", "clone_copy"):
                    bucket[action] += 1
            elif name == "pageview" and project_from_path(row["path"]):
                bucket["case_page"] += 1
    rows = []
    for project, counter in stats.items():
        score = (
            counter["select"] * 1
            + counter["details"] * 2
            + counter["case_page"] * 3
            + counter["github"] * 4
            + counter["demo"] * 4
            + counter["clone_copy"] * 3
        )
        rows.append(
            {
                "id": project,
                "select": counter["select"],
                "details": counter["details"],
                "case_page": counter["case_page"],
                "github": counter["github"],
                "demo": counter["demo"],
                "clone_copy": counter["clone_copy"],
                "score": score,
            }
        )
    top = max((row["score"] for row in rows), default=0)
    for row in rows:
        row["weight"] = pct(row["score"], top) if top else 0.0
    rows.sort(key=lambda item: (-item["score"], item["id"]))
    return rows


def goals_breakdown(sessions: list[SessionRow]) -> list[dict]:
    counts = Counter()
    event_counts = Counter()
    topics = Counter()
    networks = Counter()
    cards = Counter()
    for session in sessions:
        for goal in session.goals:
            counts[goal] += 1
        for row in session.events:
            goal = goal_of(row)
            if not goal:
                continue
            event_counts[goal] += 1
            props = row["p"]
            if goal == "contact":
                topics[str(props.get("topic") or "other")] += 1
            if goal == "social":
                networks[str(props.get("network") or "other")] += 1
            if goal == "entry_cta":
                cards[str(props.get("card") or "other")] += 1
    total_sessions = len(sessions)
    return [
        {
            "key": goal,
            "sessions": counts[goal],
            "events": event_counts[goal],
            "share": pct(counts[goal], total_sessions),
            "topics": dict(topics) if goal == "contact" else {},
            "networks": dict(networks) if goal == "social" else {},
            "cards": dict(cards) if goal == "entry_cta" else {},
        }
        for goal in GOAL_KEYS
    ]


def breakdown(
    sessions: list[SessionRow],
    key: str,
    limit: int = 12,
) -> list[dict]:
    counter: Counter = Counter()
    for session in sessions:
        value = getattr(session, key, "") if key != "source" else session.source
        if not value:
            value = "unknown"
        counter[str(value)] += 1
    total = len(sessions)
    return [
        {"key": value, "sessions": count, "share": pct(count, total)}
        for value, count in counter.most_common(limit)
    ]


def pages_breakdown(sessions: list[SessionRow], limit: int = 12) -> tuple[list[dict], list[dict]]:
    entries: Counter = Counter()
    views: Counter = Counter()
    for session in sessions:
        entries[session.entry_path or "/"] += 1
        for page in session.pages:
            views[page] += 1
    total = len(sessions)
    entry_rows = [
        {"key": value, "sessions": count, "share": pct(count, total)}
        for value, count in entries.most_common(limit)
    ]
    view_rows = [
        {"key": value, "sessions": count, "share": pct(count, sum(views.values()))}
        for value, count in views.most_common(limit)
    ]
    return entry_rows, view_rows


def isp_breakdown(sessions: list[SessionRow], limit: int = 12) -> list[dict]:
    counter: Counter = Counter()
    datacenter: dict[str, bool] = {}
    asn_of: dict[str, str] = {}
    for session in sessions:
        key = session.isp or "unknown"
        counter[key] += 1
        datacenter[key] = datacenter.get(key, False) or session.is_datacenter
        if session.asn:
            asn_of[key] = session.asn
    return [
        {
            "key": value,
            "asn": asn_of.get(value, ""),
            "sessions": count,
            "share": pct(count, len(sessions)),
            "datacenter": datacenter.get(value, False),
        }
        for value, count in counter.most_common(limit)
    ]


def interactive_stats(sessions: list[SessionRow]) -> dict:
    stack: Counter = Counter()
    stack_mode: Counter = Counter()
    questions: list[dict] = []
    assistant_opens = 0
    asks = 0
    cmdk_opens = 0
    commands: Counter = Counter()
    command_group: dict[str, str] = {}
    for session in sessions:
        for row in session.events:
            props = row["p"]
            name = row["name"]
            if name == "stack_key":
                tech = str(props.get("tech") or "").strip()
                if tech:
                    stack[tech] += 1
                    stack_mode[str(props.get("mode") or "3d")] += 1
            elif name == "assistant":
                action = str(props.get("action") or "")
                if action == "open":
                    assistant_opens += 1
                elif action == "ask":
                    asks += 1
                    questions.append(
                        {
                            "ts": row["ts"].isoformat(),
                            "session": session.sid,
                            "lang": row["lang"] or session.lang,
                            "query": str(props.get("query") or "")[:200],
                            "via": str(props.get("via") or "input"),
                        }
                    )
            elif name == "cmdk":
                action = str(props.get("action") or "")
                if action == "open":
                    cmdk_opens += 1
                elif action == "select":
                    command = str(props.get("command") or "unknown")
                    commands[command] += 1
                    command_group[command] = str(props.get("group") or "")
    questions.sort(key=lambda item: item["ts"], reverse=True)
    return {
        "stack": [{"key": tech, "count": count} for tech, count in stack.most_common(12)],
        "stack_modes": dict(stack_mode),
        "assistant": {"opens": assistant_opens, "asks": asks, "questions": questions[:40]},
        "cmdk": {
            "opens": cmdk_opens,
            "commands": [
                {"command": value, "group": command_group.get(value, ""), "count": count}
                for value, count in commands.most_common(12)
            ],
        },
    }


def themes(sessions: list[SessionRow]) -> list[dict]:
    counter: Counter = Counter()
    for session in sessions:
        for row in session.events:
            if row["name"] == "theme_switch":
                to = str(row["p"].get("to") or "").lower()
                if to in ("dark", "light"):
                    counter[to] += 1
    total = sum(counter.values())
    return [{"key": key, "count": count, "share": pct(count, total)} for key, count in counter.most_common()]


def languages(sessions: list[SessionRow]) -> list[dict]:
    counter: Counter = Counter()
    for session in sessions:
        lang = (session.lang or "").lower()
        if lang:
            counter[lang.split("-")[0]] += 1
    total = sum(counter.values())
    return [{"key": key, "sessions": count, "share": pct(count, total)} for key, count in counter.most_common(5)]


def visit_counters(sessions: list[SessionRow]) -> Counter:
    """Number of sessions per visitor, oldest first (for "N-й визит")."""
    ordered = sorted(sessions, key=lambda item: item.start)
    seen: Counter = Counter()
    counters: Counter = Counter()
    for session in ordered:
        seen[session.visitor] += 1
        counters[session.sid] = seen[session.visitor]
    return counters


def overview(db: Session, filters: Filters, *, page: int = 1, per_page: int = 30) -> dict:
    start, end, prev_start, prev_end, bucket = range_bounds(db, filters)
    rows, truncated = load_rows(db, start, end, show_me=filters.show_me, show_bots=filters.show_bots)
    all_sessions = build_sessions(rows)
    sessions = [session for session in all_sessions if session_matches(session, filters)]
    counters = visit_counters(sessions)
    current = summarise(sessions)

    prev_rows, _ = load_rows(db, prev_start, prev_end, show_me=filters.show_me, show_bots=filters.show_bots)
    prev_sessions = [
        session for session in build_sessions(prev_rows) if session_matches(session, filters)
    ]
    previous = summarise(prev_sessions) if prev_sessions else None
    show_delta = filters.range_key != "all" and previous is not None

    def d(key: str) -> float | None:
        return delta(current[key], previous[key]) if (show_delta and previous) else None

    kpi = {
        "visitors": {
            "value": current["visitors"],
            "delta": d("visitors"),
            "visits": current["sessions"],
            "returning": current["returning"],
            "returning_pct": pct(current["returning"], current["visitors"]),
        },
        "engaged": {
            "value": current["engaged"],
            "rate": current["engaged_rate"],
            "delta": d("engaged"),
        },
        "bounce": {
            "value": current["bounce_rate"],
            "count": current["bounces"],
            "delta": d("bounce_rate"),
        },
        "duration": {
            "value": current["avg_sec"],
            "max": current["max_sec"],
            "delta": d("avg_sec"),
        },
        "pageviews": {
            "value": current["pageviews"],
            "avg_scroll": current["avg_scroll"],
            "delta": d("pageviews"),
        },
        "goals": {
            "value": current["goals"],
            "sessions": current["goal_sessions"],
            "conversion_rate": current["conversion_rate"],
            "delta": d("goals"),
        },
    }

    bots_count = db.scalar(
        select(func.count(func.distinct(Event.session_id))).where(
            Event.ts >= start, Event.ts < end, Event.is_bot.is_(True)
        )
    ) or 0
    me_count = db.scalar(
        select(func.count(func.distinct(Event.session_id))).where(
            Event.ts >= start, Event.ts < end, Event.is_me.is_(True)
        )
    ) or 0
    live_rows = [
        session for session in all_sessions if session.live and not (session.is_bot and not filters.show_bots)
    ]

    entries, views = pages_breakdown(sessions)
    interactive = interactive_stats(sessions)
    total = len(sessions)
    page = max(1, int(page or 1))
    per_page = max(5, min(100, int(per_page or 30)))
    offset = (page - 1) * per_page
    feed = sessions[offset : offset + per_page]

    return {
        "meta": {
            "generated_at": utcnow().isoformat(),
            "range": filters.range_key,
            "from": start.isoformat(),
            "to": end.isoformat(),
            "prev_from": prev_start.isoformat(),
            "prev_to": prev_end.isoformat(),
            "bucket": bucket,
            "tz": "Europe/Moscow",
            "filters": filters.as_dict(),
            "truncated": truncated,
            "bots_hidden": 0 if filters.show_bots else int(bots_count),
            "me_hidden": 0 if filters.show_me else int(me_count),
            "live": len(live_rows),
            "events_5min": sum(
                1 for session in all_sessions for row in session.events if (utcnow() - row["ts"]) <= LIVE_WINDOW
            ),
            "total_sessions": total,
        },
        "kpi": kpi,
        "prev": previous,
        "timeseries": timeseries(sessions, start, end, bucket),
        "funnel": funnel(sessions),
        "projects": project_matrix(sessions),
        "goals": goals_breakdown(sessions),
        "stack": interactive["stack"],
        "stack_modes": interactive["stack_modes"],
        "assistant": interactive["assistant"],
        "cmdk": interactive["cmdk"],
        "acquisition": {
            "sources": breakdown(sessions, "source", 14),
            "utm": _utm_rows(sessions),
        },
        "geo": {
            "countries": breakdown(sessions, "country", 14),
            "cities": _city_rows(sessions),
            "isps": isp_breakdown(sessions),
        },
        "devices": {
            "types": breakdown(sessions, "device"),
            "os": breakdown(sessions, "os_name"),
            "browsers": breakdown(sessions, "browser"),
            "screens": breakdown(sessions, "screen"),
        },
        "preferences": {"languages": languages(sessions), "themes": themes(sessions)},
        "paths": {"entry": entries, "all": views},
        "sessions": {
            "total": total,
            "page": page,
            "per_page": per_page,
            "items": [
                session.to_dict(visit_index=counters.get(session.sid, 1)) for session in feed
            ],
        },
    }


def _utm_rows(sessions: list[SessionRow], limit: int = 12) -> list[dict]:
    counter: Counter = Counter()
    for session in sessions:
        if not (session.utm_source or session.utm_medium or session.utm_campaign):
            continue
        counter[(session.utm_source, session.utm_medium, session.utm_campaign)] += 1
    total = sum(counter.values())
    return [
        {
            "key": " / ".join(part for part in combo if part) or "unknown",
            "source": combo[0],
            "medium": combo[1],
            "campaign": combo[2],
            "sessions": count,
            "share": pct(count, total),
        }
        for combo, count in counter.most_common(limit)
    ]


def _city_rows(sessions: list[SessionRow], limit: int = 14) -> list[dict]:
    counter: Counter = Counter()
    country_of: dict[str, str] = {}
    for session in sessions:
        if not session.city:
            continue
        counter[session.city] += 1
        country_of[session.city] = session.country
    total = sum(counter.values())
    return [
        {
            "key": city,
            "country": country_of.get(city, ""),
            "sessions": count,
            "share": pct(count, total),
        }
        for city, count in counter.most_common(limit)
    ]


# --------------------------------------------------------------------------- #
# details, visitors, exports
# --------------------------------------------------------------------------- #


def load_session(db: Session, sid: str) -> tuple[SessionRow | None, list[dict]]:
    rows, _ = load_rows(
        db,
        datetime(2000, 1, 1, tzinfo=timezone.utc),
        utcnow() + timedelta(days=1),
        show_me=True,
        show_bots=True,
    )
    target = [row for row in rows if row["session_id"] == sid]
    if not target:
        return None, []
    sessions = build_sessions(target)
    session = sessions[0]
    events = []
    previous: datetime | None = None
    for row in session.events:
        gap = round((row["ts"] - previous).total_seconds()) if previous else 0
        previous = row["ts"]
        events.append(
            {
                "id": row["id"],
                "ts": row["ts"].isoformat(),
                "name": row["name"],
                "path": row["path"],
                "title": row["title"],
                "gap": gap,
                "props": row["p"],
            }
        )
    return session, events


def session_detail(db: Session, sid: str) -> dict | None:
    session, events = load_session(db, sid)
    if session is None:
        return None
    visitor_sessions = db.scalars(
        select(Event.session_id)
        .where(Event.visitor == session.visitor)
        .group_by(Event.session_id)
        .order_by(func.min(Event.ts).desc())
    ).all()
    return {
        "session": session.to_dict(visit_index=len(visitor_sessions)),
        "events": events,
        "visitor": {
            "id": session.visitor,
            "sessions": len(visitor_sessions),
        },
    }


def visitor_detail(db: Session, vid: str) -> dict | None:
    rows, _ = load_rows(
        db,
        datetime(2000, 1, 1, tzinfo=timezone.utc),
        utcnow() + timedelta(days=1),
        show_me=True,
        show_bots=True,
    )
    rows = [row for row in rows if row["visitor"] == vid]
    if not rows:
        return None
    sessions = build_sessions(rows)
    counters = visit_counters(sessions)
    goals: Counter = Counter()
    projects: Counter = Counter()
    stack: Counter = Counter()
    for session in sessions:
        goals.update(session.goals)
        projects.update(session.projects)
        for row in session.events:
            if row["name"] == "stack_key":
                tech = str(row["p"].get("tech") or "")
                if tech:
                    stack[tech] += 1
    ordered = sorted(sessions, key=lambda item: item.start)
    return {
        "visitor": {
            "id": vid,
            "first_seen": ordered[0].start.isoformat(),
            "last_seen": ordered[-1].end.isoformat(),
            "sessions": len(sessions),
            "active_sec": round(sum(session.duration for session in sessions), 1),
            "is_me": any(session.is_me for session in sessions),
            "is_bot": any(session.is_bot for session in sessions),
            "goals": [{"key": key, "count": count} for key, count in goals.most_common()],
            "projects": [{"key": key, "count": count} for key, count in projects.most_common()],
            "stack": [{"key": key, "count": count} for key, count in stack.most_common(10)],
            "countries": sorted({session.country for session in sessions if session.country}),
            "isp": next((session.isp for session in sessions if session.isp), ""),
        },
        "sessions": [
            session.to_dict(visit_index=counters.get(session.sid, 1)) for session in sessions
        ],
    }


def collect_filtered(db: Session, filters: Filters) -> list[SessionRow]:
    start, end, _, _, _ = range_bounds(db, filters)
    rows, _ = load_rows(db, start, end, show_me=filters.show_me, show_bots=filters.show_bots)
    return [session for session in build_sessions(rows) if session_matches(session, filters)]


def export_sessions_csv(db: Session, filters: Filters) -> str:
    sessions = collect_filtered(db, filters)
    counters = visit_counters(sessions)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "session_id",
            "start_msk",
            "end_msk",
            "visitor",
            "visit_index",
            "duration_sec",
            "pageviews",
            "max_scroll",
            "engaged",
            "is_bot",
            "is_me",
            "device",
            "os",
            "browser",
            "screen",
            "country",
            "region",
            "city",
            "isp",
            "asn",
            "is_datacenter",
            "ip_masked",
            "source",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "entry_path",
            "goals",
            "projects",
        ]
    )
    for session in sessions:
        writer.writerow(
            [
                session.sid,
                session.start.astimezone(MSK).strftime("%Y-%m-%d %H:%M:%S"),
                session.end.astimezone(MSK).strftime("%Y-%m-%d %H:%M:%S"),
                session.visitor,
                counters.get(session.sid, 1),
                round(session.duration, 1),
                session.pageviews,
                round(session.max_scroll),
                int(session.engaged),
                int(session.is_bot),
                int(session.is_me),
                session.device,
                session.os_name,
                session.browser,
                session.screen,
                session.country,
                session.region,
                session.city,
                session.isp,
                session.asn,
                int(session.is_datacenter),
                session.ip_masked,
                session.source,
                session.utm_source,
                session.utm_medium,
                session.utm_campaign,
                session.entry_path,
                "|".join(sorted(session.goals)),
                "|".join(sorted(session.projects)),
            ]
        )
    return buffer.getvalue()


def export_events_json(db: Session, filters: Filters) -> str:
    start, end, _, _, _ = range_bounds(db, filters)
    rows, _ = load_rows(db, start, end, show_me=filters.show_me, show_bots=filters.show_bots)
    sessions = {session.sid: session for session in build_sessions(rows)}
    allowed = {session.sid for session in sessions.values() if session_matches(session, filters)}
    payload = [
        {
            "id": row["id"],
            "ts": row["ts"].isoformat(),
            "name": row["name"],
            "path": row["path"],
            "title": row["title"],
            "session": row["session_id"],
            "visitor": row["visitor"],
            "country": row["country"],
            "region": row["region"],
            "city": row["city"],
            "isp": row["isp"],
            "asn": row["asn"],
            "device": row["device"],
            "os": row["os_name"],
            "browser": row["browser"],
            "screen": row["screen"],
            "viewport": row["viewport"],
            "tz": row["tz"],
            "lang": row["lang"],
            "ip_masked": row["ip_masked"],
            "is_bot": row["is_bot"],
            "is_me": row["is_me"],
            "is_datacenter": row["is_datacenter"],
            "referrer": row["referrer"],
            "utm": {
                "source": row["utm_source"],
                "medium": row["utm_medium"],
                "campaign": row["utm_campaign"],
            },
            "props": row["p"],
        }
        for row in rows
        if row["session_id"] in allowed
    ]
    return json.dumps(payload, ensure_ascii=False, indent=1)


# --------------------------------------------------------------------------- #
# identities and cleanup
# --------------------------------------------------------------------------- #


def list_ignored(db: Session) -> list[dict]:
    rows = db.scalars(select(IgnoredIdentity).order_by(IgnoredIdentity.created_at.desc())).all()
    counts = {
        kind: dict(
            db.execute(
                select(getattr(Event, column), func.count(Event.id)).group_by(getattr(Event, column))
            ).all()
        )
        for kind, column in (("visitor", "visitor"), ("ip_hash", "ip_hash"))
    }
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "value": row.value,
            "label": row.label,
            "created_at": as_utc(row.created_at).isoformat(),
            "events": counts.get(row.kind, {}).get(row.value, 0),
        }
        for row in rows
    ]


def add_ignored(db: Session, kind: str, value: str, label: str = "") -> dict:
    from .ingest import mark_ignored

    kind = kind if kind in ("visitor", "ip_hash") else "visitor"
    value = (value or "").strip()[:64]
    if not value:
        raise ValueError("empty value")
    existing = db.scalar(select(IgnoredIdentity).where(IgnoredIdentity.value == value))
    if existing:
        row = existing
        row.label = label[:64] or row.label
        row.kind = kind
    else:
        row = IgnoredIdentity(kind=kind, value=value, label=label[:64])
        db.add(row)
    db.commit()
    db.refresh(row)
    updated = mark_ignored(value if kind == "visitor" else "", value if kind == "ip_hash" else "")
    return {"item": {"id": row.id, "kind": row.kind, "value": row.value, "label": row.label}, "updated": updated}


def remove_ignored(db: Session, ident: int) -> bool:
    row = db.get(IgnoredIdentity, ident)
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def cleanup_preview(db: Session) -> dict:
    bots = db.scalar(select(func.count(Event.id)).where(Event.is_bot.is_(True))) or 0
    me = db.scalar(select(func.count(Event.id)).where(Event.is_me.is_(True))) or 0
    total = db.scalar(select(func.count(Event.id))) or 0
    ignored = db.scalar(select(func.count(IgnoredIdentity.id))) or 0
    return {"bots": int(bots), "me": int(me), "total": int(total), "ignored": int(ignored)}


def cleanup(db: Session, scope: str, confirm: str = "") -> dict:
    if scope == "all":
        if confirm.strip().upper() != "DELETE":
            raise PermissionError("confirmation required")
        db.execute(delete(Event))
        db.execute(delete(IgnoredIdentity))
    elif scope == "bots":
        db.execute(delete(Event).where(Event.is_bot.is_(True)))
    elif scope == "me":
        db.execute(delete(Event).where(Event.is_me.is_(True)))
    elif scope == "ignored":
        db.execute(delete(IgnoredIdentity))
    else:
        raise ValueError("unknown scope")
    db.commit()
    return cleanup_preview(db)


def delete_session(db: Session, sid: str) -> int:
    result = db.execute(delete(Event).where(Event.session_id == sid))
    db.commit()
    return result.rowcount or 0


def delete_visitor(db: Session, vid: str) -> int:
    result = db.execute(delete(Event).where(Event.visitor == vid))
    db.commit()
    return result.rowcount or 0
