from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    
    # AI API Keys
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"
    GEMINI_MODEL: str = "gemini-2.5-flash"
    
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
    
    # Email Sending (SMTP)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    
    # ChromaDB
    CHROMADB_PATH: str = "./chroma_db"
    CHROMADB_COLLECTION: str = "tickets"
    
    # Backend Server
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    
    # Frontend URL (CORS)
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()
