"""Tests for POST /v1/memory/events — idempotent batch ingest (design §3.1)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from .conftest import auth
from .factories import event


def post(client: TestClient, device: str, events: list[dict], token: str = "anon-1"):
    return client.post(
        "/v1/memory/events",
        json={"deviceId": device, "events": events},
        headers=auth(token),
    )


class TestEventIngest:
    def test_accepts_a_batch_and_reports_counts(self, client: TestClient):
        res = post(client, "anon-1", [event(eventId="e1"), event(eventId="e2", lemma="alpha")])
        assert res.status_code == 200
        body = res.json()
        assert body["accepted"] == 2
        assert body["duplicates"] == 0
        assert isinstance(body["serverTime"], int) and body["serverTime"] > 0

    def test_empty_batch_is_a_no_op(self, client: TestClient):
        res = post(client, "anon-1", [])
        assert res.status_code == 200
        assert res.json() == {"accepted": 0, "duplicates": 0, "serverTime": res.json()["serverTime"]}

    def test_idempotent_resend_reports_all_duplicates(self, client: TestClient):
        events = [event(eventId="e1"), event(eventId="e2"), event(eventId="e3")]
        first = post(client, "anon-1", events)
        assert first.json()["accepted"] == 3
        second = post(client, "anon-1", events)
        assert second.status_code == 200
        assert second.json()["accepted"] == 0
        assert second.json()["duplicates"] == 3

    def test_mixed_batch_counts_new_and_dup_within_one_request(self, client: TestClient):
        post(client, "anon-1", [event(eventId="e1"), event(eventId="e2")])
        res = post(
            client,
            "anon-1",
            [event(eventId="e2"), event(eventId="e3"), event(eventId="e1"), event(eventId="e4")],
        )
        body = res.json()
        assert body["accepted"] == 2  # e3, e4
        assert body["duplicates"] == 2  # e1, e2

    def test_duplicate_eventid_within_the_same_batch_is_deduped(self, client: TestClient):
        # Two events sharing an eventId in one payload: only one is stored.
        res = post(
            client,
            "anon-1",
            [event(eventId="dup"), event(eventId="dup", lemma="other")],
        )
        body = res.json()
        # INSERT OR IGNORE keeps the first; the second collides on the PK.
        assert body["accepted"] + body["duplicates"] == 2
        assert body["accepted"] == 1

    def test_rejects_oversized_batch_with_413(self, client: TestClient):
        too_many = [event(eventId=f"e{i}") for i in range(501)]
        res = post(client, "anon-1", too_many)
        assert res.status_code == 413
        assert "exceeds" in res.json()["detail"]

    def test_batches_are_scoped_per_device(self, client: TestClient):
        # Same eventId on different devices is NOT a duplicate (separate scopes).
        post(client, "anon-A", [event(eventId="shared", deviceId="anon-A")])
        res = post(client, "anon-B", [event(eventId="shared", deviceId="anon-B")])
        assert res.json()["accepted"] == 1
        assert res.json()["duplicates"] == 0


class TestEventValidation:
    @pytest.mark.parametrize(
        "bad",
        [
            event(eventId=""),  # empty eventId
            event(lemma=""),  # empty lemma
            event(type="bogus"),  # unknown type
            event(ts=-1),  # negative ts
            {"eventId": "x", "lemma": "robust", "type": "seen", "ts": 1},  # missing deviceId
        ],
    )
    def test_malformed_event_returns_422(self, client: TestClient, bad: dict):
        res = post(client, "anon-1", [bad])
        assert res.status_code == 422

    def test_lemma_is_normalized_to_lowercase(self, client: TestClient):
        post(client, "anon-1", [event(eventId="e1", lemma="Robust")])
        res = client.post(
            "/v1/memory/recall",
            json={"deviceId": "anon-1", "lemmas": ["robust"]},
            headers=auth(),
        )
        assert {s["lemma"] for s in res.json()["states"]} == {"robust"}
