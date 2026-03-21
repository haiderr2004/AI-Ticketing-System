import logging
from sqlalchemy.orm import Session
from backend.services.embedding_service import find_similar_tickets
from backend.models.schemas import DuplicateCheckResult
from backend.models.ticket import Ticket, TicketStatus

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.85

def check_for_duplicates(db: Session, ticket_id: int, title: str, description: str) -> DuplicateCheckResult:
    """
    Checks if a ticket is a duplicate of an existing open ticket.
    Uses semantic similarity search over embeddings.
    """
    similar_tickets = find_similar_tickets(title, description, top_k=5, exclude_id=ticket_id)
    
    for matching_id, score in similar_tickets:
        if score >= SIMILARITY_THRESHOLD:
            # Check if matching ticket is open
            matching_ticket = db.query(Ticket).filter(Ticket.id == matching_id).first()
            if matching_ticket:
                is_open = matching_ticket.status not in [TicketStatus.resolved.value, TicketStatus.closed.value]
                
                if is_open:
                    explanation = (
                        f"This ticket closely matches ticket #{matching_id} "
                        f"('{matching_ticket.title}') with a similarity score of {score:.2f}."
                    )
                    return DuplicateCheckResult(
                        is_duplicate=True,
                        duplicate_of_id=matching_id,
                        similarity_score=score,
                        explanation=explanation
                    )
                    
    # No duplicate found
    return DuplicateCheckResult(
        is_duplicate=False,
        duplicate_of_id=None,
        similarity_score=None,
        explanation="No open duplicates detected."
    )
