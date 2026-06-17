"""SQLite-backed persistence for memory events and trained model state.

Design notes
------------
* **Idempotency** lives at the storage layer: ``(device_id, event_id)`` is the
  primary key, so a re-sent batch from one device is a no-op while two devices
  that happen to mint equal event ids stay independent. :meth:`EventStore.ingest_events`
  uses ``INSERT OR IGNORE`` and reports how many rows were actually new.
* **Single source of truth = the events table.** Recall states are *computed* from
  events on demand (see :mod:`annhub_memory.model`), never stored, so they can
  never go stale. Only *trained model weights* are persisted (model_meta).
* **Privacy**: only the anonymized contract fields are ever stored — there is no
  column (and no code path) for sentences, URLs, or page content. GDPR wipe is a
  single scoped delete.
* SQLite is single-writer; we guard the shared connection with an ``RLock`` so the
  FastAPI sync-threadpool can call us safely.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator, Sequence

from .schemas import MemoryEvent

_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    device_id   TEXT NOT NULL,
    event_id    TEXT NOT NULL,
    lemma       TEXT NOT NULL,
    type        TEXT NOT NULL,
    ts          INTEGER NOT NULL,
    delta_days  REAL,
    seen_count  INTEGER,
    local_recall REAL,
    domain      TEXT,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (device_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_events_device_lemma ON events (device_id, lemma);
CREATE INDEX IF NOT EXISTS idx_events_device_ts ON events (device_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_lemma ON events (lemma);

CREATE TABLE IF NOT EXISTS model_meta (
    scope         TEXT PRIMARY KEY,
    weights       TEXT NOT NULL,        -- JSON list[float]
    model_version TEXT NOT NULL,
    trained_at    INTEGER NOT NULL,
    examples      INTEGER NOT NULL DEFAULT 0
);
"""


@dataclass(frozen=True)
class StoredEvent:
    """A materialized event row, typed for the model layer."""

    event_id: str
    device_id: str
    lemma: str
    type: str
    ts: int
    delta_days: float | None
    seen_count: int | None
    local_recall: float | None
    domain: str | None


@dataclass(frozen=True)
class IngestResult:
    accepted: int
    duplicates: int


@dataclass(frozen=True)
class ModelMeta:
    scope: str
    weights: list[float]
    model_version: str
    trained_at: int
    examples: int


class EventStore:
    """Thread-safe wrapper around a single SQLite connection."""

    def __init__(self, database_path: str) -> None:
        # Ensure the parent directory exists for file-backed DBs (``:memory:``
        # and URIs skip this). Lets the server boot with zero setup.
        if database_path != ":memory:" and "mode=memory" not in database_path:
            parent = os.path.dirname(os.path.abspath(database_path))
            os.makedirs(parent, exist_ok=True)
        # ``check_same_thread=False`` because FastAPI serves sync routes from a
        # threadpool; the ``RLock`` serializes all access.
        self._conn = sqlite3.connect(database_path, check_same_thread=False)
        # Keep rows dict-like via column names.
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self._init_schema()

    # ── lifecycle ───────────────────────────────────────────────────────────

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __enter__(self) -> "EventStore":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ── ingest (idempotent) ─────────────────────────────────────────────────

    def ingest_events(self, device_id: str, events: Sequence[MemoryEvent]) -> IngestResult:
        """Insert events, deduplicating by ``(deviceId, eventId)``.

        Returns counts of newly-accepted vs. already-known rows. The top-level
        ``device_id`` is authoritative for scoping (and is the dedup prefix); the
        per-event ``deviceId`` is only kept on the row for cross-device debugging.
        """
        if not events:
            return IngestResult(accepted=0, duplicates=0)
        import time

        now_ms = int(time.time() * 1000)
        rows = [
            (
                e.eventId,
                device_id,
                e.lemma,
                e.type,
                e.ts,
                e.deltaDays,
                e.seenCount,
                e.localRecall,
                e.domain,
                now_ms,
            )
            for e in events
        ]
        with self._lock:
            cur = self._conn.executemany(
                "INSERT OR IGNORE INTO events "
                "(event_id, device_id, lemma, type, ts, delta_days, seen_count, "
                " local_recall, domain, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rows,
            )
            inserted = int(cur.rowcount)  # executemany rowcount = rows actually inserted
            self._conn.commit()
        duplicates = len(events) - inserted
        return IngestResult(accepted=inserted, duplicates=duplicates)

    # ── reads ───────────────────────────────────────────────────────────────

    def get_events_for_lemma(self, device_id: str, lemma: str) -> list[StoredEvent]:
        """All events for one lemma, ascending by ``ts`` (then eventId for stability)."""
        with self._lock:
            cur = self._conn.execute(
                "SELECT event_id, device_id, lemma, type, ts, delta_days, "
                "       seen_count, local_recall, domain "
                "FROM events WHERE device_id = ? AND lemma = ? "
                "ORDER BY ts ASC, event_id ASC",
                (device_id, lemma.strip().lower()),
            )
            return [self._row_to_event(r) for r in cur.fetchall()]

    def iter_lemmas(self, device_id: str) -> Iterator[str]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT DISTINCT lemma FROM events WHERE device_id = ?", (device_id,)
            )
            for row in cur:
                yield row["lemma"]

    def count_events(self, device_id: str) -> int:
        with self._lock:
            cur = self._conn.execute(
                "SELECT COUNT(*) AS n FROM events WHERE device_id = ?", (device_id,)
            )
            return int(cur.fetchone()["n"])

    def device_ids(self) -> list[str]:
        with self._lock:
            cur = self._conn.execute("SELECT DISTINCT device_id FROM events")
            return [row["device_id"] for row in cur.fetchall()]

    # ── model state ─────────────────────────────────────────────────────────

    def get_model_meta(self, scope: str) -> ModelMeta | None:
        with self._lock:
            cur = self._conn.execute(
                "SELECT scope, weights, model_version, trained_at, examples "
                "FROM model_meta WHERE scope = ?",
                (scope,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return ModelMeta(
                scope=row["scope"],
                weights=json.loads(row["weights"]),
                model_version=row["model_version"],
                trained_at=int(row["trained_at"]),
                examples=int(row["examples"]),
            )

    def upsert_model_meta(self, meta: ModelMeta) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO model_meta (scope, weights, model_version, trained_at, examples) "
                "VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(scope) DO UPDATE SET "
                "  weights=excluded.weights, model_version=excluded.model_version, "
                "  trained_at=excluded.trained_at, examples=excluded.examples",
                (
                    meta.scope,
                    json.dumps(meta.weights, separators=(",", ":")),
                    meta.model_version,
                    meta.trained_at,
                    meta.examples,
                ),
            )
            self._conn.commit()

    # ── GDPR wipe ────────────────────────────────────────────────────────────

    def delete_device(self, device_id: str) -> int:
        """Wipe everything for a device: all events + its trained model. Returns
        the number of events deleted."""
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM events WHERE device_id = ?", (device_id,)
            )
            deleted = int(cur.rowcount)
            self._conn.execute(
                "DELETE FROM model_meta WHERE scope = ?", (device_id,)
            )
            self._conn.commit()
            return deleted

    # ── internals ────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_event(row: sqlite3.Row) -> StoredEvent:
        return StoredEvent(
            event_id=row["event_id"],
            device_id=row["device_id"],
            lemma=row["lemma"],
            type=row["type"],
            ts=int(row["ts"]),
            delta_days=row["delta_days"],
            seen_count=row["seen_count"],
            local_recall=row["local_recall"],
            domain=row["domain"],
        )

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Expose the connection under the lock for multi-statement atomicity."""
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise
