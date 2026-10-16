# Woodkeeper — модель данных, классы и API

> Этап 2: проектирование. Дата: 2026-10-16. Стек — см. [decisions.md](decisions.md).

## 1. Ориентация доски

| Размер | Ось 3D |
|---|---|
| длина (`length_mm`) | X |
| толщина (`thickness_mm`) | Y |
| ширина (`width_mm`) | Z |

| Сторона | Код | Направление | Плоскость |
|---|---|---|---|
| Верхняя пласть | `top` | +Y | длина × ширина |
| Нижняя пласть | `bottom` | −Y | длина × ширина |
| Передняя кромка | `front` | +Z | длина × толщина |
| Задняя кромка | `back` | −Z | длина × толщина |
| Левый торец | `left` | −X | ширина × толщина |
| Правый торец | `right` | +X | ширина × толщина |

Порядок материалов граней `BoxGeometry` в three.js: +X, −X, +Y, −Y, +Z, −Z → `right, left, top, bottom, front, back`.

## 2. Таблицы SQLite

### `users`

| Поле | Тип | Ограничения |
|---|---|---|
| id | INTEGER | PK |
| google_sub | TEXT | UNIQUE, NOT NULL — постоянный ID пользователя Google |
| email | TEXT | NOT NULL |
| name | TEXT | NULL |
| avatar_url | TEXT | NULL |
| created_at | DATETIME | NOT NULL, UTC |

### `projects` (подпроекты)

| Поле | Тип | Ограничения |
|---|---|---|
| id | INTEGER | PK |
| user_id | INTEGER | FK → users.id, ON DELETE CASCADE, индекс |
| name | TEXT | NOT NULL |
| description | TEXT | NULL |
| created_at | DATETIME | NOT NULL, UTC |
| updated_at | DATETIME | NOT NULL, UTC |

### `boards`

| Поле | Тип | Ограничения |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id, ON DELETE CASCADE, индекс |
| name | TEXT | NOT NULL («Полка», «Боковина») |
| length_mm | INTEGER | NOT NULL, CHECK > 0 |
| width_mm | INTEGER | NOT NULL, CHECK > 0 |
| thickness_mm | INTEGER | NOT NULL, CHECK > 0 |
| quantity | INTEGER | NOT NULL, DEFAULT 1, CHECK ≥ 1 |
| is_ordered | BOOLEAN | NOT NULL, DEFAULT false |
| notes | TEXT | NULL — заметки («отверстия под полкодержатели») |
| face_top_color | TEXT | NULL |
| face_bottom_color | TEXT | NULL |
| face_front_color | TEXT | NULL |
| face_back_color | TEXT | NULL |
| face_left_color | TEXT | NULL |
| face_right_color | TEXT | NULL |
| created_at | DATETIME | NOT NULL, UTC |
| updated_at | DATETIME | NOT NULL, UTC |

**Облицовка:** `face_*_color = NULL` — сторона не облицована, иначе цвет `#rrggbb` (нижний регистр).

Почему 6 колонок, а не таблица `board_faces`: сторон всегда ровно 6; нет JOIN-ов и синхронизации строк; состояние «не облицована, но с цветом» невозможно. В API стороны отдаются вложенным объектом `faces`, так что хранение можно поменять без влияния на фронтенд.

### Технические детали

- `PRAGMA foreign_keys=ON` на каждом подключении (в SQLite выключено по умолчанию — без него не работает каскад).
- `PRAGMA journal_mode=WAL`.
- Время — UTC. SQLite не хранит часовой пояс, поэтому колонки времени — тип `UTCDateTime` (`app/models.py`): на запись принимает только aware-datetime и приводит к UTC, при чтении возвращает aware-datetime в UTC. В миграциях это обычный `sa.DateTime()`.
- Имена ограничений и индексов задаются `naming_convention` в `Base.metadata` — нужно для `batch_alter_table` в миграциях SQLite.
- Сессии в БД не хранятся: подписанная httpOnly-cookie с `user_id` и сроком жизни.
- Порядок досок: сначала незаказанные, затем по `created_at`.

## 3. Модели SQLAlchemy (`app/models.py`)

```
Base (DeclarativeBase)
 └─ TimestampMixin: created_at, updated_at

User(Base)
   id, google_sub, email, name, avatar_url, created_at
   projects: list[Project]     relationship, cascade="all, delete-orphan"

Project(Base, TimestampMixin)
   id, user_id, name, description
   user: User
   boards: list[Board]         cascade="all, delete-orphan"

Board(Base, TimestampMixin)
   id, project_id, name, length_mm, width_mm, thickness_mm,
   quantity, is_ordered, notes,
   face_top_color, face_bottom_color, face_front_color,
   face_back_color, face_left_color, face_right_color
   project: Project
```

## 4. Pydantic-схемы (`app/schemas.py`)

