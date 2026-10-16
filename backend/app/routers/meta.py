from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
