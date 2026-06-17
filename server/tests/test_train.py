"""Tests for POST /v1/memory/train — admin HLR refit (T1-D)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import auth
from .factories import DAY_MS, NOW_MS, event


def seed_separable(client: TestClient, device: str = "anon-1") -> None:
    """Ingest labelled data: easy words (seen×4 then known), hard words (seen then unknown)."""
    events: list[dict] = []
    for i in range(6):
        base = NOW_MS - (10 + i) * DAY_MS
        for j in range(4):
            events.append(event(eventId=f"easy{i}-{j}", lemma=f"easy{i}", type="seen", ts=base + j * 1000, deviceId=device))
        events.append(event(eventId=f"easy{i}-k", lemma=f"easy{i}", type="known", ts=NOW_MS - 5 * DAY_MS, deviceId=device))
    for i in range(6):
        events.append(event(eventId=f"hard{i}-s", lemma=f"hard{i}", type="seen", ts=NOW_MS - 10 * DAY_MS, deviceId=device))
        events.append(event(eventId=f"hard{i}-u", lemma=f"hard{i}", type="unknown", ts=NOW_MS - 5 * DAY_MS, deviceId=device))
    # ingest in <=500 batches (we're well under)
    res = client.post("/v1/memory/events", json={"deviceId": device, "events": events}, headers=auth(device))
    assert res.status_code == 200


class TestTrainEndpoint:
    def test_trains_and_flips_model_version(self, client: TestClient):
        seed_separable(client)
        res = client.post("/v1/memory/train", params={"deviceId": "anon-1"}, headers=auth())
        assert res.status_code == 200
        body = res.json()
        assert body["trained"] is True
        assert body["modelVersion"] == "hlr-v1"
        assert body["examples"] >= 5

        # recall now reports the trained model version
        recall = client.post(
            "/v1/memory/recall",
            json={"deviceId": "anon-1", "lemmas": ["easy0", "hard0"]},
            headers=auth(),
        ).json()
        assert recall["modelVersion"] == "hlr-v1"
        assert {s["lemma"] for s in recall["states"]} == {"easy0", "hard0"}

    def test_too_few_events_keeps_default(self, client: TestClient):
        client.post(
            "/v1/memory/events",
            json={"deviceId": "anon-1", "events": [
                event(eventId="e1", lemma="w", type="seen", ts=NOW_MS - 10 * DAY_MS),
                event(eventId="e2", lemma="w", type="known", ts=NOW_MS - 5 * DAY_MS),
            ]},
            headers=auth(),
        )
        res = client.post("/v1/memory/train", params={"deviceId": "anon-1"}, headers=auth())
        body = res.json()
        assert body["trained"] is False
        assert body["modelVersion"] == "fsrs-default-v1"
        assert "not enough" in body["message"]

    def test_train_requires_auth(self, client: TestClient):
        res = client.post("/v1/memory/train", params={"deviceId": "anon-1"})
        assert res.status_code == 401
