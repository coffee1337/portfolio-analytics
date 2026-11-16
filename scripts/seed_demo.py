"""Seed a local demo database with realistic portfolio traffic.

Usage:  DATABASE_URL=sqlite:///./demo.db python scripts/seed_demo.py [sessions]
"""

from __future__ import annotations

import json
import os
import random
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal, ensure_schema  # noqa: E402
from app.models import Event  # noqa: E402

random.seed(7)

CITIES = [
    ("RU", "Moscow", "Moscow", "AS25513", "PJSC Moscow City Telephone Network", False, "desktop", "Windows", "Chrome"),
    ("RU", "Saint Petersburg", "Saint Petersburg", "AS12389", "PJSC Rostelecom", False, "desktop", "macOS", "Safari"),
    ("RU", "Kazan", "Tatarstan", "AS41330", "MTS PJSC", False, "mobile", "Android", "Chrome"),
    ("RU", "Novosibirsk", "Novosibirsk Oblast", "AS31200", "Novotelecom Ltd", False, "mobile", "iOS", "Safari"),
    ("KZ", "Astana", "Astana", "AS43370", "Obit Telecommunications", False, "desktop", "Linux", "Firefox"),
    ("DE", "Frankfurt am Main", "Hesse", "AS24940", "Hetzner Online GmbH", True, "desktop", "Linux", "Chrome"),
    ("NL", "Amsterdam", "North Holland", "AS14061", "DigitalOcean, LLC", True, "desktop", "Linux", "Chrome"),
    ("US", "Ashburn", "Virginia", "AS15169", "Google LLC", True, "desktop", "Linux", "Chrome"),
]
SCREENS = ["1920x1080", "2560x1440", "1440x900", "390x844", "412x915", "1512x982"]
PROJECTS = ["ai-python-mentor", "ngie", "transaction-monitor", "neural-astar", "knn", "portfolio-analytics"]
STACK = ["Python", "FastAPI", "PyTorch", "RAG", "PostgreSQL", "React", "TypeScript", "Three.js", "Docker", "Kafka"]
QUESTIONS = [
    "Какой у тебя опыт с FastAPI?",
    "Покажи проекты с PyTorch",
    "Сколько лет коммерческого опыта?",
    "Что за проект ai-python-mentor?",
    "Есть ли опыт с Kafka?",
    "Можно посмотреть резюме?",
    "Какие задачи решал в TransactionMonitor?",
    "Работаешь ли с Kubernetes?",
]
SOURCES = ["https://t.me/coffee1337", "https://www.linkedin.com/feed/", "https://github.com/coffee1337", "https://habr.com/ru/", ""]


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def build_session(rng: random.Random, start: datetime, index: int) -> list[dict]:
    country, city, region, asn, isp, dc, device, os_name, browser = rng.choice(CITIES)
    visitor = f"v{rng.randrange(10**15):015d}"[:16]
    sid = f"s{rng.randrange(10**12):012d}"
    screen = rng.choice(SCREENS)
    path_entry = rng.choice(["/", "/ru/", "/", "/projects/knn/", "/"])
    referrer = rng.choice(SOURCES)
    rows: list[dict] = []
    ts = start

    def add(name: str, props: dict | None = None, path: str | None = None, gap: float = 0.0, lang: str = "ru-RU"):
        nonlocal ts
        ts = ts + timedelta(seconds=gap)
        rows.append(
            {
                "ts": ts,
                "site_key": "portfolio-dev-key",
                "name": name,
                "path": path if path is not None else path_entry,
                "title": "Егор Трефилов — Python / ML",
                "session_id": sid,
                "visitor": visitor,
                "is_me": False,
                "is_bot": False,
                "is_datacenter": dc,
                "ip_masked": f"{rng.randrange(1, 223)}.{rng.randrange(0, 255)}.{rng.randrange(0, 255)}.xxx",
                "ip_hash": f"{index:02d}{rng.randrange(10**20):020d}"[:24],
                "referrer": referrer,
                "utm_source": "telegram" if "t.me" in referrer else "",
                "utm_medium": "social" if "t.me" in referrer else "",
                "utm_campaign": "",
                "country": country,
                "region": region,
                "city": city,
                "asn": asn,
                "isp": isp,
                "device": device,
                "os_name": os_name,
                "browser": browser,
                "lang": lang,
                "screen": screen,
                "viewport": "1440x810" if device == "desktop" else "390x780",
                "tz": "Europe/Moscow",
                "props_json": json.dumps(props or {}, ensure_ascii=False, separators=(",", ":")),
            }
        )

    add("pageview", {"active_sec": 0})
    add("loader", {"action": "complete" if rng.random() > 0.25 else "skip", "elapsed_ms": rng.randrange(900, 3200)}, gap=rng.uniform(0.6, 2.4))

    sections = ["top", "entry", "about", "stack", "projects", "reviews", "resume", "contact"]
    depth = rng.choice([1, 2, 3, 4, 5, 6, 7, 8])
    active = 0.0
    for position, section in enumerate(sections[:depth]):
        active += rng.uniform(2, 9)
        add("section", {"id": section, "active_sec": round(active, 1)}, gap=rng.uniform(1.5, 7))
        if section in ("stack", "projects") and rng.random() > 0.45:
            tech = rng.choice(STACK)
            active += rng.uniform(2, 6)
            add("stack_key", {"tech": tech, "mode": rng.choice(["3d", "3d", "2d"]), "active_sec": round(active, 1)}, gap=rng.uniform(1, 5))

    scroll = rng.choice([24, 38, 52, 68, 84, 100])
    active += 4
    add("scroll", {"scroll": scroll, "active_sec": round(active, 1)}, gap=rng.uniform(1, 4))

    if rng.random() > 0.35:
        project = rng.choice(PROJECTS)
        add("project_select", {"project": project, "via": rng.choice(["explorer", "pill"]), "active_sec": round(active, 1)}, gap=rng.uniform(2, 6))
        if rng.random() > 0.4:
            add("project_details", {"project": project, "open": True, "active_sec": round(active, 1)}, gap=rng.uniform(1, 4))
        action = rng.choice(["github", "github", "demo", "clone_copy", "case_study"])
        add("project_action", {"project": project, "action": action, "active_sec": round(active, 1)}, gap=rng.uniform(2, 8))
        if action in ("github", "demo"):
            add("pageview", {"active_sec": round(active, 1)}, path=f"/projects/{project}/", gap=rng.uniform(1, 3))

    if rng.random() > 0.55:
        question = rng.choice(QUESTIONS)
        add("assistant", {"action": "open", "active_sec": round(active, 1)}, gap=rng.uniform(1, 3))
        add("assistant", {"action": "ask", "query": question, "via": rng.choice(["input", "chip"]), "lang": "ru", "active_sec": round(active, 1)}, gap=rng.uniform(2, 6))

    if rng.random() > 0.7:
        add("cmdk", {"action": "open", "active_sec": round(active, 1)}, gap=rng.uniform(1, 2))
        add("cmdk", {"action": "select", "command": rng.choice(["goto-projects", "goto-contact", "copy-email", "toggle-theme"]), "group": "nav", "active_sec": round(active, 1)}, gap=rng.uniform(0.5, 2))

    if rng.random() > 0.6:
        add("resume", {"action": rng.choice(["download_pdf", "view_repo"]), "section": "resume", "active_sec": round(active, 1)}, gap=rng.uniform(2, 6))

    if rng.random() > 0.75:
        add("contact_submit", {"topic": rng.choice(["hire", "hire", "project", "other"]), "status": "sent", "provider": "worker", "active_sec": round(active, 1)}, gap=rng.uniform(3, 9))

    if rng.random() > 0.8:
        add("social_click", {"network": rng.choice(["telegram", "linkedin", "github"]), "section": "contact", "active_sec": round(active, 1)}, gap=rng.uniform(1, 4))

    if rng.random() > 0.85:
        add("contact_copy", {"channel": rng.choice(["email", "telegram"]), "active_sec": round(active, 1)}, gap=rng.uniform(1, 3))

    if rng.random() > 0.9:
        add("entry_cta", {"card": rng.choice(["hire", "freelance", "code"]), "active_sec": round(active, 1)}, gap=rng.uniform(1, 4))

    add("exit", {"active_sec": round(active + rng.uniform(1, 6), 1), "max_scroll": scroll}, gap=rng.uniform(2, 12))
    return rows


