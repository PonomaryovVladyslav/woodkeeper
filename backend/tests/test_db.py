from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import Engine, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Board, Project, User


def make_user(session: Session, sub: str = "sub-a") -> User:
    user = User(google_sub=sub, email=f"{sub}@example.com")
    session.add(user)
    session.flush()
    return user


def make_project(session: Session, user: User) -> Project:
    project = Project(user=user, name="Шкаф")
    session.add(project)
    session.flush()
    return project


def make_board(session: Session, project: Project, **overrides: Any) -> Board:
    fields: dict[str, Any] = {
        "name": "Полка",
        "length_mm": 800,
        "width_mm": 300,
        "thickness_mm": 18,
        **overrides,
    }
    board = Board(project=project, **fields)
    session.add(board)
    session.flush()
    return board


def count(session: Session, model: type[User | Project | Board]) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def test_pragmas_on_new_connection(engine: Engine) -> None:
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert conn.execute(text("PRAGMA journal_mode")).scalar() == "wal"


def test_board_defaults(db_session: Session) -> None:
    board = make_board(db_session, make_project(db_session, make_user(db_session)))
    db_session.commit()
    db_session.expire_all()

    assert board.quantity == 1
    assert board.is_ordered is False
    assert board.notes is None
    assert board.face_top_color is None


@pytest.mark.parametrize("field", ["length_mm", "width_mm", "thickness_mm", "quantity"])
def test_check_constraints(db_session: Session, field: str) -> None:
    project = make_project(db_session, make_user(db_session))
    with pytest.raises(IntegrityError):
        make_board(db_session, project, **{field: 0})


def test_unique_google_sub(db_session: Session) -> None:
    make_user(db_session, "same")
    with pytest.raises(IntegrityError):
        make_user(db_session, "same")


def test_delete_project_cascades_to_boards(db_session: Session) -> None:
    project = make_project(db_session, make_user(db_session))
    make_board(db_session, project)
    make_board(db_session, project)
    db_session.commit()

    db_session.delete(project)
    db_session.commit()

    assert count(db_session, Board) == 0


def test_delete_user_cascades_on_db_level(db_session: Session) -> None:
    # Raw SQL bypasses ORM cascades: only ON DELETE CASCADE + foreign_keys=ON can clean up.
    user = make_user(db_session)
    make_board(db_session, make_project(db_session, user))
    db_session.commit()

    db_session.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})
    db_session.commit()

    assert count(db_session, Project) == 0
    assert count(db_session, Board) == 0


def test_timestamps_are_utc_aware(db_session: Session) -> None:
    project = make_project(db_session, make_user(db_session))
    db_session.commit()
    db_session.expire_all()

    assert project.created_at.tzinfo == UTC
    assert project.updated_at.tzinfo == UTC


def test_updated_at_changes_on_update(db_session: Session) -> None:
    project = make_project(db_session, make_user(db_session))
    project.updated_at = datetime(2000, 1, 1, tzinfo=UTC)
    db_session.commit()
    created_at = project.created_at

    project.name = "Комод"
    db_session.commit()
    db_session.expire_all()

    assert project.updated_at > datetime(2000, 1, 1, tzinfo=UTC)
    assert project.created_at == created_at


def test_naive_datetime_rejected(db_session: Session) -> None:
    project = make_project(db_session, make_user(db_session))
    project.created_at = datetime(2026, 1, 1)
    with pytest.raises(Exception, match="naive datetime"):
        db_session.flush()
