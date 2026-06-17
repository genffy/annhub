"""AnnHub vocabulary memory-sync server (T1-C / T1-D).

Reference backend implementing the REST contract frozen in
``docs/vocab-server-memory-model-design.md`` §3:

* ``POST /v1/memory/events`` — idempotent batch ingest (dedup by ``eventId``)
* ``POST|GET /v1/memory/recall`` — server-computed per-lemma recall states
* ``DELETE /v1/memory/events`` — GDPR wipe of a device's data

The server is an *optional enhancement*; the extension's local ``WordMemory`` model
remains the offline source of truth (see design §1). This package is fully
independent of the WXT extension build — it has its own venv and never touches the
Node side.
"""

__version__ = "0.1.0"
