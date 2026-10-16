# Woodkeeper — деплой

> Этап 12: проектирование. Дата: 2026-10-16. Связанные документы: [decisions.md](decisions.md), [roadmap.md](roadmap.md), [testing.md](testing.md).

## 1. Общая схема

```
GitHub (push в main)
  └─ GitHub Actions: тесты → сборка Docker-образа → push в GHCR
                                                     │
Вы: deploy/deploy.sh ── ssh ──► EC2: docker compose pull && up -d
                                                     │
Интернет → :443 Caddy (HTTPS) → app:8000 (FastAPI + статика React) → SQLite (volume)
Телеграм-бот — независимо, как раньше
cron на хосте (03:00) → бэкап SQLite → S3
```

## 2. Ключевые решения

| Решение | Выбор | Почему |
|---|---|---|
| Артефакт | **Один Docker-образ**: бэкенд + собранный фронтенд | Одна версия = один тег; фронтенд и API не могут разъехаться |
| Кто раздаёт статику | **FastAPI** (`StaticFiles` + SPA-fallback) | Следствие одного образа. Для одного пользователя производительность не важна |
| Роль Caddy | Только HTTPS, reverse proxy, сжатие, заголовки | Автоматические сертификаты Let's Encrypt |
| Где собирается образ | **GitHub Actions**, не на сервере | На micro-инстансе с 1 ГБ RAM сборка фронтенда может упасть по памяти |
| Реестр образов | **GHCR** (`ghcr.io/ponomaryovvladyslav/woodkeeper`) | Бесплатно, рядом с репозиторием |
| Деплой | **Ручной скрипт** `deploy/deploy.sh` | Просто и прозрачно; автодеплой из Actions — опционально позже (раздел 10) |
| Конфиг фронтенда | **Во время выполнения** через `GET /api/config` | Один образ работает и локально, и в проде; Client ID не зашивается при сборке |
| Миграции | `alembic upgrade head` при старте контейнера, перед этим — копия БД | Нельзя забыть мигрировать; есть точка отката |
| Процессы | 1 воркер uvicorn | SQLite + маленький сервер |
| Бэкапы | cron на хосте → SQLite backup API → gzip → S3 | Консистентная копия даже в режиме WAL; доступ к S3 через IAM-роль инстанса, без ключей на сервере |

### Изменение относительно decisions.md

Ранее планировалось, что Caddy раздаёт статику. Теперь статику раздаёт FastAPI из того же образа, Caddy только проксирует. Причина — атомарные версии и отсутствие синхронизации файлов между контейнерами.

## 3. Файлы в репозитории

```
Dockerfile                  multi-stage: сборка фронтенда → образ бэкенда
.dockerignore
backend/entrypoint.sh       бэкап перед миграцией → alembic → uvicorn
backend/app/backup.py       python -m app.backup <путь> — копия через sqlite3 backup API
deploy/
  docker-compose.yml        app + caddy
  docker-compose.local.yml  переопределения для локального запуска (этап 13)
  Caddyfile
  .env.example              шаблон переменных для сервера
  deploy.sh                 деплой с локальной машины
  backup.sh                 бэкап в S3 (запускается cron на сервере)
  restore.md                пошаговое восстановление из бэкапа
.github/workflows/
  ci.yml                    тесты (из roadmap этап 0)
  release.yml               сборка и push образа после зелёного CI в main
```

## 4. Docker-образ

### Dockerfile (эскиз)

```dockerfile
# --- 1. Сборка фронтенда ---
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build                      # → /fe/dist

# --- 2. Бэкенд ---
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
COPY --from=frontend /fe/dist ./static
RUN useradd --system --uid 1000 app && mkdir /data && chown app /data
USER app
ENV PATH="/app/.venv/bin:$PATH" STATIC_DIR=/app/static
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"
ENTRYPOINT ["./entrypoint.sh"]
```

Архитектура образа — `linux/amd64` (t2/t3 — x86_64).

### entrypoint.sh (логика)

1. Если файл БД существует → `python -m app.backup /data/pre-migrate.db` (перезаписывается при каждом старте).
2. `alembic upgrade head`.
3. `exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips '*'`.

### Статика в FastAPI

- `/assets/*` → `StaticFiles`, заголовок `Cache-Control: public, max-age=31536000, immutable` (имена файлов с хешем).
- Любой другой `GET`, не начинающийся с `/api` → `index.html` с `Cache-Control: no-cache` (SPA-fallback для React Router).
- Неизвестный `/api/*` → 404 JSON, а не `index.html`.

### Новый эндпоинт

`GET /api/config` (без авторизации) → `{"google_client_id": "..."}`. Фронтенд запрашивает его при старте.

## 5. docker-compose.yml

```yaml
services:
  app:
    image: ghcr.io/ponomaryovvladyslav/woodkeeper:${TAG:-latest}
    env_file: .env
    environment:
      DATABASE_URL: sqlite:////data/woodkeeper.db
    volumes:
      - data:/data
    restart: unless-stopped
    mem_limit: 256m
    logging: &logging
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [app]
    restart: unless-stopped
    mem_limit: 64m
    logging: *logging

volumes:
  data:
  caddy_data:      # сертификаты — не удалять, иначе упрёмся в лимиты Let's Encrypt
  caddy_config:
```

