"""Print the OpenAPI schema: `python -m app.openapi > openapi.json`.

Uses fixed settings so the output does not depend on the local .env
(and test-only routes are not included).
"""

import json

from app.config import Settings
from app.main import create_app


def build_schema() -> str:
    settings = Settings(app_env="development", google_client_id="", _env_file=None)
    return json.dumps(create_app(settings).openapi(), ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    print(build_schema(), end="")
