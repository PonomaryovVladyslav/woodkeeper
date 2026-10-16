from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Board, Project, User
from tests.factories import count, make_board, make_project


def test_create(user_client: TestClient) -> None:
    response = user_client.post("/api/projects", json={"name": "Шкаф", "description": "Прихожая"})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Шкаф"
    assert body["description"] == "Прихожая"
    assert body["boards_count"] == 0
    assert body["ordered_count"] == 0
    assert set(body) == {"id", "name", "description", "boards_count", "ordered_count", "created_at"}


def test_create_without_description(user_client: TestClient) -> None:
    response = user_client.post("/api/projects", json={"name": "Шкаф"})
    assert response.status_code == 201
    assert response.json()["description"] is None


def test_create_invalid_name(user_client: TestClient, db_session: Session) -> None:
    for name in ["", "   ", "x" * 101]:
        assert user_client.post("/api/projects", json={"name": name}).status_code == 422
    assert count(db_session, Project) == 0


def test_list_only_own_projects_in_creation_order(
    user_client: TestClient, user_a: User, user_b: User, db_session: Session
) -> None:
    make_project(db_session, user_a, name="Первый")
    make_project(db_session, user_b, name="Чужой")
    make_project(db_session, user_a, name="Второй")
    db_session.commit()

    names = [p["name"] for p in user_client.get("/api/projects").json()]

    assert names == ["Первый", "Второй"]


def test_list_empty(user_client: TestClient) -> None:
    assert user_client.get("/api/projects").json() == []


def test_counts(user_client: TestClient, user_a: User, db_session: Session) -> None:
    project = make_project(db_session, user_a)
    make_board(db_session, project, quantity=5)
    make_board(db_session, project, is_ordered=True)
    make_board(db_session, project)
    empty = make_project(db_session, user_a, name="Пустой")
    db_session.commit()

    by_id = {p["id"]: p for p in user_client.get("/api/projects").json()}

    assert (by_id[project.id]["boards_count"], by_id[project.id]["ordered_count"]) == (3, 1)
    assert (by_id[empty.id]["boards_count"], by_id[empty.id]["ordered_count"]) == (0, 0)


def test_patch_name_keeps_description(
    user_client: TestClient, user_a: User, db_session: Session
) -> None:
    project = make_project(db_session, user_a, description="Описание")
    db_session.commit()

    response = user_client.patch(f"/api/projects/{project.id}", json={"name": "Комод"})

    assert response.status_code == 200
    assert response.json()["name"] == "Комод"
    assert response.json()["description"] == "Описание"


def test_patch_description_keeps_name(
    user_client: TestClient, user_a: User, db_session: Session
) -> None:
    project = make_project(db_session, user_a, name="Шкаф", description="Старое")
    db_session.commit()

    body = user_client.patch(f"/api/projects/{project.id}", json={"description": None}).json()

    assert body["name"] == "Шкаф"
    assert body["description"] is None


def test_patch_returns_counts(user_client: TestClient, user_a: User, db_session: Session) -> None:
    project = make_project(db_session, user_a)
    make_board(db_session, project, is_ordered=True)
    db_session.commit()

    body = user_client.patch(f"/api/projects/{project.id}", json={"name": "Комод"}).json()

    assert (body["boards_count"], body["ordered_count"]) == (1, 1)


def test_patch_updates_updated_at(
    user_client: TestClient, user_a: User, db_session: Session
) -> None:
    old = datetime(2000, 1, 1, tzinfo=UTC)
    project = make_project(db_session, user_a, created_at=old, updated_at=old)
    db_session.commit()

    user_client.patch(f"/api/projects/{project.id}", json={"name": "Комод"})
    db_session.refresh(project)

    assert project.updated_at > old
    assert project.created_at == old


def test_patch_invalid(user_client: TestClient, user_a: User, db_session: Session) -> None:
    project = make_project(db_session, user_a, name="Шкаф")
    db_session.commit()

    for body in [{"name": ""}, {"name": "x" * 101}, {"name": None}]:
        assert user_client.patch(f"/api/projects/{project.id}", json=body).status_code == 422
    db_session.refresh(project)
    assert project.name == "Шкаф"


def test_delete_removes_project_and_boards(
    user_client: TestClient, user_a: User, db_session: Session
) -> None:
    project = make_project(db_session, user_a)
    make_board(db_session, project)
    make_board(db_session, project)
    db_session.commit()

    response = user_client.delete(f"/api/projects/{project.id}")

    assert response.status_code == 204
    assert count(db_session, Project) == 0
    assert count(db_session, Board) == 0
    assert user_client.delete(f"/api/projects/{project.id}").status_code == 404


def test_missing_project(user_client: TestClient) -> None:
    assert user_client.patch("/api/projects/999", json={"name": "x"}).status_code == 404
    assert user_client.delete("/api/projects/999").status_code == 404
