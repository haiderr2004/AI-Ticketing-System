from pathlib import Path

from backend.core.config import Settings, resolve_database_url


def test_relative_sqlite_database_is_anchored_to_the_application_root(tmp_path):
    resolved = resolve_database_url("sqlite:///./tickets.db", base_dir=tmp_path)

    assert resolved == f"sqlite:///{(tmp_path / 'tickets.db').resolve().as_posix()}"


def test_memory_and_server_database_urls_are_unchanged(tmp_path):
    assert resolve_database_url("sqlite:///:memory:", base_dir=tmp_path) == "sqlite:///:memory:"
    postgres = "postgresql://ticket_user:secret@db/ticketing"
    assert resolve_database_url(postgres, base_dir=Path(tmp_path)) == postgres


def test_embeddings_are_opt_in_by_default():
    settings = Settings(_env_file=None)

    assert settings.EMBEDDINGS_ENABLED is False
    assert settings.EMBEDDING_MODEL_PATH == ""