Порт `app` наружу не публикуется — доступен только Caddy внутри сети compose.

Ожидаемое потребление памяти: app ~100 МБ, Caddy ~30 МБ.

## 6. Caddyfile

```
{$DOMAIN} {
    encode zstd gzip
    reverse_proxy app:8000

    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options    "nosniff"
        Referrer-Policy           "strict-origin-when-cross-origin"
        Cross-Origin-Opener-Policy "same-origin-allow-popups"
        -Server
    }
}
```

`Cross-Origin-Opener-Policy: same-origin-allow-popups` нужен, чтобы всплывающее окно входа Google могло вернуть результат на страницу.

HTTP → HTTPS редирект Caddy делает автоматически.

## 7. Переменные окружения

Файл `/opt/woodkeeper/.env` на сервере, права `600`, в git не попадает. Шаблон — `deploy/.env.example`.

| Переменная | Пример | Назначение |
|---|---|---|
| `APP_ENV` | `production` | Отключает `test-login`, включает `Secure` для cookie |
| `SECRET_KEY` | `openssl rand -hex 32` | Подпись cookie сессии. Смена = все сессии сброшены |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Проверка ID-токена, отдаётся фронтенду через `/api/config` |
| `DOMAIN` | `woodkeeper.example.com` | Для Caddy |
| `TAG` | `latest` или SHA коммита | Версия образа (необязательно) |

Cookie сессии: `HttpOnly`, `Secure` (в проде), `SameSite=Lax`, срок — 30 дней.

## 8. Сборка образа (GitHub Actions)

`release.yml` — на push в `main`, после успешного `ci.yml`:

1. `docker/setup-buildx-action`.
2. Логин в GHCR через `GITHUB_TOKEN`.
3. `docker/build-push-action` с тегами `:latest` и `:<sha>`, кэш `type=gha`.

Доступ сервера к образу:

- **Репозиторий публичный** → пакет в GHCR делаем публичным, на сервере логин не нужен (секретов в образе нет).
- **Репозиторий приватный** → на сервере один раз `docker login ghcr.io` с PAT (только `read:packages`).

## 9. Подготовка сервера (этап 14)

### Состояние сервера (проверено 2026-10-16)

| Параметр | Значение | Вывод |
|---|---|---|
| Инстанс | t3.micro, x86_64, 2 vCPU | Образ `linux/amd64` |
| ОС | Ubuntu 26.04 LTS | Docker ставится из официального apt-репозитория Docker |
| RAM | 908 МБ, занято ~410 МБ, доступно ~500 МБ | Хватает (app ~100 МБ + Caddy ~30 МБ), но **swap обязателен** |
| Swap | нет | Добавить 2 ГБ |
| Диск | 6.7 ГБ, свободно 3.6 ГБ | Хватает; `deploy.sh` чистит старые образы (`docker image prune -f`) |
| Порты | слушается только 22 | 80/443 свободны |
| Бот | `reminder-bot.service` (systemd, `~/reminder_bot`, long polling, ~75 МБ) | Входящих портов не использует — **конфликтов нет**, бот не трогаем |
| Docker | не установлен | Установить |
| nginx / apache | нет | — |
| AWS CLI | не установлен | Установить (`snap install aws-cli --classic`) |
| IAM-роль инстанса | нет | Создать и прикрепить (для бэкапов в S3) |
| Публичный IP | 18.222.97.98 | Проверить в консоли AWS, что это Elastic IP; если нет — выделить и привязать до настройки DNS |
| SSH | `ssh -i ~/Downloads/osvc.pem ubuntu@ec2-18-222-97-98.us-east-2.compute.amazonaws.com` | Используется в `deploy.sh` (хост и ключ — через переменные окружения, не в репозитории) |

### Команды проверки (для повторной проверки)

```bash
cat /etc/os-release                 # Amazon Linux 2023 или Ubuntu
uname -m                            # ожидаем x86_64
free -h                             # память и swap
sudo ss -tlnp | grep -E ':(80|443)\b'   # заняты ли 80/443
systemctl list-units --type=service | grep -iE 'bot|nginx|apache'
```

**Сосуществование с ботом:**

- Бот на **long polling** (входящих портов не нужно) — конфликтов нет, ничего не меняем.
- Бот на **webhook за nginx** на 443 — Caddy и nginx не могут оба слушать 443. Решение: убрать nginx, а в Caddyfile добавить блок для бота (`reverse_proxy host.docker.internal:<порт>` по пути вебхука или на поддомене).

### Шаги