```
HexColor = Annotated[str, pattern ^#[0-9a-fA-F]{6}$, приводится к нижнему регистру]

Faces            top, bottom, front, back, left, right: HexColor | None = None

UserRead         id, email, name, avatar_url

ProjectCreate    name (1..100), description?
ProjectUpdate    name?, description?                       (PATCH, частичное)
ProjectRead      id, name, description, boards_count, ordered_count, created_at

BoardCreate      name (1..100), length_mm, width_mm, thickness_mm (int > 0),
                 quantity (int ≥ 1, по умолчанию 1), is_ordered = False,
                 notes? (до 2000 символов), faces: Faces
BoardUpdate      все поля опциональны + project_id? (перенос в другой подпроект);
                 faces передаётся целиком
BoardRead        id, project_id, все поля + faces, created_at, updated_at

GoogleLoginIn    credential: str                           (ID-токен от Google)
```

Преобразование 6 колонок ↔ `faces` — в одной функции-маппере.

## 5. API

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/google` | `{credential}` → проверка токена, upsert пользователя, cookie → `UserRead` |
| POST | `/api/auth/logout` | Удаление cookie |
| GET | `/api/auth/me` | Текущий пользователь или 401 |
| GET | `/api/config` | Публичная конфигурация фронтенда: `{google_client_id}` (без авторизации) |
| GET | `/api/health` | Проверка живости (без авторизации) |
| GET | `/api/projects` | Список подпроектов со счётчиками |
| POST | `/api/projects` | Создать подпроект |
| PATCH | `/api/projects/{id}` | Переименовать / изменить описание |
| DELETE | `/api/projects/{id}` | Удалить подпроект вместе с досками |
| GET | `/api/projects/{id}/boards` | Доски подпроекта |
| POST | `/api/projects/{id}/boards` | Добавить доску |
| PATCH | `/api/boards/{id}` | Редактировать, отметить заказ, перенести в другой подпроект |
| DELETE | `/api/boards/{id}` | Удалить доску |

Все эндпоинты (кроме входа, `/api/config` и `/api/health`) требуют `get_current_user`. Чужой или несуществующий объект — 404.

### Дублирование доски

Отдельный эндпоинт не нужен. Кнопка «Дублировать» открывает редактор, заполненный данными исходной доски (имя с суффиксом « (копия)», `is_ordered = false`). Пользователь меняет размеры и сохраняет — обычный `POST /api/projects/{id}/boards`. Так копия с другим размером создаётся за одно действие и без лишней записи в БД.

## 6. Структура бэкенда

```
backend/
  app/
    main.py          FastAPI(), подключение роутеров, раздача статики + SPA-fallback
    config.py        Settings (pydantic-settings): APP_ENV, GOOGLE_CLIENT_ID, SECRET_KEY, DATABASE_URL, STATIC_DIR
    db.py            make_engine() с PRAGMA-хуком, get_engine() / get_sessionmaker() (ленивые, из Settings), get_db()
    models.py
    schemas.py
    auth.py          verify_google_token(), подпись cookie, get_current_user()
    backup.py        python -m app.backup <путь> — консистентная копия SQLite
    routers/
      auth.py
      projects.py
      boards.py
      meta.py        /api/health, /api/config
  entrypoint.sh      бэкап перед миграцией → alembic upgrade → uvicorn
  alembic/
  tests/
  pyproject.toml
```

Отдельный слой сервисов/репозиториев не вводится — при таком объёме логика остаётся в роутерах.

## 7. Структура фронтенда

```
frontend/src/
  api/
    client.ts           fetch-обёртка (credentials: include, обработка 401)
    schema.d.ts         генерируется openapi-typescript
    queries.ts          хуки TanStack Query: useProjects, useBoards, useCreateBoard, ...
  pages/
    LoginPage.tsx       кнопка Google
    MainPage.tsx        вкладки подпроектов + список досок
  components/
    ProjectTabs.tsx     вкладки подпроектов, создать / переименовать / удалить
    BoardList.tsx       список, фильтр: все / не заказаны / заказаны
    BoardCard.tsx       имя, Д×Ш×Т, «×4», чекбокс «заказана», заметки, превью,
                        кнопки: редактировать / дублировать / удалить
    BoardEditor.tsx     модалка создания/редактирования/дублирования: форма + 3D
    DimensionsFields.tsx
    FacesEditor.tsx     6 строк «сторона — чекбокс — цвет», колор-пикер в поповере
    BoardPreview3D.tsx  Canvas + OrbitControls, клик по грани переключает облицовку
  lib/
    faces.ts            порядок граней ↔ материалы three.js, названия сторон
```

Дополнительные библиотеки: **TanStack Query** (данные и кэш), **React Router** (`/login`, `/`).

### UI-решения

- Живой 3D только в редакторе; в карточках — лёгкое статичное превью.
- Удаление доски и подпроекта — с подтверждением внутри страницы.
- При включении облицовки стороны подставляется последний использованный цвет.
- Модель в 3D нормализуется под размер окна, реальные размеры — подписями.
