"""User B must get 404 (not 403) for anything that belongs to user A."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Project, User
from tests.factories import make_board, make_project


@pytest.fixture
def project_a(user_a: User, db_session: Session) -> Project:
    project = make_project(db_session, user_a, name="Шкаф A", description="A")
    make_board(db_session, project)
    db_session.commit()
    return project


@pytest.mark.parametrize(
    ("method", "body"),
    [("PATCH", {"name": "Взлом"}), ("DELETE", None)],
)
def test_foreign_project_is_not_found(
    other_client: TestClient,
    project_a: Project,
    db_session: Session,
    method: str,
    body: dict[str, Any] | None,
) -> None:
    response = other_client.request(method, f"/api/projects/{project_a.id}", json=body)

    assert response.status_code == 404
    db_session.refresh(project_a)
    assert project_a.name == "Шкаф A"
    assert len(project_a.boards) == 1


def test_foreign_project_not_listed(other_client: TestClient, project_a: Project) -> None:
    assert other_client.get("/api/projects").json() == []
