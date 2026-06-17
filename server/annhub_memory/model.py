"""The memory / recall model.

Two interchangeable estimators of a word's current recall probability:

* :class:`DefaultParams` (T1-C, **no training**) — a deterministic per-event
  update that mirrors the extension's local ``word-memory.ts`` semantics. This is
  the cold-start path: server recall ≈ local recall, so turning on sync never
  weakens an explicit "known".
* :class:`TrainedParams` (T1-D) — Half-Life Regression weights fitted from the
  device's own event history. When available it overrides the default.

Both share the same recall formula ``recall = 2 ** (-elapsedDays / stability)``
and both feed the FSRS-style DSR triple, so the response shape is identical
regardless of which estimator produced it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Sequence

from .schemas import MemoryEvent
from .store import EventStore, ModelMeta, StoredEvent

# ── constants (mirrors entrypoints/content/annotation-core/word-memory.ts) ──
DAY_MS = 24 * 60 * 60 * 1000

INITIAL_STABILITY = 1.0
MIN_STABILITY = 0.25
MAX_STABILITY = 365.0 * 2
SEEN_STABILITY_GROWTH = 1.6
KNOWN_STABILITY = 180.0
SKIP_STABILITY = MAX_STABILITY
UNKNOWN_STABILITY = 0.5

# Difficulty (FSRS D-scale, 1 easy … 10 hard) bookkeeping for the DSR triple.
INITIAL_DIFFICULTY = 5.0
MIN_DIFFICULTY = 1.0
MAX_DIFFICULTY = 10.0
DIFFICULTY_EASE = 0.15  # seen/known/skip → slightly easier
DIFFICULTY_PENALTY = 0.8  # unknown/addToVocab → harder

DEFAULT_MODEL_VERSION = "fsrs-default-v1"
TRAINED_MODEL_VERSION = "hlr-v1"

#: Interaction types that count as "the user knew the word" for training labels
#: and the difficulty tracker.
POSITIVE_TYPES = {"known", "skip"}
#: Interaction types that count as "the user did not know the word".
NEGATIVE_TYPES = {"unknown", "addToVocab", "reveal"}
#: Types that carry an explicit right/wrong label usable for HLR supervision.
LABELLED_TYPES = POSITIVE_TYPES | NEGATIVE_TYPES

_LN2 = math.log(2.0)


# ── params ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class DefaultParams:
    """Deterministic per-event update (no learned weights)."""

    @property
    def model_version(self) -> str:
        return DEFAULT_MODEL_VERSION


@dataclass(frozen=True)
class TrainedParams:
    """Half-Life Regression weights: ``h = 2 ** (theta · x)``.

    Feature order (3-dim): ``[bias=1, ln(1+seen), correct_frac]``.
    """

    weights: tuple[float, ...]
    examples: int = 0

    @property
    def model_version(self) -> str:
        return TRAINED_MODEL_VERSION


ModelParams = DefaultParams | TrainedParams


# ── helpers ─────────────────────────────────────────────────────────────────


def clamp(value: float, lo: float, hi: float) -> float:
    if not math.isfinite(value):
        return lo
    return max(lo, min(hi, value))


def clamp_stability(days: float) -> float:
    return clamp(days, MIN_STABILITY, MAX_STABILITY)


def clamp_difficulty(d: float) -> float:
    return clamp(d, MIN_DIFFICULTY, MAX_DIFFICULTY)


def elapsed_days(last_seen_ts: int | None, now_ms: int) -> float:
    if last_seen_ts is None:
        return 0.0
    return max(0.0, (now_ms - last_seen_ts) / DAY_MS)


def recall_from_stability(stability_days: float, last_seen_ts: int | None, now_ms: int) -> float:
    """``recall = 2 ** (-elapsedDays / stability)`` (same formula as the client)."""
    s = clamp_stability(stability_days)
    days = elapsed_days(last_seen_ts, now_ms)
    if s <= 0:
        return 0.0
    recall = math.pow(2.0, -days / s)
    return clamp(recall, 0.0, 1.0)


# ── deterministic walk (shared difficulty tracker + default stability) ───────


@dataclass(frozen=True)
class WordSnapshot:
    """Aggregated state of one lemma's history, sufficient for a RecallState."""

    stability: float
    difficulty: float
    seen_count: int
    last_seen_ts: int | None


