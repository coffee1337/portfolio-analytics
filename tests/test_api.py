from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from conftest import BOT_UA, HUMAN_UA, collect, send

from app import geo
from app.ingest import clean_referrer, resolve_ts


class FakeRequest:
    def __init__(self, headers=None, client=("203.0.113.9", 443)):  # noqa: S107 - test fixture
        self.headers = {key.lower(): value for key, value in (headers or {}).items()}
        self.client = type("C", (), {"host": client[0]})() if client else None


# ------------------------------ ip extraction ------------------------------ #


def test_cf_connecting_ip_wins_over_forwarded_chain():
    request = FakeRequest(
        {
            "CF-Connecting-IP": "95.161.224.13",
            "X-Forwarded-For": "95.161.224.13, 172.70.1.1, 10.0.0.4",
        }
    )
    assert geo.extract_client_ip(request) == "95.161.224.13"


def test_forwarded_for_is_read_left_to_right():
    request = FakeRequest({"X-Forwarded-For": "95.161.224.13, 172.70.1.1, 10.0.0.4"})
    # The old code took the right-most public hop (the Cloudflare edge) — the
    # left-most entry is the actual visitor.
    assert geo.extract_client_ip(request) == "95.161.224.13"


def test_forwarded_for_skips_private_and_keeps_client():
    request = FakeRequest({"X-Forwarded-For": "10.0.0.4, 192.168.1.5, 8.8.8.8"})
    assert geo.extract_client_ip(request) == "8.8.8.8"


def test_ipv6_with_brackets_and_port_is_cleaned():
    request = FakeRequest({"True-Client-IP": "[2a00:1370:8190:1111::1]:443"})
    assert geo.extract_client_ip(request) == "2a00:1370:8190:1111::1"


def test_ipv4_with_port_is_cleaned():
    request = FakeRequest({"X-Real-IP": "77.88.55.66:52344"})
    assert geo.extract_client_ip(request) == "77.88.55.66"


def test_only_private_hops_yield_empty_ip():
    request = FakeRequest({"X-Forwarded-For": "10.1.2.3, 172.16.0.1"}, client=("127.0.0.1", 1))
    assert geo.extract_client_ip(request) == ""


def test_mask_and_hash():
    assert geo.mask_ip("95.161.224.13") == "95.161.224.xxx"
    assert geo.mask_ip("2a00:1370:8190:1111::1") == "2a00:1370:8190:xxxx::"
    first = geo.hash_ip("95.161.224.13")
    assert first == geo.hash_ip("95.161.224.13") and len(first) == 24
    assert first != geo.hash_ip("95.161.224.14")


def test_datacenter_markers():
    assert geo.looks_like_datacenter("Cloudflare, Inc.", "") is True
    assert geo.looks_like_datacenter("PJSC Rostelecom", "") is False
    assert geo.looks_like_datacenter("Some ISP", "", hosting=True) is True


# ------------------------------ clock & referrer ---------------------------- #


def test_client_ts_is_trusted_inside_window():
    now = datetime.now(timezone.utc)
    cold_start = now - timedelta(seconds=40)
    resolved = resolve_ts(cold_start.timestamp() * 1000, now)
    assert abs((resolved - cold_start).total_seconds()) < 1


def test_client_ts_outside_window_falls_back_to_server_time():
    now = datetime.now(timezone.utc)
    stale = now - timedelta(hours=3)
    assert resolve_ts(stale.timestamp() * 1000, now) == now


def test_self_referrer_is_dropped():
    assert clean_referrer("https://coffee1337.github.io/ru/") == ""
    assert clean_referrer("http://localhost:5173/") == ""
    assert clean_referrer("https://t.me/coffee1337") == "https://t.me/coffee1337"
    assert clean_referrer("https://coffee1337.github.io.example.com/x") == (
        "https://coffee1337.github.io.example.com/x"
    )


# ------------------------------ collect ------------------------------------- #


