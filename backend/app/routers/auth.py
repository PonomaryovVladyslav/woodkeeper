import contextlib
import hmac
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    CurrentUser,
    GoogleIdentity,
    InvalidTokenError,
    TokenVerifier,
    clear_session_cookie,
    get_token_verifier,
    set_session_cookie,
)
from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.schemas import GoogleNonce, UserRead

router = APIRouter(prefix="/api/auth", tags=["auth"])
test_router = APIRouter(prefix="/api/auth", tags=["auth"])

DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def upsert_user(db: Session, identity: GoogleIdentity) -> User:
    user = db.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        user = User(google_sub=identity.sub)
        db.add(user)
    user.email = identity.email
    user.name = identity.name
    user.avatar_url = identity.picture
    db.commit()
    return user


# Google signs the user in on its own page and POSTs the ID token back to
# /google/redirect (GIS "redirect" mode). A popup would be simpler, but iOS Safari
# loses the popup's hand-off and leaves the user on a blank page.
#
# The nonce ties that POST to this browser: it is stored in a cookie here and
# Google embeds it in the signed token, so a token obtained elsewhere is rejected.
# The POST comes from accounts.google.com, so the cookie must be SameSite=None
# (which requires Secure; browsers allow that on http://localhost too).
NONCE_COOKIE = "google_nonce"
NONCE_PATH = "/api/auth/google"
NONCE_MAX_AGE = 60 * 60


def _clear_nonce(response: Response) -> None:
    response.delete_cookie(
        NONCE_COOKIE, path=NONCE_PATH, secure=True, httponly=True, samesite="none"
    )


@router.get("/google/nonce")
def google_nonce(response: Response) -> GoogleNonce:
    nonce = secrets.token_urlsafe(32)
    response.set_cookie(
        NONCE_COOKIE,
        nonce,
        max_age=NONCE_MAX_AGE,
        path=NONCE_PATH,
        secure=True,
        httponly=True,
        samesite="none",
    )
    response.headers["Cache-Control"] = "no-store"
    return GoogleNonce(nonce=nonce)


@router.post("/google/redirect", status_code=status.HTTP_303_SEE_OTHER)
def login_google_redirect(
    request: Request,
    db: DbSession,
    settings: AppSettings,
    verify: Annotated[TokenVerifier, Depends(get_token_verifier)],
    credential: Annotated[str, Form()] = "",
) -> RedirectResponse:
    expected_nonce = request.cookies.get(NONCE_COOKIE, "")
    identity = None
    if credential and expected_nonce:
        with contextlib.suppress(InvalidTokenError):
            identity = verify(credential)
    if identity is None or not hmac.compare_digest(identity.nonce or "", expected_nonce):
        response = RedirectResponse("/login?error=google", status.HTTP_303_SEE_OTHER)
    else:
        user = upsert_user(db, identity)
        response = RedirectResponse("/", status.HTTP_303_SEE_OTHER)
        set_session_cookie(response, user.id, settings)
    _clear_nonce(response)
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, settings: AppSettings) -> None:
    clear_session_cookie(response, settings)


@router.get("/me")
def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


class TestLoginIn(BaseModel):
    sub: str
    email: str
    name: str | None = None


@test_router.post("/test-login")
def test_login(
    body: TestLoginIn, response: Response, db: DbSession, settings: AppSettings
) -> UserRead:
    """Login without Google. Registered only when APP_ENV=test (E2E and API tests)."""
    user = upsert_user(db, GoogleIdentity(sub=body.sub, email=body.email, name=body.name))
    set_session_cookie(response, user.id, settings)
    return UserRead.model_validate(user)
