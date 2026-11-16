from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, Body, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import analytics, auth, geo, ingest
from .db import ensure_schema, get_db
from .models import Event, utcnow
from .schema import PayloadError, parse_payload

log = logging.getLogger("portfolio")
logging.basicConfig(level=logging.INFO)

SITE_KEY = os.environ.get("SITE_KEY", "portfolio-dev-key")
ALLOWED_ORIGINS = {
    value.strip()
    for value in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://coffee1337.github.io,http://localhost:5173,http://localhost:4173",
    ).split(",")
    if value.strip()
}
STATIC_DIR = Path(__file__).resolve().parent / "static"

@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    yield


app = FastAPI(
    title="portfolio-analytics",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS | {"*"}),
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["content-type", "authorization"],
    allow_credentials=False,
    max_age=86400,
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "ts": utcnow().isoformat()}


@app.post("/collect", status_code=204)
async def collect(request: Request, background: BackgroundTasks, db: Session = Depends(get_db)) -> Response:
    raw = await request.body()
    try:
        events = parse_payload(raw)
    except PayloadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="invalid event") from exc
    if any(event.key != SITE_KEY for event in events):
        raise HTTPException(status_code=403, detail="bad key")
    origin = request.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="origin not allowed")
    headers = {key.lower(): value for key, value in request.headers.items()}
    client_ip = geo.extract_client_ip(request)
    ignored = ingest.ignored_values(db)
    rows, pending = ingest.build_rows(
        events,
        request_headers=headers,
        client_ip=client_ip,
        ignored=ignored,
        own_hosts={request.url.hostname or ""},
    )
    ingest.insert_rows(rows)
    for ip, sid, ip_hash in pending:
        background.add_task(ingest.enrich_and_backfill, ip, sid, ip_hash, headers)
    return Response(status_code=204, headers={"cache-control": "no-store"})


@app.options("/collect", status_code=204)
def collect_preflight() -> Response:
    response = Response(status_code=204)
    response.headers["access-control-allow-origin"] = "*"
    response.headers["access-control-allow-methods"] = "POST, OPTIONS"
    response.headers["access-control-allow-headers"] = "content-type"
    response.headers["access-control-max-age"] = "86400"
    return response


# --------------------------------------------------------------------------- #
# auth
# --------------------------------------------------------------------------- #


@app.post("/api/login")
def login(request: Request, payload: dict = Body(...)) -> JSONResponse:
    candidate = str(payload.get("token") or "")
    if not auth.token_matches(candidate):
        raise HTTPException(status_code=401, detail="invalid token")
    response = JSONResponse({"ok": True, "auth": auth.auth_enabled()})
    auth.set_auth_cookie(response, request)
    return response


@app.post("/api/logout")
def logout() -> JSONResponse:
    response = JSONResponse({"ok": True})
    auth.clear_auth_cookie(response)
    return response


@app.get("/api/me")
def me(request: Request) -> dict:
    return {
        "authenticated": auth.is_authenticated(request),
        "auth_enabled": auth.auth_enabled(),
        "site_key": SITE_KEY,
        "now": utcnow().isoformat(),
    }


# --------------------------------------------------------------------------- #
# dashboard API
# --------------------------------------------------------------------------- #


@app.get("/api/overview")
def overview(
    request: Request,
    page: int = 1,
    per_page: int = 30,
    db: Session = Depends(get_db),
) -> dict:
    auth.require_auth(request)
    filters = analytics.Filters.from_query(request.query_params)
    return analytics.overview(db, filters, page=page, per_page=per_page)