def test_collect_single_event_creates_visitor_and_session(client):
    response = send(client, session="s-1", visitor="visitor12345678", screen="1920x1080")
    assert response.status_code == 204
    overview = client.get("/api/overview?range=today").json()
    assert overview["sessions"]["total"] == 1
    item = overview["sessions"]["items"][0]
    assert item["visitor"] == "visitor12345678"
    assert item["screen"] == "1920x1080"
    assert item["sid"] == "s-1"
    assert item["ip_masked"].endswith(".xxx")
    assert "95.161.224.13" not in str(overview)


def test_collect_batch_of_events(client):
    events = [
        {"key": "test-key", "name": "pageview", "path": "/", "session": "s-2", "visitor": "visitor22222222"},
        {"key": "test-key", "name": "section", "path": "/", "session": "s-2", "visitor": "visitor22222222",
         "props": {"id": "entry"}},
    ]
    assert collect(client, events).status_code == 204
    overview = client.get("/api/overview?range=today").json()
    assert overview["sessions"]["total"] == 1
    steps = {step["key"]: step for step in overview["funnel"]["steps"]}
    assert steps["entry"]["sessions"] == 1
    assert "loader" not in steps


def test_anonymous_session_is_generated(client):
    response = client.post(
        "/collect",
        json={"key": "test-key", "name": "pageview", "path": "/"},
        headers={"user-agent": HUMAN_UA},
    )
    assert response.status_code == 204
    overview = client.get("/api/overview?range=today").json()
    assert overview["sessions"]["total"] == 1
    assert overview["sessions"]["items"][0]["sid"].startswith("anon-")


def test_self_referrer_is_not_stored(client):
    send(client, session="s-3", visitor="visitor33333333", referrer="https://coffee1337.github.io/ru/")
    detail = client.get("/api/session/s-3").json()
    assert detail["session"]["referrer"] == ""
    assert detail["session"]["source"] == "direct"


def test_bot_traffic_is_flagged_and_hidden_by_default(client):
    client.post(
        "/collect",
        json={"key": "test-key", "name": "pageview", "path": "/", "session": "bot-1", "visitor": "botvisitor0001"},
        headers={"user-agent": BOT_UA},
    )
    default = client.get("/api/overview?range=today").json()
    assert default["sessions"]["total"] == 0
    assert default["meta"]["bots_hidden"] == 1
    with_bots = client.get("/api/overview?range=today&bots=1").json()
    assert with_bots["sessions"]["total"] == 1
    assert with_bots["sessions"]["items"][0]["is_bot"] is True


def test_ignored_visitor_is_marked_as_me(client):
    send(client, session="s-me", visitor="myvisitor000001")
    assert client.post("/api/ignore", json={"sid": "s-me", "label": "мой браузер"}).status_code == 200
    overview = client.get("/api/overview?range=today").json()
    assert overview["sessions"]["total"] == 0
    assert overview["meta"]["me_hidden"] == 1
    with_me = client.get("/api/overview?range=today&me=1").json()
    assert with_me["sessions"]["items"][0]["is_me"] is True
    listed = client.get("/api/ignore").json()["items"]
    assert {item["kind"] for item in listed} == {"visitor", "ip_hash"}


def test_new_events_from_ignored_visitor_are_me(client):
    client.post("/api/ignore", json={"kind": "visitor", "value": "knownvisitor001", "label": "я"})
    send(client, session="s-known", visitor="knownvisitor001")
    with_me = client.get("/api/overview?range=today&me=1").json()
    assert with_me["sessions"]["items"][0]["is_me"] is True


# ------------------------------ metrics ------------------------------------- #


def _event(name, path="/", session="s", visitor="visitor000000001", props=None, ts=None):
    payload = {"key": "test-key", "name": name, "path": path, "session": session, "visitor": visitor}
    if props:
        payload["props"] = props
    if ts:
        payload["client_ts"] = ts
    return payload


