"""Directory Service-backed technician authentication for Ticket Service."""

from typing import Final

import httpx
from fastapi import HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.core.config import get_settings


_AUTH_HEADER: Final[str] = "Authorization"


class TechnicianIdentity(BaseModel):
    subject: str = Field(min_length=1, max_length=256)
    dn: str = Field(max_length=2048)
    exp_timestamp: float


async def require_technician(request: Request) -> TechnicianIdentity:
    """Validate the session at the Directory Service's existing /api/auth/me."""
    authorization = request.headers.get(_AUTH_HEADER)
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid technician session is required.",
        )

    settings = get_settings()
    identity_url = f"{settings.DIRECTORY_SERVICE_URL.rstrip('/')}/api/auth/me"
    try:
        async with httpx.AsyncClient(
            timeout=settings.DIRECTORY_SERVICE_TIMEOUT_SECONDS
        ) as client:
            response = await client.get(identity_url, headers={_AUTH_HEADER: authorization})
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Technician identity service is unavailable.",
        ) from None

    if response.status_code in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired technician session.",
        )
    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Technician identity service is unavailable.",
        )
    try:
        return TechnicianIdentity.model_validate(response.json())
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Technician identity service returned an invalid response.",
        ) from None
