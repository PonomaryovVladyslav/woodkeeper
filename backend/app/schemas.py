from datetime import datetime
from typing import Annotated, Any, ClassVar, Literal, Self, get_args

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    Strict,
    StringConstraints,
    model_validator,
)

from app.models import Board

HexColor = Annotated[
    str,
    StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$"),
    AfterValidator(str.lower),
]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Notes = Annotated[str, StringConstraints(max_length=2000)]
Millimeters = Annotated[int, Strict(), Field(gt=0)]
Quantity = Annotated[int, Strict(), Field(ge=1)]

Side = Literal["top", "bottom", "front", "back", "left", "right"]
SIDES: tuple[Side, ...] = get_args(Side)


class Faces(BaseModel):
    """Veneer color per side; None = side is not veneered."""

    # Optional in requests, but always present in responses: OpenAPI gets Faces-Input/-Output.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    top: HexColor | None = None
    bottom: HexColor | None = None
    front: HexColor | None = None
    back: HexColor | None = None
    left: HexColor | None = None
    right: HexColor | None = None


def face_column(side: Side) -> str:
    return f"face_{side}_color"


def faces_from_board(board: Board) -> Faces:
    return Faces(**{side: getattr(board, face_column(side)) for side in SIDES})


def faces_to_columns(faces: Faces) -> dict[str, str | None]:
    return {face_column(side): getattr(faces, side) for side in SIDES}


class PatchModel(BaseModel):
    """Partial update: omitted fields are untouched; explicit null only where allowed."""

    nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def _reject_nulls(self) -> Self:
        for field in self.model_fields_set - self.nullable_fields:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self

    def changes(self) -> dict[str, Any]:
        return {field: getattr(self, field) for field in self.model_fields_set}


class HealthRead(BaseModel):
    status: Literal["ok"]


class ConfigRead(BaseModel):
    google_client_id: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str | None
    avatar_url: str | None


class GoogleNonce(BaseModel):
    nonce: str


class ProjectCreate(BaseModel):
    name: Name
    description: str | None = None


class ProjectUpdate(PatchModel):
    nullable_fields = frozenset({"description"})

    name: Name | None = None
    description: str | None = None


class ProjectRead(BaseModel):
    id: int
    name: str
    description: str | None
    boards_count: int
    ordered_count: int
    created_at: datetime


class BoardCreate(BaseModel):
    name: Name
    length_mm: Millimeters
    width_mm: Millimeters
    thickness_mm: Millimeters
    quantity: Quantity = 1
    is_ordered: bool = False
    notes: Notes | None = None
    faces: Faces = Field(default_factory=Faces)


class BoardUpdate(PatchModel):
    nullable_fields = frozenset({"notes"})

    project_id: int | None = None
    name: Name | None = None
    length_mm: Millimeters | None = None
    width_mm: Millimeters | None = None
    thickness_mm: Millimeters | None = None
    quantity: Quantity | None = None
    is_ordered: bool | None = None
    notes: Notes | None = None
    faces: Faces | None = None


class BoardRead(BaseModel):
    id: int
    project_id: int
    name: str
    length_mm: int
    width_mm: int
    thickness_mm: int
    quantity: int
    is_ordered: bool
    notes: str | None
    faces: Faces
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, board: Board) -> Self:
        return cls(
            id=board.id,
            project_id=board.project_id,
            name=board.name,
            length_mm=board.length_mm,
            width_mm=board.width_mm,
            thickness_mm=board.thickness_mm,
            quantity=board.quantity,
            is_ordered=board.is_ordered,
            notes=board.notes,
            faces=faces_from_board(board),
            created_at=board.created_at,
            updated_at=board.updated_at,
        )
