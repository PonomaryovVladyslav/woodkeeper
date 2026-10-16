#!/bin/sh
# Container start: back up the database, migrate, serve.
set -eu

# A copy before every migration is the rollback point (docs/deploy.md, "Откат").
python -m app.backup "${PRE_MIGRATE_BACKUP:-/data/pre-migrate.db}" --if-exists

alembic upgrade head

# One worker: SQLite and a small server. Caddy in front sets X-Forwarded-*.
exec uvicorn app.main:app \
    --host 0.0.0.0 --port 8000 --workers 1 \
    --proxy-headers --forwarded-allow-ips '*'
