import logging
from backend.models.database import SessionLocal
from backend.models.ticket import Ticket, TicketStatus, TicketPriority, get_utc_now
from backend.services.claude_service import run_triage
from backend.services.embedding_service import add_ticket_embedding
from backend.services.duplicate_detector import check_for_duplicates
from backend.services.notification_service import notify_slack_new_ticket

logger = logging.getLogger(__name__)

def process_ticket_async(ticket_id: int):
    """
    Background pipeline to fully process a newly created ticket.
    """
    db = SessionLocal()
    try:
        # Step 1: Load the ticket
        ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
        if not ticket:
            logger.error(f"Ticket #{ticket_id} not found in DB.")
            return

        # Step 2: AI Triage
        try:
            triage_result = run_triage(
                title=ticket.title,
                description=ticket.description,
                submitter_email=ticket.submitter_email or ""
            )
            ticket.category = triage_result.category.value
            ticket.priority = triage_result.priority.value
            ticket.ai_summary = triage_result.summary
            ticket.ai_draft_reply = triage_result.draft_reply
            ticket.ai_suggested_assignee = triage_result.suggested_assignee
            ticket.ai_confidence_score = triage_result.confidence_score
            ticket.triage_reasoning = triage_result.reasoning
        except Exception as e:
            logger.error(f"Error during triage for ticket #{ticket_id}: {e}")

        # Step 3: Vector Embeddings
        try:
            add_ticket_embedding(
                ticket_id=ticket.id,
                title=ticket.title,
                description=ticket.description,
                summary=ticket.ai_summary
            )
        except Exception as e:
            logger.error(f"Error during embedding for ticket #{ticket_id}: {e}")

        # Step 4: Duplicate Detection
        try:
            duplicate_result = check_for_duplicates(
                db=db,
                ticket_id=ticket.id,
                title=ticket.title,
                description=ticket.description
            )
            if duplicate_result.is_duplicate:
                ticket.is_duplicate = duplicate_result.is_duplicate
                ticket.duplicate_of_id = duplicate_result.duplicate_of_id
                ticket.similarity_score = duplicate_result.similarity_score
                ticket.status = TicketStatus.duplicate.value
                # We could append the explanation to triage_reasoning or handle it elsewhere
        except Exception as e:
            logger.error(f"Error during duplicate detection for ticket #{ticket_id}: {e}")

        # Step 5: Triage completion timestamp
        ticket.triage_completed_at = get_utc_now()

        # Step 6: Save changes
        db.commit()
        db.refresh(ticket)

        # Step 7: Slack Notification
        try:
            if ticket.priority in [TicketPriority.high.value, TicketPriority.critical.value] and not ticket.is_duplicate:
                notify_slack_new_ticket(ticket)
        except Exception as e:
            logger.error(f"Error sending Slack notification for ticket #{ticket_id}: {e}")

    except Exception as e:
        logger.error(f"Unhandled error in process_ticket_async for ticket #{ticket_id}: {e}")
        db.rollback()
    finally:
        # Step 8: Close session
        db.close()
