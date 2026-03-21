import logging
import re
from fastapi import APIRouter, Depends, HTTPException, Header, BackgroundTasks, Request
from sqlalchemy.orm import Session
from backend.models.database import get_db
from backend.models.ticket import Ticket, TicketSource
from backend.models.schemas import EmailIngestRequest, SlackIngestRequest, TicketResponse
from backend.services.ticket_processor import process_ticket_async

logger = logging.getLogger(__name__)
router = APIRouter()

# Dependency for basic API key check
def verify_api_key(x_api_key: str = Header(None)):
    # For demo purposes, we accept "demo-secret" or any configured key
    # In a real app, you would validate against a hashed DB value or settings
    if x_api_key != "demo-secret":
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return x_api_key

@router.post("/email", response_model=TicketResponse)
def ingest_email(
    request: EmailIngestRequest, 
    background_tasks: BackgroundTasks, 
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
    db.commit()
    db.refresh(ticket)
    
    background_tasks.add_task(process_ticket_async, ticket.id)
    return ticket

@router.post("/slack", response_model=TicketResponse)
def ingest_slack(
    request: SlackIngestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
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
    db.commit()
    db.refresh(ticket)
    
    background_tasks.add_task(process_ticket_async, ticket.id)
    return ticket

@router.post("/github")
async def ingest_github(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
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
    db.commit()
    db.refresh(ticket)
    
    background_tasks.add_task(process_ticket_async, ticket.id)
    return {"status": "success", "ticket_id": ticket.id}

@router.post("/webhook")
async def ingest_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
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
    db.commit()
    db.refresh(ticket)
    
    background_tasks.add_task(process_ticket_async, ticket.id)
    return {"status": "success", "ticket_id": ticket.id}
