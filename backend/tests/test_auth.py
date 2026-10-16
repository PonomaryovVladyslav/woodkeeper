import re
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.oauth2 import id_token
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import auth
from app.auth import SESSION_COOKIE, SESSION_MAX_AGE, read_session, sign_session
from app.config import Settings, get_settings
from app.main import create_app
from app.models import User

PUBLIC_ROUTES = {
    ("GET", "/api/health"),
    ("GET", "/api/config"),
    ("POST", "/api/auth/google"),
    ("POST", "/api/auth/logout"),
    ("POST", "/api/auth/test-login"),
}


def users_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User)) or 0


# --- session token ---


def test_session_roundtrip() -> None:
    assert read_session(sign_session(42, "s"), "s") == 42


def test_session_wrong_secret() -> None:
    assert read_session(sign_session(42, "s"), "other") is None


@pytest.mark.parametrize("token", ["", ".", "garbage", "a.b", "a.b.c"])
def test_session_malformed(token: str) -> None:
    assert read_session(token, "s") is None


def test_session_tampered_payload() -> None:
    payload, sig = sign_session(42, "s").split(".")
    forged = sign_session(1, "s").split(".")[0]
    assert read_session(f"{forged}.{sig}", "s") is None
    assert read_session(f"{payload}.{sig}x", "s") is None


def test_session_expiry() -> None:
    now = time.time()
    token = sign_session(42, "s", now=now)
    assert read_session(token, "s", now=now + SESSION_MAX_AGE - 1) == 42
    assert read_session(token, "s", now=now + SESSION_MAX_AGE) is None


# --- POST /api/auth/google ---


def test_google_login_creates_user_and_sets_cookie(client: TestClient, db_session: Session) -> None:
    response = client.post("/api/auth/google", json={"credential": "valid:alice"})

    assert response.status_code == 200
    assert response.json()["email"] == "alice@example.com"
    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith(f"{SESSION_COOKIE}=")
    assert "HttpOnly" in set_cookie
    assert re.search(r"SameSite=lax", set_cookie, re.IGNORECASE)
    assert f"Max-Age={SESSION_MAX_AGE}" in set_cookie
    assert "Secure" not in set_cookie
    assert users_count(db_session) == 1


def test_google_login_again_updates_same_user(
    client: TestClient, app: FastAPI, db_session: Session
) -> None:
    first = client.post("/api/auth/google", json={"credential": "valid:alice"}).json()

    user = db_session.scalar(select(User))
    assert user is not None
    user.email, user.name = "old@example.com", "Old"
    db_session.commit()

    second = client.post("/api/auth/google", json={"credential": "valid:alice"}).json()

    assert second["id"] == first["id"]
    assert second["email"] == "alice@example.com"
    assert second["name"] == "Alice"
    assert users_count(db_session) == 1


def test_google_login_invalid_token(client: TestClient, db_session: Session) -> None:
    response = client.post("/api/auth/google", json={"credential": "forged"})

    assert response.status_code == 401
    assert "set-cookie" not in response.headers
    assert users_count(db_session) == 0


def test_google_login_empty_credential(client: TestClient) -> None:
    assert client.post("/api/auth/google", json={"credential": ""}).status_code == 422


def test_google_login_not_configured(settings: Settings) -> None:
    app = create_app(settings.model_copy(update={"google_client_id": ""}))
    with TestClient(app) as client:
        response = client.post("/api/auth/google", json={"credential": "valid:alice"})
    assert response.status_code == 503


def test_secure_cookie_in_production(app: FastAPI, settings: Settings) -> None:
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"app_env": "production"}
    )
    with TestClient(app) as client:
        response = client.post("/api/auth/google", json={"credential": "valid:alice"})
    assert "Secure" in response.headers["set-cookie"]


# --- /me, logout ---