def _deterministic_walk(events: Sequence[StoredEvent]) -> WordSnapshot:
    """Replay events in time order, applying the word-memory.ts stability rules.

    The resulting ``stability`` is the default-model half-life; ``difficulty`` is
    always computed here (it's descriptive, not part of any recall formula).
    """
    stability = INITIAL_STABILITY
    difficulty = INITIAL_DIFFICULTY
    seen = 0
    last_ts: int | None = None

    for e in events:
        seen += 1
        etype = e.type
        if etype in ("seen", "reveal"):
            stability = clamp_stability(stability * SEEN_STABILITY_GROWTH)
        elif etype == "known":
            stability = clamp_stability(max(stability, KNOWN_STABILITY))
        elif etype == "skip":
            stability = clamp_stability(SKIP_STABILITY)
        elif etype in ("unknown", "addToVocab"):
            stability = clamp_stability(min(stability, UNKNOWN_STABILITY))
        # difficulty tracker (FSRS-ish): success eases, failure hardens.
        if etype in NEGATIVE_TYPES:
            difficulty = clamp_difficulty(difficulty + DIFFICULTY_PENALTY)
        else:
            difficulty = clamp_difficulty(difficulty - DIFFICULTY_EASE)
        last_ts = e.ts

    return WordSnapshot(
        stability=stability,
        difficulty=difficulty,
        seen_count=seen,
        last_seen_ts=last_ts,
    )


def _aggregate_features(events: Sequence[StoredEvent]) -> tuple[int, int, int]:
    """Return ``(total_seen, explicit_count, positive_count)`` for a lemma."""
    total = 0
    explicit = 0
    positive = 0
    for e in events:
        total += 1
        if e.type in LABELLED_TYPES:
            explicit += 1
            if e.type in POSITIVE_TYPES:
                positive += 1
    return total, explicit, positive


def _trained_half_life(params: TrainedParams, seen: int, correct_frac: float) -> float:
    bias, seen_coef, correct_coef = params.weights
    log_seen = math.log1p(seen)
    exponent = bias + seen_coef * log_seen + correct_coef * correct_frac
    return math.pow(2.0, exponent)


# ── public: snapshot + recall ───────────────────────────────────────────────


def compute_snapshot(
    events: Sequence[StoredEvent], now_ms: int, params: ModelParams
) -> WordSnapshot | None:
    """Aggregate a lemma's events into a snapshot under the given params.

    Returns ``None`` when there is no history (the lemma is "not covered" and the
    caller omits it from the response — see design §3.2).
    """
    if not events:
        return None

    # Order-independence (design §3.1): always replay by time regardless of the
    # order the caller supplies. (The store already returns sorted rows, but the
    # model must not depend on that.)
    ordered = sorted(events, key=lambda e: (e.ts, e.event_id))
    base = _deterministic_walk(ordered)  # always gives difficulty + seen + last_ts

    if isinstance(params, TrainedParams):
        total, explicit, positive = _aggregate_features(events)
        correct_frac = (positive / explicit) if explicit else 0.5
        stability = clamp_stability(_trained_half_life(params, total, correct_frac))
        return WordSnapshot(
            stability=stability,
            difficulty=base.difficulty,
            seen_count=base.seen_count,
            last_seen_ts=base.last_seen_ts,
        )

    return base  # DefaultParams


def snapshot_to_recall(snapshot: WordSnapshot, now_ms: int) -> float:
    return recall_from_stability(snapshot.stability, snapshot.last_seen_ts, now_ms)


# ── HLR training (T1-D) ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class TrainingExample:
    features: tuple[float, float, float]  # [1, ln(1+seen), correct_frac]
    label: float  # 1.0 known, 0.0 unknown
    delta_days: float


def build_training_examples(events_by_lemma: Iterable[Sequence[StoredEvent]]) -> list[TrainingExample]:
    """Materialize labelled HLR examples from per-lemma event timelines.

    For each *explicit-feedback* event we know whether the user recalled the word,
    so it becomes a supervised point. The features describe the history *before*
    that event; ``delta_days`` is the gap to the previous interaction (degenerate
    zero-gap points are dropped — they carry no forgetting signal).
    """
    examples: list[TrainingExample] = []
    for timeline in events_by_lemma:
        ordered = sorted(timeline, key=lambda e: (e.ts, e.event_id))
        prior_seen = 0
        prior_explicit = 0
        prior_positive = 0
        last_ts: int | None = None
        for e in ordered:
            if e.type in LABELLED_TYPES:
                delta = e.delta_days if e.delta_days is not None else (
                    (e.ts - last_ts) / DAY_MS if last_ts is not None else 0.0
                )
                if delta > 0:
                    correct_frac = (prior_positive / prior_explicit) if prior_explicit else 0.5
                    features = (1.0, math.log1p(prior_seen), correct_frac)
                    label = 1.0 if e.type in POSITIVE_TYPES else 0.0
                    examples.append(TrainingExample(features, label, delta))
            # advance the running counters *after* using them for this event
            prior_seen += 1
            if e.type in LABELLED_TYPES:
                prior_explicit += 1
                if e.type in POSITIVE_TYPES:
                    prior_positive += 1
            last_ts = e.ts
    return examples


