from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.routers import ingest


def test_ingestion_fails_closed_when_api_key_is_not_configured(monkeypatch):
    monkeypatch.setattr(ingest, "settings", SimpleNamespace(INGEST_API_KEY=""))

    with pytest.raises(HTTPException) as error:
        ingest.verify_api_key("demo-secret")

    assert error.value.status_code == 503


def test_ingestion_rejects_an_invalid_key(monkeypatch):
    monkeypatch.setattr(ingest, "settings", SimpleNamespace(INGEST_API_KEY="a-secure-test-ingestion-key-12345"))

    with pytest.raises(HTTPException) as error:
        ingest.verify_api_key("wrong")

    assert error.value.status_code == 401


def test_ingestion_accepts_the_exact_configured_key(monkeypatch):
    monkeypatch.setattr(ingest, "settings", SimpleNamespace(INGEST_API_KEY="a-secure-test-ingestion-key-12345"))

    assert ingest.verify_api_key("a-secure-test-ingestion-key-12345") == "a-secure-test-ingestion-key-12345"
