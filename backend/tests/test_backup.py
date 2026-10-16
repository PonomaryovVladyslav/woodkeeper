import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import Engine, text

from app.backup import backup, database_path, main
from app.config import get_settings


def rows(path: Path) -> list[tuple[int, str]]:
    with sqlite3.connect(path) as conn:
        result = conn.execute("SELECT id, name FROM projects ORDER BY id").fetchall()
    conn.close()
    return [(int(r[0]), str(r[1])) for r in result]


@pytest.fixture
def source(engine: Engine, db_url: str) -> Path:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, google_sub, email, created_at) "
                "VALUES (1, 's', 'e', '2026-01-01')"
            )
        )
        for i, name in [(1, "Шкаф"), (2, "Комод")]:
            conn.execute(
                text(
                    "INSERT INTO projects (id, user_id, name, created_at, updated_at) "
                    "VALUES (:id, 1, :name, '2026-01-01', '2026-01-01')"
                ),
                {"id": i, "name": name},
            )
    return database_path(db_url)


def test_database_path() -> None:
    assert database_path("sqlite:////data/woodkeeper.db") == Path("/data/woodkeeper.db")
    assert database_path("sqlite:///./woodkeeper.db") == Path("./woodkeeper.db")
    with pytest.raises(ValueError):
        database_path("sqlite://")
    with pytest.raises(ValueError):
        database_path("postgresql://localhost/db")


def test_backup_copies_data_including_uncheckpointed_wal(
    engine: Engine, source: Path, tmp_path: Path
) -> None:
    # Keep a connection open so the latest write stays in the -wal file, not the main file.
    with engine.connect() as held:
        held.execute(text("SELECT 1"))
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO projects (id, user_id, name, created_at, updated_at) "
                    "VALUES (3, 1, 'Стол', '2026-01-01', '2026-01-01')"
                )
            )
        assert Path(f"{source}-wal").stat().st_size > 0

        destination = tmp_path / "out" / "backup.db"
        backup(source, destination)

    assert rows(destination) == [(1, "Шкаф"), (2, "Комод"), (3, "Стол")]
    with sqlite3.connect(destination) as copy:
        assert copy.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    copy.close()
    assert not destination.with_name("backup.db.partial").exists()


def test_backup_replaces_previous_copy(source: Path, tmp_path: Path) -> None:
    destination = tmp_path / "backup.db"
    destination.write_text("old garbage")
    backup(source, destination)
    assert rows(destination) == [(1, "Шкаф"), (2, "Комод")]


def test_backup_of_missing_database_fails_without_creating_it(tmp_path: Path) -> None:
    missing = tmp_path / "missing.db"
    with pytest.raises(sqlite3.OperationalError):
        backup(missing, tmp_path / "out.db")
    assert not missing.exists()


def test_cli(source: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, db_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", db_url)
    get_settings.cache_clear()
    try:
        assert main([str(tmp_path / "cli.db")]) == 0
        assert rows(tmp_path / "cli.db") == [(1, "Шкаф"), (2, "Комод")]

        monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'none.db'}")
        get_settings.cache_clear()
        assert main([str(tmp_path / "x.db"), "--if-exists"]) == 0
        assert main([str(tmp_path / "x.db")]) == 1
        assert not (tmp_path / "x.db").exists()
    finally:
        get_settings.cache_clear()
