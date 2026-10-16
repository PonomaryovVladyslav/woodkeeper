from logging.config import fileConfig
from typing import Any

from alembic import context
from app.config import get_settings
from app.db import make_engine
from app.models import Base, UTCDateTime

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def render_item(type_: str, obj: Any, autogen_context: Any) -> str | bool:
    # Keep migrations independent of app code: UTCDateTime is plain DATETIME in the DB.
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False


COMMON_OPTS: dict[str, Any] = {
    "target_metadata": target_metadata,
    "render_as_batch": True,
    "render_item": render_item,
    "compare_type": True,
}


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **COMMON_OPTS,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = make_engine(get_url())
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            **COMMON_OPTS,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
