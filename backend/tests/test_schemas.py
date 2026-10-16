from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError

from app.models import Board
from app.schemas import (
    SIDES,
    BoardCreate,
    BoardRead,
    BoardUpdate,
    Faces,
    ProjectCreate,
    ProjectUpdate,
    faces_from_board,
    faces_to_columns,
)

BOARD: dict[str, Any] = {"name": "Полка", "length_mm": 800, "width_mm": 300, "thickness_mm": 18}
ALL_FACES = Faces(
    top="#000001", bottom="#000002", front="#000003",
    back="#000004", left="#000005", right="#000006",
)  # fmt: skip


def board(**overrides: Any) -> BoardCreate:
    return BoardCreate.model_validate({**BOARD, **overrides})


# --- HexColor ---


@pytest.mark.parametrize(("raw", "expected"), [("#a1b2c3", "#a1b2c3"), ("#A1B2C3", "#a1b2c3")])
def test_hex_color_accepted_and_lowercased(raw: str, expected: str) -> None:
    assert Faces(top=raw).top == expected


@pytest.mark.parametrize("raw", ["#fff", "a1b2c3", "#gggggg", "red", "#a1b2c3d", ""])
def test_hex_color_rejected(raw: str) -> None:
    with pytest.raises(ValidationError):
        Faces(top=raw)


def test_faces_default_to_none() -> None:
    assert all(getattr(Faces(), side) is None for side in SIDES)


# --- mapper ---


@pytest.mark.parametrize(
    "faces", [Faces(), ALL_FACES, Faces(top="#abcdef", left="#123456")], ids=["none", "all", "some"]
)
def test_faces_roundtrip_through_columns(faces: Faces) -> None:
    columns = faces_to_columns(faces)
    assert set(columns) == {f"face_{side}_color" for side in SIDES}
    assert faces_from_board(Board(**columns)) == faces


def test_faces_mapper_keeps_sides_apart() -> None:
    columns = faces_to_columns(ALL_FACES)
    assert columns["face_top_color"] == "#000001"
    assert columns["face_right_color"] == "#000006"


def test_board_read_from_model() -> None:
    now = datetime(2026, 10, 16, tzinfo=UTC)
    model = Board(
        id=7, project_id=3, quantity=2, is_ordered=True, notes="n",
        created_at=now, updated_at=now, **BOARD, **faces_to_columns(ALL_FACES),
    )  # fmt: skip
    read = BoardRead.from_model(model)
    assert read.id == 7
    assert read.quantity == 2
    assert read.faces == ALL_FACES
    assert read.model_dump()["faces"]["front"] == "#000003"


# --- BoardCreate ---


def test_board_create_defaults() -> None:
    created = board()
    assert created.quantity == 1
    assert created.is_ordered is False
    assert created.notes is None
    assert created.faces == Faces()


@pytest.mark.parametrize("field", ["length_mm", "width_mm", "thickness_mm"])
@pytest.mark.parametrize("value", [0, -1, 1.5, "abc", "12", True, None])
def test_board_dimensions_rejected(field: str, value: Any) -> None:
    with pytest.raises(ValidationError):
        board(**{field: value})


@pytest.mark.parametrize("value", [1, 100000])
def test_board_dimensions_accepted(value: int) -> None:
    assert board(length_mm=value).length_mm == value


def test_quantity_bounds() -> None:
    with pytest.raises(ValidationError):
        board(quantity=0)
    assert board(quantity=1).quantity == 1


@pytest.mark.parametrize("name", ["", "   ", "x" * 101])
def test_name_rejected(name: str) -> None:
    with pytest.raises(ValidationError):
        board(name=name)
    with pytest.raises(ValidationError):
        ProjectCreate(name=name)


def test_name_is_stripped_and_100_chars_ok() -> None:
    assert board(name="  Полка  ").name == "Полка"
    assert ProjectCreate(name="x" * 100).name == "x" * 100


def test_notes_length() -> None:
    assert board(notes="x" * 2000).notes == "x" * 2000
    with pytest.raises(ValidationError):
        board(notes="x" * 2001)


# --- partial updates ---


def test_project_update_changes_only_set_fields() -> None:
    assert ProjectUpdate.model_validate({"name": "Комод"}).changes() == {"name": "Комод"}
    assert ProjectUpdate.model_validate({"description": None}).changes() == {"description": None}


def test_project_update_name_cannot_be_null() -> None:
    with pytest.raises(ValidationError):
        ProjectUpdate.model_validate({"name": None})


def test_board_update_changes_only_set_fields() -> None:
    update = BoardUpdate.model_validate({"is_ordered": True, "notes": None})
    assert update.changes() == {"is_ordered": True, "notes": None}


@pytest.mark.parametrize(
    "field", ["project_id", "name", "length_mm", "quantity", "is_ordered", "faces"]
)
def test_board_update_rejects_null_for_required(field: str) -> None:
    with pytest.raises(ValidationError):
        BoardUpdate.model_validate({field: None})


def test_board_update_validates_values() -> None:
    with pytest.raises(ValidationError):
        BoardUpdate.model_validate({"length_mm": 0})
    with pytest.raises(ValidationError):
        BoardUpdate.model_validate({"faces": {"top": "red"}})


def test_board_update_faces_replaced_whole() -> None:
    update = BoardUpdate.model_validate({"faces": {"top": "#ABCDEF"}})
    assert update.faces == Faces(top="#abcdef")
