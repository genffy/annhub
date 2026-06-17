"""Tests for the SQLite EventStore: idempotency, reads, model meta, GDPR wipe."""

from __future__ import annotations

from annhub_memory.store import EventStore, ModelMeta

from .factories import event_obj


class TestIngestIdempotency:
    def test_first_insert_accepted_second_all_duplicates(self, store: EventStore):
        events = [event_obj(eventId="e1", lemma="robust"), event_obj(eventId="e2", lemma="alpha")]
        first = store.ingest_events("anon-1", events)
        assert (first.accepted, first.duplicates) == (2, 0)
        second = store.ingest_events("anon-1", events)
        assert (second.accepted, second.duplicates) == (0, 2)

    def test_empty_ingest_is_zero_cost(self, store: EventStore):
        result = store.ingest_events("anon-1", [])
        assert (result.accepted, result.duplicates) == (0, 0)


class TestReads:
    def test_events_returned_sorted_by_ts(self, store: EventStore):
        store.ingest_events("anon-1", [
            event_obj(eventId="c", lemma="w", ts=3000),
            event_obj(eventId="a", lemma="w", ts=1000),
            event_obj(eventId="b", lemma="w", ts=2000),
        ])
        rows = store.get_events_for_lemma("anon-1", "w")
        assert [r.ts for r in rows] == [1000, 2000, 3000]

    def test_get_is_case_insensitive(self, store: EventStore):
        store.ingest_events("anon-1", [event_obj(eventId="e1", lemma="robust")])
        # schema lowercases on input; lookup also lowercases.
        assert len(store.get_events_for_lemma("anon-1", "ROBUST")) == 1

    def test_scoped_per_device(self, store: EventStore):
        store.ingest_events("anon-A", [event_obj(eventId="e1", lemma="w", deviceId="anon-A")])
        store.ingest_events("anon-B", [event_obj(eventId="e1", lemma="w", deviceId="anon-B")])
        assert store.count_events("anon-A") == 1
        assert store.count_events("anon-B") == 1
        assert set(store.device_ids()) == {"anon-A", "anon-B"}

    def test_iter_lemmas_unique(self, store: EventStore):
        store.ingest_events("anon-1", [
            event_obj(eventId="e1", lemma="alpha"),
            event_obj(eventId="e2", lemma="beta"),
            event_obj(eventId="e3", lemma="alpha"),
        ])
        assert set(store.iter_lemmas("anon-1")) == {"alpha", "beta"}


class TestModelMeta:
    def test_round_trip_and_overwrite(self, store: EventStore):
        store.upsert_model_meta(ModelMeta("dev", [0.0, 0.5, 0.2], "hlr-v1", 100, 42))
        meta = store.get_model_meta("dev")
        assert meta is not None
        assert meta.weights == [0.0, 0.5, 0.2]
        assert meta.examples == 42
        # overwrite
        store.upsert_model_meta(ModelMeta("dev", [1.0], "hlr-v2", 200, 7))
        meta = store.get_model_meta("dev")
        assert meta.weights == [1.0] and meta.model_version == "hlr-v2"

    def test_missing_meta_is_none(self, store: EventStore):
        assert store.get_model_meta("nobody") is None


class TestGdprWipe:
    def test_delete_removes_events_and_model(self, store: EventStore):
        store.ingest_events("anon-1", [
            event_obj(eventId="e1", lemma="a"),
            event_obj(eventId="e2", lemma="b"),
        ])
        store.upsert_model_meta(ModelMeta("anon-1", [0.0], "hlr-v1", 1, 1))
        deleted = store.delete_device("anon-1")
        assert deleted == 2
        assert store.count_events("anon-1") == 0
        assert store.get_model_meta("anon-1") is None

    def test_delete_is_scoped(self, store: EventStore):
        store.ingest_events("anon-A", [event_obj(eventId="e1", lemma="a")])
        store.ingest_events("anon-B", [event_obj(eventId="e2", lemma="a")])
        store.delete_device("anon-A")
        assert store.count_events("anon-A") == 0
        assert store.count_events("anon-B") == 1