def test_me_without_cookie(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_after_login(client: TestClient) -> None:
    client.post("/api/auth/google", json={"credential": "valid:alice"})
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "alice@example.com"


def test_me_with_forged_cookie(user_client: TestClient) -> None:
    token = user_client.cookies[SESSION_COOKIE]
    payload, sig = token.split(".")
    user_client.cookies.set(SESSION_COOKIE, f"{payload}.{sig[:-2]}AA")
    assert user_client.get("/api/auth/me").status_code == 401


def test_me_with_cookie_signed_by_other_secret(client: TestClient, user_client: TestClient) -> None:
    user_id = user_client.get("/api/auth/me").json()["id"]
    client.cookies.set(SESSION_COOKIE, sign_session(user_id, "attacker-secret"))
    assert client.get("/api/auth/me").status_code == 401


def test_me_with_expired_cookie(client: TestClient, user_client: TestClient) -> None:
    user_id = user_client.get("/api/auth/me").json()["id"]
    expired = sign_session(user_id, "test-secret", now=time.time() - SESSION_MAX_AGE - 1)
    client.cookies.set(SESSION_COOKIE, expired)
    assert client.get("/api/auth/me").status_code == 401


def test_me_for_deleted_user(user_client: TestClient, db_session: Session) -> None:
    db_session.execute(delete(User))
    db_session.commit()
    assert user_client.get("/api/auth/me").status_code == 401


def test_logout(user_client: TestClient) -> None:
    response = user_client.post("/api/auth/logout")

    assert response.status_code == 204
    assert f'{SESSION_COOKIE}=""' in response.headers["set-cookie"]
    assert user_client.get("/api/auth/me").status_code == 401


def test_two_clients_are_different_users(user_client: TestClient, other_client: TestClient) -> None:
    a = user_client.get("/api/auth/me").json()
    b = other_client.get("/api/auth/me").json()
    assert a["id"] != b["id"]


# --- test-login ---


@pytest.mark.parametrize("env", ["development", "production"])
def test_test_login_absent_outside_test_env(settings: Settings, env: str) -> None:
    app = create_app(settings.model_copy(update={"app_env": env}))
    with TestClient(app) as client:
        response = client.post("/api/auth/test-login", json={"sub": "x", "email": "x@example.com"})
    assert response.status_code == 404


# --- every non-public endpoint requires a session ---


def protected_routes(app: FastAPI) -> list[tuple[str, str]]:
    routes = []
    for path, operations in app.openapi()["paths"].items():
        for method in operations:
            if (method.upper(), path) not in PUBLIC_ROUTES:
                routes.append((method.upper(), re.sub(r"\{[^}]+\}", "1", path)))
    return routes


def test_protected_routes_list_is_not_empty(app: FastAPI) -> None:
    assert ("GET", "/api/auth/me") in protected_routes(app)


def test_every_protected_route_requires_auth(app: FastAPI, client: TestClient) -> None:
    for method, path in protected_routes(app):
        response = client.request(method, path, json={})
        assert response.status_code == 401, f"{method} {path} -> {response.status_code}"


# --- verify_google_token (google-auth is patched, no network) ---


def test_verify_google_token_maps_claims(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    def fake(credential: str, _request: object, audience: str, **_: object) -> dict[str, str]:
        calls.append((credential, audience))
        return {"sub": "123", "email": "a@example.com", "name": "A", "picture": "https://p"}

    monkeypatch.setattr(id_token, "verify_oauth2_token", fake)
    identity = auth.verify_google_token("tok", "client-id")

    assert calls == [("tok", "client-id")]
    assert identity == auth.GoogleIdentity("123", "a@example.com", "A", "https://p")


def test_verify_google_token_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake(*_: object, **__: object) -> dict[str, str]:
        raise ValueError("Token expired")

    monkeypatch.setattr(id_token, "verify_oauth2_token", fake)
    with pytest.raises(auth.InvalidTokenError):
        auth.verify_google_token("tok", "client-id")


def test_token_verifier_uses_configured_client_id(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    audiences: list[str] = []

    def fake(_credential: str, _request: object, audience: str, **_: object) -> dict[str, str]:
        audiences.append(audience)
        return {"sub": "1", "email": "a@example.com"}

    monkeypatch.setattr(id_token, "verify_oauth2_token", fake)
    auth.get_token_verifier(settings)("tok")
    assert audiences == ["test-client-id"]
