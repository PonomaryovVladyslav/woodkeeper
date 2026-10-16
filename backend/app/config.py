from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET_KEY = "dev-insecure-secret-key"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./woodkeeper.db"
    secret_key: str = DEV_SECRET_KEY
    google_client_id: str = ""

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> Self:
        if self.app_env == "production" and self.secret_key == DEV_SECRET_KEY:
            raise ValueError("SECRET_KEY must be set in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
