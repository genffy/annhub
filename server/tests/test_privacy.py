"""Tests for the privacy / GDPR guarantees (design §4).

Two pillars:
1. The contract carries *only* lemma + interaction type + time + counts — never the
   sentence, URL, or page content. We assert the schema is structurally incapable of
   accepting those.
2. A device can be fully erased via DELETE.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from annhub_memory.schemas import MemoryEvent

from .conftest import auth
from .factories import event

#: The only fields a MemoryEvent may carry (frozen contract, design §2.1).
ALLOWED_EVENT_FIELDS = {
    "eventId",
    "lemma",
    "type",
    "ts",
    "deltaDays",
    "seenCount",
    "localRecall",
    "domain",
    "deviceId",
}

#: Field names that must NEVER appear — they'd let the server reconstruct content.
FORBIDDEN_FRAGMENTS = ("sentence", "url", "page", "content", "title", "snippet", "text", "html")


class TestSchemaIsContentFree:
    def test_event_fields_are_exactly_the_contract(self):
        assert set(MemoryEvent.model_fields) == ALLOWED_EVENT_FIELDS

    def test_no_field_name_leaks_content(self):
        names = " ".join(MemoryEvent.model_fields).lower()
        for fragment in FORBIDDEN_FRAGMENTS:
            assert fragment not in names, f"field name leaks '{fragment}'"

    def test_server_ignores_extra_content_fields(self, client: TestClient):
        # Even if a (buggy) client sneaks in a sentence, Pydantic drops it by default
        # and we never persist it.
        res = client.post(
            "/v1/memory/events",
            json={
                "deviceId": "anon-1",
                "events": [
                    {
                        **event(),
                        "sentence": "the cat sat on the mat",  # ignored
                        "pageUrl": "https://secret.example/article",  # ignored
                    }
                ],
            },
            headers=auth(),
        )
        assert res.status_code == 200


class TestGdprWipe:
    def test_delete_returns_count_and_forgets_data(self, client: TestClient):
        client.post(
            "/v1/memory/events",
            json={"deviceId": "anon-1", "events": [event(eventId="e1", lemma="a"), event(eventId="e2", lemma="b")]},
            headers=auth(),
        )
        assert client.post("/v1/memory/recall", json={"deviceId": "anon-1", "lemmas": ["a", "b"]}, headers=auth()).json()["states"]

        res = client.delete("/v1/memory/events", params={"deviceId": "anon-1"}, headers=auth())
        assert res.status_code == 200
        assert res.json() == {"deviceId": "anon-1", "deleted": 2}

        # recall now returns nothing for this device
        states = client.post("/v1/memory/recall", json={"deviceId": "anon-1", "lemmas": ["a", "b"]}, headers=auth()).json()["states"]
        assert states == []

    def test_delete_is_scoped_to_one_device(self, client: TestClient):
        client.post("/v1/memory/events", json={"deviceId": "anon-A", "events": [event(eventId="e1", lemma="a", deviceId="anon-A")]}, headers=auth("anon-A"))
        client.post("/v1/memory/events", json={"deviceId": "anon-B", "events": [event(eventId="e2", lemma="a", deviceId="anon-B")]}, headers=auth("anon-B"))
        client.delete("/v1/memory/events", params={"deviceId": "anon-A"}, headers=auth("anon-A"))
        b_states = client.post("/v1/memory/recall", json={"deviceId": "anon-B", "lemmas": ["a"]}, headers=auth("anon-B")).json()["states"]
        assert len(b_states) == 1  # anon-B unaffected

    def test_reingest_after_delete_starts_fresh(self, client: TestClient):
        client.post("/v1/memory/events", json={"deviceId": "anon-1", "events": [event(eventId="e1", lemma="a")]}, headers=auth())
        client.delete("/v1/memory/events", params={"deviceId": "anon-1"}, headers=auth())
        # same eventId can be re-used after wipe
        res = client.post("/v1/memory/events", json={"deviceId": "anon-1", "events": [event(eventId="e1", lemma="a")]}, headers=auth())
        assert res.json()["accepted"] == 1
