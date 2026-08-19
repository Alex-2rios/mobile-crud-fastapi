from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Inventory API"
    database_url: str = "sqlite:///./inventory.db"
    secret_key: str = "change-me-before-deploying-anywhere"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    cors_origins: str = "*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
