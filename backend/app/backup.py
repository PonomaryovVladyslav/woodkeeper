"""Consistent copy of the SQLite database: `python -m app.backup <destination>`.

Uses SQLite's online backup API, which is safe while the app is running in WAL
mode (copying the file with `cp` is not). The copy is written next to the
destination and renamed into place, so a half-written backup never replaces a
good one.
"""

import argparse
import sqlite3
import sys
from pathlib import Path

from sqlalchemy.engine import make_url

from app.config import get_settings


def database_path(database_url: str) -> Path:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite" or not url.database:
        raise ValueError(f"Not a file-based SQLite URL: {database_url}")
    return Path(url.database)


def backup(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".partial")
    partial.unlink(missing_ok=True)
    # Read-only URI: a missing source raises instead of creating an empty database.
    with (
        sqlite3.connect(f"file:{source}?mode=ro", uri=True) as src,
        sqlite3.connect(partial) as dst,
    ):
        src.backup(dst)
    src.close()
    dst.close()
    partial.replace(destination)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destination", type=Path)
    parser.add_argument(
        "--if-exists",
        action="store_true",
        help="do nothing (exit 0) when the database does not exist yet, e.g. on first start",
    )
    args = parser.parse_args(argv)

    source = database_path(get_settings().database_url)
    if not source.exists():
        if args.if_exists:
            print(f"backup: {source} does not exist yet, skipping")
            return 0
        print(f"backup: {source} does not exist", file=sys.stderr)
        return 1

    backup(source, args.destination)
    print(f"backup: {source} -> {args.destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
