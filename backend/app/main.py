from fastapi import FastAPI

from app.routers import meta


def create_app() -> FastAPI:
    app = FastAPI(title="Woodkeeper")
    app.include_router(meta.router)
    return app


app = create_app()
