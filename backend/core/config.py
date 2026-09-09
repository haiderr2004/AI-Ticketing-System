from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


def resolve_database_url(database_url: str, base_dir: Path = BASE_DIR) -> str:
    """Anchor relative SQLite files to the repository, independent of CWD."""
    prefix = "sqlite:///./"
    if database_url.startswith(prefix):
        database_path = (base_dir / database_url[len(prefix):]).resolve()
        return f"sqlite:///{database_path.as_posix()}"
    return database_url


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"

    # OpenAI-compatible LLM provider (for example, LM Studio or another compatible endpoint)
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.lmstudio.ai/v1"
    LLM_MODEL: str = "llama-3.3-70b-instruct"
    LLM_TIMEOUT_SECONDS: float = Field(default=20.0, gt=0, le=120)
    LLM_MAX_RETRIES: int = Field(default=1, ge=0, le=3)

    # Database
    DATABASE_URL: str = "sqlite:///./tickets.db"

    # Slack
    SLACK_WEBHOOK_URL: Optional[str] = None

    # Email Ingestion (IMAP)
    IMAP_HOST: Optional[str] = None
    IMAP_PORT: int = 993
    IMAP_USER: Optional[str] = None
    IMAP_PASSWORD: Optional[str] = None
    EMAIL_POLL_INTERVAL: int = 60
    INGEST_API_KEY: str = ""

    # Email Sending (SMTP)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None

    # ChromaDB
    EMBEDDINGS_ENABLED: bool = False
    EMBEDDING_MODEL_PATH: str = ""
    CHROMADB_PATH: str = "./chroma_db"
    CHROMADB_COLLECTION: str = "tickets"

    # Backend Server
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Frontend URL (CORS)
    FRONTEND_URL: str = "http://localhost:5173"

    # The Directory Service validates technician sessions. This service never
    # reads or shares the Directory Service JWT signing secret.
    DIRECTORY_SERVICE_URL: str = "http://localhost:8000"
    DIRECTORY_SERVICE_TIMEOUT_SECONDS: float = 5.0
    TICKET_SERVICE_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
