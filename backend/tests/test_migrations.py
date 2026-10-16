from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect

from alembic import command
from app.db import make_engine
from app.models import Base

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


@pytest.fixture
def alembic_config(tmp_path: Path) -> Config:
    config = Config(ALEMBIC_INI)
    config.set_main_option("sqlalchemy.url", f"sqlite:///{tmp_path / 'migrate.db'}")
    config.attributes["configure_logger"] = False
    return config


def test_upgrade_matches_models(alembic_config: Config) -> None:
    command.upgrade(alembic_config, "head")

    engine = make_engine(alembic_config.get_main_option("sqlalchemy.url") or "")
    with engine.connect() as conn:
        diff = compare_metadata(
            MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata
        )
    engine.dispose()
    assert diff == []


def test_downgrade_and_upgrade_again(alembic_config: Config) -> None:
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "base")

    engine = make_engine(alembic_config.get_main_option("sqlalchemy.url") or "")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    engine.dispose()

    command.upgrade(alembic_config, "head")
