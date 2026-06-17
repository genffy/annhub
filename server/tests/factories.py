"""Shared test factories for building MemoryEvent payloads.

``event()`` returns a plain dict (the JSON shape the client sends over HTTP);
``event_obj()`` wraps it in a validated :class:`MemoryEvent` for direct store/model
tests. Defaults are chosen so the event is valid with no arguments.
"""

from __future__ import annotations

from typing import Any

from annhub_memory.schemas import MemoryEvent

#: Fixed "server now" used across HTTP tests (≈ 2027-01-15). Event timestamps are
#: expressed as offsets from this so recall decay is deterministic.
NOW_MS = 1_800_000_000_000
DAY_MS = 86_400_000


def event(
    *,
    eventId: str = "e1",
    lemma: str = "robust",
    type: str = "seen",
    ts: int = NOW_MS,
    deviceId: str = "anon-1",
    **extra: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "eventId": eventId,
        "lemma": lemma,
        "type": type,
        "ts": ts,
        "deviceId": deviceId,
    }
    payload.update(extra)
    return payload


def event_obj(**kwargs: Any) -> MemoryEvent:
    return MemoryEvent(**event(**kwargs))


def days_ago(days: float, base: int = NOW_MS) -> int:
    """Timestamp `days` before the frozen NOW_MS."""
    return base - int(days * DAY_MS)
