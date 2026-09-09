"""Deterministic, ticket-scoped guidance from an approved knowledge catalog.

This module deliberately has no provider client, directory client, or persistence
side effects. It receives one ticket at a time and returns a bounded projection
that a technician can verify against the cited article.
"""

from dataclasses import dataclass
from typing import Final

from backend.models.ticket import Ticket


@dataclass(frozen=True)
class KnowledgeArticle:
    article_id: str
    title: str
    version: str
    keywords: tuple[str, ...]
    hypothesis: str
    checks: tuple[str, ...]


_CATALOG: Final[tuple[KnowledgeArticle, ...]] = (
    KnowledgeArticle("KB-ACCESS-001", "Restore account sign-in access", "1.0", ("sign in", "login", "log in", "cannot access"), "The account may require a basic access-state review.", ("Confirm the reported application and the time the issue began.", "Confirm the requester identity through the approved support process.", "Check the account state in MissionControl before proposing any action.")),
    KnowledgeArticle("KB-ACCESS-002", "Handle password reset requests", "1.0", ("password", "reset credentials", "forgot password"), "A password reset may be appropriate after identity verification.", ("Confirm identity using the approved verification procedure.", "Confirm the exact account identifier with the requester.", "Use the human-approved Directory action only after reviewing the proposal.")),
    KnowledgeArticle("KB-ACCESS-003", "Resolve account lockouts", "1.0", ("locked", "lockout", "too many attempts"), "Repeated failed attempts may have locked the account.", ("Confirm the lockout symptom and affected service.", "Check for a known stale saved credential or connected device.", "Review account status before considering an unlock workflow.")),
    KnowledgeArticle("KB-ACCESS-004", "Investigate account expiry", "1.0", ("expired", "expiry", "expiration"), "The account or a related entitlement may have expired.", ("Confirm the exact access error and when it started.", "Review the account expiry status in MissionControl.", "Escalate entitlement changes to the authorized owner when required.")),
    KnowledgeArticle("KB-ACCESS-005", "Investigate disabled accounts", "1.0", ("disabled", "deactivated", "inactive account"), "The account may be disabled by policy or an authorized workflow.", ("Confirm the requester identity and employment or access status.", "Review the account state and the associated ticket history.", "Escalate re-enablement decisions to the authorized owner.")),
    KnowledgeArticle("KB-GROUP-001", "Process group access requests", "1.0", ("group", "permission", "access request", "membership"), "The request may require an approved group-membership change.", ("Confirm the business purpose and approving owner.", "Confirm the exact approved group through MissionControl.", "Use the human-approved Directory action only after scope review.")),
    KnowledgeArticle("KB-MAIL-001", "Troubleshoot mail client access", "1.0", ("outlook", "email", "mailbox"), "The issue may be client configuration, service availability, or account access.", ("Confirm whether web mail and the desktop client fail in the same way.", "Record the exact error and affected device.", "Check service status before changing account settings.")),
    KnowledgeArticle("KB-ESC-001", "Escalate insufficiently evidenced incidents", "1.0", ("security", "suspicious", "incident", "urgent"), "The available ticket evidence is insufficient for a safe automated recommendation.", ("Preserve the reported facts and avoid destructive troubleshooting.", "Confirm the impact scope and the on-call escalation path.", "Escalate using the incident process when a security or service risk is indicated.")),
)


def _select_article(ticket: Ticket) -> KnowledgeArticle:
    searchable = f"{ticket.title} {ticket.description}".lower()
    scored = [
        (sum(keyword in searchable for keyword in article.keywords), article)
        for article in _CATALOG
    ]
    score, article = max(scored, key=lambda item: item[0])
    return article if score else _CATALOG[-1]


def build_ticket_guidance(ticket: Ticket) -> dict[str, object]:
    """Return a bounded guidance projection without echoing ticket content."""
    article = _select_article(ticket)
    category = ticket.category.replace("_", " ") if ticket.category else "unclassified"
    evidence_status = "supported" if article.article_id != "KB-ESC-001" else "insufficient"
    citation = {"article_id": article.article_id, "title": article.title, "version": article.version}
    return {
        "ticket_id": ticket.id,
        "evidence_status": evidence_status,
        "observations": [f"Ticket category is {category}.", "Guidance is based on the ticket currently being viewed."],
        "hypotheses": [article.hypothesis],
        "recommended_checks": [
            {"step": check, "citation": citation}
            for check in article.checks
        ],
        "citations": [citation],
        "notice": "Guidance is advisory. Verify each check and retain human approval for Directory actions.",
    }
