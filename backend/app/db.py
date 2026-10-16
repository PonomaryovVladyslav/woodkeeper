from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings


def make_engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args)

    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn: Any, _record: Any) -> None:
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    return engine


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@lru_cache
def get_sessionmaker(database_url: str) -> sessionmaker[Session]:
    return make_sessionmaker(make_engine(database_url))


def get_db(settings: Annotated[Settings, Depends(get_settings)]) -> Iterator[Session]:
    with get_sessionmaker(settings.database_url)() as session:
        yield session
