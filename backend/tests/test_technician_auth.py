"""Offline contract tests for Directory Service-backed technician auth."""

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from backend.auth import technician


def _request(authorization: str | None = None) -> Request:
    headers = [] if authorization is None else [(b"authorization", authorization.encode())]
    return Request({"type": "http", "headers": headers})


class _FakeResponse:
    def __init__(self, status_code: int, payload: object):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, response: _FakeResponse, calls: list[tuple[str, dict]]):
        self.response = response
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, url: str, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


def _configure_directory(monkeypatch, response: _FakeResponse):
    calls: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        technician,
        "get_settings",
        lambda: SimpleNamespace(
            DIRECTORY_SERVICE_URL="http://directory.internal/",
            DIRECTORY_SERVICE_TIMEOUT_SECONDS=1.0,
        ),
    )
    monkeypatch.setattr(
        technician.httpx,
        "AsyncClient",
        lambda **_kwargs: _FakeClient(response, calls),
    )
    return calls


def test_missing_bearer_token_is_rejected_without_directory_call():
    with pytest.raises(HTTPException) as error:
        asyncio.run(technician.require_technician(_request()))
    assert error.value.status_code == 401


def test_directory_service_identity_is_forwarded_and_accepted(monkeypatch):
    calls = _configure_directory(
        monkeypatch,
        _FakeResponse(200, {"subject": "portal_admin", "dn": "CN=Portal Admin", "exp_timestamp": 42}),
    )
    identity = asyncio.run(technician.require_technician(_request("Bearer session-token")))

    assert identity.subject == "portal_admin"
    assert calls == [
        (
            "http://directory.internal/api/auth/me",
            {"headers": {"Authorization": "Bearer session-token"}},
        )
    ]


def test_directory_service_rejection_becomes_ticket_service_401(monkeypatch):
    _configure_directory(monkeypatch, _FakeResponse(401, {"detail": "expired"}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(technician.require_technician(_request("Bearer expired")))
    assert error.value.status_code == 401


def test_directory_service_network_failure_is_not_authorized(monkeypatch):
    monkeypatch.setattr(
        technician,
        "get_settings",
        lambda: SimpleNamespace(DIRECTORY_SERVICE_URL="http://directory.internal", DIRECTORY_SERVICE_TIMEOUT_SECONDS=1.0),
    )

    class _FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, *_args, **_kwargs):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr(technician.httpx, "AsyncClient", lambda **_kwargs: _FailingClient())
    with pytest.raises(HTTPException) as error:
        asyncio.run(technician.require_technician(_request("Bearer session-token")))
    assert error.value.status_code == 503
