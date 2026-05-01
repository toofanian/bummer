"""Vercel Python entry point for the Bummer FastAPI backend.

Lazy import pattern: expose a minimal FastAPI instance at module
load time so Vercel's Python builder can detect the function, then
import the real backend app on the first request. This lets us
surface import errors in the HTTP response body instead of dying
cold-start with FUNCTION_INVOCATION_FAILED.

Once the cutover is clean and the real backend import is stable,
this shim can be collapsed to the one-liner:

    from main import app
"""
import sys
import traceback
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from starlette.types import Receive, Scope, Send

_BACKEND = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


class _LazyApp:
    """ASGI wrapper that imports the real FastAPI app on first call."""

    def __init__(self) -> None:
        self._real_app: FastAPI | None = None
        self._import_error: str | None = None

    def _load(self) -> FastAPI:
        if self._real_app is not None:
            return self._real_app
        if self._import_error is not None:
            return self._error_app()
        try:
            from main import app as real_app  # type: ignore[import-not-found]
            self._real_app = real_app
            return real_app
        except Exception:  # noqa: BLE001
            self._import_error = traceback.format_exc()
            return self._error_app()

    def _error_app(self) -> FastAPI:
        import os

        is_prod = os.getenv("ENVIRONMENT") == "production"
        err = "Internal server error" if is_prod else (self._import_error or "unknown import error")
        error_app = FastAPI()

        @error_app.get("/{full_path:path}")
        async def surface_error(full_path: str) -> PlainTextResponse:
            return PlainTextResponse(
                f"api/index.py failed to import backend/main.py:\n\n{err}",
                status_code=500,
            )

        return error_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        target = self._load()

        # Vercel routes /api/* to this function without stripping the
        # /api prefix, so the ASGI scope path arrives as e.g.
        # /api/library/albums. The FastAPI app registers its routes
        # without the /api prefix (so local dev at localhost:8000 keeps
        # working), so we strip /api here on the way in.
        if scope.get("type") in ("http", "websocket"):
            path = scope.get("path", "")
            if path.startswith("/api/"):
                new_path = path[len("/api"):]  # '/api/health' -> '/health'
                scope = {**scope, "path": new_path, "raw_path": new_path.encode()}
            elif path == "/api":
                scope = {**scope, "path": "/", "raw_path": b"/"}

        await target(scope, receive, send)


app = _LazyApp()

__all__ = ["app"]
