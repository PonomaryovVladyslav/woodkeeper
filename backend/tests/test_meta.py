import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.openapi import build_schema


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_production_requires_secret_key() -> None:
    with pytest.raises(ValidationError):
        Settings(app_env="production", _env_file=None)


def test_config_is_public(client: TestClient) -> None:
    response = client.get("/api/config")
    assert response.status_code == 200
    assert response.json() == {"google_client_id": "test-client-id"}


def test_openapi_export_is_stable_and_has_no_test_routes() -> None:
    schema = build_schema()
    assert schema == build_schema()
    assert '"/api/auth/me"' in schema
    assert "test-login" not in schema
