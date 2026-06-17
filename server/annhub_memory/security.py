"""Bearer-token authentication for the memory-sync API.

The client always sends ``Authorization: Bearer <token>`` where ``<token>`` is the
anonymous ``deviceId`` (fallback) or an account token (design §3 / §4). Two modes:

* **lenient** (default): any non-empty bearer is accepted. This honours the
  contract shape — a bearer is *present* — without requiring an auth database, and
  matches the anonymous-device rollout.
* **shared_secret**: when ``ANNHUB_AUTH_SHARED_SECRET`` is set, the bearer must
  equal it. Use this for a single-tenant deployment where the client is
  configured with the same secret as its token.

A missing/empty bearer is always rejected with 401 (the contract requires the
header on every request).
"""

from __future__ import annotations

from fastapi import Header, HTTPException, status

from .config import Settings


def require_bearer(settings: Settings) -> None:
    """FastAPI dependency: validate the ``Authorization`` header against settings."""

    async def dependency(authorization: str | None = Header(default=None)) -> str:
        token = _extract_token(authorization)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="missing or malformed Authorization bearer",
                headers={"WWW-Authenticate": f'Bearer realm="{settings.auth_realm}"'},
            )
        if settings.auth_mode == "shared_secret" and token != settings.auth_shared_secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid bearer token",
                headers={"WWW-Authenticate": f'Bearer realm="{settings.auth_realm}"'},
            )
        return token

    return dependency


def _extract_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return ""
    return parts[1].strip()
