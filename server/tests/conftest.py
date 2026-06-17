"""Shared pytest fixtures.

* ``frozen_now`` patches the server clock so HTTP recall values are deterministic.
* ``app`` / ``client`` give a fresh in-memory server per test.
* ``store`` gives a raw :class:`EventStore` for store/model unit tests.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import annhub_memory.app as app_module
from annhub_memory.app import create_app
from annhub_memory.config import Settings
from annhub_memory.store import EventStore

from .factories import NOW_MS


@pytest.fixture
def frozen_now(monkeypatch) -> int:
    """Freeze the server's ``_now_ms`` so recall decay is deterministic."""
    monkeypatch.setattr(app_module, "_now_ms", lambda: NOW_MS)
    return NOW_MS


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_path=":memory:",
        max_batch_size=500,
        ttl_seconds=86_400,
        min_events_to_train=5,
        auth_shared_secret="",
        auth_realm="annhub-memory",
    )


@pytest.fixture
def app(settings):
    application = create_app(settings)
    yield application
    application.state.store.close()


@pytest.fixture
def client(app, frozen_now) -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def store() -> EventStore:
    s = EventStore(":memory:")
    yield s
    s.close()


def auth(token: str = "anon-1") -> dict[str, str]:
    """Convenience header builder for HTTP tests."""
    return {"Authorization": f"Bearer {token}"}
