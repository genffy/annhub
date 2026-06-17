"""Unit tests for the memory model: recall formula, deterministic walk, HLR."""

from __future__ import annotations

import math

import pytest

from annhub_memory.schemas import MemoryEvent
from annhub_memory.model import (
    DEFAULT_MODEL_VERSION,
    INITIAL_DIFFICULTY,
    KNOWN_STABILITY,
    MAX_DIFFICULTY,
    MIN_DIFFICULTY,
    SEEN_STABILITY_GROWTH,
    TRAINED_MODEL_VERSION,
    UNKNOWN_STABILITY,
    DAY_MS,
    DefaultParams,
    TrainedParams,
    build_training_examples,
    compute_snapshot,
    pick_params,
    recall_from_stability,
    train_hlr,
    train_identity,
)
from annhub_memory.store import EventStore, StoredEvent

DAY = DAY_MS


def stored(lemma: str, etype: str, ts: int, eid: str | None = None, **extra) -> StoredEvent:
    return StoredEvent(
        event_id=eid or f"{lemma}-{etype}-{ts}",
        device_id="anon-1",
        lemma=lemma,
        type=etype,
        ts=ts,
        delta_days=extra.get("delta_days"),
        seen_count=extra.get("seen_count"),
        local_recall=extra.get("local_recall"),
        domain=extra.get("domain"),
    )


# ── recall formula ───────────────────────────────────────────────────────────


class TestRecallFormula:
    def test_full_recall_when_no_time_elapsed(self):
        assert recall_from_stability(stability_days=10.0, last_seen_ts=1000, now_ms=1000) == pytest.approx(1.0)

    def test_half_life_gives_half_recall(self):
        # elapsed == stability → recall == 0.5
        now = 10_000_000
        assert recall_from_stability(7.0, now - int(7 * DAY), now) == pytest.approx(0.5, rel=1e-9)

    def test_negative_elapsed_is_clamped_to_full_recall(self):
        # future last-seen (clock skew) → treat as now → recall 1.0, never >1.
        assert recall_from_stability(5.0, 2000, 1000) == pytest.approx(1.0)

    def test_stability_zero_is_safe(self):
        # stability is clamped to MIN_STABILITY so 0 never divides — just assert
        # a finite, in-range result with no exception.
        recall = recall_from_stability(0.0, 1000, 2000)
        assert math.isfinite(recall) and 0.0 <= recall <= 1.0


# ── deterministic walk (mirrors word-memory.ts) ──────────────────────────────


class TestDeterministicWalk:
    def test_empty_history_is_uncovered(self):
        assert compute_snapshot([], now_ms=1, params=DefaultParams()) is None

    def test_seen_grows_stability_by_growth_factor(self):
        snap = compute_snapshot([stored("w", "seen", 1000)], now_ms=1000, params=DefaultParams())
        assert snap.seen_count == 1
        assert snap.stability == pytest.approx(SEEN_STABILITY_GROWTH)

    def test_known_jumps_to_long_term(self):
        snap = compute_snapshot([stored("w", "known", 1000)], now_ms=1000, params=DefaultParams())
        assert snap.stability == pytest.approx(KNOWN_STABILITY)

    def test_unknown_collapses_stability(self):
        snap = compute_snapshot([stored("w", "unknown", 1000)], now_ms=1000, params=DefaultParams())
        assert snap.stability == pytest.approx(UNKNOWN_STABILITY)

    def test_repeated_seen_compounds(self):
        events = [stored("w", "seen", 1000 + i) for i in range(4)]
        snap = compute_snapshot(events, now_ms=2000, params=DefaultParams())
        # 1.0 * 1.6 ** 4
        assert snap.stability == pytest.approx(SEEN_STABILITY_GROWTH ** 4)

    def test_difficulty_eases_on_success_hardens_on_failure(self):
        ok = compute_snapshot([stored("w", "known", 1000)], now_ms=1000, params=DefaultParams())
        bad = compute_snapshot([stored("w", "unknown", 1000)], now_ms=1000, params=DefaultParams())
        assert ok.difficulty < INITIAL_DIFFICULTY
        assert bad.difficulty > INITIAL_DIFFICULTY
        assert MIN_DIFFICULTY <= ok.difficulty <= MAX_DIFFICULTY
        assert MIN_DIFFICULTY <= bad.difficulty <= MAX_DIFFICULTY

    def test_last_seen_ts_is_most_recent_event(self):
        events = [stored("w", "seen", 1000), stored("w", "seen", 5000), stored("w", "seen", 3000)]
        snap = compute_snapshot(events, now_ms=6000, params=DefaultParams())
        assert snap.last_seen_ts == 5000


# ── training-example materialization ─────────────────────────────────────────


