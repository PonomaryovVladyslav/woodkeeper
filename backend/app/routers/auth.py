from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
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
from app.schemas import GoogleLoginIn, UserRead

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


@router.post("/google")
def login_google(
    body: GoogleLoginIn,
    response: Response,
    db: DbSession,
    settings: AppSettings,
    verify: Annotated[TokenVerifier, Depends(get_token_verifier)],
) -> UserRead:
    try:
        identity = verify(body.credential)
    except InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google token") from exc
    user = upsert_user(db, identity)
    set_session_cookie(response, user.id, settings)
    return UserRead.model_validate(user)


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
