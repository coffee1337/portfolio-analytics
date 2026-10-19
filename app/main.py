import hashlib
import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Event, country_from_headers, parse_device, utcnow
from .schema import CollectIn

SITE_KEY = os.environ.get("SITE_KEY", "portfolio-dev-key")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")  # empty = auth disabled (local dev only)
VISITOR_SALT = os.environ.get("VISITOR_SALT", "change-me-in-prod")

app = FastAPI(title="portfolio-analytics", docs_url=None, redoc_url=None)


@app.on_event("startup")
def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def visitor_hash(request: Request) -> str:
    """Daily-rotating pseudonymous id: raw IP is never stored."""
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "")
    ua = request.headers.get("user-agent", "")
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return hashlib.sha256(f"{ip}|{ua}|{day}|{VISITOR_SALT}".encode()).hexdigest()[:32]


@app.post("/collect", status_code=204)
async def collect(request: Request, response: Response) -> None:
    raw = await request.body()
    try:
        payload = CollectIn.model_validate_json(raw)
    except ValueError:
        raise HTTPException(status_code=422)
    if payload.key != SITE_KEY:
        raise HTTPException(status_code=403)
    response.headers["cache-control"] = "no-store"
    response.headers["access-control-allow-origin"] = "*"
    with Session(engine) as db:
        db.add(
            Event(
                site_key=payload.key,
                name=payload.name,
                path=payload.path[:255],
                visitor=visitor_hash(request),
                referrer=(payload.referrer or "")[:255],
                country=country_from_headers(request.headers),
                device=parse_device(request.headers.get("user-agent", "")),
                props_json=json.dumps(payload.props or {}, separators=(",", ":"))[:1024],
            )
        )
        db.commit()


@app.options("/collect", status_code=204)
def collect_preflight(response: Response) -> None:
    response.headers["access-control-allow-origin"] = "*"
    response.headers["access-control-allow-methods"] = "POST, OPTIONS"
    response.headers["access-control-allow-headers"] = "content-type"
    response.headers["access-control-max-age"] = "86400"


# ---------- dashboard ----------

def check_auth(request: Request) -> bool:
    if not ADMIN_TOKEN:
        return True
    return request.cookies.get("pa_auth") == ADMIN_TOKEN


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, days: int = 7, db: Session = Depends(get_db)):
    if not check_auth(request):
        return login_page()
    days = max(1, min(days, 365))
    since = utcnow() - timedelta(days=days)

    def q_count():
        return db.scalar(select(func.count(Event.id)).where(Event.ts >= since)) or 0

    total_events = q_count()

    pageviews = db.scalar(
        select(func.count(Event.id)).where(Event.ts >= since, Event.name == "pageview")
    ) or 0
    visitors = db.scalar(
        select(func.count(func.distinct(Event.visitor))).where(
            Event.ts >= since, Event.name == "pageview"
        )
    ) or 0

    def top(column, event_name: str | None = None, limit: int = 10):
        stmt = select(column, func.count(Event.id)).where(Event.ts >= since).group_by(column)
        if event_name:
            stmt = stmt.where(Event.name == event_name)
        rows = db.execute(stmt.order_by(func.count(Event.id).desc()).limit(limit)).all()
        return [(value or "—", count) for value, count in rows]

    per_day_rows = db.execute(
        select(func.date(Event.ts), func.count(Event.id))
        .where(Event.ts >= since, Event.name == "pageview")
        .group_by(func.date(Event.ts))
        .order_by(func.date(Event.ts))
    ).all()
    per_day = {str(day): count for day, count in per_day_rows}

    clicks = Counter()
    for props_json, count in db.execute(
        select(Event.props_json, func.count(Event.id))
        .where(Event.ts >= since, Event.name == "click")
        .group_by(Event.props_json)
    ):
        try:
            label = json.loads(props_json).get("kind", "?")
        except ValueError:
            label = "?"
        clicks[label] += count

    sections = Counter()
    for props_json, count in db.execute(
        select(Event.props_json, func.count(Event.id))
        .where(Event.ts >= since, Event.name == "section")
        .group_by(Event.props_json)
    ):
        try:
            label = json.loads(props_json).get("id", "?")
        except ValueError:
            label = "?"
        sections[label] += count

    return render_dashboard(
        days=days,
        total_events=total_events,
        pageviews=pageviews,
        visitors=visitors,
        per_day=per_day,
        top_pages=top(Event.path, "pageview"),
        top_referrers=top(Event.referrer, "pageview"),
        top_countries=top(Event.country),
        top_devices=top(Event.device),
        top_clicks=clicks.most_common(10),
        top_sections=sections.most_common(8),
    )


@app.post("/login")
def login(request: Request, token: str = ""):
    if ADMIN_TOKEN and token == ADMIN_TOKEN:
        response = Response(status_code=303)
        response.headers["location"] = "/"
        response.set_cookie("pa_auth", ADMIN_TOKEN, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 30)
        return response
    raise HTTPException(status_code=403)


