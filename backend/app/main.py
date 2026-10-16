from fastapi import FastAPI

from app.config import Settings, get_settings
from app.routers import auth, meta, projects


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Woodkeeper")
    app.dependency_overrides[get_settings] = lambda: settings
    app.include_router(meta.router)
    app.include_router(auth.router)
    app.include_router(projects.router)
    if settings.app_env == "test":
        app.include_router(auth.test_router)
    return app


app = create_app()
