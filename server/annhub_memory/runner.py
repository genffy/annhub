"""Command-line entrypoint: ``python -m annhub_memory.runner``.

* ``serve`` (default) — run the Uvicorn ASGI server.
* ``train --device <id>`` — fit (or refresh) the HLR model for one device and exit.
* ``wipe --device <id>`` — GDPR-delete a device's data.

Examples
--------
::

    python -m annhub_memory.runner serve --port 8000
    python -m annhub_memory.runner train --device anon-abc
    ANNHUB_DB_PATH=./data.db python -m annhub_memory.runner train --device anon-abc
"""

from __future__ import annotations

import argparse
import sys

from .config import load_settings


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="annhub-memory", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="Run the Uvicorn HTTP server.")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true", help="Auto-reload on file changes (dev).")

    train = sub.add_parser("train", help="Fit HLR for a device, then exit.")
    train.add_argument("--device", required=True, help="Anonymous device id to fit.")

    wipe = sub.add_parser("wipe", help="GDPR-delete a device's data, then exit.")
    wipe.add_argument("--device", required=True, help="Anonymous device id to delete.")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    settings = load_settings()

    if args.command == "serve":
        import uvicorn

        uvicorn.run(
            "annhub_memory.app:create_app",
            factory=True,
            host=args.host,
            port=args.port,
            reload=args.reload,
        )
        return 0

    if args.command == "train":
        from .store import EventStore
        from .model import train_identity

        with EventStore(settings.database_path) as store:
            trained, examples, version = train_identity(
                store, args.device, min_examples=settings.min_events_to_train
            )
        if trained:
            print(f"[train] fitted HLR for {args.device}: {examples} examples → {version}")
        else:
            print(
                f"[train] not enough data for {args.device} "
                f"({examples} < {settings.min_events_to_train}); kept default {version}"
            )
        return 0

    if args.command == "wipe":
        from .store import EventStore

        with EventStore(settings.database_path) as store:
            deleted = store.delete_device(args.device)
        print(f"[wipe] deleted {deleted} events for {args.device}")
        return 0

    return 1  # pragma: no cover - argparse enforces a subcommand


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
