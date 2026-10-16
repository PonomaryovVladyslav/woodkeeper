"""Plain factory functions: insert rows directly, bypassing the API."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Board, Project, User


def make_user(session: Session, sub: str = "sub-a") -> User:
    user = User(google_sub=sub, email=f"{sub}@example.com")
    session.add(user)
    session.flush()
    return user


def make_project(session: Session, user: User, **overrides: Any) -> Project:
    project = Project(user=user, **{"name": "Шкаф", **overrides})
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
