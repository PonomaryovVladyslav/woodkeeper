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
  caddy/
    common.caddy            общее: gzip/zstd, reverse_proxy, заголовки
    Caddyfile               прод: + HSTS
    Caddyfile.local         локально: без HSTS (иначе браузер запомнит HTTPS для localhost)
  .env.example              шаблон переменных для сервера
  .env.local.example        шаблон для локального запуска (копия — .env.local, не в git)
  deploy.sh                 деплой с локальной машины
  backup.sh                 бэкап в S3 (запускается cron на сервере)
  restore.md                пошаговое восстановление из бэкапа и откат миграции
.github/workflows/
  ci.yml                    тесты; job docker — сборка образа и E2E против него
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

1. `python -m app.backup /data/pre-migrate.db --if-exists` — копия БД, если она уже есть (перезаписывается при каждом старте).
2. `alembic upgrade head`.
3. `exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips '*'`.

### Статика в FastAPI

- `/assets/*` → `StaticFiles`, заголовок `Cache-Control: public, max-age=31536000, immutable` (имена файлов с хешем).
- Любой другой `GET`, не начинающийся с `/api` → `index.html` с `Cache-Control: no-cache` (SPA-fallback для React Router).
- Неизвестный `/api/*` → 404 JSON, а не `index.html` — для любого метода (в проде `POST /api/auth/test-login` → 404, не 405).
- `HEAD` работает как `GET` (мониторинги); не-GET на маршруты приложения → 405.
- Файлы из корня сборки (`favicon.svg`) отдаются как есть; выход за пределы `STATIC_DIR` невозможен.

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

Доступ сервера к образу: репозиторий публичный → пакет в GHCR делается публичным (один раз в настройках пакета после первого push), на сервере `docker login` не нужен. Секретов в образе нет — все они в `.env` на сервере.

## 9. Подготовка сервера (этап 14)

### Состояние сервера (проверено 2026-10-16)

| Параметр | Значение | Вывод |
|---|---|---|
| Инстанс | t3.micro, x86_64, 2 vCPU | Образ `linux/amd64` |
| ОС | Ubuntu 26.04 LTS | Docker ставится из официального apt-репозитория Docker |
| RAM | 908 МБ, занято ~410 МБ, доступно ~500 МБ | Хватает (app ~100 МБ + Caddy ~30 МБ), но **swap обязателен** |
| Swap | нет | Добавлен 1 ГБ (см. «Диск») |
| Диск | 6.7 ГБ, свободно 3.6 ГБ | Хватает; `deploy.sh` чистит старые образы (`docker image prune -f`) |
| Порты | слушается только 22 | 80/443 свободны |
| Бот | `reminder-bot.service` (systemd, `~/reminder_bot`, long polling, ~75 МБ) | Входящих портов не использует — **конфликтов нет**, бот не трогаем |
| Docker | не установлен | Установлен 29.9 |
| nginx / apache | нет | — |
| AWS CLI | не установлен | Установлен (snap) |
| IAM-роль инстанса | нет | `woodkeeper-ec2` |
| Публичный IP | 18.222.97.98 | Привязка к домену — через Route 53 (владелец); убедиться, что это Elastic IP |
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

Выполнено 2026-10-16 / 17:

- [x] Docker Engine 29.9 + Compose v5.6 из официального репозитория Docker (`resolute`); пользователь `ubuntu` в группе `docker`; ротация логов по умолчанию в `/etc/docker/daemon.json`.
- [x] Swap **1 ГБ** (`/swapfile`, `/etc/fstab`, `vm.swappiness=10`). Сначала был 2 ГБ, уменьшен из-за места на диске (см. ниже).
- [x] Security Group `launch-wizard-8`: входящие 80, 443 (TCP); UDP 443 — по желанию (HTTP/3).
- [x] Elastic IP `18.222.97.98` у инстанса `i-048aa1ff244bf59c8`.
- [x] Route 53: A-запись `woodkeepervlad.com` → `18.222.97.98`.
- [x] Google OAuth Client: origin `https://woodkeepervlad.com` (рядом с `http://localhost:5173`).
- [x] S3-бакет `woodkeeper-backups-vlad` (us-east-2): приватный, lifecycle «удалять старше 60 дней».
- [x] IAM-роль `woodkeeper-ec2` (инлайн-политика `woodkeeper-backups`: `PutObject`/`GetObject` на `woodkeeper/*`, `ListBucket` на бакет) прикреплена к инстансу. Проверено с сервера: запись/чтение в `woodkeeper/` работают, запись вне префикса и список всех бакетов — запрещены.
- [x] AWS CLI 2 (snap `aws-cli`).
- [x] `/opt/woodkeeper/.env` (600): `SECRET_KEY` сгенерирован на сервере и не покидал его, `GOOGLE_CLIENT_ID`, `DOMAIN`, `TAG`, `S3_BUCKET`.
- [x] Образ `ghcr.io/ponomaryovvladyslav/woodkeeper` доступен анонимно — `docker login` на сервере не нужен.

### Диск

После установки Docker, образа (~455 МБ) и AWS CLI (snap) свободно было 590 МБ из 6.7 ГБ. Очищены кэш apt, старые ревизии snap, журналы; swap уменьшен до 1 ГБ → **свободно ~1.9 ГБ**. Хватает на работу (старые образы удаляет `deploy.sh`, логи ротируются), но запас небольшой.

Рекомендация: расширить EBS-том до 16–20 ГБ (EC2 → Volumes → Modify volume; на сервере `sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1`). Стоимость gp3 — около $0.08 за ГБ в месяц.

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

```bash
cp deploy/.env.local.example deploy/.env.local   # SECRET_KEY, GOOGLE_CLIENT_ID
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml \
  --env-file deploy/.env.local up -d --build
# → https://localhost (сертификат внутреннего CA Caddy — браузер предупредит один раз)
```

- Образ собирается локально под **`linux/amd64`** — как на сервере (на Apple Silicon через эмуляцию). Помимо паритета: arm64-wheel `cryptography` 50 падает с SIGILL в VM Docker Desktop.
- `APP_ENV=production`: статика из образа, `Secure`-cookie, `test-login` → 404.
- Для входа через Google добавить origin `https://localhost` в OAuth Client.
- E2E против образа: `docker run -e APP_ENV=test ...` и `E2E_BASE_URL=http://localhost:<порт> npx playwright test` (так же делает job `docker` в CI).

Проверено 2026-10-16: HTTP→HTTPS, заголовки, zstd, `immutable` для `/assets`, `no-cache` для страниц, 401/404, бэкап перед миграцией при рестарте, данные в volume; память app ~95 МБ / 256, Caddy ~20 МБ / 64; все 16 E2E (ноутбук, Android, iPhone) зелёные против образа.

## 14. Тесты, связанные с деплоем

Добавлены в [testing.md](testing.md) (✅ этап 13):

- [x] `GET /api/config` возвращает `google_client_id` без авторизации.
- [x] `GET /` и `GET /любой/путь` → `index.html` (SPA-fallback), `no-cache`.
- [x] `GET /assets/<файл>` → файл с `immutable`.
- [x] `GET /api/несуществующий` → 404 JSON, не `index.html`.
- [x] `app.backup` создаёт открываемую копию БД с теми же данными (в том числе при активном WAL).
- [x] В CI: образ собирается (`docker build`) на каждом PR, push — только из `main`.
