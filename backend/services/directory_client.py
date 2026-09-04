"""Authenticated client for approved Directory Service execution endpoints."""

from typing import Any

import httpx

from backend.core.config import get_settings


class DirectoryActionRejected(Exception):
    """The Directory Service completed the request but rejected the AD action."""


class DirectoryServiceUnavailable(Exception):
    """The Directory Service outcome cannot be determined safely."""


class DirectoryServiceClient:
    async def _post_execution(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        settings = get_settings()
        if not settings.TICKET_SERVICE_API_KEY:
            raise DirectoryServiceUnavailable("Ticket Service credential is not configured.")
        try:
            async with httpx.AsyncClient(timeout=settings.DIRECTORY_SERVICE_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    f"{settings.DIRECTORY_SERVICE_URL.rstrip('/')}{path}",
                    json=payload,
                    headers={"X-Service-Key": settings.TICKET_SERVICE_API_KEY},
                )
        except httpx.RequestError as exc:
            raise DirectoryServiceUnavailable("Directory Service could not be reached.") from exc

        if response.status_code in {400, 404, 422}:
            raise DirectoryActionRejected("Directory Service rejected the requested action.")
        if response.status_code != 200:
            raise DirectoryServiceUnavailable("Directory Service did not confirm the requested action.")
        try:
            result = response.json()
        except ValueError as exc:
            raise DirectoryServiceUnavailable("Directory Service returned an invalid response.") from exc
        if result.get("success") is not True:
            raise DirectoryActionRejected("Directory Service did not complete the requested action.")
        return result

    async def reset_password(
        self,
        target_sam_account_name: str,
        new_password: str,
        ticket_id: int | None = None,
    ) -> dict[str, Any]:
        return await self._post_execution(
            "/api/internal/execution/reset-password",
            {
                "target_sam_account_name": target_sam_account_name,
                "new_password": new_password,
                "ticket_id": ticket_id,
            },
        )

    async def add_group(
        self,
        target_sam_account_name: str,
        group_dns: list[str],
        ticket_id: int | None = None,
    ) -> dict[str, Any]:
        return await self._post_execution(
            "/api/internal/execution/add-group",
            {
                "target_sam_account_name": target_sam_account_name,
                "group_dns": group_dns,
                "ticket_id": ticket_id,
            },
        )