def test_bounce_vs_engaged_rules(client):
    now = time.time()
    # Visit 1: 1 pageview, no scroll, no clicks → bounce.
    collect(
        client,
        [
            _event("pageview", session="s-bounce", visitor="visitor00000000A", ts=(now - 60) * 1000),
            _event("exit", session="s-bounce", visitor="visitor00000000A", props={"active_sec": 4}, ts=(now - 55) * 1000),
        ],
    )
    # Visit 2: short but deep scroll → engaged (not a bounce).
    collect(
        client,
        [
            _event("pageview", session="s-scroll", visitor="visitor00000000B", ts=(now - 50) * 1000),
            _event("scroll", session="s-scroll", visitor="visitor00000000B", props={"scroll": 60}, ts=(now - 45) * 1000),
        ],
    )
    overview = client.get("/api/overview?range=today").json()
    kpi = overview["kpi"]
    assert kpi["bounce"]["count"] == 1
    assert kpi["engaged"]["value"] == 1
    assert 49.0 < kpi["bounce"]["value"] < 51.0
    bounced = {item["sid"] for item in overview["sessions"]["items"] if item["bounce"]}
    assert bounced == {"s-bounce"}
    engaged_filtered = client.get("/api/overview?range=today&engaged=1").json()
    assert [item["sid"] for item in engaged_filtered["sessions"]["items"]] == ["s-scroll"]


def test_background_gap_is_capped(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-gap", ts=(now - 3 * 3600) * 1000),
            _event("click", session="s-gap", props={"kind": "anchor"}, ts=(now - 3500) * 1000),
            _event("exit", session="s-gap", ts=(now - 10) * 1000),
        ],
    )
    overview = client.get("/api/overview?range=today").json()
    duration = overview["kpi"]["duration"]["max"]
    assert duration <= 130, duration


def test_active_sec_is_summed_per_page(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", path="/", session="s-active", ts=(now - 120) * 1000),
            _event("ping", path="/", session="s-active", props={"active_sec": 40}, ts=(now - 80) * 1000),
            _event("pageview", path="/projects/knn/", session="s-active", ts=(now - 60) * 1000),
            _event("exit", path="/projects/knn/", session="s-active", props={"active_sec": 25}, ts=(now - 20) * 1000),
        ],
    )
    overview = client.get("/api/overview?range=today").json()
    assert overview["kpi"]["duration"]["max"] == 65


def test_project_matrix_and_goals(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-proj", visitor="visitor00000000C", ts=(now - 300) * 1000),
            _event("project_select", session="s-proj", visitor="visitor00000000C",
                   props={"project": "pyai-python-mentor", "via": "explorer"}, ts=(now - 290) * 1000),
            _event("project_details", session="s-proj", visitor="visitor00000000C",
                   props={"project": "ai-python-mentor", "open": True}, ts=(now - 280) * 1000),
            _event("project_action", session="s-proj", visitor="visitor00000000C",
                   props={"project": "ai-python-mentor", "action": "github"}, ts=(now - 270) * 1000),
            _event("resume", session="s-proj", visitor="visitor00000000C",
                   props={"action": "download_pdf", "section": "resume"}, ts=(now - 260) * 1000),
            _event("contact_submit", session="s-proj", visitor="visitor00000000C",
                   props={"topic": "hire", "status": "sent", "provider": "worker"}, ts=(now - 250) * 1000),
        ],
    )
    overview = client.get("/api/overview?range=today").json()
    projects = {row["id"]: row for row in overview["projects"]}
    assert projects["ai-python-mentor"]["select"] == 1
    assert projects["ai-python-mentor"]["details"] == 1
    assert projects["ai-python-mentor"]["github"] == 1
    goals = {row["key"]: row for row in overview["goals"]}
    assert goals["resume"]["sessions"] == 1
    assert goals["contact"]["topics"] == {"hire": 1}
    assert overview["kpi"]["goals"]["conversion_rate"] == 100.0
    filtered = client.get("/api/overview?range=today&project=ai-python-mentor").json()
    assert filtered["sessions"]["total"] == 1
    assert client.get("/api/overview?range=today&goal=resume").json()["sessions"]["total"] == 1
    assert client.get("/api/overview?range=today&goal=social").json()["sessions"]["total"] == 0


def test_filters_use_matching_keys(client):
    now = time.time()
    send(client, session="s-ru", visitor="visitorru000001", referrer="https://t.me/x", ts=(now - 30) * 1000)
    send(client, session="s-en", visitor="visitoren000001", referrer="https://linkedin.com/feed", ts=(now - 20) * 1000)
    assert client.get("/api/overview?range=today&source=t.me").json()["sessions"]["total"] == 1
    assert client.get("/api/overview?range=today&source=linkedin.com").json()["sessions"]["total"] == 1
    assert client.get("/api/overview?range=today&path=/").json()["sessions"]["total"] == 2
    assert client.get("/api/overview?range=today&country=RU").json()["sessions"]["total"] == 2  # CF header
    assert client.get("/api/overview?range=today&country=DE").json()["sessions"]["total"] == 0


def test_funnel_has_no_loader_row(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-funnel", ts=(now - 30) * 1000),
            _event("loader", session="s-funnel", props={"action": "complete"}, ts=(now - 29) * 1000),
            _event("section", session="s-funnel", props={"id": "top"}, ts=(now - 28) * 1000),
            _event("section", session="s-funnel", props={"id": "contact"}, ts=(now - 20) * 1000),
        ],
    )
    funnel = client.get("/api/overview?range=today").json()["funnel"]
    keys = [step["key"] for step in funnel["steps"]]
    # reviews is not rendered on the site yet → no dead 0% step
    assert keys == ["top", "entry", "about", "stack", "projects", "resume", "contact"]
    assert funnel["steps"][0]["share"] == 100.0
    assert funnel["loader"]["complete"] == 1
    assert funnel["loader"]["complete_pct"] == 100.0
    assert funnel["reached_contact"] == 1


def test_heatmap_and_insights(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-heat", visitor="visitorheat001", ts=(now - 120) * 1000),
            _event("project_select", session="s-heat", visitor="visitorheat001",
                   props={"project": "knn", "via": "explorer"}, ts=(now - 110) * 1000),
            _event("section", session="s-heat", visitor="visitorheat001",
                   props={"id": "contact"}, ts=(now - 100) * 1000),
        ],
    )
    payload = client.get("/api/overview?range=today").json()
    assert len(payload["heatmap"]) == 7
    assert all(len(row) == 24 for row in payload["heatmap"])
    assert sum(sum(row) for row in payload["heatmap"]) == 1
    assert payload["heatmap_max"] >= 1
    assert payload["prev_timeseries"]["bucket"] == payload["timeseries"]["bucket"]
    insights = payload["insights"]
    assert insights["project"]["id"] == "knn"
    assert insights["deep"]["section"] == "contact"
    assert insights["deep"]["pct"] == 100.0
    assert insights["peak"]["kind"] in ("hour", "weekday", "day")


def test_screen_lang_entry_filters(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", path="/", session="s-f1", visitor="visitorflt0001", ts=(now - 60) * 1000),
            _event("pageview", path="/projects/knn/", session="s-f1", visitor="visitorflt0001", ts=(now - 50) * 1000),
            {**_event("pageview", path="/projects/knn/", session="s-f1", visitor="visitorflt0001", ts=(now - 55) * 1000),
             "screen": "1920x1080", "lang": "ru-RU"},
        ],
        headers={
            "origin": "https://coffee1337.github.io",
            "cf-connecting-ip": "95.161.224.13",
            "cf-ipcountry": "RU",
            "user-agent": HUMAN_UA,
            "accept-language": "ru-RU",
        },
    )
    assert client.get("/api/overview?range=today&screen=1920x1080").json()["sessions"]["total"] == 1
    assert client.get("/api/overview?range=today&screen=800x600").json()["sessions"]["total"] == 0
    assert client.get("/api/overview?range=today&lang=ru").json()["sessions"]["total"] == 1
    assert client.get("/api/overview?range=today&lang=en").json()["sessions"]["total"] == 0
    assert client.get("/api/overview?range=today&entry=/").json()["sessions"]["total"] == 1
    assert client.get("/api/overview?range=today&entry=/projects/knn/").json()["sessions"]["total"] == 0
    assert client.get("/api/overview?range=today&path=/projects/knn/").json()["sessions"]["total"] == 1