def _half_life_from_weights(weights: Sequence[float], features: Sequence[float]) -> float:
    return math.pow(2.0, sum(w * f for w, f in zip(weights, features)))


def _predict_recall(weights: Sequence[float], ex: TrainingExample) -> float:
    h = _half_life_from_weights(weights, ex.features)
    if h <= 0:
        return 0.0
    return clamp(math.pow(2.0, -ex.delta_days / h), 1e-6, 1 - 1e-6)


def _cross_entropy_loss(weights: Sequence[float], examples: Sequence[TrainingExample]) -> float:
    if not examples:
        return 0.0
    total = 0.0
    for ex in examples:
        p = _predict_recall(weights, ex)
        total += -(ex.label * math.log(p) + (1 - ex.label) * math.log(1 - p))
    return total / len(examples)


def train_hlr(
    examples: Sequence[TrainingExample],
    *,
    learning_rate: float = 0.05,
    iterations: int = 2000,
    l2: float = 1e-3,
    init: Sequence[float] | None = None,
) -> tuple[tuple[float, ...], list[float]]:
    """Fit Half-Life Regression weights by gradient descent on cross-entropy.

    Returns ``(weights, loss_history)``. ``loss_history[0]`` is the initial loss,
    ``loss_history[-1]`` the final loss; a healthy fit ends strictly lower.
    """
    if not examples:
        return (0.0, 0.3, 0.5), [0.0]

    n_features = len(examples[0].features)
    weights = list(init) if init is not None else [0.0] * n_features
    loss_history: list[float] = []

    for it in range(iterations):
        loss_history.append(_cross_entropy_loss(weights, examples))
        grad = [0.0] * n_features
        for ex in examples:
            p = _predict_recall(weights, ex)
            # dL/dθ_i = (p - y) * delta * (ln2)^2 * x_i / ((1 - p) * h)
            h = _half_life_from_weights(weights, ex.features)
            common = (p - ex.label) * ex.delta_days * (_LN2 ** 2) / ((1.0 - p) * max(h, 1e-9))
            for i, fi in enumerate(ex.features):
                grad[i] += common * fi
        m = len(examples)
        for i in range(n_features):
            grad[i] = grad[i] / m + l2 * weights[i]  # L2 regularization
            weights[i] = clamp(weights[i] - learning_rate * grad[i], -5.0, 5.0)

    loss_history.append(_cross_entropy_loss(weights, examples))
    return tuple(weights), loss_history


# ── scope orchestration ─────────────────────────────────────────────────────


def pick_params(store: EventStore, scope: str) -> ModelParams:
    """Resolve the estimator for a device: trained weights if present, else default."""
    meta = store.get_model_meta(scope)
    if meta is not None:
        return TrainedParams(weights=tuple(meta.weights), examples=meta.examples)
    return DefaultParams()


def train_identity(
    store: EventStore, device_id: str, *, min_examples: int
) -> tuple[bool, int, str]:
    """Train (or refresh) the HLR model for one device.

    Returns ``(trained, examples_used, model_version)``. When there are too few
    labelled examples the default model is kept and ``trained=False`` is reported
    (cold-start safety — see design §8).
    """
    timelines = [store.get_events_for_lemma(device_id, lemma) for lemma in store.iter_lemmas(device_id)]
    examples = build_training_examples(timelines)
    if len(examples) < min_examples:
        return False, len(examples), DEFAULT_MODEL_VERSION

    weights, _loss = train_hlr(examples)
    import time

    meta = ModelMeta(
        scope=device_id,
        weights=list(weights),
        model_version=TRAINED_MODEL_VERSION,
        trained_at=int(time.time() * 1000),
        examples=len(examples),
    )
    store.upsert_model_meta(meta)
    return True, len(examples), TRAINED_MODEL_VERSION
