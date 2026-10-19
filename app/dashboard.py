"""Server-rendered dashboard: overview, session timeline, visitor history.

Dark theme matching the portfolio site (black + lime). All HTML is built with
plain f-strings — no template engine, no client-side JS, no external assets.
"""

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .models import Event, utcnow

# ---------------------------------------------------------------- helpers


def fmt_dur(sec) -> str:
    sec = int(sec or 0)
    if sec <= 5:
        return "≤5с"
    if sec < 60:
        return f"{sec}с"
    if sec < 3600:
        return f"{sec // 60}м {sec % 60}с".replace(" 0с", "")
    return f"{sec // 3600}ч {(sec % 3600) // 60}м"


def fmt_dt(dt: datetime) -> str:
    return dt.strftime("%d.%m %H:%M")


def fmt_t(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S")


def host_of(url: str) -> str:
    if not url:
        return "—"
    try:
        return urlparse(url).hostname or url[:40]
    except ValueError:
        return url[:40]


def short_id(value: str) -> str:
    return value[:10] if value else "—"


def flag(cc: str) -> str:
    cc = cc or ""
    if len(cc) == 2 and cc.isalpha():
        base = 0x1F1E6
        return chr(base + ord(cc[0].upper()) - 65) + chr(base + ord(cc[1].upper()) - 65)
    return ""


def props_of(event: Event) -> dict:
    try:
        return json.loads(event.props_json) if event.props_json else {}
    except ValueError:
        return {}


def esc(value) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


EVENT_LABELS = {
    "pageview": "страница",
    "click": "клик",
    "ui": "интерфейс",
    "section": "секция",
    "scroll": "скролл",
    "ping": "пинг",
    "exit": "выход",
    "lang_switch": "язык",
}

# ---------------------------------------------------------------- CSS

CSS = """
:root{--bg:#0b0b0c;--card:#131315;--card2:#1a1a1d;--line:#26262b;--line2:#333338;
--text:#e8e4da;--muted:#8a8778;--faint:#5c5a50;--lime:#c6f24e;
--red:#e5484d;--blue:#7ab8ff;--violet:#c9a6ff}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--text);font:14px/1.55 ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;
padding-bottom:60px;-webkit-font-smoothing:antialiased}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.mono,td.v,.num{font-family:ui-monospace,'Cascadia Mono','JetBrains Mono',Consolas,monospace}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.topbar{position:sticky;top:0;z-index:20;background:rgba(11,11,12,.85);backdrop-filter:blur(10px);
border-bottom:1px solid var(--line)}
.topbar .wrap{display:flex;align-items:center;gap:16px;height:56px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;color:var(--text)}
.brand:hover{text-decoration:none}
.brand .dot{width:10px;height:10px;border-radius:3px;background:var(--lime);display:inline-block}
.brand small{color:var(--faint);font-weight:400;font-family:ui-monospace,monospace;font-size:10px}
.spacer{flex:1}
.pills{display:flex;gap:6px}
.pill{color:var(--muted);border:1px solid var(--line);border-radius:8px;padding:4px 12px;font-size:12px;font-family:ui-monospace,monospace}
.pill:hover{color:var(--text);text-decoration:none;border-color:var(--line2)}
.pill.on{background:var(--text);color:var(--bg);border-color:var(--text)}
.pill.me.on{background:var(--lime);color:#0b0b0c;border-color:var(--lime)}
.live{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted);font-family:ui-monospace,monospace}
.live .lamp{width:8px;height:8px;border-radius:50%;background:var(--lime);animation:pulse 2s infinite}
.live.zero .lamp{background:var(--faint);animation:none}
.live.zero{color:var(--faint)}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(198,242,78,.5)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:22px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi:hover{border-color:var(--line2)}
.kpi b{display:block;font-size:26px;font-weight:600;font-family:ui-monospace,monospace;color:var(--lime);letter-spacing:-.02em}
.kpi span{color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.06em}
.kpi .sub{font-size:11px;color:#6d6b60;margin-top:2px;text-transform:none;letter-spacing:0}
.chart-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 16px 8px;margin-bottom:22px}
.chart-card h2{margin:0 0 6px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600}
.chart-legend{display:flex;gap:14px;font-size:11px;color:var(--muted);margin:2px 0 10px}
.chart-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;background:#c6f24e}
.chart-scroll{overflow-x:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-bottom:22px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.panel h2{font-size:11px;color:var(--muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em;font-weight:600}
table{width:100%;border-collapse:collapse}
tr{border-bottom:1px solid var(--line)}
tr:last-child{border-bottom:0}
td{padding:5px 0;vertical-align:middle;font-size:13px}
td.k{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
td.k.mono{font-size:12px;color:var(--muted)}
td.v{color:var(--lime);text-align:right;min-width:44px;font-size:13px;white-space:nowrap}
td.p{color:var(--faint);text-align:right;min-width:40px;font-size:11px;font-family:ui-monospace,monospace}
.mini{display:block;height:3px;background:var(--lime);border-radius:2px;opacity:.55;margin:5px 8px 5px 0}
.empty{color:var(--faint);font-size:12.5px}
.badge{display:inline-block;border-radius:6px;padding:1px 7px;font-size:10.5px;font-family:ui-monospace,monospace;line-height:1.7}
.b-me{background:rgba(198,242,78,.14);color:var(--lime);border:1px solid rgba(198,242,78,.4)}
.b-bot{background:#2a2a2e;color:var(--muted);border:1px solid var(--line2)}
.b-dev{background:rgba(122,184,255,.12);color:var(--blue);border:1px solid rgba(122,184,255,.35)}
.sessions{width:100%;border-collapse:collapse}
.sessions th{font-size:10.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.07em;text-align:left;
padding:0 10px 8px 0;font-weight:600;font-family:ui-monospace,monospace}
.sessions td{padding:8px 10px 8px 0;border-bottom:1px solid var(--line);font-size:12.5px}
.sessions tr:hover td{background:var(--card2)}
.sessions a.dash{color:var(--text)} .sessions a.dash:hover{color:var(--lime);text-decoration:none}
.t-mon{font-family:ui-monospace,monospace;font-size:12px;color:var(--muted)}
.t-num{font-family:ui-monospace,monospace;color:var(--lime);white-space:nowrap}
.sess-head{background:linear-gradient(180deg,var(--card2),var(--card));border:1px solid var(--line);
border-radius:12px;padding:18px 20px;margin:22px 0}
.sess-head h1{margin:0;font-size:22px;font-family:ui-monospace,monospace;font-weight:600}
.sess-head .meta{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:12px;font-size:12.5px;color:var(--muted)}
.sess-head .meta b{color:var(--text);font-weight:500}
.timeline{list-style:none;margin:0;padding:0}
.timeline li{display:grid;grid-template-columns:80px 18px 1fr;gap:0 10px;padding:0 0 14px}
.timeline .t{font-family:ui-monospace,monospace;font-size:11px;color:var(--faint);text-align:right;padding-top:3px}
.timeline .rail{position:relative}
.timeline .rail::before{content:'';position:absolute;left:8px;top:14px;bottom:0;width:1px;background:var(--line)}
.timeline li:last-child .rail::before{display:none}
.timeline .node{position:absolute;left:3px;top:5px;width:11px;height:11px;border-radius:50%;border:2px solid var(--line2);background:var(--bg)}
.n-pageview{border-color:var(--lime);background:var(--lime)}
.n-click{border-color:var(--text)}
.n-exit{border-color:var(--red);background:var(--red)}
.n-scroll,.n-section{border-color:var(--blue)}
.n-ui{border-color:var(--violet)}
.ev-chip{display:inline-block;border-radius:5px;padding:0 7px;font-size:10.5px;font-family:ui-monospace,monospace;margin-right:8px}
.c-pageview{background:rgba(198,242,78,.15);color:var(--lime)}
.c-click{background:#2f2f34;color:var(--text)}
.c-ui{background:rgba(201,166,255,.13);color:var(--violet)}
.c-section,.c-scroll{background:rgba(122,184,255,.12);color:var(--blue)}
.c-exit{background:rgba(229,72,77,.13);color:var(--red)}
.c-lang_switch{background:#2f2f34;color:var(--muted)}
.ev-detail{color:var(--muted);font-size:12px;font-family:ui-monospace,monospace;margin-top:2px;word-break:break-all}
.ev-detail b{color:var(--text);font-weight:500}
.back{display:inline-flex;gap:6px;align-items:center;color:var(--muted);font-size:12.5px;margin:22px 0 0}
.back:hover{color:var(--text);text-decoration:none}
.note{color:var(--faint);font-size:11.5px;margin:18px 0 0;font-family:ui-monospace,monospace}
h1.pg{font-size:18px;margin:26px 0 0;font-family:ui-monospace,monospace}
@media (max-width:720px){.sessions .hide-sm{display:none}.topbar .wrap{gap:8px}}
"""

# ---------------------------------------------------------------- shell


def shell(title: str, body: str, days: int = 7, show_me: bool = True, live: tuple = (0, 0)) -> str:
    live_events, live_sessions = live
    ranges = "".join(
        f'<a class="pill{" on" if days == d else ""}" href="/?days={d}&me={1 if show_me else 0}">{d}д</a>'
        for d in (1, 7, 30, 90)
    )
    me_label = "мои визиты: скрыты" if show_me else "мои визиты: показывать"
    live_cls = "live zero" if not live_events else "live"
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<style>{CSS}</style></head><body>
<div class="topbar"><div class="wrap">
<a class="brand" href="/?days={days}&me={1 if show_me else 0}"><span class="dot"></span>ET <small>/ analytics</small></a>
<span class="{live_cls}"><span class="lamp"></span>{live_sessions} online · {live_events} соб. за 5 мин</span>
<span class="spacer"></span>
<span class="pills">{ranges}</span>
<a class="pill me{" on" if show_me else ""}" href="/?days={days}&me={0 if show_me else 1}">{me_label}</a>
</div></div>
<div class="wrap">{body}
<p class="note">времена UTC · посетители — псевдонимы (IP не хранятся) · свои визиты помечаются через ?me=1 на сайте</p>
</div></body></html>"""


def login_page(error: bool = False) -> str:
    hint = '<p style="color:#e5484d;font-size:12px">неверный токен</p>' if error else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>portfolio-analytics</title>
<style>body{{background:#0b0b0c;color:#e8e4da;font-family:ui-monospace,monospace;display:grid;place-items:center;min-height:100vh;margin:0}}
form{{display:flex;gap:8px}}input{{background:#131315;border:1px solid #26262b;color:#e8e4da;padding:10px 14px;border-radius:8px;font-family:inherit}}</style></head>
<body><div style="text-align:center"><h1 style="font-size:20px">portfolio-analytics</h1>{hint}
<form method="post" action="/login"><input type="password" name="token" placeholder="admin token" autofocus><input type="submit" value="→" style="cursor:pointer"></form>
</div></body></html>"""


# ---------------------------------------------------------------- data


def _sessions(db: Session, since, show_me: bool) -> list:
    stmt = (
        select(
            Event.session_id.label("sid"),
            func.min(Event.ts).label("start"),
            func.max(Event.ts).label("end"),
            func.min(Event.visitor).label("visitor"),
            func.max(Event.is_me).label("is_me"),
            func.min(Event.device).label("device"),
            func.min(Event.country).label("country"),
            func.min(Event.referrer).label("referrer"),
            func.sum(case((Event.name == "pageview", 1), else_=0)).label("pageviews"),
            func.sum(case((Event.name == "click", 1), else_=0)).label("clicks"),
            func.sum(case((Event.name == "ui", 1), else_=0)).label("uis"),
        )
        .where(Event.ts >= since, Event.session_id != "")
        .group_by(Event.session_id)
    )
    if not show_me:
        stmt = stmt.having(func.max(Event.is_me).is_(False))
    rows = db.execute(stmt).all()
    sessions = []
    for r in rows:
        sessions.append(
            {
                "sid": r.sid,
                "start": r.start,
                "end": r.end,
                "duration": (r.end - r.start).total_seconds(),
                "visitor": r.visitor,
                "is_me": bool(r.is_me),
                "device": r.device or "?",
                "country": r.country or "",
                "referrer": r.referrer or "",
                "pageviews": int(r.pageviews or 0),
                "clicks": int(r.clicks or 0),
                "uis": int(r.uis or 0),
            }
        )
    sessions.sort(key=lambda s: s["end"], reverse=True)
    return sessions


def _top(db: Session, column, since, event_name: str | None = None, limit: int = 10) -> list:
    stmt = select(column, func.count(Event.id)).where(Event.ts >= since).group_by(column)
    if event_name:
        stmt = stmt.where(Event.name == event_name)
    rows = db.execute(stmt.order_by(func.count(Event.id).desc()).limit(limit)).all()
    return [(value if value else "—", count) for value, count in rows]


def _live(db: Session) -> tuple:
    recent = utcnow() - timedelta(minutes=5)
    events = db.scalar(select(func.count(Event.id)).where(Event.ts >= recent)) or 0
    sessions = (
        db.scalar(
            select(func.count(func.distinct(Event.session_id))).where(Event.ts >= recent, Event.session_id != "")
        )
        or 0
    )
    return events, sessions


def _chart(per_day: dict, days: int) -> str:
    today = datetime.now(timezone.utc).date()
    values = [per_day.get(str(today - timedelta(days=i)), 0) for i in range(days - 1, -1, -1)]
    max_pv = max(values) or 1
    width, height, chart_h = 1000, 158, 104
    top = 8
    bw = min(36, width / days - 6)
    step = width / days
    parts = []
    # grid + y labels
    for frac, label in ((1.0, max_pv), (0.5, max_pv // 2), (0.0, 0)):
        y = top + chart_h - int(chart_h * frac)
        parts.append(f'<line x1="34" y1="{y}" x2="{width}" y2="{y}" stroke="#26262b" stroke-width="1"/>')
        parts.append(
            f'<text x="28" y="{y + 4}" text-anchor="end" font-size="10" fill="#5c5a50" '
            f'font-family="monospace">{label}</text>'
        )
    every = max(1, days // 10)
    for i, v in enumerate(values):
        x = i * step + (step - bw) / 2
        h = int(v / max_pv * chart_h)
        parts.append(
            f'<rect x="{int(x)}" y="{top + chart_h - max(h, 2)}" width="{int(bw)}" height="{max(h, 2)}" '
            f'fill="#c6f24e" opacity="{".85" if v else ".25"}" rx="3">'
            f"<title>{today - timedelta(days=days - 1 - i)}: {v} просмотров</title></rect>"
        )
        if days <= 15 and v:
            parts.append(
                f'<text x="{int(x + bw / 2)}" y="{top + chart_h - max(h, 2) - 5}" text-anchor="middle" '
                f'font-size="10" fill="#c6f24e" font-family="monospace">{v}</text>'
            )
        if (days - 1 - i) % every == 0 or days <= 7:
            day = today - timedelta(days=days - 1 - i)
            parts.append(
                f'<text x="{int(x + bw / 2)}" y="{top + chart_h + 16}" text-anchor="middle" '
                f'font-size="10" fill="#5c5a50" font-family="monospace">{day.strftime("%d.%m")}</text>'
            )
    svg = (
        f'<svg viewBox="0 0 {width} {height}" width="100%" height="158" preserveAspectRatio="xMidYMid meet" '
        f'xmlns="http://www.w3.org/2000/svg">{"".join(parts)}</svg>'
    )
    return f'<div class="chart-scroll">{svg}</div>'


def _table(rows: list, total: int, mono: bool = False) -> str:
    if not rows:
        return "<p class='empty'>нет данных</p>"
    mx = rows[0][1] or 1
    cls = "k mono" if mono else "k"
    body = ""
    for value, count in rows:
        share = int(count / total * 100) if total else 0
        body += (
            f'<tr><td class="{cls}">{esc(value)}</td>'
            f'<td><span class="mini" style="width:{int(count / mx * 100)}%"></span></td>'
            f'<td class="v">{count}</td><td class="p">{share}%</td></tr>'
        )
    return f"<table>{body}</table>"


def _device_badge(device: str) -> str:
    if device == "bot":
        return '<span class="badge b-bot">bot</span>'
    if device in ("mobile", "tablet"):
        return f'<span class="badge b-dev">{device}</span>'
    return esc(device)


# ---------------------------------------------------------------- pages


def render_overview(db: Session, days: int = 7, show_me: bool = True) -> str:
    days = max(1, min(days, 365))
    since = utcnow() - timedelta(days=days)
    sessions = _sessions(db, since, show_me)
    live = _live(db)

    pageviews = db.scalar(
        select(func.count(Event.id)).where(Event.ts >= since, Event.name == "pageview")
    ) or 0
    visitors = db.scalar(
        select(func.count(func.distinct(Event.visitor))).where(Event.ts >= since, Event.name == "pageview")
    ) or 0

    engaged = [s["duration"] for s in sessions]
    avg_dur = sum(engaged) / len(engaged) if engaged else 0
    max_dur = max(engaged, default=0)
    bounces = sum(1 for s in sessions if s["pageviews"] <= 1 and s["duration"] < 15)
    bounce_rate = int(bounces / len(sessions) * 100) if sessions else 0
    total_clicks = sum(s["clicks"] for s in sessions)
    total_uis = sum(s["uis"] for s in sessions)
    pv_per_visit = f"{pageviews / len(sessions):.1f}" if sessions else "—"

    per_day_rows = db.execute(
        select(func.date(Event.ts), func.count(Event.id))
        .where(Event.ts >= since, Event.name == "pageview")
        .group_by(func.date(Event.ts))
        .order_by(func.date(Event.ts))
    ).all()
    per_day = {str(day): count for day, count in per_day_rows}

    clicks_rows = db.execute(
        select(Event.props_json).where(Event.ts >= since, Event.name == "click")
    ).scalars()
    click_kinds: Counter = Counter()
    click_targets: Counter = Counter()
    for props_json in clicks_rows:
        try:
            p = json.loads(props_json) if props_json else {}
        except ValueError:
            p = {}
        kind = p.get("kind", "?")
        click_kinds[kind] += 1
        label = p.get("text") or (p.get("target") or "")[:48]
        click_targets[f"{kind}: {label}"] += 1

    scroll_rows = db.execute(
        select(Event.props_json).where(Event.ts >= since, Event.name == "scroll")
    ).scalars()
    scrolls: Counter = Counter()
    for props_json in scroll_rows:
        try:
            scrolls[f"до {json.loads(props_json).get('depth', '?')}%"] += 1
        except (ValueError, TypeError):
            pass

    utm_rows = db.execute(
        select(Event.props_json).where(Event.ts >= since, Event.name == "pageview")
    ).scalars()
    utms: Counter = Counter()
    for props_json in utm_rows:
        try:
            p = json.loads(props_json) if props_json else {}
            if p.get("utm_source"):
                utms[f"{p['utm_source']} / {p.get('utm_medium', '—')}"] += 1
        except ValueError:
            pass

    sessions_by_referrer: Counter = Counter()
    sessions_by_country: Counter = Counter()
    sessions_by_device: Counter = Counter()
    for s in sessions:
        sessions_by_referrer[host_of(s["referrer"])] += 1
        sessions_by_country[s["country"] or "—"] += 1
        sessions_by_device[s["device"]] += 1

    kpis = f"""<div class="kpis">
<div class="kpi"><b>{len(sessions)}</b><span>визитов</span><div class="sub">{visitors} уникальных</div></div>
<div class="kpi"><b>{pageviews}</b><span>просмотров</span><div class="sub">{pv_per_visit} на визит</div></div>
<div class="kpi"><b>{fmt_dur(avg_dur)}</b><span>ср. длительность</span><div class="sub">макс {fmt_dur(max_dur)}</div></div>
<div class="kpi"><b>{bounce_rate}%</b><span>отказов</span><div class="sub">{bounces} из {len(sessions)}</div></div>
<div class="kpi"><b>{total_clicks}</b><span>кликов по ссылкам</span><div class="sub">{total_uis} по кнопкам</div></div>
<div class="kpi"><b>{live[1]}</b><span>сейчас на сайте</span><div class="sub">{live[0]} событий за 5 мин</div></div>
</div>"""

    chart = f"""<div class="chart-card"><h2>Просмотры по дням</h2>
<div class="chart-legend"><span><i></i>просмотры</span></div>
{_chart(per_day, days)}</div>"""

    recent_rows = ""
    for s in sessions[:25]:
        me_badge = '<span class="badge b-me">это я</span> ' if s["is_me"] else ""
        recent_rows += (
            f'<tr><td><a class="dash" href="/session/{esc(s["sid"])}">{esc(fmt_dt(s["start"]))}</a></td>'
            f'<td><a class="dash t-mon" href="/visitor/{esc(s["visitor"])}">{esc(short_id(s["visitor"]))}</a> {me_badge}</td>'
            f'<td class="hide-sm">{_device_badge(s["device"])}</td>'
            f'<td class="hide-sm">{esc(flag(s["country"]) or "—")}</td>'
            f'<td class="hide-sm t-mon">{esc(host_of(s["referrer"]))}</td>'
            f'<td class="t-mon">{s["pageviews"]}</td>'
            f'<td class="t-mon">{s["clicks"]}</td>'
            f'<td class="t-num">{fmt_dur(s["duration"])}</td></tr>'
        )
    if not recent_rows:
        recent_rows = '<tr><td colspan="8" class="empty">нет визитов за период</td></tr>'

    sessions_table = f"""<div class="panel"><h2>Последние визиты ({len(sessions)})</h2>
<table class="sessions"><tr><th>когда</th><th>посетитель</th><th class="hide-sm">устройство</th>
<th class="hide-sm">страна</th><th class="hide-sm">откуда</th><th>стр.</th><th>клики</th><th>длит.</th></tr>
{recent_rows}</table></div>"""

    ref_rows = sessions_by_referrer.most_common(10)
    country_rows = [(f"{flag(k)} {k}" if k != "—" else "—", c) for k, c in sessions_by_country.most_common(10)]
    panels = f"""<div class="grid">
<div class="panel"><h2>Страницы</h2>{_table(_top(db, Event.path, since, "pageview"), pageviews, mono=True)}</div>
<div class="panel"><h2>Откуда пришли</h2>{_table(ref_rows, len(sessions))}</div>
<div class="panel"><h2>Куда жмут (типы)</h2>{_table(click_kinds.most_common(10), total_clicks)}</div>
<div class="panel"><h2>Куда жмут (детально)</h2>{_table(click_targets.most_common(10), total_clicks, mono=True)}</div>
<div class="panel"><h2>Доскроллы</h2>{_table(scrolls.most_common(6), sum(scrolls.values()))}</div>
<div class="panel"><h2>Секции</h2>{_table(_top(db, Event.props_json, since, "section", limit=10), len(sessions), mono=True)}</div>
<div class="panel"><h2>Страны</h2>{_table(country_rows, len(sessions))}</div>
<div class="panel"><h2>Устройства</h2>{_table(sessions_by_device.most_common(6), len(sessions))}</div>
<div class="panel"><h2>UTM-кампании</h2>{_table(utms.most_common(10), sum(utms.values()), mono=True)}</div>
</div>"""

    return shell("ET / analytics", kpis + chart + sessions_table + panels, days=days, show_me=show_me, live=live)


def render_session(db: Session, sid: str) -> str:
    events = list(db.execute(select(Event).where(Event.session_id == sid).order_by(Event.ts)).scalars())
    if not events:
        return shell(
            "ET / analytics — визит не найден",
            '<h1 class="pg">Визит не найден</h1><a class="back" href="/">← к обзору</a>',
        )
    first = events[0]
    last = events[-1]
    duration = (last.ts - first.ts).total_seconds()
    pings = sum(1 for e in events if e.name == "ping")
    pageviews = sum(1 for e in events if e.name == "pageview")
    clicks = sum(1 for e in events if e.name == "click")

    props0 = props_of(first)
    utm_line = ""
    if props0.get("utm_source"):
        utm_line = (
            f'<div><span>UTM</span> <b>{esc(props0.get("utm_source", "—"))} / {esc(props0.get("utm_medium", "—"))}</b></div>'
        )

    exit_dwell = ""
    for e in reversed(events):
        if e.name == "exit":
            exit_dwell = f" · ушёл со страницы через {fmt_dur(props_of(e).get('dwell', 0))}"
            break

    me_badge = '<span class="badge b-me">это я</span> ' if any(e.is_me for e in events) else ""
    device = first.device or "?"
    device_badge = _device_badge(device)

    timeline = ""
    for e in events:
        if e.name == "ping":
            continue
        p = props_of(e)
        offset = int((e.ts - first.ts).total_seconds())
        label = EVENT_LABELS.get(e.name, e.name)
        detail = ""
        if e.name == "pageview":
            detail = f"<b>{esc(e.path)}</b>" + (f" · {esc(e.title)}" if e.title else "")
        elif e.name in ("click", "ui"):
            bits = []
            if p.get("kind"):
                bits.append(f"тип: <b>{esc(p['kind'])}</b>")
            if p.get("text"):
                bits.append(f"«{esc(p['text'])}»")
            if p.get("target"):
                bits.append(f"→ <b>{esc(p['target'])}</b>")
            if p.get("element"):
                bits.append(f"элемент: {esc(p['element'])}")
            if p.get("section"):
                bits.append(f"секция: {esc(p['section'])}")
            detail = " · ".join(bits)
        elif e.name == "section":
            detail = f"доскроллил до <b>{esc(p.get('id', '?'))}</b>"
        elif e.name == "scroll":
            detail = f"глубина скролла <b>{esc(p.get('depth', '?'))}%</b>"
        elif e.name == "lang_switch":
            detail = f"переключил язык на <b>{esc(p.get('to', '?'))}</b>"
        elif e.name == "exit":
            detail = f"ушёл · на странице {fmt_dur(p.get('dwell', 0))}"
        timeline += f"""<li>
<span class="t">+{fmt_dur(offset)}<br>{fmt_t(e.ts)}</span>
<span class="rail"><span class="node n-{e.name}"></span></span>
<span><span class="ev-chip c-{e.name}">{label}</span>{detail}</span>
</li>"""

    body = f"""<a class="back" href="/?days=7">← к обзору</a>
<div class="sess-head">
<h1>{esc(sid[:14])}</h1>
<div class="meta">
<div><span>посетитель</span> <a href="/visitor/{esc(first.visitor)}"><b>{esc(short_id(first.visitor))}</b></a> {me_badge}</div>
<div><span>начало</span> <b>{esc(fmt_dt(first.ts))} UTC</b></div>
<div><span>длительность</span> <b>{fmt_dur(duration)}</b> (≈{pings * 30}с активности)</div>
<div><span>страниц</span> <b>{pageviews}</b> · кликов <b>{clicks}</b></div>
<div><span>устройство</span> <b>{device_badge}</b></div>
<div><span>страна</span> <b>{esc(flag(first.country) or "—")}</b></div>
<div><span>откуда</span> <b>{esc(first.referrer or "прямой заход")}</b></div>
{utm_line}
</div>
</div>
<div class="panel"><h2>Хронология визита{exit_dwell}</h2><ul class="timeline">{timeline}</ul></div>"""
    return shell(f"ET / analytics — визит {sid[:14]}", body, live=_live(db))


def render_visitor(db: Session, vid: str) -> str:
    sessions = _sessions(db, utcnow() - timedelta(days=90), show_me=True)
    mine = [s for s in sessions if s["visitor"] == vid]
    if not mine:
        return shell(
            "ET / analytics — посетитель не найден",
            '<h1 class="pg">Посетитель не найден</h1><a class="back" href="/">← к обзору</a>',
        )
    total_dur = sum(s["duration"] for s in mine)
    me_badge = '<span class="badge b-me">это я</span>' if any(s["is_me"] for s in mine) else ""

    rows = ""
    for s in mine:
        me_b = '<span class="badge b-me">я</span> ' if s["is_me"] else ""
        rows += (
            f'<tr><td><a class="dash" href="/session/{esc(s["sid"])}">{esc(fmt_dt(s["start"]))}</a></td>'
            f'<td class="t-mon">{esc(host_of(s["referrer"]))}</td>'
            f'<td class="t-mon">{s["pageviews"]} стр · {s["clicks"]} кл</td>'
            f'<td class="t-num">{fmt_dur(s["duration"])}</td>'
            f"<td>{me_b}{_device_badge(s['device'])} {esc(flag(s['country']) or '')}</td></tr>"
        )

    body = f"""<a class="back" href="/?days=30">← к обзору</a>
<div class="sess-head">
<h1>{esc(vid[:16])} {me_badge}</h1>
<div class="meta">
<div><span>визитов за 90 дней</span> <b>{len(mine)}</b></div>
<div><span>первый</span> <b>{esc(fmt_dt(mine[-1]['start']))}</b></div>
<div><span>последний</span> <b>{esc(fmt_dt(mine[0]['start']))}</b></div>
<div><span>всего на сайте</span> <b>{fmt_dur(total_dur)}</b></div>
</div>
</div>
<div class="panel"><h2>Визиты</h2><table class="sessions">
<tr><th>когда</th><th>откуда</th><th>активность</th><th>длительность</th><th></th></tr>{rows}</table></div>"""
    return shell(f"ET / analytics — {vid[:16]}", body, live=_live(db))
