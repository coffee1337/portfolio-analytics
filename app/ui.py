"""Server-rendered analytics dashboard.

Dense dark UI, Moscow time, click-to-filter. No template engine, no client
framework — one small refresh script on the overview.
"""

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlparse
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .models import Event, utcnow

MSK = ZoneInfo("Europe/Moscow")
RANGES = (("today", "сегодня"), ("7d", "7д"), ("30d", "30д"), ("90d", "90д"))
DEVICE_LABEL = {"desktop": "компьютер", "mobile": "телефон", "tablet": "планшет", "bot": "бот"}
EVENT_LABELS = {
    "pageview": "страница",
    "click": "ссылка",
    "ui": "кнопка",
    "section": "секция",
    "scroll": "скролл",
    "exit": "выход",
    "lang_switch": "язык",
    "theme": "тема",
    "nav": "меню",
    "resume": "резюме",
}


def esc(value) -> str:
    return (
        str(value if value is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def q(value: str) -> str:
    return quote(value or "", safe="")


def to_msk(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(MSK)


def fmt_dt(dt: datetime) -> str:
    return to_msk(dt).strftime("%d.%m %H:%M")


def fmt_t(dt: datetime) -> str:
    return to_msk(dt).strftime("%H:%M:%S")


def fmt_dur(sec) -> str:
    sec = int(sec or 0)
    if sec <= 5:
        return "≤5с"
    if sec < 60:
        return f"{sec}с"
    if sec < 3600:
        return f"{sec // 60}м {sec % 60}с".replace(" 0с", "")
    return f"{sec // 3600}ч {(sec % 3600) // 60}м"


def host_of(url: str) -> str:
    if not url:
        return "прямой"
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return url[:48]
    if host.startswith("www."):
        host = host[4:]
    if host in ("coffee1337.github.io", "localhost", "127.0.0.1"):
        return "прямой"
    return host or "прямой"


def flag(cc: str) -> str:
    cc = (cc or "").upper()
    if len(cc) == 2 and cc.isalpha():
        base = 0x1F1E6
        return chr(base + ord(cc[0]) - 65) + chr(base + ord(cc[1]) - 65)
    return ""


def props_of(raw) -> dict:
    if isinstance(raw, Event):
        raw = raw.props_json
    try:
        return json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        return {}


def range_bounds(range_key: str) -> tuple[datetime, str]:
    key = range_key if range_key in dict(RANGES) else "today"
    now = datetime.now(MSK)
    if key == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now - timedelta(days=int(key[:-1]))
    return start.astimezone(timezone.utc), key


def href(filters: dict, **overrides) -> str:
    data = {
        "range": filters.get("range", "today"),
        "me": 1 if filters.get("me") else 0,
        "source": filters.get("source", ""),
        "country": filters.get("country", ""),
        "device": filters.get("device", ""),
        "path": filters.get("path", ""),
    }
    data.update(overrides)
    parts = [f"range={q(str(data['range']))}", f"me={1 if data['me'] else 0}"]
    for key in ("source", "country", "device", "path"):
        if data.get(key):
            parts.append(f"{key}={q(str(data[key]))}")
    return "/?" + "&".join(parts)


CSS = """
:root{--bg:#09090b;--card:#111113;--line:#232328;--text:#ece8df;--muted:#9a968a;--faint:#6a675c;
--lime:#c6f24e;--blue:#8eb6ff}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text)}
body{font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI",sans-serif;padding-bottom:48px}
a{color:inherit;text-decoration:none}
.mono{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace}
.wrap{max-width:1280px;margin:0 auto;padding:0 16px}
.top{position:sticky;top:0;z-index:5;background:rgba(9,9,11,.92);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;gap:12px;min-height:52px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.brand{font-weight:650}
.brand b{color:var(--lime)}
.live{color:var(--muted);font-size:12px}
.live i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--lime);margin-right:6px}
.live.off i{background:var(--faint)}
.spacer{flex:1}
.pills{display:flex;gap:4px;flex-wrap:wrap}
.pill{border:1px solid var(--line);border-radius:7px;padding:4px 9px;color:var(--muted);font-size:12px}
.pill.on{background:var(--text);color:var(--bg);border-color:var(--text)}
.kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:14px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.kpi b{display:block;font-size:22px;font-family:ui-monospace,monospace;color:var(--lime);font-weight:600}
.kpi span{color:var(--muted);font-size:11px}
.kpi small{display:block;color:var(--faint);font-size:11px;margin-top:2px}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
.chip{border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:12px}
.chart,.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:12px}
.chart h2,.panel h2{margin:0 0 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
table{width:100%;border-collapse:collapse}
td{padding:7px 8px 7px 0;border-top:1px solid var(--line);vertical-align:top}
.bar{display:block;height:3px;background:var(--lime);border-radius:2px;opacity:.7;margin-top:6px}
.num{font-family:ui-monospace,monospace;color:var(--lime);white-space:nowrap}
.faint{color:var(--faint)}
.muted{color:var(--muted)}
.badge{display:inline-block;border-radius:5px;padding:0 6px;font-size:11px}
.me{color:#111;background:var(--lime)}
.visit{display:grid;grid-template-columns:150px minmax(140px,1.1fr) minmax(160px,1.3fr) 120px 72px minmax(90px,auto);gap:10px;padding:9px 0;border-top:1px solid var(--line)}
.visit a:hover{color:var(--lime)}
.head{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.card span{display:block;color:var(--faint);font-size:11px;margin-bottom:3px}
.card b{font-weight:550;word-break:break-word}
.timeline{list-style:none;margin:0;padding:0}
.timeline li{display:grid;grid-template-columns:92px 1fr;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
.tag{display:inline-block;min-width:72px;font-size:11px;color:var(--lime)}
.wipe{margin-top:18px;border-top:1px solid var(--line);padding-top:12px;color:var(--faint);font-size:12px}
.wipe input,.wipe button{background:#161618;color:var(--text);border:1px solid var(--line);border-radius:7px;padding:6px 8px}
.note{color:var(--faint);font-size:11px}
@media (max-width:980px){
  .kpis,.grid,.head{grid-template-columns:1fr 1fr}
  .visit{grid-template-columns:1fr 1fr}
}
@media (max-width:640px){
  .kpis,.grid,.head,.visit{grid-template-columns:1fr}
}
"""


def shell(title: str, body: str, filters: dict | None = None, live: tuple = (0, 0), refresh: bool = False) -> str:
    filters = filters or {"range": "today", "me": False}
    events, sessions = live
    live_cls = "live" if events else "live off"
    pills = "".join(
        f'<a class="pill{" on" if filters.get("range") == key else ""}" href="{href(filters, range=key)}">{label}</a>'
        for key, label in RANGES
    )
    me_on = bool(filters.get("me"))
    me = (
        f'<a class="pill{" on" if me_on else ""}" href="{href(filters, me=not me_on)}">'
        f'{"мои визиты: видны" if me_on else "мои визиты: скрыты"}</a>'
    )
    script = "<script>setTimeout(()=>location.reload(),30000)</script>" if refresh else ""
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title><style>{CSS}</style></head><body>
<div class="top"><div class="wrap">
<a class="brand" href="{href(filters)}"><b>ET</b> / аналитика</a>
<span class="{live_cls}"><i></i>{sessions} сейчас · {events} за 5 мин</span>
<span class="spacer"></span>
<span class="pills">{pills}{me}</span>
</div></div>
<div class="wrap">{body}
<p class="note">время московское · IP не хранится · свой визит: ?me=1 на сайте, снять: ?me=0</p>
</div>{script}</body></html>"""


def login_page(error: bool = False) -> str:
    hint = '<p style="color:#ff6b6b;font-size:12px">неверный токен</p>' if error else ""
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>вход</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#ece8df;font-family:ui-sans-serif,system-ui,sans-serif}}
form{{display:flex;gap:8px}}input,button{{background:#111113;color:#ece8df;border:1px solid #232328;border-radius:8px;padding:10px 12px}}</style></head>
<body><div><h1 style="font-size:18px">ET / аналитика</h1>{hint}
<form method="post" action="/login"><input type="password" name="token" placeholder="токен" autofocus><button>войти</button></form>
</div></body></html>"""


def _live(db: Session) -> tuple[int, int]:
    recent = utcnow() - timedelta(minutes=5)
    events = db.scalar(select(func.count(Event.id)).where(Event.ts >= recent)) or 0
    sessions = db.scalar(
        select(func.count(func.distinct(Event.session_id))).where(Event.ts >= recent, Event.session_id != "")
    ) or 0
    return int(events), int(sessions)


def _load_events(db: Session, since: datetime, show_me: bool) -> list[Event]:
    stmt = select(Event).where(Event.ts >= since, Event.session_id != "").order_by(Event.ts)
    if not show_me:
        stmt = stmt.where(Event.is_me.is_(False))
    return list(db.execute(stmt).scalars())


def _session_rows(events: list[Event]) -> list[dict]:
    grouped: dict[str, list[Event]] = {}
    for event in events:
        grouped.setdefault(event.session_id, []).append(event)
    rows = []
    for sid, items in grouped.items():
        items.sort(key=lambda item: item.ts)
        pageviews = [item for item in items if item.name == "pageview"]
        entry = pageviews[0] if pageviews else items[0]
        referrer = next((item.referrer for item in items if item.referrer), "")
        utm = ""
        for item in items:
            props = props_of(item)
            if props.get("utm_source"):
                utm = f"{props.get('utm_source')} / {props.get('utm_medium', '—')}"
                break
        rows.append(
            {
                "sid": sid,
                "start": items[0].ts,
                "end": items[-1].ts,
                "duration": (items[-1].ts - items[0].ts).total_seconds(),
                "visitor": next((item.visitor for item in items if item.visitor), ""),
                "is_me": any(item.is_me for item in items),
                "device": entry.device or "?",
                "os": entry.os_name or "",
                "browser": entry.browser or "",
                "lang": entry.lang or "",
                "screen": entry.screen or "",
                "country": entry.country or "",
                "city": entry.city or "",
                "referrer": referrer,
                "source": host_of(referrer),
                "utm": utm,
                "entry": entry.path or "/",
                "pageviews": len(pageviews),
                "clicks": sum(1 for item in items if item.name in ("click", "ui", "nav", "resume")),
                "scroll": max(
                    (int(props_of(item).get("depth") or 0) for item in items if item.name == "scroll"),
                    default=0,
                ),
            }
        )
    rows.sort(key=lambda row: row["end"], reverse=True)
    return rows


def _apply(rows: list[dict], source: str, country: str, device: str, path: str) -> list[dict]:
    if source:
        rows = [row for row in rows if row["source"] == source]
    if country:
        rows = [row for row in rows if row["country"] == country]
    if device:
        rows = [row for row in rows if row["device"] == device]
    if path:
        rows = [row for row in rows if row["entry"] == path]
    return rows


def _bars(pairs: list[tuple], total: int, filters: dict, key: str) -> str:
    if not pairs:
        return '<p class="faint">нет данных</p>'
    top = max(count for _, count, _ in pairs) or 1
    body = ""
    for label, count, value in pairs:
        share = int(count / total * 100) if total else 0
        link = href(filters, **{key: "" if filters.get(key) == value else value})
        body += (
            f'<tr><td><a href="{link}">{esc(label)}</a>'
            f'<span class="bar" style="width:{max(4, int(count / top * 100))}%"></span></td>'
            f'<td class="num">{count}</td><td class="faint">{share}%</td></tr>'
        )
    return f"<table>{body}</table>"


def _chart(rows: list[dict], range_key: str) -> str:
    now = datetime.now(MSK)
    if range_key == "today":
        labels = [f"{hour:02d}" for hour in range(24)]
        counts = [0] * 24
        for row in rows:
            counts[to_msk(row["start"]).hour] += 1
    else:
        days = int(range_key[:-1])
        start = (now - timedelta(days=days - 1)).date()
        labels = [(start + timedelta(days=i)).strftime("%d.%m") for i in range(days)]
        counts = [0] * days
        index = {label: i for i, label in enumerate(labels)}
        for row in rows:
            label = to_msk(row["start"]).strftime("%d.%m")
            if label in index:
                counts[index[label]] += 1
    peak = max(counts) or 1
    width, chart_h = max(640, len(counts) * 22), 96
    step = width / max(len(counts), 1)
    bw = min(16, step * 0.55)
    parts = []
    for i, count in enumerate(counts):
        height = max(2, int(count / peak * chart_h)) if count else 2
        x = i * step + (step - bw) / 2
        y = 8 + chart_h - height
        parts.append(
            f'<rect x="{x:.1f}" y="{y}" width="{bw:.1f}" height="{height}" rx="2" '
            f'fill="#c6f24e" opacity="{"0.9" if count else "0.18"}"><title>{labels[i]}: {count}</title></rect>'
        )
        if i % max(1, len(counts) // 12) == 0:
            parts.append(
                f'<text x="{x + bw / 2:.1f}" y="{chart_h + 24}" text-anchor="middle" font-size="10" fill="#6a675c">{labels[i]}</text>'
            )
    return f'<svg viewBox="0 0 {width} 140" width="100%" height="140">{"".join(parts)}</svg>'


def render_overview(
    db: Session,
    range_key: str = "today",
    show_me: bool = False,
    source: str = "",
    country: str = "",
    device: str = "",
    path: str = "",
) -> str:
    since, key = range_bounds(range_key)
    filters = {
        "range": key,
        "me": show_me,
        "source": (source or "")[:80],
        "country": (country or "")[:8].upper(),
        "device": (device or "")[:16],
        "path": (path or "")[:255],
    }
    events = _load_events(db, since, show_me)
    sessions = _apply(_session_rows(events), filters["source"], filters["country"], filters["device"], filters["path"])
    visitors = len({row["visitor"] for row in sessions if row["visitor"]})
    pageviews = sum(row["pageviews"] for row in sessions)
    clicks = sum(row["clicks"] for row in sessions)
    durations = [row["duration"] for row in sessions]
    avg = sum(durations) / len(durations) if durations else 0
    bounces = sum(1 for row in sessions if row["pageviews"] <= 1 and row["duration"] < 15)
    bounce = int(bounces / len(sessions) * 100) if sessions else 0
    live = _live(db)
    per = f"{pageviews / len(sessions):.1f} на визит" if sessions else "нет визитов"

    chips = ""
    active = []
    for name, label in (("source", "источник"), ("country", "страна"), ("device", "устройство"), ("path", "страница")):
        if filters[name]:
            active.append(f'<a class="chip" href="{href(filters, **{name: ""})}">{label}: {esc(filters[name])} ×</a>')
    if active:
        chips = f'<div class="filters">{"".join(active)}</div>'

    kpis = f"""<div class="kpis">
<div class="kpi"><b>{len(sessions)}</b><span>визитов</span><small>{visitors} человек</small></div>
<div class="kpi"><b>{pageviews}</b><span>просмотров</span><small>{per}</small></div>
<div class="kpi"><b>{fmt_dur(avg)}</b><span>среднее время</span><small>макс {fmt_dur(max(durations, default=0))}</small></div>
<div class="kpi"><b>{bounce}%</b><span>отказов</span><small>{bounces} коротких</small></div>
<div class="kpi"><b>{clicks}</b><span>кликов</span><small>ссылки и кнопки</small></div>
<div class="kpi"><b>{live[1]}</b><span>сейчас</span><small>{live[0]} событий / 5 мин</small></div>
</div>"""
    chart = f'<div class="chart"><h2>Визиты · {dict(RANGES)[key]}</h2>{_chart(sessions, key)}</div>'

    sources, countries, devices, pages, clicked = Counter(), Counter(), Counter(), Counter(), Counter()
    allowed = {row["sid"] for row in sessions}
    for row in sessions:
        sources[(row["source"], row["source"])] += 1
        place = f"{flag(row['country'])} {row['city'] or row['country'] or '—'}".strip()
        countries[(place, row["country"])] += 1
        dev = f"{DEVICE_LABEL.get(row['device'], row['device'])} · {row['os'] or '—'}"
        devices[(dev, row["device"])] += 1
        pages[(row["entry"], row["entry"])] += 1
    for event in events:
        if event.session_id not in allowed or event.name not in ("click", "ui", "nav", "resume"):
            continue
        props = props_of(event)
        label = str(props.get("text") or props.get("kind") or event.name)[:48]
        clicked[(label, label)] += 1

    def ranked(counter: Counter, limit: int = 8):
        return [(label, count, value) for (label, value), count in counter.most_common(limit)]

    panels = f"""<div class="grid">
<div class="panel"><h2>Откуда</h2>{_bars(ranked(sources), len(sessions), filters, "source")}</div>
<div class="panel"><h2>Страны</h2>{_bars(ranked(countries), len(sessions), filters, "country")}</div>
<div class="panel"><h2>Устройства</h2>{_bars(ranked(devices), len(sessions), filters, "device")}</div>
<div class="panel"><h2>Страницы входа</h2>{_bars(ranked(pages), len(sessions), filters, "path")}</div>
</div>
<div class="panel"><h2>Что нажимали</h2>{_bars(ranked(clicked, 12), max(clicks, 1), filters, "source")}</div>"""

    visits = ""
    for row in sessions[:40]:
        who = f'<a href="/visitor/{esc(row["visitor"])}">{esc((row["visitor"] or "—")[:12])}</a>'
        me = ' <span class="badge me">я</span>' if row["is_me"] else ""
        place = f"{flag(row['country'])} {row['city'] or row['country'] or '—'}"
        device_bits = " · ".join(
            bit for bit in (DEVICE_LABEL.get(row["device"], row["device"]), row["os"], row["browser"], row["screen"]) if bit
        )
        visits += f"""<div class="visit">
<div><a href="/session/{esc(row["sid"])}">{esc(fmt_dt(row["start"]))}</a><div class="faint">{who}{me}</div></div>
<div><a href="{href(filters, source=row["source"])}">{esc(row["source"])}</a><div class="faint">{esc(row["utm"] or row["referrer"] or "без utm")}</div></div>
<div><a href="{href(filters, path=row["entry"])}">{esc(row["entry"])}</a><div class="faint">{esc(device_bits)}</div></div>
<div>{esc(place)}</div>
<div class="num">{fmt_dur(row["duration"])}</div>
<div class="muted">{row["pageviews"]} стр · {row["clicks"]} кл · скролл {row["scroll"]}%</div>
</div>"""
    if not visits:
        visits = '<p class="faint">нет визитов за выбранный период</p>'
    feed = f'<div class="panel"><h2>Визиты ({len(sessions)})</h2>{visits}</div>'
    wipe = """<form class="wipe" method="post" action="/wipe">
Очистить всю базу. Введите DELETE и подтвердите.
<input name="confirm" autocomplete="off" placeholder="DELETE">
<button>удалить события</button>
</form>"""
    return shell("ET / аналитика", chips + kpis + chart + panels + feed + wipe, filters, live, refresh=True)


def render_session(db: Session, sid: str) -> str:
    events = list(db.execute(select(Event).where(Event.session_id == sid).order_by(Event.ts)).scalars())
    if not events:
        return shell("визит", '<p>Визит не найден</p><p><a href="/">← обзор</a></p>')
    row = _session_rows(events)[0]
    others = _session_rows(
        list(
            db.execute(
                select(Event).where(Event.visitor == row["visitor"], Event.session_id != sid).order_by(Event.ts)
            ).scalars()
        )
    )
    same = [item for item in others if item["entry"] == row["entry"]]
    if same:
        avg = sum(item["duration"] for item in same) / len(same)
        compare = f"другие заходы на {row['entry']}: {len(same)}, среднее {fmt_dur(avg)}"
    elif others:
        compare = f"других визитов этого человека: {len(others)}"
    else:
        compare = "других визитов этого человека нет"

    pages: list[list] = []
    for event in events:
        if event.name != "pageview":
            continue
        if pages:
            pages[-1][2] = event.ts
        pages.append([event.path, event.ts, None])
    if pages:
        pages[-1][2] = events[-1].ts
    page_html = "".join(
        f"<div>{esc(path)} <span class='faint'>{fmt_dur((end - start).total_seconds() if end else 0)}</span></div>"
        for path, start, end in pages
    ) or "—"

    timeline = ""
    for event in events:
        if event.name == "ping":
            continue
        props = props_of(event)
        if event.name in ("click", "ui", "nav", "resume"):
            detail = " · ".join(esc(bit) for bit in (props.get("kind"), props.get("text"), props.get("target")) if bit)
        elif event.name == "section":
            detail = f"доскролл до {esc(props.get('id', ''))}"
        elif event.name == "scroll":
            detail = f"глубина {esc(props.get('depth', ''))}%"
        elif event.name == "exit":
            detail = f"на странице {fmt_dur(props.get('dwell', 0))}"
        elif event.name in ("lang_switch", "theme"):
            detail = esc(props.get("to") or props.get("theme") or "")
        else:
            detail = esc(event.path or event.title or "")
        timeline += (
            f'<li><span class="mono faint">{fmt_t(event.ts)}</span>'
            f'<span><span class="tag">{EVENT_LABELS.get(event.name, event.name)}</span> {detail}</span></li>'
        )
    device = " · ".join(
        bit for bit in (DEVICE_LABEL.get(row["device"], row["device"]), row["os"], row["browser"], row["lang"], row["screen"]) if bit
    )
    place = " ".join(bit for bit in (flag(row["country"]), row["city"], row["country"]) if bit) or "—"
    body = f"""<p><a href="/">← обзор</a></p>
<div class="head">
<div class="card"><span>посетитель</span><b><a href="/visitor/{esc(row["visitor"])}">{esc(row["visitor"])}</a></b></div>
<div class="card"><span>откуда</span><b>{esc(row["source"])}</b><div class="faint">{esc(row["referrer"] or "прямой заход")}</div></div>
<div class="card"><span>utm</span><b>{esc(row["utm"] or "нет")}</b></div>
<div class="card"><span>устройство</span><b>{esc(device)}</b></div>
<div class="card"><span>где</span><b>{esc(place)}</b></div>
<div class="card"><span>время</span><b>{esc(fmt_dt(row["start"]))} · {fmt_dur(row["duration"])}</b></div>
<div class="card"><span>страницы и время</span><b>{page_html}</b></div>
<div class="card"><span>сравнение</span><b>{esc(compare)}</b><div class="faint">скролл {row["scroll"]}%</div></div>
</div>
<div class="panel"><h2>Хронология</h2><ul class="timeline">{timeline}</ul></div>"""
    return shell(f"визит {sid[:12]}", body, live=_live(db))


def render_visitor(db: Session, vid: str) -> str:
    events = list(
        db.execute(
            select(Event).where(Event.visitor == vid, Event.ts >= utcnow() - timedelta(days=90)).order_by(Event.ts)
        ).scalars()
    )
    rows = _session_rows(events)
    if not rows:
        return shell("посетитель", '<p>Посетитель не найден</p><p><a href="/">← обзор</a></p>')
    lines = "".join(
        f'<div class="visit"><div><a href="/session/{esc(row["sid"])}">{esc(fmt_dt(row["start"]))}</a></div>'
        f'<div>{esc(row["source"])}</div><div>{esc(row["entry"])}</div>'
        f'<div class="num">{fmt_dur(row["duration"])}</div><div class="muted">{row["clicks"]} кл · скролл {row["scroll"]}%</div></div>'
        for row in rows
    )
    body = f"""<p><a href="/">← обзор</a></p>
<div class="head">
<div class="card"><span>id</span><b class="mono">{esc(vid)}</b></div>
<div class="card"><span>визитов за 90 дней</span><b>{len(rows)}</b></div>
<div class="card"><span>всего на сайте</span><b>{fmt_dur(sum(row["duration"] for row in rows))}</b></div>
</div>
<div class="panel"><h2>Визиты</h2>{lines}</div>"""
    return shell(f"посетитель {vid[:12]}", body, live=_live(db))


def wipe_events(db: Session) -> None:
    db.execute(delete(Event))
    db.commit()
