**English** · [Русский](./README.ru.md) · [Case Study](https://coffee1337.github.io/projects/portfolio-analytics/)

# portfolio-analytics

Self-hosted analytics for the portfolio site [coffee1337.github.io](https://coffee1337.github.io):
events arrive from a beacon, aggregation runs on the server, and the SPA dashboard matches the
look of the site itself.

Stack: **FastAPI + SQLAlchemy 2.0 + PostgreSQL (Neon) / SQLite** and **React 19 + TypeScript +
Vite + Tailwind** in `web/` (built into `app/static` and served by the same service).
Deployment is a single process: Render (free tier) or Docker.

```
coffee1337.github.io ──POST /collect──▶ FastAPI ──▶ Neon
   (beacon, batches)                     │        SQLite locally
                                         └─▶ SPA dashboard at /  (/session/:sid, /visitor/:vid)
```

## Privacy

- The raw IP **is never written to the database**. Only `ip_masked` (`95.161.224.xxx`) and
  `ip_hash` = `HMAC-SHA256(salt, ip)[:24]` are stored — stable and irreversible.
- No cookies: a visitor is an anonymous ID kept in `localStorage` (`et-vid`).
- `Do Not Track` is honoured client-side: the beacon is not initialised.
- The owner can mark their own visits as `is_me` in one click and hide them from every KPI.

## IP, geo and ISP detection (`app/geo.py`)

1. `extract_client_ip()`: `cf-connecting-ip` → `true-client-ip` → `x-real-ip` →
   `fastly-client-ip` → `x-forwarded-for` **left to right** (first public address) →
   `request.client.host`. Every candidate is stripped of port/brackets/zone and validated with
   `ipaddress`: only `is_global and not private/loopback/link-local/multicast/reserved` pass.
2. Country/city/region come first from CDN headers (`cf-ipcountry`, `cf-ipcity`,
   `x-vercel-ip-*`), then from the asynchronous lookup.
3. `enrich_geo_async()`: an LRU+TTL cache for 24 h (5 000 IPs), `httpx.AsyncClient(timeout=2.5)`,
   primary source `ip-api.com`, fallback `ipwho.is`. It is called **only** from `BackgroundTasks` —
   `/collect` never waits on the network.
4. After the response, a background task writes `country/region/city/asn/isp/is_datacenter`
   into the records for that IP hash (empty fields only — country and city always come from one source).
5. `is_datacenter` = `hosting`/`proxy` on the provider or cloud/VPN markers in `isp`/`org`.

## Metrics

- **Active time**: the client sends a cumulative `props.active_sec` (it only ticks while
  `visibilityState === "visible"`); the server sums the maximums per page of a session. For older
  events there is a fallback — "sum of intervals, each capped at 60 s" — so a forgotten tab never adds hours.
- **Engaged visit** (not a bounce) if at least one holds: `active_sec >= 15`,
  `scroll >= 50%`, `>= 3` sections, `>= 2` pages, any interaction or conversion.
- **Conversions**: résumé, contact form, email/Telegram copy, social links, the
  "What brought you here" cards, project actions (GitHub / Demo / `git clone`).
- **Bots** are detected by an extended marker list (`app/ua.py`) and excluded from every KPI and
  chart by default; there is a toggle in the dashboard header.
- Render cold start: the client sends `client_ts`; the server accepts it only inside the
  −15 min … +2 min window around `utcnow()`, otherwise it records the server time.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness without the DB (`healthCheckPath`) |
| POST | `/collect` | accept one event or a batch of up to 25 (204) |
| POST | `/api/login` | `{token}` → HttpOnly cookie `pa_auth` (30 days) |
| POST | `/api/logout` | clear the cookie |
| GET | `/api/me` | auth state |
| GET | `/api/overview` | KPIs, deltas, timeseries, funnel, projects, conversions, AI/Cmd+K, geo, ISP, devices, sources, pages, paginated session feed |
| GET | `/api/session/{sid}` | visit passport + event timeline |
| DELETE | `/api/session/{sid}` | delete a visit |
| GET | `/api/visitor/{vid}` | visitor profile across all time |
| DELETE | `/api/visitor/{vid}` | delete all data of a visitor |
| GET/POST | `/api/ignore` | list / add "this is me" (`sid`, or `kind`+`value`) |
| POST | `/api/ignore/self` | mark the dashboard's own IP (`ip_hash`) as the owner |
| DELETE | `/api/ignore/{id}` | remove from the ignore list |
| POST | `/api/cleanup` | `{scope: bots\|me\|ignored\|old_pings\|all, confirm}` (old `ping`s older than 14 days are compressed separately) |
| GET | `/api/cleanup/preview` | how many rows the cleanup would touch |
| GET | `/api/export/sessions.csv` | sessions CSV honouring the filters |
| GET | `/api/export/events.json` | events JSON honouring the filters |

Filters for `overview` and the exports: `range=today|yesterday|7d|30d|90d|all|custom` (or `from`/`to`),
`me`, `bots`, `source`, `utm`, `country`, `city`, `isp`, `device`, `os`, `browser`,
`path` (any page of the visit), `entry` (entry point only), `screen`, `lang`,
`project`, `goal`, `engaged`, `hide_dc` (no data centres/VPN), `dow` (0–6) and `hour` (0–23)
in MSK (clicking a cell of the 24×7 matrix), `q` (search by city, ISP, IP, page, sid…),
`tab=all|engaged|goals|live|bounce`, `page`, `per_page`.

`overview` additionally returns `prev_timeseries` (dashed previous period),
`heatmap` (7×24 visits by weekday and MSK hour), `insights` (top project,
main source, scroll depth to contacts, activity peak), `clicks` (top external links
and buttons), `preferences` (browser language, site version, theme by session) and
`sessions.counts` (journal tab counters for the whole period, not just the page) plus
`vitals` (p50/p75 for LCP, INP, CLS, FCP, TTFB with good/warn/poor grades and a desktop/mobile breakdown).

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: it checks that the committed `app/static`
is consistent (every `/assets/*` referenced by `index.html` exists, exactly one `index-*.js` and one
`index-*.css`), runs `pytest -q` on Python 3.12 and builds the SPA on Node 22.

## Dashboard

- 6 clickable KPIs: a card switches the metric of the main chart, with a sparkline
  from `timeseries` inside; the "Headline for the period" strip filters by project and source in one click.
- `§02`: area / bars / **24×7 matrix**, a Y axis with integer ticks (the scale never lies),
  a dashed previous period, and a hover tooltip with the exact value.
- `§03`: section funnel (the splash as a separate two-colour widget, never duplicated in the steps),
  project cards with human-readable names and 5 metrics, conversions with icons.
- `§04`: sources, countries/cities/providers, OS/browsers/screens (click = filter),
  entry and all pages kept apart, language is a filter too.
- `§05`: tabs "all / engaged / converted / online / bounces", instant search, and a sliding
  visit drawer (`Esc` closes it) with the passport and the route.
- `RU | EN`, Espresso / Parchment themes with a circular View Transition, auto-refresh without
  reloading the page and without losing the scroll position.

## Local run

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload               # http://127.0.0.1:8000

cd web && npm ci && npm run dev             # SPA on :5173 proxied to :8000
cd web && npm run build                     # production bundle into app/static
```

Tests:

```bash
pip install pytest
python -m pytest -q
```

SQLite (`analytics.db`) and auth are off by default. Checking event intake:

```bash
curl -s -X POST http://127.0.0.1:8000/collect -H "content-type: application/json" \
  -d '{"key":"portfolio-dev-key","name":"pageview","path":"/"}'
```

An event without a `session` is not lost: the server creates `anon-<visitor>-<YYYYMMDDHH>`.

Demo data for a local dashboard (60 sessions over two weeks + bots):

```bash
DATABASE_URL=sqlite:///./demo.db python scripts/seed_demo.py 60
DATABASE_URL=sqlite:///./demo.db uvicorn app.main:app --port 8000
```

## Deploy (Render + Neon)

1. Neon → Create project → copy the connection string.
2. Render → New → Blueprint → this repository. `render.yaml` creates the service with
   `healthCheckPath: /health`. Set `DATABASE_URL` and `SITE_KEY`; Render generates `ADMIN_TOKEN` and
   `VISITOR_SALT` itself.
3. In the site repository: `VITE_ANALYTICS_URL=https://<service>.onrender.com`,
   `VITE_ANALYTICS_KEY=<SITE_KEY>` (in GitHub → Settings → Variables or Secrets: the workflow
   reads both `vars` and `secrets`).
4. Open `https://<service>.onrender.com/` — the login screen accepts `ADMIN_TOKEN`.

The built SPA is committed to `app/static`, so the Python service starts without Node.
If npm is available in the build environment, `buildCommand` rebuilds the frontend from `web/`.

## Docker

```bash
docker build -t portfolio-analytics .
docker run -p 8000:8000 -e DATABASE_URL=... -e SITE_KEY=... -e ADMIN_TOKEN=... portfolio-analytics
```

Multi-stage: `node:22-alpine` builds `web/` into `app/static`, then `python:3.12-slim`
installs the dependencies and copies the application.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./analytics.db` | Neon/SQLite |
| `SITE_KEY` | `portfolio-dev-key` | public beacon key |
| `ADMIN_TOKEN` | empty (auth off) | dashboard token |
| `VISITOR_SALT` | `change-me-in-prod` | salt for `ip_hash` |
| `ALLOWED_ORIGINS` | github.io + localhost | CORS for `/collect` |
| `GEO_LOOKUP` | `1` | `0` disables the external geo lookup |

## License

MIT — see [LICENSE](./LICENSE).