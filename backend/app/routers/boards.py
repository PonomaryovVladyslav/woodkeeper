from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db
from app.models import Board, Project, User
from app.routers.projects import get_own_project
from app.schemas import BoardCreate, BoardRead, BoardUpdate, faces_to_columns

router = APIRouter(prefix="/api", tags=["boards"])

DbSession = Annotated[Session, Depends(get_db)]


def get_own_board(db: Session, user: User, board_id: int) -> Board:
    board = db.scalar(
        select(Board).join(Project).where(Board.id == board_id, Project.user_id == user.id)
    )
    if board is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    return board


@router.get("/projects/{project_id}/boards")
def list_boards(project_id: int, db: DbSession, user: CurrentUser) -> list[BoardRead]:
    project = get_own_project(db, user, project_id)
    boards = db.scalars(
        select(Board)
        .where(Board.project_id == project.id)
        .order_by(Board.is_ordered, Board.created_at, Board.id)
    )
    return [BoardRead.from_model(board) for board in boards]


@router.post("/projects/{project_id}/boards", status_code=status.HTTP_201_CREATED)
def create_board(project_id: int, body: BoardCreate, db: DbSession, user: CurrentUser) -> BoardRead:
    project = get_own_project(db, user, project_id)
    board = Board(
        project_id=project.id,
        **body.model_dump(exclude={"faces"}),
        **faces_to_columns(body.faces),
    )
    db.add(board)
    db.commit()
    return BoardRead.from_model(board)


@router.patch("/boards/{board_id}")
def update_board(board_id: int, body: BoardUpdate, db: DbSession, user: CurrentUser) -> BoardRead:
    board = get_own_board(db, user, board_id)
    changes = body.changes()

    if "project_id" in changes:
        # Moving into someone else's project looks like moving into a missing one.
        changes["project_id"] = get_own_project(db, user, changes["project_id"]).id
    if "faces" in changes:
        changes.update(faces_to_columns(changes.pop("faces")))

    for field, value in changes.items():
        setattr(board, field, value)
    db.commit()
    return BoardRead.from_model(board)


@router.delete("/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(board_id: int, db: DbSession, user: CurrentUser) -> None:
    db.delete(get_own_board(db, user, board_id))
    db.commit()