- [ ] Установить Docker Engine + Compose plugin; добавить пользователя в группу `docker`.
- [ ] Swap 2 ГБ (`/swapfile`, запись в `/etc/fstab`).
- [ ] Security Group: входящие 80, 443 (TCP) и 443 (UDP, для HTTP/3) — для всех; 22 — для своего IP.
- [ ] Купить домен, A-запись → Elastic IP сервера (публичный IP без Elastic IP меняется при остановке инстанса).
- [ ] Google Cloud Console: добавить `https://<домен>` в authorized JavaScript origins.
- [ ] S3-бакет `woodkeeper-backups-<суффикс>`: приватный, lifecycle-правило «удалять объекты старше 60 дней».
- [ ] IAM-роль для инстанса с политикой `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` только на этот бакет; прикрепить к EC2.
- [ ] AWS CLI на хосте (в Amazon Linux есть, в Ubuntu — установить).
- [ ] `mkdir /opt/woodkeeper`, создать `.env` с правами `600`.

## 10. Процесс деплоя

### Ручной (основной)

`deploy/deploy.sh [TAG]` с локальной машины:

1. Проверить, что образ с нужным тегом есть в GHCR.
2. `scp deploy/docker-compose.yml deploy/Caddyfile deploy/backup.sh` → `/opt/woodkeeper/`.
3. `ssh` → `cd /opt/woodkeeper && TAG=<tag> docker compose pull && docker compose up -d`.
4. `docker image prune -f` — удалить старые образы (диск 6.7 ГБ).
5. Подождать и проверить `curl -fsS https://<домен>/api/health`.
6. Вывести `docker compose ps` и последние строки логов.

Первый деплой — то же самое плюс проверка, что Caddy получил сертификат (`docker compose logs caddy`).

### Автоматический (опционально, позже)

Job `deploy` в `release.yml` по SSH (`appleboy/ssh-action`), ключ и хост — в GitHub Secrets. Требует открыть 22 порт для IP-адресов GitHub (по сути — для всех, только по ключу) или использовать AWS SSM. Решим после того, как ручной деплой устоится.

### Откат

- **Код:** `deploy.sh <предыдущий SHA>`.
- **Код + миграция БД:** остановить app → восстановить `/data/pre-migrate.db` в `/data/woodkeeper.db` → `deploy.sh <предыдущий SHA>`.

## 11. Бэкапы

### backup.sh (cron на хосте, ежедневно 03:00)

```
docker compose exec -T app python -m app.backup /data/backup.db
docker compose cp app:/data/backup.db /tmp/woodkeeper.db
gzip -f /tmp/woodkeeper.db
aws s3 cp /tmp/woodkeeper.db.gz s3://<бакет>/woodkeeper/$(date +%F).db.gz
rm /tmp/woodkeeper.db.gz
```

- Копирование через `sqlite3` backup API, а не `cp` файла: в режиме WAL простое копирование может дать неконсистентную БД.
- Хранение — 60 дней (lifecycle-правило S3).
- Объём крошечный: стоимость практически нулевая.

Почему не Litestream: данные меняются редко, ежедневного бэкапа достаточно, а лишний постоянный процесс на micro-инстансе не нужен.

### Восстановление (`deploy/restore.md`)

1. `aws s3 cp s3://<бакет>/woodkeeper/<дата>.db.gz .` и `gunzip`.
2. `docker compose stop app`.
3. `docker compose cp <файл>.db app:/data/woodkeeper.db` (удалить `-wal`/`-shm`, если есть).
4. `docker compose start app` → проверить данные в UI.

Восстановление проверяется вручную при первом деплое (см. [testing.md, раздел 7](testing.md#7-проверки-после-деплоя-смоук-на-сервере)).

## 12. Мониторинг и логи

- Логи: `docker compose logs -f app`, ротация 3 × 10 МБ.
- Healthcheck контейнера: Docker перезапускает только при падении процесса; `restart: unless-stopped` поднимает после перезагрузки сервера.
- Внешняя проверка доступности (опционально): cron на сервере раз в 5 минут `curl /api/health`, при ошибке — сообщение себе через уже существующего телеграм-бота. Либо бесплатный UptimeRobot.

## 13. Локальный запуск в Docker (этап 13)

`docker-compose.local.yml` поверх основного:

- образ собирается локально (`build: ..`) вместо GHCR;
- `DOMAIN=localhost` — Caddy выдаёт локальный сертификат своим CA (браузер предупредит один раз) — либо Caddy пропускается и app публикуется на `localhost:8000`;
- `APP_ENV=production`, чтобы проверить именно прод-поведение (статика, `Secure`-cookie, отсутствие `test-login`).

В Google OAuth для этого добавить origin `https://localhost` (или `http://localhost:8000`).

## 14. Тесты, связанные с деплоем

Добавляются в [testing.md](testing.md):

- [ ] `GET /api/config` возвращает `google_client_id` без авторизации.
- [ ] `GET /` и `GET /любой/путь` → `index.html` (SPA-fallback), `no-cache`.
- [ ] `GET /assets/<файл>` → файл с `immutable`.
- [ ] `GET /api/несуществующий` → 404 JSON, не `index.html`.
- [ ] `app.backup` создаёт открываемую копию БД с теми же данными (в том числе при активном WAL).
- [ ] В CI: образ собирается (`docker build`) на каждом PR, push — только из `main`.
