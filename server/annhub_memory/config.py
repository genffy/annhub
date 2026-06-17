"""Runtime configuration for the memory-sync server.

All settings are environment-driven (12-factor) so the same image runs locally,
in a container, or serverless. Defaults make a single-instance dev server work
with zero configuration.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

#: Max events accepted in a single ``POST /v1/memory/events`` (design §3.1: "≤ 500").
DEFAULT_MAX_BATCH_SIZE = 500

#: Client cache TTL the server advertises for recall states (design §3.2 example).
DEFAULT_TTL_SECONDS = 86_400  # 24h — mirrors the client's local cache TTL

#: Minimum explicit-feedback events required before HLR training is attempted
#: (cold-start guard: too few labelled points → keep the deterministic default).
DEFAULT_MIN_EVENTS_TO_TRAIN = 20


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default) or default


@dataclass(frozen=True)
class Settings:
    """Immutable settings resolved once at startup from the environment."""

    #: SQLite database path. ``:memory:`` runs an in-process DB (used by tests).
    database_path: str = field(
        default_factory=lambda: _env("ANNHUB_DB_PATH", "data/annhub_memory.db")
    )
    #: Max events per ingest batch.
    max_batch_size: int = field(
        default_factory=lambda: _env_int("ANNHUB_MAX_BATCH_SIZE", DEFAULT_MAX_BATCH_SIZE)
    )
    #: Advertised recall cache TTL (seconds).
    ttl_seconds: int = field(
        default_factory=lambda: _env_int("ANNHUB_RECALL_TTL_SECONDS", DEFAULT_TTL_SECONDS)
    )
    #: Minimum labelled events to allow HLR training.
    min_events_to_train: int = field(
        default_factory=lambda: _env_int(
            "ANNHUB_MIN_EVENTS_TO_TRAIN", DEFAULT_MIN_EVENTS_TO_TRAIN
        )
    )
    #: If set, the ``Authorization: Bearer`` token must equal this secret.
    #: If unset, any non-empty bearer is accepted (anonymous-device mode).
    auth_shared_secret: str = field(
        default_factory=lambda: os.environ.get("ANNHUB_AUTH_SHARED_SECRET", "") or ""
    )
    #: Bearer realm surfaced on 401 responses.
    auth_realm: str = field(
        default_factory=lambda: _env("ANNHUB_AUTH_REALM", "annhub-memory")
    )

    @property
    def auth_mode(self) -> str:
        """``"shared_secret"`` when a secret is configured, else ``"lenient"``."""
        return "shared_secret" if self.auth_shared_secret else "lenient"


def load_settings(**overrides: object) -> Settings:
    """Build :class:`Settings`, applying test/local overrides on top of env."""
    fields = {
        "database_path": _env("ANNHUB_DB_PATH", "data/annhub_memory.db"),
        "max_batch_size": _env_int("ANNHUB_MAX_BATCH_SIZE", DEFAULT_MAX_BATCH_SIZE),
        "ttl_seconds": _env_int("ANNHUB_RECALL_TTL_SECONDS", DEFAULT_TTL_SECONDS),
        "min_events_to_train": _env_int(
            "ANNHUB_MIN_EVENTS_TO_TRAIN", DEFAULT_MIN_EVENTS_TO_TRAIN
        ),
        "auth_shared_secret": os.environ.get("ANNHUB_AUTH_SHARED_SECRET", "") or "",
        "auth_realm": _env("ANNHUB_AUTH_REALM", "annhub-memory"),
    }
    for key, value in overrides.items():
        if value is not None:
            fields[key] = value
    return Settings(**fields)  # type: ignore[arg-type]