def test_ignore_self_marks_owner(client):
    send(client, session="s-owner", visitor="visitorowner001")
    response = client.post(
        "/api/ignore/self",
        json={"visitor": "visitorowner001"},
        headers={"cf-connecting-ip": "95.161.224.13"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ip_masked"].endswith(".xxx")
    kinds = {item["kind"] for item in client.get("/api/ignore").json()["items"]}
    assert kinds == {"ip_hash", "visitor"}
    assert client.get("/api/overview?range=today").json()["meta"]["me_hidden"] == 1


def test_custom_date_range(client):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    send(client, session="s-custom", visitor="visitorcustom01")
    today = datetime.now(ZoneInfo("Europe/Moscow")).strftime("%Y-%m-%d")
    inside = client.get(f"/api/overview?range=custom&from={today}&to={today}").json()
    assert inside["sessions"]["total"] == 1
    outside = client.get("/api/overview?range=custom&from=2020-01-01&to=2020-01-02").json()
    assert outside["sessions"]["total"] == 0


def test_session_and_visitor_detail(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-detail", visitor="visitordetail01", ts=(now - 100) * 1000),
            _event("stack_key", session="s-detail", visitor="visitordetail01",
                   props={"tech": "FastAPI", "mode": "3d"}, ts=(now - 90) * 1000),
            _event("assistant", session="s-detail", visitor="visitordetail01",
                   props={"action": "ask", "query": "Опыт с FastAPI?", "via": "input"}, ts=(now - 80) * 1000),
        ],
    )
    detail = client.get("/api/session/s-detail").json()
    assert len(detail["events"]) == 3
    assert detail["events"][1]["gap"] == 10
    visitor = client.get("/api/visitor/visitordetail01").json()
    assert visitor["visitor"]["sessions"] == 1
    assert visitor["visitor"]["stack"][0]["key"] == "FastAPI"
    assert client.delete("/api/session/s-detail").json()["deleted"] == 3
    assert client.get("/api/session/s-detail").status_code == 404


def test_interactive_stats(client):
    now = time.time()
    collect(
        client,
        [
            _event("cmdk", session="s-int", visitor="visitorint00001",
                   props={"action": "open"}, ts=(now - 60) * 1000),
            _event("cmdk", session="s-int", visitor="visitorint00001",
                   props={"action": "select", "command": "goto-projects", "group": "nav"}, ts=(now - 50) * 1000),
            _event("assistant", session="s-int", visitor="visitorint00001",
                   props={"action": "ask", "query": "что умеешь", "via": "chip", "lang": "ru"}, ts=(now - 40) * 1000),
        ],
    )
    overview = client.get("/api/overview?range=today").json()
    assert overview["cmdk"]["opens"] == 1
    assert overview["cmdk"]["commands"][0]["command"] == "goto-projects"
    assert overview["assistant"]["asks"] == 1
    assert overview["assistant"]["questions"][0]["query"] == "что умеешь"


def test_export_csv_and_json(client):
    now = time.time()
    send(client, session="s-export", visitor="visitorexport01", ts=(now - 10) * 1000)
    csv_response = client.get("/api/export/sessions.csv?range=today")
    assert csv_response.status_code == 200
    assert "session_id" in csv_response.text
    assert "s-export" in csv_response.text
    json_response = client.get("/api/export/events.json?range=today")
    assert json_response.status_code == 200
    assert json_response.json()[0]["session"] == "s-export"


def test_cleanup_preview_and_bots(client):
    client.post(
        "/collect",
        json={"key": "test-key", "name": "pageview", "path": "/", "session": "b1"},
        headers={"user-agent": BOT_UA},
    )
    send(client, session="s-human", visitor="visitorhuman001")
    preview = client.get("/api/cleanup/preview").json()
    assert preview["bots"] == 1 and preview["total"] == 2
    removed = client.post("/api/cleanup", json={"scope": "bots"}).json()
    assert removed["deleted"] == 1
    assert removed["preview"]["total"] == 1
    assert client.post("/api/cleanup", json={"scope": "all"}).status_code == 400
    assert client.post("/api/cleanup", json={"scope": "all", "confirm": "DELETE"}).json()["preview"]["total"] == 0


def test_health_and_spa_fallback(client):
    assert client.get("/health").json()["status"] == "ok"
    page = client.get("/session/whatever")
    assert page.status_code == 200


# ------------------------------ auth ---------------------------------------- #


def test_auth_required_for_api(auth_client):
    assert auth_client.get("/api/overview?range=today").status_code == 401
    bad = auth_client.post("/api/login", json={"token": "nope"})
    assert bad.status_code == 401
    good = auth_client.post("/api/login", json={"token": "s3cret"})
    assert good.status_code == 200
    assert auth_client.get("/api/overview?range=today").status_code == 200
    me = auth_client.get("/api/me").json()
    assert me["authenticated"] is True
    assert auth_client.post("/api/logout").status_code == 200
    assert auth_client.get("/api/overview?range=today").status_code == 401


def test_batch_limit(client):
    events = [{"key": "test-key", "name": "ping"} for _ in range(26)]
    assert collect(client, events).status_code == 422


def test_wrong_key_and_origin(client):
    assert client.post("/collect", json={"key": "wrong", "name": "pageview"}).status_code == 403
    assert client.post(
        "/collect",
        json={"key": "test-key", "name": "pageview"},
        headers={"origin": "https://evil.example", "user-agent": HUMAN_UA},
    ).status_code == 403


# ------------------------------ v3 ------------------------------ #


def test_reviews_appear_when_visited(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-rev", ts=(now - 40) * 1000),
            _event("section", session="s-rev", props={"id": "reviews"}, ts=(now - 30) * 1000),
        ],
    )
    keys = [step["key"] for step in client.get("/api/overview?range=today").json()["funnel"]["steps"]]
    assert "reviews" in keys


