import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.models.database import get_db
from backend.models.ticket import Ticket, TicketStatus, get_utc_now
from backend.models.schemas import TicketCreate, TicketUpdate, TicketResponse, TicketListResponse
from backend.services.ticket_processor import process_ticket_async
from backend.services.embedding_service import remove_ticket_embedding, add_ticket_embedding
from backend.services.claude_service import run_triage
from backend.services.duplicate_detector import check_for_duplicates
from backend.services.notification_service import send_email_reply

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/", response_model=TicketListResponse)
def get_tickets(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    category_filter: Optional[str] = Query(None, alias="category"),
    source_filter: Optional[str] = Query(None, alias="source"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Ticket)

    if status_filter and status_filter != "All statuses":
        query = query.filter(Ticket.status == status_filter.lower().replace(" ", "_"))
    if priority_filter and priority_filter != "All priorities":
        query = query.filter(Ticket.priority == priority_filter.lower())
    if category_filter and category_filter != "All categories":
        query = query.filter(Ticket.category == category_filter.lower())
    if source_filter and source_filter != "All sources":
        query = query.filter(Ticket.source == source_filter.lower().replace(" ", "_"))

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Ticket.title.ilike(search_term),
                Ticket.description.ilike(search_term),
                Ticket.ai_summary.ilike(search_term)
            )
        )

    total = query.count()
    tickets = query.order_by(Ticket.created_at.desc()).offset((page - 1) * size).limit(size).all()

    return TicketListResponse(
        items=tickets,
        total=total,
        page=page,
        size=size
    )

@router.post("/", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def create_ticket(
    ticket_in: TicketCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    new_ticket = Ticket(
        title=ticket_in.title,
        description=ticket_in.description,
        source=ticket_in.source.value,
        submitter_name=ticket_in.submitter_name,
        submitter_email=ticket_in.submitter_email
    )
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)

    background_tasks.add_task(process_ticket_async, new_ticket.id)
    return new_ticket

@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket

@router.patch("/{ticket_id}", response_model=TicketResponse)
def update_ticket(ticket_id: int, ticket_update: TicketUpdate, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    update_data = ticket_update.model_dump(exclude_unset=True)
    
    if "status" in update_data:
        new_status = update_data["status"]
        if new_status == TicketStatus.resolved and ticket.status != TicketStatus.resolved:
            ticket.resolved_at = get_utc_now()
        ticket.status = new_status.value
        
    if "priority" in update_data:
        ticket.priority = update_data["priority"].value
    if "category" in update_data:
        ticket.category = update_data["category"].value
    if "assigned_to" in update_data:
        ticket.assigned_to = update_data["assigned_to"]
    if "ai_draft_reply" in update_data:
        ticket.ai_draft_reply = update_data["ai_draft_reply"]

    db.commit()
    db.refresh(ticket)
    return ticket

@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.status = TicketStatus.closed.value
    db.commit()

    try:
        remove_ticket_embedding(ticket_id)
    except Exception as e:
        logger.error(f"Failed to remove embedding during delete: {e}")

    return None

@router.post("/{ticket_id}/retriage", response_model=TicketResponse)
def retriage_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

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
        
        # Re-add embedding
        add_ticket_embedding(
            ticket_id=ticket.id,
            title=ticket.title,
            description=ticket.description,
            summary=ticket.ai_summary
        )

        # Run duplicate check again
        dup_check = check_for_duplicates(db, ticket.id, ticket.title, ticket.description)
        if dup_check.is_duplicate:
            ticket.is_duplicate = True
            ticket.duplicate_of_id = dup_check.duplicate_of_id
            ticket.similarity_score = dup_check.similarity_score
            ticket.status = TicketStatus.duplicate.value

        ticket.triage_completed_at = get_utc_now()
        
        db.commit()
        db.refresh(ticket)
        return ticket
    except Exception as e:
        logger.error(f"Retriage failed: {e}")
        raise HTTPException(status_code=500, detail="Retriage process failed")

@router.post("/{ticket_id}/send-reply")
def send_ticket_reply(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    if not ticket.submitter_email:
        raise HTTPException(status_code=400, detail="Ticket has no submitter email")
        
    if not ticket.ai_draft_reply:
        raise HTTPException(status_code=400, detail="Ticket has no draft reply to send")

    try:
        send_email_reply(
            to_email=ticket.submitter_email,
            to_name=ticket.submitter_name or "",
            ticket_id=ticket.id,
            draft_reply=ticket.ai_draft_reply
        )
        ticket.email_reply_sent = True
        db.commit()
        return {"status": "success", "message": "Reply sent successfully"}
    except Exception as e:
        logger.error(f"Failed to send reply: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email reply")
