import logging
import re
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from backend.core.config import get_settings
from backend.models.database import get_db
from backend.models.schemas import EmailIngestRequest, SlackIngestRequest, TicketResponse
from backend.models.ticket import Ticket, TicketSource
from backend.services.email_ingestion import is_email_ingestion_configured, poll_mailbox
from backend.services.job_queue import enqueue_ticket_processing

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


# Dependency for basic API key check
def verify_api_key(x_api_key: str | None = Header(None)):
    expected_key = settings.INGEST_API_KEY.strip()
    if not expected_key:
        raise HTTPException(status_code=503, detail="Ingestion is not configured")
    if not x_api_key or not secrets.compare_digest(x_api_key, expected_key):
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return x_api_key

@router.get("/email/status")
def email_ingestion_status(_api_key: str = Depends(verify_api_key)):
    return {
        "configured": is_email_ingestion_configured(),
        "imap_host": settings.IMAP_HOST,
        "poll_interval_seconds": settings.EMAIL_POLL_INTERVAL,
    }


@router.post("/email/poll")
def ingest_email_poll(api_key: str = Depends(verify_api_key)):
    return poll_mailbox()


@router.post("/email", response_model=TicketResponse)
def ingest_email(
    request: EmailIngestRequest,
    db: Session = Depends(get_db),
    api_key: str = Depends(verify_api_key)
):
    ticket = Ticket(
        title=request.subject[:255],
        description=request.body,
        submitter_name=request.sender_name,
        submitter_email=request.sender_email,
        source=TicketSource.email.value
    )
    db.add(ticket)
    db.flush()
    enqueue_ticket_processing(db, ticket)
    db.commit()
    db.refresh(ticket)
    return ticket

@router.post("/slack", response_model=TicketResponse)
def ingest_slack(
    request: SlackIngestRequest,
    db: Session = Depends(get_db),
    _api_key: str = Depends(verify_api_key),
):
    # Clean up Slack user mention formatting like <@U123456>
    clean_text = re.sub(r'<@[A-Z0-9]+>', '', request.text).strip()
    
    ticket = Ticket(
        title=f"Slack request from {request.user_name}",
        description=clean_text or "No content provided",
        submitter_name=request.user_name,
        submitter_email=request.user_email,
        source=TicketSource.slack.value
    )
    db.add(ticket)
    db.flush()
    enqueue_ticket_processing(db, ticket)
    db.commit()
    db.refresh(ticket)
    return ticket

@router.post("/github")
async def ingest_github(
    request: Request,
    db: Session = Depends(get_db),
    _api_key: str = Depends(verify_api_key),
):
    payload = await request.json()
    action = payload.get("action")
    
    # Only process "opened" actions
    if action != "opened":
        return {"status": "ignored", "reason": f"action '{action}' not supported"}
        
    issue = payload.get("issue", {})
    title = issue.get("title", "GitHub Issue")
    body = issue.get("body", "No description")
    user = issue.get("user", {})
    author_login = user.get("login", "Unknown")
    
    ticket = Ticket(
        title=title[:255],
        description=body,
        submitter_name=author_login,
        source=TicketSource.github.value
    )
    db.add(ticket)
    db.flush()
    enqueue_ticket_processing(db, ticket)
    db.commit()
    db.refresh(ticket)
    return {"status": "success", "ticket_id": ticket.id}

@router.post("/webhook")
async def ingest_webhook(
    request: Request,
    db: Session = Depends(get_db),
    _api_key: str = Depends(verify_api_key),
):
    payload = await request.json()
    title = payload.get("title")
    description = payload.get("description")
    
    if not title or not description:
        raise HTTPException(status_code=422, detail="Webhook payload must include 'title' and 'description'")
        
    ticket = Ticket(
        title=title[:255],
        description=description,
        source=TicketSource.api.value
    )
    db.add(ticket)
    db.flush()
    enqueue_ticket_processing(db, ticket)
    db.commit()
    db.refresh(ticket)
    return {"status": "success", "ticket_id": ticket.id}