def test_timeseries_has_bounce_rate(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-br1", visitor="visitorbr000001", ts=(now - 60) * 1000),
            _event("exit", session="s-br1", visitor="visitorbr000001", props={"active_sec": 2}, ts=(now - 50) * 1000),
            _event("pageview", session="s-br2", visitor="visitorbr000002", ts=(now - 40) * 1000),
            _event("section", session="s-br2", visitor="visitorbr000002", props={"id": "top"}, ts=(now - 35) * 1000),
            _event("section", session="s-br2", visitor="visitorbr000002", props={"id": "contact"}, ts=(now - 30) * 1000),
        ],
    )
    points = client.get("/api/overview?range=today").json()["timeseries"]["points"]
    assert all("bounce_rate" in point for point in points)
    assert any(point["bounce_rate"] == 100.0 for point in points)
    assert any(point["bounces"] == 2 for point in points)

    # a session with 3+ sections is engaged, so its bucket is not 100% bounce
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-br3", visitor="visitorbr000003", ts=(now - 20) * 1000),
            *[
                _event("section", session="s-br3", visitor="visitorbr000003", props={"id": name},
                       ts=(now - 18 + index) * 1000)
                for index, name in enumerate(("top", "entry", "about"))
            ],
        ],
    )
    points = client.get("/api/overview?range=today").json()["timeseries"]["points"]
    assert any(0 < point["bounce_rate"] < 100 for point in points)


def test_lifetime_visit_index(client):
    now = time.time()
    collect(
        client,
        [
            _event("pageview", session="s-old", visitor="visitorlife0001", ts=(now - 300) * 1000),
            _event("pageview", session="s-new", visitor="visitorlife0001", ts=(now - 120) * 1000),
        ],
    )
    payload = client.get("/api/overview?range=today").json()
    indexes = {item["sid"]: item["visit_index"] for item in payload["sessions"]["items"]}
    assert indexes == {"s-old": 1, "s-new": 2}
    # even a single-visit page shows the lifetime number, not "1 of the slice"
    detail = client.get("/api/session/s-new").json()
    assert detail["session"]["visit_index"] == 2
    csv_body = client.get("/api/export/sessions.csv?range=today").text
    assert "s-new" in csv_body


