"""Tests for /v1/memory/recall (POST + GET) — design §3.2."""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from .conftest import auth
from .factories import DAY_MS, NOW_MS, days_ago, event


def recall_post(client: TestClient, device: str, lemmas: list[str], token: str = "anon-1"):
    return client.post(
        "/v1/memory/recall",
        json={"deviceId": device, "lemmas": lemmas},
        headers=auth(token),
    )


def ingest(client: TestClient, device: str, events: list[dict]) -> None:
    res = client.post(
        "/v1/memory/events",
        json={"deviceId": device, "events": events},
        headers=auth(device),
    )
    assert res.status_code == 200


class TestRecallShape:
    def test_uncovered_lemmas_are_absent(self, client: TestClient):
        ingest(client, "anon-1", [event(eventId="e1", lemma="robust")])
        res = recall_post(client, "anon-1", ["robust", "unseen-word"])
        body = res.json()
        assert res.status_code == 200
        assert {s["lemma"] for s in body["states"]} == {"robust"}
        assert body["modelVersion"] == "fsrs-default-v1"
        assert body["ttlSeconds"] == 86_400

    def test_state_has_required_fields_and_valid_ranges(self, client: TestClient):
        ingest(client, "anon-1", [event(eventId="e1", lemma="robust", ts=days_ago(1))])
        state = recall_post(client, "anon-1", ["robust"]).json()["states"][0]
        assert state["lemma"] == "robust"
        assert 0.0 <= state["recall"] <= 1.0
        assert state["computedAt"] == NOW_MS
        assert state["modelVersion"] == "fsrs-default-v1"
        dsr = state["dsr"]
        assert {"difficulty", "stability", "retrievability"} == set(dsr)
        assert dsr["retrievability"] == pytest.approx(state["recall"])
        assert dsr["stability"] > 0
        assert 1.0 <= dsr["difficulty"] <= 10.0

    def test_empty_lemma_list_returns_empty_states(self, client: TestClient):
        res = recall_post(client, "anon-1", [])
        assert res.status_code == 200
        assert res.json()["states"] == []

    def test_get_variant_matches_post(self, client: TestClient):
        ingest(client, "anon-1", [event(eventId="e1", lemma="robust"), event(eventId="e2", lemma="alpha")])
        post_res = recall_post(client, "anon-1", ["robust", "alpha"])
        get_res = client.get(
            "/v1/memory/recall",
            params={"deviceId": "anon-1", "lemmas": "robust,alpha"},
            headers=auth(),
        )
        assert get_res.status_code == 200
        by_lemma_post = {s["lemma"]: s["recall"] for s in post_res.json()["states"]}
        by_lemma_get = {s["lemma"]: s["recall"] for s in get_res.json()["states"]}
        assert by_lemma_get == by_lemma_post


class TestRecallDecay:
    """Default-model forgetting behaviour (mirrors word-memory.ts)."""

    def test_just_seen_has_full_recall(self, client: TestClient):
        ingest(client, "anon-1", [event(eventId="e1", lemma="robust", ts=NOW_MS)])
        recall = recall_post(client, "anon-1", ["robust"]).json()["states"][0]["recall"]
        assert recall == pytest.approx(1.0, abs=1e-9)

    def test_known_decays_slowly_unknown_decays_fast(self, client: TestClient):
        # Both last interacted with 10 days ago.
        ingest(client, "anon-1", [event(eventId="k", lemma="known-word", type="known", ts=days_ago(10))])
        ingest(client, "anon-1", [event(eventId="u", lemma="unknown-word", type="unknown", ts=days_ago(10))])
        states = {s["lemma"]: s["recall"] for s in recall_post(client, "anon-1", ["known-word", "unknown-word"]).json()["states"]}
        assert states["known-word"] > 0.9  # stability ~180 → barely decayed
        assert states["unknown-word"] < 0.01  # stability 0.5 → essentially forgotten

    def test_more_exposures_mean_slower_decay(self, client: TestClient):
        # Two words last seen 5 days ago; one saw the word once, the other 4 times.
        few = [event(eventId="f1", lemma="few", ts=days_ago(5))]
        many = [event(eventId=f"m{i}", lemma="many", ts=days_ago(5)) for i in range(4)]
        ingest(client, "anon-1", few + many)
        states = {s["lemma"]: s["recall"] for s in recall_post(client, "anon-1", ["few", "many"]).json()["states"]}
        # stability grows ×1.6 per exposure → 4 exposures decays far less.
        assert states["many"] > states["few"]

    def test_recall_never_exceeds_one(self, client: TestClient):
        ingest(client, "anon-1", [event(eventId="e1", lemma="robust", ts=NOW_MS + 1000)])
        # future ts would make elapsed negative → clamped to 0 → recall 1.0, not >1.
        states = recall_post(client, "anon-1", ["robust"]).json()["states"]
        assert all(0.0 <= s["recall"] <= 1.0 for s in states)


class TestRecallFormulaMatchesClient:
    """The server uses the same recall formula as the client (2^(-d/s))."""

    def test_single_seen_matches_closed_form(self, client: TestClient):
        days = 10.0
        ingest(client, "anon-1", [event(eventId="e1", lemma="robust", ts=days_ago(days))])
        recall = recall_post(client, "anon-1", ["robust"]).json()["states"][0]["recall"]
        # one 'seen' → stability = 1.0 * 1.6 = 1.6
        expected = math.pow(2.0, -days / 1.6)
        assert recall == pytest.approx(expected, rel=1e-9)
