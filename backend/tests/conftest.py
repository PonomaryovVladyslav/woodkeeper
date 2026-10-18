from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.auth import GoogleIdentity, InvalidTokenError, TokenVerifier, get_token_verifier
from app.config import Settings
from app.db import get_db, make_engine, make_sessionmaker
from app.main import create_app
from app.models import Base, User

ClientFactory = Callable[[], TestClient]


def fake_verify(credential: str) -> GoogleIdentity:
    """Accepts credentials of the form "valid:<sub>" or "valid:<sub>:<nonce>"."""
    prefix, _, rest = credential.partition(":")
    sub, _, nonce = rest.partition(":")
    if prefix != "valid" or not sub:
        raise InvalidTokenError("bad token")
    return GoogleIdentity(
        sub=sub, email=f"{sub}@example.com", name=sub.title(), picture=None, nonce=nonce or None
    )


@pytest.fixture
def db_url(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'test.db'}"


@pytest.fixture
def engine(db_url: str) -> Iterator[Engine]:
    engine = make_engine(db_url)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    with make_sessionmaker(engine)() as session:
        yield session


@pytest.fixture
def settings(db_url: str) -> Settings:
    return Settings(
        app_env="test",
        database_url=db_url,
        secret_key="test-secret",
        google_client_id="test-client-id",
        _env_file=None,
    )


@pytest.fixture
def app(settings: Settings, engine: Engine) -> FastAPI:
    app = create_app(settings)
    session_factory = make_sessionmaker(engine)

    def override_get_db() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    def override_verifier() -> TokenVerifier:
        return fake_verify

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_token_verifier] = override_verifier
    return app


@pytest.fixture
def make_client(app: FastAPI) -> Iterator[ClientFactory]:
    """Each client has its own cookie jar, i.e. its own browser."""
    clients: list[TestClient] = []

    def factory() -> TestClient:
        client = TestClient(app)
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.close()


def login(client: TestClient, sub: str) -> TestClient:
    response = client.post("/api/auth/test-login", json={"sub": sub, "email": f"{sub}@example.com"})
    assert response.status_code == 200
    return client


@pytest.fixture
def client(make_client: ClientFactory) -> TestClient:
    return make_client()


@pytest.fixture
def user_client(make_client: ClientFactory) -> TestClient:
    return login(make_client(), "user-a")


@pytest.fixture
def other_client(make_client: ClientFactory) -> TestClient:
    return login(make_client(), "user-b")


def get_user(db: Session, sub: str) -> User:
    user = db.scalar(select(User).where(User.google_sub == sub))
    assert user is not None
    return user


@pytest.fixture
def user_a(user_client: TestClient, db_session: Session) -> User:
    """DB row of the user behind user_client."""
    return get_user(db_session, "user-a")


@pytest.fixture
def user_b(other_client: TestClient, db_session: Session) -> User:
    """DB row of the user behind other_client."""
    return get_user(db_session, "user-b")
