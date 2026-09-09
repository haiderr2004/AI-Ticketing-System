# pyright: reportGeneralTypeIssues=false
# pyright: reportAttributeAccessIssue=false

import logging
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from ..models.database import get_db
from ..models.ticket import Ticket, TicketEvent, TicketProcessingJob, TicketStatus, get_utc_now
from ..models.schemas import (
    DirectoryActionApproval,
    TicketCreate,
    TicketUpdate,
    TicketResponse,
    TicketListResponse,
    TicketGuidanceResponse,
    ProcessingQueueHealth,
)
from ..services.embedding_service import remove_ticket_embedding
from ..services.job_queue import enqueue_ticket_processing
from ..services.technician_guidance import build_ticket_guidance
from ..services.notification_service import send_email_reply
from ..auth.technician import TechnicianIdentity, require_technician
from ..services.directory_client import (
    DirectoryActionRejected,
    DirectoryServiceClient,
    DirectoryServiceUnavailable,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_SAM_ACCOUNT_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_EVENT_TYPE_PATTERN = re.compile(r"^[A-Z0-9_]{1,64}$")
_ACTIVITY_CATEGORIES = {
    "ticket_workflow": {"STATUS_CHANGED", "ASSIGNMENT_CHANGED"},
    "account_access": {"DIRECTORY_ACTION_EXECUTED", "DIRECTORY_ACTION_FAILED", "DIRECTORY_ACTION_OUTCOME_UNKNOWN"},
    "group_access": {"DIRECTORY_ACTION_EXECUTED", "DIRECTORY_ACTION_FAILED", "DIRECTORY_ACTION_OUTCOME_UNKNOWN"},
    "profile": set(),
    "account_status": set(),
    "directory_view": set(),
    "directory_change": set(),
}
_ACTIVITY_RESULTS = {"success", "failed", "rejected", "in_progress", "unknown", "informational"}


def _activity_timestamp(value: str, name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        raise HTTPException(status_code=422, detail=f"{name} must be an ISO-8601 timestamp.") from None
    if parsed.tzinfo is None:
        raise HTTPException(status_code=422, detail=f"{name} must include a timezone.")
    return parsed.astimezone(timezone.utc)


def _activity_range(start_at: str | None, end_at: str | None) -> tuple[datetime, datetime]:
    if bool(start_at) != bool(end_at):
        raise HTTPException(status_code=422, detail="start_at and end_at must be provided together.")
    end = _activity_timestamp(end_at, "end_at") if end_at else get_utc_now()
    start = _activity_timestamp(start_at, "start_at") if start_at else end - timedelta(days=7)
    if start >= end or end - start > timedelta(days=31):
        raise HTTPException(status_code=422, detail="Date range must be positive and no more than 31 days.")
    return start, end


def _safe_activity_target(raw_value: str | None) -> tuple[str | None, dict[str, str]]:
    """Extract only explicit, safe directory correlation from an event payload."""
    if not raw_value or len(raw_value) > 4096:
        return None, {}
    try:
        parsed = json.loads(raw_value)
    except (TypeError, ValueError):
        return None, {}
    if not isinstance(parsed, dict):
        return None, {}
    target = parsed.get("target_sam_account_name")
    action = parsed.get("action")
    safe_target = target if isinstance(target, str) and _SAM_ACCOUNT_PATTERN.fullmatch(target) else None
    safe_action = action if isinstance(action, str) and _EVENT_TYPE_PATTERN.fullmatch(action.upper()) else None
    metadata = {"action": safe_action.upper()} if safe_action else {}
    return safe_target, metadata


def _ticket_activity_result(event_type: str) -> str:
    return {
        "DIRECTORY_ACTION_EXECUTED": "success",
        "DIRECTORY_ACTION_FAILED": "rejected",
        "DIRECTORY_ACTION_OUTCOME_UNKNOWN": "unknown",
        "STATUS_CHANGED": "success",
        "ASSIGNMENT_CHANGED": "informational",
    }.get(event_type, "informational")


def _ticket_activity_entry(event: TicketEvent) -> dict:
    target, metadata = _safe_activity_target(event.new_value)
    created_at = event.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return {
        "source": "ticketing",
        "source_id": f"ticket-event:{event.id}",
        "occurred_at": created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "category": "ticket_workflow" if event.event_type in {"STATUS_CHANGED", "ASSIGNMENT_CHANGED"} else "account_access",
        "raw_code": event.event_type if _EVENT_TYPE_PATTERN.fullmatch(event.event_type) else "UNAVAILABLE",
        "result": _ticket_activity_result(event.event_type),
        "actor": event.actor_subject if _SAM_ACCOUNT_PATTERN.fullmatch(event.actor_subject) else None,
        "target_account": target,
        "ticket_id": event.ticket_id,
        "safe_metadata": metadata,
    }


@router.get("/activity/events")
def get_ticket_activity_events(
    start_at: Optional[str] = None,
    end_at: Optional[str] = None,
    ticket_id: Optional[int] = Query(None, ge=1),
    actor: Optional[str] = None,
    target: Optional[str] = None,
    event_type: Optional[str] = None,
    category: Optional[str] = None,
    result: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _technician: TechnicianIdentity = Depends(require_technician),
):
    """Read a bounded, technician-authorized TicketEvent display projection."""
    start, end = _activity_range(start_at, end_at)
    if actor and not _SAM_ACCOUNT_PATTERN.fullmatch(actor):
        raise HTTPException(status_code=422, detail="actor is invalid.")
    if target and not _SAM_ACCOUNT_PATTERN.fullmatch(target):
        raise HTTPException(status_code=422, detail="target is invalid.")
    if event_type and not _EVENT_TYPE_PATTERN.fullmatch(event_type):
        raise HTTPException(status_code=422, detail="event_type is invalid.")
    if category and category not in _ACTIVITY_CATEGORIES:
        raise HTTPException(status_code=422, detail="category is invalid.")
    if result and result not in _ACTIVITY_RESULTS:
        raise HTTPException(status_code=422, detail="result is invalid.")

    # SQLite does not preserve timezone information for this legacy column.
    # Compare UTC-naive values at the persistence boundary, then serialize UTC
    # explicitly in the display projection below.
    query_start = start.replace(tzinfo=None)
    query_end = end.replace(tzinfo=None)
    query = db.query(TicketEvent).filter(TicketEvent.created_at >= query_start, TicketEvent.created_at <= query_end)
    if ticket_id:
        query = query.filter(TicketEvent.ticket_id == ticket_id)
    if actor:
        query = query.filter(TicketEvent.actor_subject == actor)
    if event_type:
        query = query.filter(TicketEvent.event_type == event_type)
    if category:
        query = query.filter(TicketEvent.event_type.in_(_ACTIVITY_CATEGORIES[category]))
    if result:
        matching_types = [code for code in {"DIRECTORY_ACTION_EXECUTED", "DIRECTORY_ACTION_FAILED", "DIRECTORY_ACTION_OUTCOME_UNKNOWN", "STATUS_CHANGED", "ASSIGNMENT_CHANGED"} if _ticket_activity_result(code) == result]
        if not matching_types:
            return {"entries": [], "total": 0, "limit": limit, "offset": offset}
        query = query.filter(TicketEvent.event_type.in_(matching_types))
    if target:
        # This is an exact, parameterized match on the explicit correlation
        # written by the directory-action workflow; descriptions are never searched.
        query = query.filter(
            func.json_valid(TicketEvent.new_value),
            func.json_extract(TicketEvent.new_value, "$.target_sam_account_name") == target,
        )

    total = query.count()
    events = query.order_by(TicketEvent.created_at.desc(), TicketEvent.id.desc()).offset(offset).limit(limit).all()
    return {"entries": [_ticket_activity_entry(event) for event in events], "total": total, "limit": limit, "offset": offset}

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
    db.flush()
    enqueue_ticket_processing(db, new_ticket)
    db.commit()
    db.refresh(new_ticket)
    return new_ticket


@router.get("/processing/health", response_model=ProcessingQueueHealth)
def get_processing_queue_health(
    db: Session = Depends(get_db),
    _technician: TechnicianIdentity = Depends(require_technician),
):
    counts = dict(
        db.query(TicketProcessingJob.status, func.count(TicketProcessingJob.id))
        .group_by(TicketProcessingJob.status)
        .all()
    )
    oldest = (
        db.query(TicketProcessingJob.created_at)
        .filter(TicketProcessingJob.status == "pending")
        .order_by(TicketProcessingJob.created_at)
        .first()
    )
    age_seconds = 0
    if oldest:
        created_at = oldest[0]
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age_seconds = max(0, int((get_utc_now() - created_at).total_seconds()))
    degraded = counts.get("failed", 0) > 0 or age_seconds > 300
    return {
        "status": "degraded" if degraded else "healthy",
        "pending": counts.get("pending", 0),
        "running": counts.get("running", 0),
        "failed": counts.get("failed", 0),
        "oldest_pending_age_seconds": age_seconds,
    }

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


@router.get("/{ticket_id}/guidance", response_model=TicketGuidanceResponse)
def get_ticket_guidance(
    ticket_id: int,
    db: Session = Depends(get_db),
    _technician: TechnicianIdentity = Depends(require_technician),
):
    """Return approved, bounded guidance for the one ticket being reviewed."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return build_ticket_guidance(ticket)


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
    """Queue durable re-triage for every ticket categorised as 'other'."""
    tickets = db.query(Ticket).filter(Ticket.category == "other").all()
    for ticket in tickets:
        enqueue_ticket_processing(db, ticket, job_type="retriage")
        ticket.triage_completed_at = None
    db.commit()
    return {"updated": len(tickets), "message": f"{len(tickets)} ticket(s) queued for re-triage"}


@router.post("/{ticket_id}/retriage", response_model=TicketResponse)
def retriage_ticket(ticket_id: int, db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    enqueue_ticket_processing(db, ticket, job_type="retriage")
    ticket.triage_completed_at = None
    db.commit()
    db.refresh(ticket)
    return ticket

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
