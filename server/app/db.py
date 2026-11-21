"""SQLite persistence (stdlib sqlite3). Tables are created on startup; stock is seeded from the catalog."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Iterator, Mapping

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "veloura.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS stock (
    product_id TEXT NOT NULL,
    size       TEXT NOT NULL,
    qty        INTEGER NOT NULL CHECK (qty >= 0),
    PRIMARY KEY (product_id, size)
);
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    height_cm     REAL,
    drape         TEXT,
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
    order_id   TEXT PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id),
    email      TEXT NOT NULL,
    address    TEXT NOT NULL,
    payment    TEXT NOT NULL,
    shipping   TEXT NOT NULL,
    quote      TEXT NOT NULL,
    total      INTEGER NOT NULL,
    eta_date   TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter (
    email      TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS styling_bookings (
    booking_id TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    city       TEXT NOT NULL,
    slot       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_alerts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    size       TEXT NOT NULL,
    email      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (product_id, size, email)
);
"""


def resolve_db_path(path: str | Path | None = None) -> Path:
    return Path(path or os.environ.get("VELOURA_DB") or DEFAULT_DB_PATH)


class Database:
    def __init__(self, path: str | Path | None = None):
        self.path = resolve_db_path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10, isolation_level=None)  # autocommit; explicit BEGIN for txns
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def init(self, catalog: Mapping[str, Any]) -> None:
        conn = self.connect()
        try:
            conn.executescript(SCHEMA)
            conn.execute("BEGIN")
            for p in catalog["products"]:
                for size in p["sizes"]:
                    conn.execute(
                        "INSERT OR IGNORE INTO stock (product_id, size, qty) VALUES (?, ?, ?)",
                        (p["id"], size, int(p["stock"].get(size, 0))),
                    )
            conn.execute("COMMIT")
        finally:
            conn.close()

    def session(self) -> Iterator[sqlite3.Connection]:
        """FastAPI dependency: one connection per request."""
        conn = self.connect()
        try:
            yield conn
        finally:
            conn.close()


def stock_map(conn: sqlite3.Connection) -> dict[tuple[str, str], int]:
    return {(r["product_id"], r["size"]): r["qty"] for r in conn.execute("SELECT product_id, size, qty FROM stock")}
