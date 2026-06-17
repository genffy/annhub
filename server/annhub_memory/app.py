"""FastAPI application implementing the memory-sync REST contract.

Endpoints (all require ``Authorization: Bearer <token>`` except health checks):

* ``POST   /v1/memory/events``        — idempotent batch ingest (design §3.1)
* ``POST   /v1/memory/recall``        — per-lemma recall states (design §3.2)
* ``GET    /v1/memory/recall``        — same, lemmas as comma-separated query
* ``DELETE /v1/memory/events``        — GDPR wipe of a device's data (design §4)
* ``POST   /v1/memory/train``         — admin: refit HLR for a device (T1-D)
* ``GET    /healthz`` / ``GET /``     — liveness
"""

from __future__ import annotations

import time
from typing import Iterable

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status

from . import __version__
from .config import Settings, load_settings
from .model import (
    DEFAULT_MODEL_VERSION,
    compute_snapshot,
    pick_params,
    snapshot_to_recall,
    train_identity,
)
from .schemas import (
    Dsr,
    ErrorResponse,
    EventBatchRequest,
    EventBatchResponse,
    RecallRequest,
    RecallResponse,
    RecallState,
    TrainResponse,
)
from .security import require_bearer
from .store import EventStore


def _now_ms() -> int:
    return int(time.time() * 1000)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build a configured app. Tests pass ``Settings(database_path=":memory:")``."""
    settings = settings or load_settings()
    store = EventStore(settings.database_path)

    app = FastAPI(
        title="AnnHub Memory Sync",
        version=__version__,
        description="Server-side personalization for vocabulary recall (T1-C/T1-D).",
    )
    app.state.settings = settings
    app.state.store = store
    auth = Depends(require_bearer(settings))

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # pragma: no cover - trivial
        store.close()

    # ── health ──────────────────────────────────────────────────────────────

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, object]:
        return {"status": "ok", "version": __version__}

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, object]:
        return {
            "service": "annhub-memory",
            "version": __version__,
            "contract": "/v1/memory/events, /v1/memory/recall",
        }

    # ── POST /v1/memory/events ──────────────────────────────────────────────

    @app.post(
        "/v1/memory/events",
        response_model=EventBatchResponse,
        tags=["memory"],
        dependencies=[auth],
        responses={
            413: {"model": ErrorResponse, "description": "Batch exceeds the size cap."},
        },
    )
    async def post_events(payload: EventBatchRequest) -> EventBatchResponse:
        if len(payload.events) > settings.max_batch_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"event batch size {len(payload.events)} exceeds cap "
                    f"{settings.max_batch_size}; split into smaller batches"
                ),
            )
        result = store.ingest_events(payload.deviceId, payload.events)
        return EventBatchResponse(
            accepted=result.accepted,
            duplicates=result.duplicates,
            serverTime=_now_ms(),
        )

    # ── recall (shared core) ────────────────────────────────────────────────

    def _build_states(
        device_id: str, lemmas: Iterable[str], now_ms: int
    ) -> tuple[list[RecallState], str]:
        params = pick_params(store, device_id)
        states: list[RecallState] = []
        for raw in lemmas:
            lemma = raw.strip().lower()
            if not lemma:
                continue
            events = store.get_events_for_lemma(device_id, lemma)
            snapshot = compute_snapshot(events, now_ms, params)
            if snapshot is None:
                # Not covered by any history → omit (client falls back to local).
                continue
            recall = snapshot_to_recall(snapshot, now_ms)
            states.append(
                RecallState(
                    lemma=lemma,
                    recall=recall,
                    dsr=Dsr(
                        difficulty=snapshot.difficulty,
                        stability=snapshot.stability,
                        retrievability=recall,
                    ),
                    computedAt=now_ms,
                    modelVersion=params.model_version,
                )
            )
        return states, params.model_version

    @app.post(
        "/v1/memory/recall",
        response_model=RecallResponse,
        tags=["memory"],
        dependencies=[auth],
    )
    async def post_recall(payload: RecallRequest) -> RecallResponse:
        now_ms = _now_ms()
        states, model_version = _build_states(payload.deviceId, payload.lemmas, now_ms)
        return RecallResponse(
            states=states,
            modelVersion=model_version,
            ttlSeconds=settings.ttl_seconds,
        )

    @app.get(
        "/v1/memory/recall",
        response_model=RecallResponse,
        tags=["memory"],
        dependencies=[auth],
    )
    async def get_recall(
        deviceId: str = Query(..., min_length=1),
        lemmas: str = Query(..., description="Comma-separated lemmas."),
    ) -> RecallResponse:
        now_ms = _now_ms()
        parsed = [chunk for chunk in lemmas.split(",")]
        states, model_version = _build_states(deviceId, parsed, now_ms)
        return RecallResponse(
            states=states,
            modelVersion=model_version,
            ttlSeconds=settings.ttl_seconds,
        )

    # ── GDPR wipe ───────────────────────────────────────────────────────────

    @app.delete(
        "/v1/memory/events",
        tags=["memory"],
        dependencies=[auth],
        responses={200: {"description": "Number of events deleted."}},
    )
    async def delete_device(
        deviceId: str = Query(..., min_length=1, description="Device to wipe."),
    ) -> dict[str, object]:
        deleted = store.delete_device(deviceId)
        return {"deviceId": deviceId, "deleted": deleted}

    # ── admin: train (T1-D) ─────────────────────────────────────────────────

    @app.post(
        "/v1/memory/train",
        response_model=TrainResponse,
        tags=["admin"],
        dependencies=[auth],
    )
    async def post_train(
        deviceId: str = Query(..., min_length=1, description="Device to fit."),
    ) -> TrainResponse:
        trained, examples, version = train_identity(
            store, deviceId, min_examples=settings.min_events_to_train
        )
        return TrainResponse(
            scope=deviceId,
            trained=trained,
            examples=examples,
            modelVersion=version,
            message=(
                f"HLR model fitted from {examples} labelled examples"
                if trained
                else (
                    f"not enough labelled examples ({examples} < "
                    f"{settings.min_events_to_train}); keeping default model"
                )
            ),
        )

    return app
