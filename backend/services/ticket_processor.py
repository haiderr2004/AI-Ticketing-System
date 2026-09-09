# pyright: reportGeneralTypeIssues=false
# pyright: reportAttributeAccessIssue=false

import logging
from ..models.database import SessionLocal
from ..models.ticket import Ticket, TicketStatus, TicketPriority, get_utc_now
from .llm_service import format_triage_reasoning, run_triage
from .embedding_service import add_ticket_embedding
from .duplicate_detector import check_for_duplicates
from .notification_service import notify_slack_new_ticket

logger = logging.getLogger(__name__)

def process_ticket(ticket_id: int) -> None:
    """Process one ticket. Durable retry decisions belong to the job queue."""
    db = SessionLocal()
    try:
        # Step 1: Load the ticket
        ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
        if not ticket:
            raise LookupError(f"Ticket {ticket_id} no longer exists.")

        # Step 2: AI Triage
        try:
            triage_result = run_triage(
                title=str(ticket.title), # type: ignore
                description=str(ticket.description), # type: ignore
                submitter_email=str(ticket.submitter_email or "") # type: ignore
            )
            ticket.category = triage_result.category.value # type: ignore
            ticket.priority = triage_result.priority.value # type: ignore
            ticket.ai_summary = triage_result.summary # type: ignore
            ticket.ai_draft_reply = triage_result.draft_reply # type: ignore
            ticket.ai_suggested_assignee = triage_result.suggested_assignee # type: ignore
            ticket.ai_confidence_score = triage_result.confidence_score # type: ignore
            ticket.triage_reasoning = format_triage_reasoning(triage_result) # type: ignore
        except Exception:
            logger.warning("Triage stage failed for ticket %s.", ticket_id)
            raise

        # Step 3: Vector Embeddings
        try:
            add_ticket_embedding(
                ticket_id=int(ticket.id), # type: ignore
                title=str(ticket.title), # type: ignore
                description=str(ticket.description), # type: ignore
                summary=str(ticket.ai_summary) if ticket.ai_summary else None # type: ignore
            )
        except Exception:
            logger.warning("Embedding stage failed for ticket %s; processing will continue.", ticket_id)

        # Step 4: Duplicate Detection
        try:
            duplicate_result = check_for_duplicates(
                db=db,
                ticket_id=int(ticket.id), # type: ignore
                title=str(ticket.title), # type: ignore
                description=str(ticket.description) # type: ignore
            )
            if duplicate_result.is_duplicate:
                ticket.is_duplicate = duplicate_result.is_duplicate # type: ignore
                ticket.duplicate_of_id = duplicate_result.duplicate_of_id # type: ignore
                ticket.similarity_score = duplicate_result.similarity_score # type: ignore
                ticket.status = TicketStatus.duplicate.value # type: ignore
                # We could append the explanation to triage_reasoning or handle it elsewhere
        except Exception:
            logger.warning("Duplicate detection failed for ticket %s; processing will continue.", ticket_id)

        # Step 5: Triage completion timestamp
        ticket.triage_completed_at = get_utc_now() # type: ignore

        # Step 6: Save changes
        db.commit()
        db.refresh(ticket)

        # Step 7: Slack Notification
        try:
            is_dup = bool(ticket.is_duplicate) # type: ignore
            if ticket.priority in [TicketPriority.high.value, TicketPriority.critical.value] and not is_dup: # type: ignore
                notify_slack_new_ticket(ticket)
        except Exception:
            logger.warning("Notification failed for ticket %s; processing is complete.", ticket_id)

    except Exception:
        db.rollback()
        raise
    finally:
        # Step 8: Close session
        db.close()
