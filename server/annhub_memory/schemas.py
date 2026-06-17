"""Pydantic request/response models — a 1:1 mirror of the frozen TypeScript
contract in ``types/vocabulary.ts`` (``MemoryEvent`` / ``RecallState``) and the
REST shapes in ``docs/vocab-server-memory-model-design.md`` §2–§3.

Keeping the field names and types identical means the client's JSON never needs
translation. Field aliases are avoided on purpose: the client already sends
``camelCase`` and we accept ``camelCase``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

#: Interaction types eligible for upload (``reset`` is local-only, never sent).
MemoryEventType = Literal["seen", "reveal", "known", "unknown", "skip", "addToVocab"]


class Dsr(BaseModel):
    """FSRS difficulty / stability / retrievability triple (design §2.2)."""

    difficulty: float = Field(..., description="Perceived difficulty (FSRS D-scale).")
    stability: float = Field(..., description="Memory half-life in days.")
    retrievability: float = Field(..., description="Recall probability right now (0..1).")


class MemoryEvent(BaseModel):
    """One anonymized "user interacted with a word" event (design §2.1).

    Carries only a normalized lemma + interaction type + time + counts — never the
    sentence, URL, or page content — so it cannot reconstruct what the user read.
    """

    eventId: str = Field(..., min_length=1, description="Client idempotency id.")
    lemma: str = Field(..., min_length=1, description="Normalized lowercased lemma.")
    type: MemoryEventType
    ts: int = Field(..., description="Event time, ms epoch (client clock).")
    deltaDays: float | None = Field(
        default=None, description="Days since the previous interaction (HLR delta)."
    )
    seenCount: int | None = Field(
        default=None, description="Cumulative exposure count at send time."
    )
    localRecall: float | None = Field(
        default=None, description="Local recall estimate (0..1) at send time."
    )
    domain: str | None = Field(default=None, description="Coarse domain/topic label.")
    deviceId: str = Field(..., min_length=1, description="Anonymous device id.")

    @field_validator("lemma")
    @classmethod
    def _normalize_lemma(cls, value: str) -> str:
        # The contract says lemmas are already lowercased by the client; enforce it
        # server-side so dedup/recall aggregation is case-stable.
        return value.strip().lower()

    @field_validator("ts")
    @classmethod
    def _coerce_ts(cls, value: int) -> int:
        # Pydantic already coerces sane numeric strings; reject negatives outright.
        if value < 0:
            raise ValueError("ts must be a non-negative epoch-ms value")
        return value


class EventBatchRequest(BaseModel):
    """Body of ``POST /v1/memory/events`` (design §3.1)."""

    deviceId: str = Field(..., min_length=1)
    events: list[MemoryEvent] = Field(..., min_length=0)


class EventBatchResponse(BaseModel):
    """Response of ``POST /v1/memory/events`` (design §3.1)."""

    accepted: int = Field(..., ge=0, description="Events newly ingested (post-dedup).")
    duplicates: int = Field(..., ge=0, description="Events already known by eventId.")
    serverTime: int = Field(..., description="Server epoch-ms at response time.")


class RecallState(BaseModel):
    """Server model output for one lemma (design §2.2)."""

    lemma: str
    recall: float = Field(..., ge=0.0, le=1.0)
    dsr: Dsr | None = None
    computedAt: int = Field(..., description="When this recall was computed (ms).")
    modelVersion: str


class RecallRequest(BaseModel):
    """Body of ``POST /v1/memory/recall``."""

    deviceId: str = Field(..., min_length=1)
    lemmas: list[str] = Field(..., min_length=0)


class RecallResponse(BaseModel):
    """Response of ``/v1/memory/recall`` (design §3.2)."""

    states: list[RecallState] = Field(
        default_factory=list,
        description="Recall states only for covered lemmas; others are absent.",
    )
    modelVersion: str
    ttlSeconds: int = Field(..., ge=0)


class ErrorResponse(BaseModel):
    """Standard error envelope (also used for 4xx validation messages)."""

    error: str
    detail: str | None = None


class TrainResponse(BaseModel):
    """Response of the admin training endpoint (T1-D)."""

    scope: str
    trained: bool
    examples: int = Field(..., ge=0, description="Labelled training examples used.")
    modelVersion: str
    message: str
