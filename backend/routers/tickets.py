# pyright: reportGeneralTypeIssues=false
# pyright: reportAttributeAccessIssue=false

import logging
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..models.database import get_db
from ..models.ticket import Ticket, TicketEvent, TicketStatus, get_utc_now
from ..models.schemas import (
    DirectoryActionApproval,
    TicketCreate,
    TicketUpdate,
    TicketResponse,
    TicketListResponse,
)
from ..services.ticket_processor import process_ticket_async
from ..services.embedding_service import remove_ticket_embedding, add_ticket_embedding
from ..services.llm_service import format_triage_reasoning, run_triage
from ..services.duplicate_detector import check_for_duplicates
from ..services.notification_service import send_email_reply
from ..auth.technician import TechnicianIdentity, require_technician
from ..services.directory_client import (
    DirectoryActionRejected,
    DirectoryServiceClient,
    DirectoryServiceUnavailable,
)

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
    submitter_email: Optional[str] = Query(None),
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
    if submitter_email:
        query = query.filter(Ticket.submitter_email == submitter_email)

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
        items=tickets, # type: ignore
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

    background_tasks.add_task(process_ticket_async, int(new_ticket.id)) # type: ignore
    return new_ticket

@router.get("/{ticket_id}", response_model=TicketResponse)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket

