from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Dialect,
    ForeignKey,
    MetaData,
    String,
    Text,
    TypeDecorator,
    false,
)
from sqlalchemy.engine.default import DefaultExecutionContext
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Stores datetimes as UTC; SQLite drops tzinfo, so it is restored on read."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime is not allowed")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        return value.replace(tzinfo=UTC) if value is not None else None


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


def _created_at_or_now(context: DefaultExecutionContext) -> datetime:
    # A new row gets identical created_at and updated_at, not two separate utcnow() calls.
    params = context.get_current_parameters()  # type: ignore[no-untyped-call]
    created_at: datetime | None = params.get("created_at")
    return created_at or utcnow()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=_created_at_or_now, onupdate=utcnow
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True)
    email: Mapped[str] = mapped_column(String(320))
    name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    projects: Mapped[list[Project]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="projects")
    boards: Mapped[list[Board]] = relationship(
        back_populates="project", cascade="all, delete-orphan", passive_deletes=True
    )


class Board(TimestampMixin, Base):
    __tablename__ = "boards"
    __table_args__ = (
        CheckConstraint("length_mm > 0", name="length_positive"),
        CheckConstraint("width_mm > 0", name="width_positive"),
        CheckConstraint("thickness_mm > 0", name="thickness_positive"),
        CheckConstraint("quantity >= 1", name="quantity_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    length_mm: Mapped[int]
    width_mm: Mapped[int]
    thickness_mm: Mapped[int]
    quantity: Mapped[int] = mapped_column(default=1, server_default="1")
    is_ordered: Mapped[bool] = mapped_column(default=False, server_default=false())
    notes: Mapped[str | None] = mapped_column(Text)

    # NULL = side is not veneered, otherwise "#rrggbb" in lower case.
    face_top_color: Mapped[str | None] = mapped_column(String(7))
    face_bottom_color: Mapped[str | None] = mapped_column(String(7))
    face_front_color: Mapped[str | None] = mapped_column(String(7))
    face_back_color: Mapped[str | None] = mapped_column(String(7))
    face_left_color: Mapped[str | None] = mapped_column(String(7))
    face_right_color: Mapped[str | None] = mapped_column(String(7))

    project: Mapped[Project] = relationship(back_populates="boards")
