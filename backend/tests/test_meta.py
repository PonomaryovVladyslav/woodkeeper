import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_production_requires_secret_key() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="production", _env_file=None)