class TestBuildTrainingExamples:
    def test_labels_and_deltas(self):
        t0 = 1_000_000
        cat = [stored("cat", "seen", t0), stored("cat", "seen", t0 + 1 * DAY), stored("cat", "known", t0 + 5 * DAY)]
        dog = [stored("dog", "seen", t0), stored("dog", "unknown", t0 + 3 * DAY)]
        examples = build_training_examples([cat, dog])
        # one labelled example per lemma (the 'seen' events carry no label)
        assert len(examples) == 2
        by_lemma = {round(ex.delta_days): ex for ex in examples}  # deltas differ
        # cat: known → label 1, delta = 4 days (5-1)
        cat_ex = next(e for e in examples if e.label == 1.0)
        assert cat_ex.delta_days == pytest.approx(4.0)
        assert cat_ex.features[1] == pytest.approx(math.log1p(2))  # prior_seen = 2
        # dog: unknown → label 0, delta = 3 days
        dog_ex = next(e for e in examples if e.label == 0.0)
        assert dog_ex.delta_days == pytest.approx(3.0)

    def test_first_event_with_no_prior_is_excluded(self):
        # A labelled event with no prior interaction → delta 0 → dropped.
        solo = [stored("w", "known", 1000)]
        assert build_training_examples([solo]) == []


# ── HLR fitting ───────────────────────────────────────────────────────────────


def _separable_timelines(n_easy: int = 6, n_hard: int = 6, delta_days: float = 10.0):
    """Easy words: 4 exposures then 'known'. Hard words: 1 exposure then 'unknown'."""
    t0 = 1_000_000
    timelines = []
    for i in range(n_easy):
        tl = [stored(f"easy{i}", "seen", t0 + j * 1_000) for j in range(4)]
        tl.append(stored(f"easy{i}", "known", t0 + int(delta_days * DAY), eid=f"easy{i}-k"))
        timelines.append(tl)
    for i in range(n_hard):
        tl = [stored(f"hard{i}", "seen", t0)]
        tl.append(stored(f"hard{i}", "unknown", t0 + int(delta_days * DAY), eid=f"hard{i}-u"))
        timelines.append(tl)
    return timelines


class TestHlrTraining:
    def test_loss_decreases(self):
        examples = build_training_examples(_separable_timelines())
        weights, history = train_hlr(examples, iterations=500)
        assert len(weights) == 3
        assert history[-1] < history[0]

    def test_seen_feature_weight_is_positive_on_separable_data(self):
        examples = build_training_examples(_separable_timelines())
        weights, _ = train_hlr(examples, iterations=1500)
        bias, seen_coef, correct_coef = weights
        assert seen_coef > 0  # more exposures → longer half-life

    def test_trained_model_ranks_easy_above_hard(self):
        examples = build_training_examples(_separable_timelines())
        weights, _ = train_hlr(examples, iterations=1500)
        params = TrainedParams(weights=weights)
        easy = compute_snapshot([stored("easy", "seen", 1) for _ in range(4)] + [stored("easy", "known", 1)], now_ms=1 + 10 * int(DAY), params=params)
        hard = compute_snapshot([stored("hard", "seen", 1), stored("hard", "unknown", 1)], now_ms=1 + 10 * int(DAY), params=params)
        assert easy.stability > hard.stability
        assert recall_from_stability(easy.stability, easy.last_seen_ts, 1 + 10 * int(DAY)) > recall_from_stability(hard.stability, hard.last_seen_ts, 1 + 10 * int(DAY))


# ── train_identity orchestration (store-backed) ──────────────────────────────


class TestTrainIdentity:
    def test_trains_when_enough_data_and_persists_weights(self, store: EventStore):
        for timeline in _separable_timelines():
            for i, ev in enumerate(timeline):
                store.ingest_events("dev", [_to_memory_event(ev, i)])
        trained, examples, version = train_identity(store, "dev", min_examples=5)
        assert trained is True
        assert examples >= 5
        assert version == TRAINED_MODEL_VERSION
        # pick_params now returns the trained model
        assert isinstance(pick_params(store, "dev"), TrainedParams)
        meta = store.get_model_meta("dev")
        assert meta is not None and meta.model_version == TRAINED_MODEL_VERSION

    def test_cold_start_keeps_default_when_too_few(self, store: EventStore):
        # only one labelled example
        store.ingest_events("dev", [
            MemoryEvent(eventId="a", lemma="w", type="seen", ts=1, deviceId="dev"),
            MemoryEvent(eventId="b", lemma="w", type="known", ts=1 + int(5 * DAY), deviceId="dev"),
        ])
        trained, examples, version = train_identity(store, "dev", min_examples=5)
        assert trained is False
        assert version == DEFAULT_MODEL_VERSION
        assert isinstance(pick_params(store, "dev"), DefaultParams)
        assert store.get_model_meta("dev") is None


def _to_memory_event(ev: StoredEvent, i: int) -> MemoryEvent:
    return MemoryEvent(
        eventId=ev.event_id,
        lemma=ev.lemma,
        type=ev.type,  # type: ignore[arg-type]
        ts=ev.ts,
        deviceId=ev.device_id,
    )
