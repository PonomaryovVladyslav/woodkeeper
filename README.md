# Woodkeeper

Личный сайт для планирования досок под улучшение мебели: подпроекты, размеры в мм, 3D-просмотр, облицовка сторон с выбором цвета, отметка заказа.

Документация — в [docs/](docs/), принятые решения — [docs/decisions.md](docs/decisions.md).

## Локальная разработка

Бэкенд (нужен [uv](https://docs.astral.sh/uv/)):

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload     # http://localhost:8000/docs
uv run pytest                            # тесты
uv run ruff check . && uv run mypy       # линтер и типы
```
