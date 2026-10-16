from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Board, Project, User
from tests.factories import count, make_board, make_project

MINIMAL: dict[str, Any] = {"name": "Полка", "length_mm": 800, "width_mm": 300, "thickness_mm": 18}
NO_FACES = dict.fromkeys(["top", "bottom", "front", "back", "left", "right"])


@pytest.fixture
def project(user_a: User, db_session: Session) -> Project:
    project = make_project(db_session, user_a)
    db_session.commit()
    return project


@pytest.fixture
def board(project: Project, db_session: Session) -> Board:
    board = make_board(
        db_session, project, notes="Заметка", face_top_color="#111111", face_left_color="#222222"
    )
    db_session.commit()
    return board


def boards_url(project: Project) -> str:
    return f"/api/projects/{project.id}/boards"


# --- create ---


def test_create_minimal(user_client: TestClient, project: Project) -> None:
    response = user_client.post(boards_url(project), json=MINIMAL)

    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == project.id
    assert body["quantity"] == 1
    assert body["is_ordered"] is False
    assert body["notes"] is None
    assert body["faces"] == NO_FACES
    assert body["created_at"] == body["updated_at"]


def test_create_full(user_client: TestClient, project: Project, db_session: Session) -> None:
    payload = {
        **MINIMAL,
        "quantity": 4,
        "is_ordered": True,
        "notes": "Отверстия под полкодержатели",
        "faces": {"top": "#A1B2C3", "front": "#ffffff"},
    }
    body = user_client.post(boards_url(project), json=payload).json()

    assert body["quantity"] == 4
    assert body["is_ordered"] is True
    assert body["notes"] == "Отверстия под полкодержатели"
    assert body["faces"] == {**NO_FACES, "top": "#a1b2c3", "front": "#ffffff"}

    stored = db_session.get(Board, body["id"])
    assert stored is not None
    assert stored.face_top_color == "#a1b2c3"
    assert stored.face_front_color == "#ffffff"
    assert stored.face_back_color is None


@pytest.mark.parametrize(
    "override",
    [
        {"length_mm": 0},
        {"width_mm": -1},
        {"thickness_mm": 1.5},
        {"quantity": 0},
        {"faces": {"top": "red"}},
        {"name": ""},
        {"notes": "x" * 2001},
    ],
)
def test_create_invalid(
    user_client: TestClient, project: Project, db_session: Session, override: dict[str, Any]
) -> None:
    response = user_client.post(boards_url(project), json={**MINIMAL, **override})
    assert response.status_code == 422
    assert count(db_session, Board) == 0


def test_create_in_missing_project(user_client: TestClient) -> None:
    assert user_client.post("/api/projects/999/boards", json=MINIMAL).status_code == 404


# --- list ---


def test_list_order_unordered_first_then_by_created_at(
    user_client: TestClient, project: Project, db_session: Session
) -> None:
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    for name, minutes, ordered in [
        ("заказана-ранняя", 0, True),
        ("новая-поздняя", 3, False),
        ("новая-ранняя", 1, False),
        ("заказана-поздняя", 2, True),
    ]:
        at = t0 + timedelta(minutes=minutes)
        make_board(db_session, project, name=name, is_ordered=ordered, created_at=at)
    db_session.commit()

    names = [b["name"] for b in user_client.get(boards_url(project)).json()]

    assert names == ["новая-ранняя", "новая-поздняя", "заказана-ранняя", "заказана-поздняя"]


def test_list_only_this_project(
    user_client: TestClient, project: Project, user_a: User, db_session: Session
) -> None:
    make_board(db_session, project, name="здесь")
    make_board(db_session, make_project(db_session, user_a, name="Другой"), name="там")
    db_session.commit()

    assert [b["name"] for b in user_client.get(boards_url(project)).json()] == ["здесь"]


def test_list_empty(user_client: TestClient, project: Project) -> None:
    assert user_client.get(boards_url(project)).json() == []


def test_list_missing_project(user_client: TestClient) -> None:
    assert user_client.get("/api/projects/999/boards").status_code == 404


# --- update ---


def patch(client: TestClient, board: Board, body: dict[str, Any]) -> Any:
    response = client.patch(f"/api/boards/{board.id}", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_patch_one_field_keeps_others(user_client: TestClient, board: Board) -> None:
    before = user_client.get(f"/api/projects/{board.project_id}/boards").json()[0]

    after = patch(user_client, board, {"length_mm": 1200})

    assert after["length_mm"] == 1200
    unchanged = {k: v for k, v in before.items() if k not in {"length_mm", "updated_at"}}
    assert {k: after[k] for k in unchanged} == unchanged


def test_patch_faces_replaces_all_sides(user_client: TestClient, board: Board) -> None:
    body = patch(user_client, board, {"faces": {"front": "#ABCDEF"}})
    assert body["faces"] == {**NO_FACES, "front": "#abcdef"}


def test_patch_faces_empty_clears_all(user_client: TestClient, board: Board) -> None:
    assert patch(user_client, board, {"faces": {}})["faces"] == NO_FACES


def test_patch_is_ordered_toggles(user_client: TestClient, board: Board) -> None:
    assert patch(user_client, board, {"is_ordered": True})["is_ordered"] is True
    assert patch(user_client, board, {"is_ordered": False})["is_ordered"] is False


def test_patch_notes_null_clears(user_client: TestClient, board: Board) -> None:
    assert patch(user_client, board, {"notes": None})["notes"] is None


def test_patch_move_to_own_project(
    user_client: TestClient, board: Board, user_a: User, db_session: Session
) -> None:
    target = make_project(db_session, user_a, name="Другой")
    db_session.commit()

    assert patch(user_client, board, {"project_id": target.id})["project_id"] == target.id
    assert [b["id"] for b in user_client.get(boards_url(target)).json()] == [board.id]


def test_patch_move_to_missing_project(user_client: TestClient, board: Board) -> None:
    response = user_client.patch(f"/api/boards/{board.id}", json={"project_id": 999})
    assert response.status_code == 404


def test_patch_updates_updated_at_not_created_at(
    user_client: TestClient, project: Project, db_session: Session
) -> None:
    old = datetime(2000, 1, 1, tzinfo=UTC)
    board = make_board(db_session, project, created_at=old, updated_at=old)
    db_session.commit()

    body = patch(user_client, board, {"name": "Боковина"})

    assert datetime.fromisoformat(body["updated_at"]) > old
    assert datetime.fromisoformat(body["created_at"]) == old


@pytest.mark.parametrize(
    "body",
    [
        {"length_mm": 0},
        {"quantity": 0},
        {"faces": {"top": "#fff"}},
        {"name": None},
        {"is_ordered": None},
        {"faces": None},
    ],
)
def test_patch_invalid_leaves_db_unchanged(
    user_client: TestClient, board: Board, db_session: Session, body: dict[str, Any]
) -> None:
    response = user_client.patch(f"/api/boards/{board.id}", json=body)

    assert response.status_code == 422
    db_session.refresh(board)
    assert (board.name, board.length_mm, board.quantity) == ("Полка", 800, 1)
    assert board.face_top_color == "#111111"


def test_patch_missing_board(user_client: TestClient) -> None:
    assert user_client.patch("/api/boards/999", json={"name": "x"}).status_code == 404


# --- delete ---


def test_delete(user_client: TestClient, board: Board, project: Project) -> None:
    assert user_client.delete(f"/api/boards/{board.id}").status_code == 204
    assert user_client.get(boards_url(project)).json() == []
    assert user_client.delete(f"/api/boards/{board.id}").status_code == 404
