import base64
import hashlib
import hmac
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import User

SESSION_COOKIE = "session"
SESSION_MAX_AGE = 30 * 24 * 60 * 60  # 30 days


class InvalidTokenError(Exception):
    pass


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str | None = None
    picture: str | None = None
    nonce: str | None = None


TokenVerifier = Callable[[str], GoogleIdentity]


def verify_google_token(credential: str, client_id: str) -> GoogleIdentity:
    try:
        claims = id_token.verify_oauth2_token(  # type: ignore[no-untyped-call]
            credential, google_requests.Request(), client_id, clock_skew_in_seconds=10
        )
    except ValueError as exc:
        raise InvalidTokenError(str(exc)) from exc
    return GoogleIdentity(
        sub=claims["sub"],
        email=claims["email"],
        name=claims.get("name"),
        picture=claims.get("picture"),
        nonce=claims.get("nonce"),
    )


def get_token_verifier(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenVerifier:
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google login is not configured")
    client_id = settings.google_client_id
    return lambda credential: verify_google_token(credential, client_id)


# --- session cookie: base64(json payload) + "." + base64(HMAC-SHA256) ---


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _signature(payload: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    return _b64encode(digest)


def sign_session(user_id: int, secret: str, now: float | None = None) -> str:
    expires = int((now if now is not None else time.time()) + SESSION_MAX_AGE)
    payload = _b64encode(json.dumps({"uid": user_id, "exp": expires}).encode())
    return f"{payload}.{_signature(payload, secret)}"


def read_session(token: str, secret: str, now: float | None = None) -> int | None:
    """Returns user id, or None if the token is malformed, forged or expired."""
    payload, _, signature = token.partition(".")
    if not hmac.compare_digest(signature, _signature(payload, secret)):
        return None
    try:
        data = json.loads(_b64decode(payload))
        user_id, expires = int(data["uid"]), int(data["exp"])
    except (ValueError, KeyError, TypeError):
        return None
    if expires <= (now if now is not None else time.time()):
        return None
    return user_id


def set_session_cookie(response: Response, user_id: int, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        sign_session(user_id, settings.secret_key),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
    )


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user_id = read_session(token, settings.secret_key) if token else None
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
