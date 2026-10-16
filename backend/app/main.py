from fastapi import FastAPI

from app.config import Settings, get_settings
from app.routers import auth, boards, meta, projects
from app.static import mount_frontend


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Woodkeeper")
    app.dependency_overrides[get_settings] = lambda: settings
    app.include_router(meta.router)
    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(boards.router)
    if settings.app_env == "test":
        app.include_router(auth.test_router)
    # Last: the SPA fallback catches every GET that no API route matched.
    if settings.static_dir is not None:
        mount_frontend(app, settings.static_dir)
    return app


app = create_app()