@app.get("/api/session/{sid}")
def session_detail(sid: str, request: Request, db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    payload = analytics.session_detail(db, sid)
    if payload is None:
        raise HTTPException(status_code=404, detail="session not found")
    return payload


@app.delete("/api/session/{sid}")
def session_delete(sid: str, request: Request, db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    return {"deleted": analytics.delete_session(db, sid)}


@app.get("/api/visitor/{vid}")
def visitor_detail(vid: str, request: Request, db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    payload = analytics.visitor_detail(db, vid)
    if payload is None:
        raise HTTPException(status_code=404, detail="visitor not found")
    return payload


@app.delete("/api/visitor/{vid}")
def visitor_delete(vid: str, request: Request, db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    return {"deleted": analytics.delete_visitor(db, vid)}


@app.get("/api/ignore")
def ignore_list(request: Request, db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    return {"items": analytics.list_ignored(db)}


@app.post("/api/ignore")
def ignore_add(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    sid = str(payload.get("sid") or "")
    kind = str(payload.get("kind") or "")
    value = str(payload.get("value") or "")
    label = str(payload.get("label") or "")
    added: list[dict] = []
    if sid:
        session = db.query(Event).filter(Event.session_id == sid).first()
        if session is None:
            raise HTTPException(status_code=404, detail="session not found")
        for ident_kind, ident_value in (("visitor", session.visitor), ("ip_hash", session.ip_hash)):
            if ident_value:
                added.append(analytics.add_ignored(db, ident_kind, ident_value, label))
    else:
        if not value:
            raise HTTPException(status_code=422, detail="value required")
        added.append(analytics.add_ignored(db, kind, value, label))
    return {"items": added, "updated": sum(item["updated"] for item in added)}


@app.delete("/api/ignore/{ident}")
def ignore_delete(ident: int, request: Request, db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    if not analytics.remove_ignored(db, ident):
        raise HTTPException(status_code=404, detail="not found")
    return {"ok": True}


@app.get("/api/cleanup/preview")
def cleanup_preview(request: Request, db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    return analytics.cleanup_preview(db)


@app.post("/api/cleanup")
def cleanup(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)) -> dict:
    auth.require_auth(request)
    scope = str(payload.get("scope") or "")
    confirm = str(payload.get("confirm") or "")
    try:
        return {"preview": analytics.cleanup(db, scope, confirm)}
    except PermissionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/export/sessions.csv")
def export_sessions(request: Request, db: Session = Depends(get_db)) -> Response:
    auth.require_auth(request)
    filters = analytics.Filters.from_query(request.query_params)
    body = analytics.export_sessions_csv(db, filters)
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"content-disposition": 'attachment; filename="sessions.csv"'},
    )


@app.get("/api/export/events.json")
def export_events(request: Request, db: Session = Depends(get_db)) -> Response:
    auth.require_auth(request)
    filters = analytics.Filters.from_query(request.query_params)
    body = analytics.export_events_json(db, filters)
    return Response(
        content=body,
        media_type="application/json",
        headers={"content-disposition": 'attachment; filename="events.json"'},
    )


# --------------------------------------------------------------------------- #
# SPA
# --------------------------------------------------------------------------- #

if (STATIC_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

BUILD_HINT = """<!doctype html><meta charset="utf-8"><title>portfolio-analytics</title>
<body style="font:14px/1.5 ui-monospace,monospace;background:#0c0a09;color:#f3efe8;padding:40px">
<h1 style="font-size:18px">dashboard not built</h1>
<p>Соберите SPA: <code>cd web &amp;&amp; npm ci &amp;&amp; npm run build</code> (статика ляжет в <code>app/static</code>).</p>
<p>API при этом работает: <a href="/api/me" style="color:#cf6234">/api/me</a>, <code>/collect</code>, <code>/health</code>.</p>
</body>"""


@app.get("/{full_path:path}", response_class=HTMLResponse)
def spa(full_path: str) -> Response:
    if full_path.startswith(("api/", "collect", "health")):
        raise HTTPException(status_code=404, detail="not found")
    candidate = (STATIC_DIR / full_path).resolve()
    if full_path and candidate.is_file() and STATIC_DIR in candidate.parents:
        return FileResponse(candidate)
    index = STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, media_type="text/html", headers={"cache-control": "no-store"})
    return HTMLResponse(BUILD_HINT, status_code=200)


@app.get("/robots.txt", response_class=PlainTextResponse)
def robots() -> str:
    return "User-agent: *\nDisallow: /\n"
