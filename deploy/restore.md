# Восстановление базы из бэкапа

Бэкапы: `s3://<S3_BUCKET>/woodkeeper/<YYYY-MM-DD>.db.gz`, хранятся 60 дней. На сервере, в `/opt/woodkeeper`:

```bash
# 1. Выбрать и скачать копию
aws s3 ls s3://<S3_BUCKET>/woodkeeper/
aws s3 cp s3://<S3_BUCKET>/woodkeeper/<дата>.db.gz /tmp/
gunzip /tmp/<дата>.db.gz

# 2. Проверить, что файл цел
sqlite3 /tmp/<дата>.db 'PRAGMA integrity_check; SELECT count(*) FROM boards;'
#    (нет sqlite3 на хосте: sudo apt-get install -y sqlite3)

# 3. Остановить приложение (Caddy можно не трогать)
docker compose stop app

# 4. Подменить файл БД в volume; старые -wal/-shm удалить, иначе SQLite применит их поверх
docker compose run --rm --no-deps -v /tmp:/restore --entrypoint sh app -c \
  'cp /data/woodkeeper.db /data/before-restore.db \
   && rm -f /data/woodkeeper.db-wal /data/woodkeeper.db-shm \
   && cp /restore/<дата>.db /data/woodkeeper.db'

# 5. Запустить и проверить
docker compose start app
curl -fsS https://<DOMAIN>/api/health
```

Затем войти в приложение и убедиться, что данные на месте. Предыдущая база остаётся в volume как `/data/before-restore.db`.

## Откат неудачной миграции

При каждом старте контейнер сохраняет `/data/pre-migrate.db` до `alembic upgrade`:

```bash
docker compose stop app
docker compose run --rm --no-deps --entrypoint sh app -c \
  'rm -f /data/woodkeeper.db-wal /data/woodkeeper.db-shm && cp /data/pre-migrate.db /data/woodkeeper.db'
DEPLOY_HOST=... deploy/deploy.sh <предыдущий SHA>   # с локальной машины
```

Важно: `pre-migrate.db` перезаписывается при каждом старте — откатывайтесь до следующего перезапуска.
