"""User B must get 404 (not 403) for anything that belongs to user A."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Board, Project, User
from app.schemas import BoardRead
from tests.factories import make_board, make_project

NEW_BOARD = {"name": "Взлом", "length_mm": 1, "width_mm": 1, "thickness_mm": 1}


@pytest.fixture
def project_a(user_a: User, db_session: Session) -> Project:
    project = make_project(db_session, user_a, name="Шкаф A", description="A")
    db_session.commit()
    return project


@pytest.fixture
def board_a(project_a: Project, db_session: Session) -> Board:
    board = make_board(db_session, project_a, face_top_color="#111111")
    db_session.commit()
    return board


@pytest.fixture
def snapshot_a(project_a: Project, board_a: Board, db_session: Session) -> Any:
    """Returns a function that captures A's data, to compare before/after the attack."""

    def take() -> tuple[str, str | None, list[dict[str, Any]]]:
        db_session.expire_all()
        project = db_session.get(Project, project_a.id)
        assert project is not None
        boards = [BoardRead.from_model(b).model_dump() for b in project.boards]
        return project.name, project.description, boards

    return take


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("PATCH", "/api/projects/{project}", {"name": "Взлом"}),
        ("DELETE", "/api/projects/{project}", None),
        ("GET", "/api/projects/{project}/boards", None),
        ("POST", "/api/projects/{project}/boards", NEW_BOARD),
        ("PATCH", "/api/boards/{board}", {"name": "Взлом", "is_ordered": True}),
        ("DELETE", "/api/boards/{board}", None),
    ],
)
def test_foreign_objects_are_not_found(
    other_client: TestClient,
    project_a: Project,
    board_a: Board,
    snapshot_a: Any,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    before = snapshot_a()
    url = path.format(project=project_a.id, board=board_a.id)

    response = other_client.request(method, url, json=body)

    assert response.status_code == 404
    assert snapshot_a() == before


def test_cannot_move_own_board_into_foreign_project(
    other_client: TestClient,
    user_b: User,
    project_a: Project,
    snapshot_a: Any,
    db_session: Session,
) -> None:
    board_b = make_board(db_session, make_project(db_session, user_b))
    db_session.commit()
    before = snapshot_a()

    response = other_client.patch(f"/api/boards/{board_b.id}", json={"project_id": project_a.id})

    assert response.status_code == 404
    db_session.refresh(board_b)
    assert board_b.project_id != project_a.id
    assert snapshot_a() == before


def test_foreign_project_not_listed(other_client: TestClient, project_a: Project) -> None:
    assert other_client.get("/api/projects").json() == []