def test_server_search_and_tabs(client):
    now = time.time()
    collect(
        client,
        [
            {**_event("pageview", session="s-msk", visitor="visitorsrch001", ts=(now - 90) * 1000),
             "city": ""},
        ],
        headers={
            "origin": "https://coffee1337.github.io",
            "cf-connecting-ip": "95.161.224.13",
            "cf-ipcity": "Moscow",
            "cf-ipcountry": "RU",
            "user-agent": HUMAN_UA,
        },
    )
    collect(
        client,
        [_event("pageview", session="s-kzn", visitor="visitorsrch002", ts=(now - 80) * 1000)],
        headers={
            "origin": "https://coffee1337.github.io",
            "cf-connecting-ip": "77.88.55.66",
            "cf-ipcity": "Kazan",
            "cf-ipcountry": "RU",
            "user-agent": HUMAN_UA,
        },
    )
    assert client.get("/api/overview?range=today&q=moscow").json()["sessions"]["total"] == 1
    assert client.get("/api/overview?range=today&q=zzz").json()["sessions"]["total"] == 0
    counts = client.get("/api/overview?range=today").json()["sessions"]["counts"]
    assert counts["all"] == 2 and counts["bounce"] == 2 and counts["engaged"] == 0
    engaged = client.get("/api/overview?range=today&tab=engaged").json()
    assert engaged["sessions"]["total"] == 0
    assert engaged["sessions"]["counts"]["all"] == 2


def test_dow_hour_and_hide_dc_filters(client):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    now = time.time()
    send(client, session="s-slot", visitor="visitorslot001", ts=(now - 20) * 1000)
    local = datetime.now(ZoneInfo("Europe/Moscow"))
    payload = client.get(
        f"/api/overview?range=today&dow={local.weekday()}&hour={local.hour}"
    ).json()
    assert payload["sessions"]["total"] == 1
    other_hour = (local.hour + 5) % 24
    assert (
        client.get(f"/api/overview?range=today&dow={local.weekday()}&hour={other_hour}").json()["sessions"]["total"]
        == 0
    )
    assert client.get("/api/overview?range=today&hide_dc=1").json()["sessions"]["total"] == 1
    assert "dc_hidden" in client.get("/api/overview?range=today").json()["meta"]


def test_clicks_and_page_time(client):
    now = time.time()
    collect(
        client,
        [
            {**_event("pageview", session="s-clk", visitor="visitorclk001", ts=(now - 120) * 1000),
             "path": "/projects/knn/"},
            _event("click", session="s-clk", visitor="visitorclk001",
                   props={"kind": "telegram", "target": "https://t.me/coffee1337"}, ts=(now - 110) * 1000),
            _event("entry_cta", session="s-clk", visitor="visitorclk001",
                   props={"card": "hire"}, ts=(now - 100) * 1000),
            _event("project_action", session="s-clk", visitor="visitorclk001",
                   props={"project": "knn", "action": "github", "href": "https://github.com/coffee1337/knn"},
                   ts=(now - 90) * 1000),
            _event("exit", session="s-clk", visitor="visitorclk001",
                   props={"active_sec": 30, "max_scroll": 80}, ts=(now - 60) * 1000),
        ],
    )
    payload = client.get("/api/overview?range=today").json()
    clicks = payload["clicks"]
    assert any("t.me" in row["key"] for row in clicks["outbound"])
    assert any("github.com/coffee1337/knn" in row["key"] for row in clicks["outbound"])
    assert any("hire" in row["key"] for row in clicks["buttons"])
    goals = {row["key"]: row for row in payload["goals"]}
    assert goals["social"]["sessions"] == 1
    pages = {row["key"]: row for row in payload["paths"]["all"]}
    assert pages["/projects/knn/"]["avg_sec"] > 0
    projects = {row["id"]: row for row in payload["projects"]}
    assert projects["knn"]["avg_sec"] > 0


