from __future__ import annotations

import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./analytics.db")

# Normalize the PostgreSQL URL: SQLAlchemy 2.1 defaults bare postgresql:// to the
# psycopg (v3) dialect, but we ship psycopg2 — pin the dialect explicitly.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first release. ``create_all`` never ALTERs an existing
# table, so live Neon databases are patched in place instead of being recreated.
EVENT_COLUMNS: dict[str, str] = {
    "session_id": "VARCHAR(64) DEFAULT ''",
    "visitor": "VARCHAR(40) DEFAULT ''",
    "is_me": "BOOLEAN DEFAULT FALSE",
    "is_bot": "BOOLEAN DEFAULT FALSE",
    "is_datacenter": "BOOLEAN DEFAULT FALSE",
    "ip_masked": "VARCHAR(48) DEFAULT ''",
    "ip_hash": "VARCHAR(32) DEFAULT ''",
    "title": "VARCHAR(255) DEFAULT ''",
    "region": "VARCHAR(64) DEFAULT ''",
    "city": "VARCHAR(64) DEFAULT ''",
    "asn": "VARCHAR(32) DEFAULT ''",
    "isp": "VARCHAR(128) DEFAULT ''",
    "utm_source": "VARCHAR(64) DEFAULT ''",
    "utm_medium": "VARCHAR(64) DEFAULT ''",
    "utm_campaign": "VARCHAR(64) DEFAULT ''",
    "os_name": "VARCHAR(32) DEFAULT ''",
    "browser": "VARCHAR(32) DEFAULT ''",
    "lang": "VARCHAR(16) DEFAULT ''",
    "screen": "VARCHAR(32) DEFAULT ''",
    "viewport": "VARCHAR(32) DEFAULT ''",
    "tz": "VARCHAR(48) DEFAULT ''",
}

EVENT_INDEXES: dict[str, str] = {
    "ix_events_session": "session_id",
    "ix_events_is_me": "is_me",
    "ix_events_is_bot": "is_bot",
    "ix_events_ip_hash": "ip_hash",
    "ix_events_visitor": "visitor",
    "ix_events_name": "name",
    "ix_events_ts": "ts",
}


def ensure_schema() -> None:
    """Create tables on a fresh database and patch an existing one in place."""
    from . import models  # noqa: F401  (registers metadata)

    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    if "events" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("events")}
    with engine.begin() as conn:
        for name, ddl in EVENT_COLUMNS.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE events ADD COLUMN {name} {ddl}"))
        for index, column in EVENT_INDEXES.items():
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index} ON events ({column})"))
