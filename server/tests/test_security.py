"""Tests for bearer authentication (design §3: every request carries a bearer)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from annhub_memory.app import create_app
from annhub_memory.config import Settings

from .factories import event


def _events(client: TestClient, token: str | None, body_device: str = "anon-1"):
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    return client.post(
        "/v1/memory/events",
        json={"deviceId": body_device, "events": [event()]},
        headers=headers,
    )


class TestAuthRequired:
    def test_missing_header_is_401(self, client: TestClient):
        res = _events(client, token=None)
        assert res.status_code == 401
        assert "Bearer" in res.headers.get("www-authenticate", "")

    @pytest.mark.parametrize(
        "header",
        ["", "anon-1", "Token anon-1", "bearer"],  # empty / wrong scheme / no token
    )
    def test_malformed_bearer_is_401(self, client: TestClient, header: str):
        res = client.post(
            "/v1/memory/events",
            json={"deviceId": "anon-1", "events": [event()]},
            headers={"Authorization": header} if header else {},
        )
        assert res.status_code == 401

    def test_recall_also_requires_auth(self, client: TestClient):
        res = client.post("/v1/memory/recall", json={"deviceId": "anon-1", "lemmas": ["x"]})
        assert res.status_code == 401


class TestLenientMode:
    """Default: any non-empty bearer is accepted (anonymous-device rollout)."""

    def test_any_non_empty_bearer_accepted(self, client: TestClient):
        # bearer differs from the body deviceId — still accepted in lenient mode.
        res = _events(client, token="whatever", body_device="anon-1")
        assert res.status_code == 200


class TestSharedSecretMode:
    """When ANNHUB_AUTH_SHARED_SECRET is set, the bearer must equal it."""

    @pytest.fixture
    def secret_app(self):
        settings = Settings(
            database_path=":memory:",
            auth_shared_secret="s3cret-key",
            min_events_to_train=5,
        )
        application = create_app(settings)
        yield application
        application.state.store.close()

    def test_wrong_token_rejected(self, secret_app):
        with TestClient(secret_app) as c:
            assert _events(c, token="not-the-secret").status_code == 401

    def test_correct_secret_accepted(self, secret_app):
        with TestClient(secret_app) as c:
            assert _events(c, token="s3cret-key").status_code == 200