def test_preferences_site_lang_and_theme(client):
    now = time.time()
    collect(
        client,
        [
            {**_event("pageview", path="/ru/", session="s-pref", visitor="visitorpref001", ts=(now - 60) * 1000),
             "lang": "ru-RU",
             "props": {"site_lang": "ru", "theme": "light", "active_sec": 0}},
            _event("theme_switch", session="s-pref", visitor="visitorpref001",
                   props={"to": "dark", "active_sec": 5}, ts=(now - 50) * 1000),
        ],
    )
    prefs = client.get("/api/overview?range=today").json()["preferences"]
    assert prefs["languages"][0]["key"] == "ru"
    assert prefs["site_langs"][0]["key"] == "ru"
    assert prefs["themes"][0]["key"] == "dark"
    assert prefs["themes"][0]["switches"] == 1


def test_insights_peak_weekday_is_index(client):
    now = time.time()
    send(client, session="s-peak", visitor="visitorpeak001", ts=(now - 20) * 1000)
    peak = client.get("/api/overview?range=7d").json()["insights"]["peak"]
    assert peak is not None
    assert isinstance(peak.get("weekday"), int) or peak["kind"] in ("hour", "day")


def test_insights_peak_none_without_data(client):
    payload = client.get("/api/overview?range=today").json()
    assert payload["insights"]["peak"] is None
    assert payload["insights"]["project"] is None


def test_auth_cookie_is_hmac_and_secure_behind_proxy(auth_client):
    import hashlib
    import hmac as hmac_lib

    response = auth_client.post(
        "/api/login",
        json={"token": "s3cret"},
        headers={"x-forwarded-proto": "https"},
    )
    cookie_header = response.headers.get("set-cookie", "")
    expected = hmac_lib.new(b"s3cret", b"pa-cookie-v1", hashlib.sha256).hexdigest()
    assert expected in cookie_header
    assert "s3cret" not in cookie_header
    assert "Secure" in cookie_header
    # http (no forwarded proto) still works and keeps the cookie non-secure
    plain = auth_client.post("/api/login", json={"token": "s3cret"})
    assert "Secure" not in plain.headers.get("set-cookie", "")
    assert auth_client.get("/api/overview?range=today").status_code == 200


def test_hide_dc_badge_matches_hidden_sessions(client):
    from datetime import datetime, timezone

    from app import analytics as analytics_mod
    from app.db import SessionLocal
    from app.models import Event

    now = time.time()
    send(client, session="s-plain", visitor="visitordc00001", ts=(now - 30) * 1000)
    with SessionLocal() as db:
        db.add(
            Event(
                ts=datetime.now(timezone.utc),
                site_key=analytics_mod.SITE_KEY,
                name="pageview",
                path="/",
                session_id="s-dc",
                visitor="visitordc00002",
                is_datacenter=True,
                device="desktop",
                os_name="Linux",
                browser="Chrome",
                country="NL",
                city="Amsterdam",
                isp="DigitalOcean, LLC",
            )
        )
        db.commit()
    analytics_mod.invalidate_overview_cache()

    full = client.get("/api/overview?range=today").json()
    hidden = client.get("/api/overview?range=today&hide_dc=1").json()
    assert full["sessions"]["total"] == 2
    assert full["meta"]["dc_hidden"] == 1
    assert hidden["sessions"]["total"] == full["sessions"]["total"] - full["meta"]["dc_hidden"]
    assert hidden["meta"]["dc_hidden"] == 0


def test_geo_negative_cache_short_ttl():
    import time as time_module

    from app import geo
    from app.geo import GeoInfo

    geo.clear_cache()
    geo.cache_geo("8.8.4.4", GeoInfo(source="none"), geo.NEGATIVE_TTL)
    assert geo.cached_geo("8.8.4.4") is not None
    geo.clear_cache()
    geo.cache_geo("8.8.4.4", GeoInfo(source="none"), 0.05)
    time_module.sleep(0.12)
    assert geo.cached_geo("8.8.4.4") is None
    assert geo.NEGATIVE_TTL == 300
