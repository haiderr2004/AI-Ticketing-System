import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.ticket import Ticket
from backend.models.schemas import AskTicketsRequest, AskTicketsResponse
from backend.services.llm_service import ask_tickets
from backend.auth.technician import TechnicianIdentity, require_technician

logger = logging.getLogger(__name__)
router = APIRouter()


def _format_ticket_context(t: Ticket) -> str:
    """Build a rich context string for a single ticket."""
    lines = [
        f"Ticket #{t.id}: {t.title}",
        f"  Status: {t.status} | Priority: {t.priority} | Category: {t.category or 'unclassified'}",
        f"  Submitter: {t.submitter_name or 'Unknown'} <{t.submitter_email or 'no email'}>",
        f"  Source: {t.source} | Assigned to: {t.assigned_to or 'Unassigned'}",
        f"  Created: {t.created_at.strftime('%Y-%m-%d %H:%M') if t.created_at else 'unknown'}",
    ]
    if t.description:
        # Trim very long descriptions to keep context manageable
        desc = t.description.strip()
        if len(desc) > 400:
            desc = desc[:400] + "…"
        lines.append(f"  Description: {desc}")
    if t.ai_summary:
        lines.append(f"  AI Summary: {t.ai_summary}")
    if t.is_duplicate and t.duplicate_of_id:
        lines.append(f"  Duplicate of: #{t.duplicate_of_id} ({int((t.similarity_score or 0) * 100)}% match)")
    return "\n".join(lines)


@router.post("/ask", response_model=AskTicketsResponse)
def ask_triage_question(request: AskTicketsRequest, db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    question = request.question.strip()

    # Fetch all tickets — ordered newest first, cap at 300 to stay within token limits
    tickets = (
        db.query(Ticket)
        .order_by(Ticket.created_at.desc())
        .limit(300)
        .all()
    )

    if not tickets:
        return AskTicketsResponse(
            answer="There are no tickets in the system yet.",
            relevant_ticket_ids=[],
            context_chunks_used=0,
        )

    contexts = [_format_ticket_context(t) for t in tickets]
    answer_text, cited_ids = ask_tickets(question, contexts)

    return AskTicketsResponse(
        answer=answer_text,
        relevant_ticket_ids=cited_ids,
        context_chunks_used=len(contexts),
    )