def login_page() -> str:
    return """<!doctype html><html><head><meta charset="utf-8"><title>portfolio-analytics</title>
<style>body{background:#0b0b0c;color:#e8e4da;font-family:ui-monospace,monospace;display:grid;place-items:center;min-height:100vh;margin:0}
form{display:flex;gap:8px}input{background:#141416;border:1px solid #2a2a2e;color:#e8e4da;padding:10px 14px;border-radius:8px;font-family:inherit}</style></head>
<body><div style="text-align:center"><h1 style="font-size:20px">portfolio-analytics</h1>
<form method="post" action="/login"><input type="password" name="token" placeholder="admin token" autofocus><input type="submit" value="→" style="cursor:pointer"></form>
</div></body></html>"""


def bar(value: int, max_value: int) -> str:
    if max_value <= 0:
        return ""
    width = int(value / max_value * 100)
    return f'<div class="bar"><span style="width:{width}%"></span></div>'


def render_dashboard(**ctx) -> str:
    day_labels = []
    today = datetime.now(timezone.utc).date()
    max_day = max(ctx["per_day"].values(), default=0)
    for i in range(ctx["days"] - 1, -1, -1):
        day = today - timedelta(days=i)
        key = str(day)
        count = ctx["per_day"].get(key, 0)
        day_labels.append(
            f'<div class="day" title="{key}: {count}"><span class="col" style="height:{int(count / max_day * 96) if max_day else 0}px"></span><span class="num">{count}</span><span class="lbl">{day.strftime("%d.%m")}</span></div>'
        )

    def table(rows, total):
        if not rows:
            return "<p class='empty'>нет данных</p>"
        mx = rows[0][1]
        return "<table>" + "".join(
            f'<tr><td class="k">{value}</td>{bar(count, mx)}<td class="v">{count}</td>'
            f'<td class="p">{int(count / total * 100) if total else 0}%</td></tr>'
            for value, count in rows
        ) + "</table>"

    nav = "".join(
        f'<a class="rng{" on" if ctx["days"] == d else ""}" href="/?days={d}">{d}d</a>' for d in (1, 7, 30, 90)
    )

    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>portfolio-analytics</title>
<style>
:root{{--bg:#0b0b0c;--card:#141416;--line:#2a2a2e;--text:#e8e4da;--muted:#8a8778;--lime:#c6f24e}}
*{{box-sizing:border-box}}body{{background:var(--bg);color:var(--text);margin:0;padding:32px 20px;font:14px/1.5 ui-monospace,'IBM Plex Mono',monospace}}
.wrap{{max-width:1080px;margin:0 auto}}
h1{{font-size:18px;margin:0 0 4px}}.sub{{color:var(--muted);font-size:12px;margin-bottom:24px}}
.stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}}
.stat{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}}
.stat b{{display:block;font-size:26px;color:var(--lime)}}.stat span{{color:var(--muted);font-size:11px}}
.chart{{display:flex;align-items:flex-end;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 14px 10px;margin-bottom:20px;min-height:150px;overflow-x:auto}}
.day{{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:26px}}
.col{{background:var(--lime);opacity:.85;border-radius:2px 2px 0 0;min-height:2px;width:100%}}
.num{{font-size:9px;color:var(--muted)}}.lbl{{font-size:9px;color:var(--muted)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}
.panel{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}}
.panel h2{{font-size:11px;color:var(--muted);margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em}}
table{{width:100%;border-collapse:collapse}}td{{padding:3px 0;vertical-align:middle}}
td.k{{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
td.v{{color:var(--lime);text-align:right;min-width:40px}}td.p{{color:var(--muted);text-align:right;min-width:36px;font-size:11px}}
.bar{{flex:1;padding:0 8px}}.bar span{{display:block;height:4px;background:var(--lime);border-radius:2px;opacity:.7}}
.empty{{color:var(--muted);font-size:12px}}
.rng{{color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:3px 10px;font-size:12px;margin-right:6px}}
.rng.on{{background:var(--text);color:var(--bg);border-color:var(--text)}}
</style></head><body><div class="wrap">
<h1>portfolio-analytics</h1>
<p class="sub">последние {ctx['days']} дн. · {ctx['total_events']} событий всего за период</p>
<p>{nav}</p>
<div class="stats">
<div class="stat"><b>{ctx['pageviews']}</b><span>просмотров страниц</span></div>
<div class="stat"><b>{ctx['visitors']}</b><span>уникальных посетителей</span></div>
<div class="stat"><b>{sum(c for _, c in ctx['top_clicks'])}</b><span>кликов по ссылкам</span></div>
<div class="stat"><b>{ctx['top_devices'][0][0] if ctx['top_devices'] else '—'}</b><span>основное устройство</span></div>
</div>
<div class="chart">{''.join(day_labels)}</div>
<div class="grid">
<div class="panel"><h2>Страницы</h2>{table(ctx['top_pages'], ctx['pageviews'])}</div>
<div class="panel"><h2>Откуда пришли (referrer)</h2>{table(ctx['top_referrers'], ctx['pageviews'])}</div>
<div class="panel"><h2>Клики: куда жмут</h2>{table(ctx['top_clicks'], sum(c for _, c in ctx['top_clicks']))}</div>
<div class="panel"><h2>Секции (доскроллы)</h2>{table(ctx['top_sections'], sum(c for _, c in ctx['top_sections']))}</div>
<div class="panel"><h2>Страны</h2>{table(ctx['top_countries'], ctx['pageviews'])}</div>
<div class="panel"><h2>Устройства</h2>{table(ctx['top_devices'], ctx['pageviews'])}</div>
</div>
</div></body></html>"""