def build_bot(start: datetime, index: int) -> list[dict]:
    return [
        {
            "ts": start,
            "site_key": "portfolio-dev-key",
            "name": "pageview",
            "path": "/",
            "title": "",
            "session_id": f"bot{index:03d}",
            "visitor": f"bot{index:013d}",
            "is_me": False,
            "is_bot": True,
            "is_datacenter": True,
            "ip_masked": "66.249.66.xxx",
            "ip_hash": f"bot{index:021d}"[:24],
            "referrer": "",
            "utm_source": "",
            "utm_medium": "",
            "utm_campaign": "",
            "country": "US",
            "region": "California",
            "city": "Mountain View",
            "asn": "AS15169",
            "isp": "Google LLC",
            "device": "bot",
            "os_name": "Linux",
            "browser": "",
            "lang": "",
            "screen": "",
            "viewport": "",
            "tz": "",
            "props_json": "{}",
        }
    ]


def build_quick_session(rng: random.Random, start: datetime, index: int) -> list[dict]:
    """Shallow visit: one pageview, a few seconds, no interaction → a true bounce."""
    rows = build_session(rng, start, 900 + index)
    keep = [row for row in rows if row["name"] in ("pageview", "loader", "exit")]
    for row in keep:
        if row["name"] == "exit":
            row["props_json"] = json.dumps({"active_sec": rng.uniform(2, 9), "max_scroll": rng.choice([0, 8, 14])})
    return keep


def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    ensure_schema()
    rng = random.Random(11)
    now = datetime.now(timezone.utc)
    rows: list[dict] = []
    for index in range(count):
        days_ago = rng.randrange(0, 14)
        start = now - timedelta(days=days_ago, hours=rng.randrange(0, 20), minutes=rng.randrange(0, 59))
        rows.extend(build_session(rng, start, index))
    for index in range(14):
        start = now - timedelta(days=rng.randrange(0, 14), hours=rng.randrange(0, 22))
        rows.extend(build_quick_session(rng, start, index))
    for index in range(6):
        rows.append(build_bot(now - timedelta(hours=index * 5 + 1), index)[0])
    with SessionLocal() as db:
        db.execute(Event.__table__.insert(), rows)
        db.commit()
    print(f"seeded {len(rows)} events in {count + 14} sessions")


if __name__ == "__main__":
    main()
