# One image: the built React app served by FastAPI (see docs/deploy.md).

# --- 1. Frontend build ---
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. Backend ---
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1
WORKDIR /app

# Dependencies first: this layer is reused while only the code changes.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
COPY --from=frontend /fe/dist ./static

RUN useradd --system --uid 1000 --no-create-home app \
    && mkdir /data && chown app /data \
    && chmod +x entrypoint.sh
USER app

ENV PATH="/app/.venv/bin:$PATH" \
    APP_ENV=production \
    STATIC_DIR=/app/static \
    DATABASE_URL=sqlite:////data/woodkeeper.db
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=4)"
ENTRYPOINT ["./entrypoint.sh"]
