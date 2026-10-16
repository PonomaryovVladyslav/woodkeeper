#!/usr/bin/env bash
# Daily SQLite backup to S3, run by cron on the server (see docs/deploy.md):
#   0 3 * * * /opt/woodkeeper/backup.sh >> /var/log/woodkeeper-backup.log 2>&1
# S3 access comes from the instance IAM role; no keys on the server.
set -euo pipefail
cd "$(dirname "$0")"

BUCKET="$(grep '^S3_BUCKET=' .env | cut -d= -f2-)"
[[ -n "$BUCKET" ]] || { echo "S3_BUCKET is not set in .env" >&2; exit 1; }
STAMP="$(date -u +%F)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "$(date -u +%FT%TZ) backup start"
# Consistent copy via the SQLite backup API (safe in WAL mode), inside the container.
docker compose exec -T app python -m app.backup /data/backup.db
docker compose cp app:/data/backup.db "$TMP/woodkeeper.db"
gzip "$TMP/woodkeeper.db"
aws s3 cp --only-show-errors "$TMP/woodkeeper.db.gz" "s3://$BUCKET/woodkeeper/$STAMP.db.gz"
echo "$(date -u +%FT%TZ) backup done: s3://$BUCKET/woodkeeper/$STAMP.db.gz"
