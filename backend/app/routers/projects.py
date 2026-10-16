from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import get_db
from app.models import Board, Project, User
from app.schemas import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])

DbSession = Annotated[Session, Depends(get_db)]


def get_own_project(db: Session, user: User, project_id: int) -> Project:
    """Someone else's project is indistinguishable from a missing one: 404."""
    project = db.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


def _with_counts() -> Select[Project, int, int]:
    return (
        select(
            Project,
            func.count(Board.id),
            func.count(Board.id).filter(Board.is_ordered),
        )
        .outerjoin(Board)
        .group_by(Project.id)
    )


def _read(project: Project, boards_count: int, ordered_count: int) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        name=project.name,
        description=project.description,
        boards_count=boards_count,
        ordered_count=ordered_count,
        created_at=project.created_at,
    )


def _read_one(db: Session, project: Project) -> ProjectRead:
    project, boards_count, ordered_count = db.execute(
        _with_counts().where(Project.id == project.id)
    ).one()
    return _read(project, boards_count, ordered_count)


@router.get("")
def list_projects(db: DbSession, user: CurrentUser) -> list[ProjectRead]:
    query = (
        _with_counts().where(Project.user_id == user.id).order_by(Project.created_at, Project.id)
    )
    return [_read(project, total, ordered) for project, total, ordered in db.execute(query)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, db: DbSession, user: CurrentUser) -> ProjectRead:
    project = Project(user_id=user.id, **body.model_dump())
    db.add(project)
    db.commit()
    return _read(project, 0, 0)


@router.patch("/{project_id}")
def update_project(
    project_id: int, body: ProjectUpdate, db: DbSession, user: CurrentUser
) -> ProjectRead:
    project = get_own_project(db, user, project_id)
    for field, value in body.changes().items():
        setattr(project, field, value)
    db.commit()
    return _read_one(db, project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: DbSession, user: CurrentUser) -> None:
    db.delete(get_own_project(db, user, project_id))
    db.commit()
