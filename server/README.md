# AnnHub Memory Sync Server

Reference Python backend for the **T1 cross-device vocabulary-memory model**
(`docs/vocab-server-memory-model-design.md`). It implements the **frozen REST
contract** the extension already speaks (T1-A/T1-B), so flipping on
`VocabConfig.memorySyncEnabled` + pointing `memorySyncEndpoint` here is all that's
needed for end-to-end cross-device recall.

> The extension's local `WordMemory` model is **always** the offline source of
> truth (design §1). This server is an *optional enhancement*: offline, unsigned,
> or un-configured → the extension fully falls back to local. Nothing here is on
> the WXT/Node critical path — this folder has its own venv and never touches the
> extension build.

## What it implements

| Milestone | Status | What |
| --------- | ------ | ---- |
| **T1-C** | ✅ | Idempotent `POST /v1/memory/events` ingest + `POST|GET /v1/memory/recall` using a deterministic FSRS-lite model (default params, mirrors `entrypoints/content/annotation-core/word-memory.ts`). |
| **T1-D** | ✅ | Half-Life Regression (HLR) training from a device's event history; recall then uses the fitted weights; `modelVersion` flips to `hlr-v1`. |
| **T2** | — | Context-difficulty (CWI/LCP) + LLM word-sense CEFR. Not in scope here yet. |

## Contract (frozen — `docs/vocab-server-memory-model-design.md` §3)

All routes require `Authorization: Bearer <deviceId-or-token>` and return JSON.

| Method | Path | Body / Query | Response |
| ------ | ---- | ------------ | -------- |
| `POST` | `/v1/memory/events` | `{deviceId, events: MemoryEvent[]}` (≤500/batch) | `{accepted, duplicates, serverTime}` — idempotent, dedup by `(deviceId, eventId)` |
| `POST` | `/v1/memory/recall` | `{deviceId, lemmas: string[]}` | `{states: RecallState[], modelVersion, ttlSeconds}` — uncovered lemmas omitted |
| `GET` | `/v1/memory/recall` | `?deviceId=…&lemmas=a,b,c` | same |
| `DELETE` | `/v1/memory/events` | `?deviceId=…` | `{deviceId, deleted}` — GDPR wipe of a device's data |
| `POST` | `/v1/memory/train` | `?deviceId=…` | admin: refit HLR for a device |

`MemoryEvent` and `RecallState` are a **1:1 mirror** of `types/vocabulary.ts`
(see `annhub_memory/schemas.py`). The schema carries only `lemma + type + ts +
counts` — never sentence / URL / page content (privacy contract §4, enforced
structurally in `tests/test_privacy.py`).

## Quick start

```bash
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt

.venv/bin/python -m annhub_memory.runner serve --port 8000   # http://127.0.0.1:8000/docs
.venv/bin/python -m pytest                                    # 68 tests
```

Then in the extension, set `memorySyncEndpoint = http://127.0.0.1:8000` and turn
on `memorySyncEnabled`.

### CLI

```bash
.venv/bin/python -m annhub_memory.runner train --device anon-abc   # fit HLR, then exit
.venv/bin/python -m annhub_memory.runner wipe  --device anon-abc   # GDPR delete, then exit
```

## Configuration (env, all optional)

| Var | Default | Meaning |
| --- | ------- | ------- |
| `ANNHUB_DB_PATH` | `data/annhub_memory.db` | SQLite path (`:memory:` = in-process, tests). |
| `ANNHUB_MAX_BATCH_SIZE` | `500` | Events accepted per `/events` batch (413 over). |
| `ANNHUB_RECALL_TTL_SECONDS` | `86400` | Cache TTL advertised to clients. |
| `ANNHUB_MIN_EVENTS_TO_TRAIN` | `20` | Cold-start guard for HLR (fewer → keep default). |
| `ANNHUB_AUTH_SHARED_SECRET` | _(empty)_ | If set, bearer must equal it; else any non-empty bearer (anon-device mode). |
| `ANNHUB_AUTH_REALM` | `annhub-memory` | `WWW-Authenticate` realm on 401. |

See `.env.example`.

## Architecture

```
annhub_memory/
├── app.py        # FastAPI app factory + routes (events / recall / train / wipe)
├── schemas.py    # Pydantic models = frozen contract (MemoryEvent, RecallState, …)
├── store.py      # SQLite EventStore: idempotent ingest, per-lemma reads, GDPR wipe
├── model.py      # recall model: DefaultParams (FSRS-lite) + TrainedParams (HLR)
├── security.py   # bearer auth dependency (lenient / shared_secret modes)
├── config.py     # env-driven Settings
└── runner.py     # CLI: serve / train / wipe
tests/            # 68 tests: events, recall, model, store, security, privacy, train
```

**Single source of truth = the `events` table.** Recall states are *computed*
from events on demand (`model.compute_snapshot`), never stored, so they cannot
go stale. Only trained HLR weights are persisted (`model_meta`).

**Two estimators, one recall formula.** Both produce a stability (half-life in
days) and both use `recall = 2 ** (-elapsedDays / stability)` — identical to the
client — so turning sync on never weakens an explicit "known":

- `DefaultParams` (T1-C): deterministic per-event update cloning `word-memory.ts`.
- `TrainedParams` (T1-D): `half-life = 2 ** (θ · [1, ln(1+seen), correct_frac])`,
  fitted by gradient descent on cross-entropy over explicit-feedback events
  (`known/skip` → label 1, `unknown/addToVocab/reveal` → label 0).

**Idempotency** is storage-layer: `(device_id, event_id)` is the primary key, so
a client retry is a no-op while two devices with coincidentally-equal event ids
stay independent (design §3.1 "重发安全").

**Privacy / GDPR** (§4): no sentence/URL/content fields exist in the schema;
`DELETE /v1/memory/events?deviceId=…` wipes a device's events and its trained
model in one transaction.

## Identity scope

Recall and training are scoped by the request's `deviceId` (anonymous). True
cross-device aggregation via `accountId` is the documented next step (design §8)
and does not change the contract — only the scope key passed to `pick_params`.

## Run in production

```bash
.venv/bin/pip install -r requirements.txt
ANNHUB_AUTH_SHARED_SECRET=… ANNHUB_DB_PATH=/var/lib/annhub/memory.db \
  .venv/bin/uvicorn annhub_memory.app:create_app --factory --host 0.0.0.0 --port 8000
```

Put a TLS-terminating reverse proxy in front and set `ANNHUB_AUTH_SHARED_SECRET`
(then configure the client's token to match). SQLite handles the single-writer
read-heavy profile of this workload; swap `store.py` for Postgres if you need
horizontal write scale — the rest of the code is storage-agnostic through the
`EventStore` interface.