@router.patch("/{ticket_id}", response_model=TicketResponse)
def update_ticket(ticket_id: int, ticket_update: TicketUpdate, db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    update_data = ticket_update.model_dump(exclude_unset=True)
    events: list[TicketEvent] = []
    
    if "status" in update_data:
        new_status = update_data["status"]
        previous_status = ticket.status
        if new_status == TicketStatus.resolved and ticket.status != TicketStatus.resolved: # type: ignore
            ticket.resolved_at = get_utc_now() # type: ignore
        ticket.status = new_status.value # type: ignore
        if previous_status != ticket.status:
            events.append(TicketEvent(ticket_id=ticket.id, actor_subject=_technician.subject, actor_dn=_technician.dn, event_type="STATUS_CHANGED", previous_value=json.dumps(previous_status), new_value=json.dumps(ticket.status)))
        
    if "priority" in update_data:
        ticket.priority = update_data["priority"].value # type: ignore
    if "category" in update_data:
        ticket.category = update_data["category"].value # type: ignore
    if "assigned_to" in update_data:
        previous_assignee = ticket.assigned_to
        ticket.assigned_to = update_data["assigned_to"] # type: ignore
        if previous_assignee != ticket.assigned_to:
            events.append(TicketEvent(ticket_id=ticket.id, actor_subject=_technician.subject, actor_dn=_technician.dn, event_type="ASSIGNMENT_CHANGED", previous_value=json.dumps(previous_assignee), new_value=json.dumps(ticket.assigned_to)))
    if "ai_draft_reply" in update_data:
        ticket.ai_draft_reply = update_data["ai_draft_reply"] # type: ignore

    db.add_all(events)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/approve-directory-action", response_model=TicketResponse)
async def approve_directory_action(
    ticket_id: int,
    approval: DirectoryActionApproval,
    db: Session = Depends(get_db),
    technician: TechnicianIdentity = Depends(require_technician),
):
    """Execute a one-time, technician-approved directory action for a ticket."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status in {
        TicketStatus.resolved.value,
        TicketStatus.closed.value,
        TicketStatus.duplicate.value,
    }:
        raise HTTPException(
            status_code=409,
            detail="Directory actions require an open or in-progress ticket.",
        )

    action_metadata = {
        "action": approval.action,
        "target_sam_account_name": approval.target_sam_account_name,
        "ticket_id": ticket_id,
    }
    client = DirectoryServiceClient()
    try:
        if approval.action == "reset_password":
            await client.reset_password(
                approval.target_sam_account_name,
                approval.new_password or "",
                ticket_id=ticket_id,
            )
        else:
            await client.add_group(
                approval.target_sam_account_name,
                approval.group_dns,
                ticket_id=ticket_id,
            )
    except DirectoryActionRejected:
        ticket.status = TicketStatus.in_progress.value
        db.add(
            TicketEvent(
                ticket_id=ticket.id,
                actor_subject=technician.subject,
                actor_dn=technician.dn,
                event_type="DIRECTORY_ACTION_FAILED",
                previous_value=None,
                new_value=json.dumps({**action_metadata, "result": "FAILED"}),
            )
        )
        db.commit()
        raise HTTPException(status_code=400, detail="Directory action was not completed.") from None
    except DirectoryServiceUnavailable:
        ticket.status = TicketStatus.in_progress.value
        db.add(
            TicketEvent(
                ticket_id=ticket.id,
                actor_subject=technician.subject,
                actor_dn=technician.dn,
                event_type="DIRECTORY_ACTION_OUTCOME_UNKNOWN",
                previous_value=None,
                new_value=json.dumps({**action_metadata, "result": "UNKNOWN"}),
            )
        )
        db.commit()
        raise HTTPException(
            status_code=503,
            detail="Directory Service outcome is unknown; check its audit log before retrying.",
        ) from None

    previous_status = ticket.status
    ticket.status = TicketStatus.resolved.value
    ticket.resolved_at = get_utc_now()
    db.add_all(
        [
            TicketEvent(
                ticket_id=ticket.id,
                actor_subject=technician.subject,
                actor_dn=technician.dn,
                event_type="DIRECTORY_ACTION_EXECUTED",
                previous_value=None,
                new_value=json.dumps({**action_metadata, "result": "SUCCESS"}),
            ),
            TicketEvent(
                ticket_id=ticket.id,
                actor_subject=technician.subject,
                actor_dn=technician.dn,
                event_type="STATUS_CHANGED",
                previous_value=json.dumps(previous_status),
                new_value=json.dumps(ticket.status),
            ),
        ]
    )
    db.commit()
    db.refresh(ticket)
    return ticket

@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(ticket_id: int, db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.status = TicketStatus.closed.value # type: ignore
    db.commit()

    try:
        remove_ticket_embedding(ticket_id)
    except Exception as e:
        logger.error(f"Failed to remove embedding during delete: {e}")

    return None

@router.post("/retriage-all")
def retriage_all_other(db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    """Re-triage every ticket currently categorised as 'other'."""
    tickets = db.query(Ticket).filter(Ticket.category == "other").all()
    updated = 0
    for ticket in tickets:
        try:
            triage_result = run_triage(
                title=str(ticket.title),
                description=str(ticket.description),
                submitter_email=str(ticket.submitter_email or "")
            )
            ticket.category = triage_result.category.value
            ticket.priority = triage_result.priority.value
            ticket.ai_summary = triage_result.summary
            ticket.ai_draft_reply = triage_result.draft_reply
            ticket.ai_suggested_assignee = triage_result.suggested_assignee
            ticket.ai_confidence_score = triage_result.confidence_score
            ticket.triage_reasoning = format_triage_reasoning(triage_result)
            ticket.triage_completed_at = get_utc_now()
            updated += 1
        except Exception as e:
            logger.error(f"Bulk retriage failed for ticket {ticket.id}: {e}")
    db.commit()
    return {"updated": updated, "message": f"{updated} ticket(s) re-triaged successfully"}


@router.post("/{ticket_id}/retriage", response_model=TicketResponse)
def retriage_ticket(ticket_id: int, db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

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
        
        # Re-add embedding
        add_ticket_embedding(
            ticket_id=int(ticket.id), # type: ignore
            title=str(ticket.title), # type: ignore
            description=str(ticket.description), # type: ignore
            summary=str(ticket.ai_summary) if ticket.ai_summary else None # type: ignore
        )

        # Run duplicate check again
        dup_check = check_for_duplicates(
            db, 
            ticket_id=int(ticket.id), # type: ignore
            title=str(ticket.title), # type: ignore
            description=str(ticket.description) # type: ignore
        )
        if dup_check.is_duplicate:
            ticket.is_duplicate = True # type: ignore
            ticket.duplicate_of_id = dup_check.duplicate_of_id # type: ignore
            ticket.similarity_score = dup_check.similarity_score # type: ignore
            ticket.status = TicketStatus.duplicate.value # type: ignore

        ticket.triage_completed_at = get_utc_now() # type: ignore
        
        db.commit()
        db.refresh(ticket)
        return ticket
    except Exception as e:
        logger.error(f"Retriage failed: {e}")
        raise HTTPException(status_code=500, detail="Retriage process failed")

@router.post("/{ticket_id}/send-reply")
def send_ticket_reply(ticket_id: int, db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
        
    if not ticket.submitter_email: # type: ignore
        raise HTTPException(status_code=400, detail="Ticket has no submitter email")
        
    if not ticket.ai_draft_reply: # type: ignore
        raise HTTPException(status_code=400, detail="Ticket has no draft reply to send")

    try:
        send_email_reply(
            to_email=str(ticket.submitter_email), # type: ignore
            to_name=str(ticket.submitter_name or ""), # type: ignore
            ticket_id=int(ticket.id), # type: ignore
            draft_reply=str(ticket.ai_draft_reply) # type: ignore
        )
        ticket.email_reply_sent = True # type: ignore
        db.commit()
        return {"status": "success", "message": "Reply sent successfully"}
    except Exception as e:
        logger.error(f"Failed to send reply: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email reply")
