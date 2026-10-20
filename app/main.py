import hashlib
import json
import os
from urllib.parse import parse_qs

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import inspect, text

from .db import Base, engine, get_db
from .ui import login_page, render_overview, render_session, render_visitor, wipe_events
from .models import Event, country_from_headers, parse_browser, parse_device, parse_os
from .schema import CollectIn

SITE_KEY = os.environ.get("SITE_KEY", "portfolio-dev-key")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")  # empty = auth disabled (local dev only)
VISITOR_SALT = os.environ.get("VISITOR_SALT", "change-me-in-prod")
ALLOWED_ORIGINS = {
    value.strip()
    for value in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://coffee1337.github.io,http://localhost:5173,http://localhost:4173",
    ).split(",")
    if value.strip()
}

app = FastAPI(title="portfolio-analytics", docs_url=None, redoc_url=None)

# Transient IP -> country lookup (result cached; the IP itself is never stored).
# ip-api.com free tier: 45 req/min, no key. Off via GEO_LOOKUP=0.
GEO_LOOKUP = os.environ.get("GEO_LOOKUP", "1") == "1"
_geo_cache: dict = {}


def _client_ip(request: Request) -> str:
    """Last public address in X-Forwarded-For.

    Render (and most proxies) append the real client, so the first hop is often
    the platform itself — that is why Finland showed up as Poland.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    for candidate in reversed(parts):
        if _is_public(candidate):
            return candidate
    direct = request.client.host if request.client else ""
    return direct if _is_public(direct) else ""


def _is_public(ip: str) -> bool:
    if not ip or ip in ("::1", "localhost"):
        return False
    if ip.startswith(("127.", "10.", "192.168.", "169.254.", "0.", "100.64.")):
        return False
    if ip.startswith("172."):
        try:
            second = int(ip.split(".")[1])
        except (IndexError, ValueError):
            return False
        if 16 <= second <= 31:
            return False
    if ip.lower().startswith(("fc", "fd", "fe80")):
        return False
    return True


def _geo(ip: str) -> tuple[str, str]:
    """Country code + city. The IP is cached in memory only and never written."""
    if not GEO_LOOKUP or not ip:
        return "", ""
    if ip in _geo_cache:
        return _geo_cache[ip]
    country, city = "", ""
    try:
        import urllib.request

        with urllib.request.urlopen(
            f"http://ip-api.com/json/{ip}?fields=status,countryCode,city", timeout=2
        ) as resp:
            data = json.loads(resp.read().decode())
            if data.get("status") == "success":
                country = str(data.get("countryCode", ""))[:8]
                city = str(data.get("city", ""))[:64]
    except Exception:
        country, city = "", ""
    if len(_geo_cache) > 2000:
        _geo_cache.clear()
    _geo_cache[ip] = (country, city)
    return country, city


def ensure_schema() -> None:
    """Create the table on fresh databases and add new columns to existing ones.

    create_all does not ALTER existing tables, so introspect and patch manually —
    this keeps data already collected on Neon when the model grows.
    """
    Base.metadata.create_all(bind=engine)
    additions = {
        "session_id": "VARCHAR(64) DEFAULT ''",
        "is_me": "BOOLEAN DEFAULT FALSE",
        "title": "VARCHAR(255) DEFAULT ''",
        "city": "VARCHAR(64) DEFAULT ''",
        "os_name": "VARCHAR(32) DEFAULT ''",
        "browser": "VARCHAR(32) DEFAULT ''",
        "lang": "VARCHAR(16) DEFAULT ''",
        "screen": "VARCHAR(32) DEFAULT ''",
    }
    with engine.begin() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("events")}
        for col, ddl in additions.items():
            if col not in cols:
                conn.execute(text(f"ALTER TABLE events ADD COLUMN {col} {ddl}"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_events_session ON events (session_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_events_is_me ON events (is_me)"))


@app.on_event("startup")
def init_db() -> None:
    ensure_schema()


def visitor_id(request: Request, client_id: str) -> str:
    """Prefer the browser's localStorage id. Fall back to a salted hash only when
    the client sent nothing — raw IP is still never stored.
    """
    clean = "".join(ch for ch in (client_id or "") if ch.isalnum())[:32]
    if len(clean) >= 8:
        return clean
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")
    return hashlib.sha256(f"{ip}|{ua}|{VISITOR_SALT}".encode()).hexdigest()[:16]


@app.post("/collect", status_code=204)
async def collect(request: Request, response: Response) -> None:
    raw = await request.body()
    try:
        payload = CollectIn.model_validate_json(raw)
    except ValueError:
        raise HTTPException(status_code=422)
    if payload.key != SITE_KEY:
        raise HTTPException(status_code=403)
    # Browser beacons carry an Origin header — reject foreign sites spamming
    # fake events through the (public by design) SITE_KEY. Non-browser clients
    # without Origin are allowed through the key check only.
    origin = request.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403)
    response.headers["cache-control"] = "no-store"
    response.headers["access-control-allow-origin"] = "*"
    ip = _client_ip(request)
    header_country = country_from_headers(request.headers)
    looked_up, city = _geo(ip)
    country = header_country or looked_up
    ua = request.headers.get("user-agent", "")
    with engine.begin() as conn:
        conn.execute(
            Event.__table__.insert().values(
                site_key=payload.key,
                name=payload.name,
                path=payload.path[:255],
                title=(payload.title or "")[:255],
                session_id=payload.session[:64],
                is_me=bool(payload.me),
                visitor=visitor_id(request, payload.visitor),
                referrer=(payload.referrer or "")[:512],
                country=country,
                city=city,
                device=parse_device(ua),
                os_name=parse_os(ua),
                browser=parse_browser(ua),
                lang=(payload.lang or "")[:16],
                screen=(payload.screen or "")[:32],
                props_json=_compact_props(payload.props),
            )
        )


def _compact_props(props) -> str:
    return json.dumps(props or {}, separators=(",", ":"), ensure_ascii=False)[:1024]


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
def overview(
    request: Request,
    range: str = "today",
    me: int = 0,
    source: str = "",
    country: str = "",
    device: str = "",
    path: str = "",
    e: int = 0,
    db=Depends(get_db),
):
    if not check_auth(request):
        return login_page(error=bool(e))
    return render_overview(
        db,
        range_key=range,
        show_me=bool(me),
        source=source,
        country=country,
        device=device,
        path=path,
    )


@app.get("/session/{sid}", response_class=HTMLResponse)
def session_detail(request: Request, sid: str, db=Depends(get_db)):
    if not check_auth(request):
        return RedirectResponse("/", status_code=303)
    return render_session(db, sid)


@app.get("/visitor/{vid}", response_class=HTMLResponse)
def visitor_detail(request: Request, vid: str, db=Depends(get_db)):
    if not check_auth(request):
        return RedirectResponse("/", status_code=303)
    return render_visitor(db, vid)


@app.post("/wipe")
async def wipe(request: Request, db=Depends(get_db)):
    if not check_auth(request):
        return RedirectResponse("/", status_code=303)
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    if (form.get("confirm") or [""])[0] != "DELETE":
        return RedirectResponse("/?range=today", status_code=303)
    wipe_events(db)
    return RedirectResponse("/?range=today", status_code=303)


@app.post("/login")
async def login(request: Request):
    # Manual urlencoded parsing: avoids the python-multipart dependency for one input field.
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    token = (form.get("token") or [""])[0]
    if ADMIN_TOKEN and token.strip() == ADMIN_TOKEN:
        response = RedirectResponse("/", status_code=303)
        response.set_cookie(
            "pa_auth", ADMIN_TOKEN, httponly=True, secure=True, samesite="lax", max_age=60 * 60 * 24 * 30
        )
        return response
    # Wrong or missing token: back to the login form (no JSON 403 dead end).
    return RedirectResponse("/?e=1", status_code=303)
