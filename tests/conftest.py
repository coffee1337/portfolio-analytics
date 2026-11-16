from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Fresh SQLite database + app instance per test."""
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("SITE_KEY", "test-key")
    monkeypatch.setenv("ADMIN_TOKEN", "")
    monkeypatch.setenv("VISITOR_SALT", "test-salt")
    monkeypatch.setenv("GEO_LOOKUP", "0")

    for name in [m for m in list(sys.modules) if m == "app" or m.startswith("app.")]:
        del sys.modules[name]

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_client(tmp_path, monkeypatch):
    db_path = tmp_path / "auth.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("SITE_KEY", "test-key")
    monkeypatch.setenv("ADMIN_TOKEN", "s3cret")
    monkeypatch.setenv("VISITOR_SALT", "test-salt")
    monkeypatch.setenv("GEO_LOOKUP", "0")

    for name in [m for m in list(sys.modules) if m == "app" or m.startswith("app.")]:
        del sys.modules[name]

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


BASE_HEADERS = {
    "origin": "https://coffee1337.github.io",
    "cf-connecting-ip": "95.161.224.13",
    "cf-ipcountry": "RU",
}

BOT_UA = "curl/8.5.0"
HUMAN_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def send(client, **payload):
    ua = payload.pop("ua", HUMAN_UA)
    body = {"key": "test-key", "name": "pageview", "path": "/", **payload}
    return client.post(
        "/collect",
        json=body,
        headers={**BASE_HEADERS, "user-agent": ua},
    )


def collect(client, events, headers=None):
    return client.post("/collect", json=events, headers=headers or {**BASE_HEADERS, "user-agent": HUMAN_UA})
