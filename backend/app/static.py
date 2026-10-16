"""Serving the built React app from FastAPI (one image = API + UI, see docs/deploy.md)."""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"
ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


class ImmutableStaticFiles(StaticFiles):
    """Vite puts a content hash into every asset name, so assets can be cached forever."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == status.HTTP_200_OK:
            response.headers["Cache-Control"] = IMMUTABLE
        return response


def mount_frontend(app: FastAPI, static_dir: Path) -> None:
    index = static_dir / "index.html"
    if not index.is_file():
        raise RuntimeError(f"STATIC_DIR has no index.html: {static_dir}")
    root = static_dir.resolve()

    assets = static_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", ImmutableStaticFiles(directory=assets), name="assets")

    # Every method, so that e.g. POST to a missing API route is a JSON 404, not a 405.
    @app.api_route("/{path:path}", methods=ALL_METHODS, include_in_schema=False)
    def spa(path: str, request: Request) -> FileResponse:
        # Unknown API routes stay JSON 404s instead of turning into the app's HTML.
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
        if request.method not in ("GET", "HEAD"):
            raise HTTPException(status.HTTP_405_METHOD_NOT_ALLOWED, "Method Not Allowed")
        # Top-level files from public/ (favicon.svg); never outside the static dir.
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate, headers={"Cache-Control": NO_CACHE})
        # Everything else is a client-side route: React Router decides.
        return FileResponse(index, headers={"Cache-Control": NO_CACHE})
