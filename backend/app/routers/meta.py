from typing import Annotated

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.schemas import ConfigRead, HealthRead

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health() -> HealthRead:
    return HealthRead(status="ok")


@router.get("/config")
def config(settings: Annotated[Settings, Depends(get_settings)]) -> ConfigRead:
    """Public frontend config, read at runtime so one build works in every environment."""
    return ConfigRead(google_client_id=settings.google_client_id)
