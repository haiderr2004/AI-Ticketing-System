from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from backend.models.ticket import TicketStatus, TicketPriority, TicketCategory, TicketSource

# Request Schemas
class TicketCreate(BaseModel):
    title: str = Field(..., min_length=5, max_length=255)
    description: str = Field(..., min_length=20)
    source: TicketSource = Field(default=TicketSource.web_form)
    submitter_name: Optional[str] = None
    submitter_email: Optional[EmailStr] = None

class TicketUpdate(BaseModel):
    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None
    category: Optional[TicketCategory] = None
    assigned_to: Optional[str] = None
    ai_draft_reply: Optional[str] = None

class EmailIngestRequest(BaseModel):
    subject: str
    body: str
    sender_email: EmailStr
    sender_name: Optional[str] = None
    received_at: datetime

class SlackIngestRequest(BaseModel):
    text: str
    user_email: EmailStr
    user_name: str
    channel_name: str

class AskTicketsRequest(BaseModel):
    question: str

# Response Schemas
class TicketResponse(BaseModel):
    id: int
    created_at: datetime
    updated_at: datetime
    
    submitter_name: Optional[str]
    submitter_email: Optional[str]
    source: str
    
    title: str
    description: str
    
    ai_summary: Optional[str]
    ai_draft_reply: Optional[str]
    ai_suggested_assignee: Optional[str]
    ai_confidence_score: Optional[float]
    triage_reasoning: Optional[str]
    
    status: str
    priority: Optional[str]
    category: Optional[str]
    assigned_to: Optional[str]
    
    is_duplicate: bool
    duplicate_of_id: Optional[int]
    similarity_score: Optional[float]
    
    slack_notified: bool
    email_reply_sent: bool
    
    triage_completed_at: Optional[datetime]
    resolved_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

class TicketListResponse(BaseModel):
    items: List[TicketResponse]
    total: int
    page: int
    size: int

class TriageResult(BaseModel):
    category: TicketCategory
    priority: TicketPriority
    summary: str
    draft_reply: str
    suggested_assignee: str
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    reasoning: str

class DuplicateCheckResult(BaseModel):
    is_duplicate: bool
    duplicate_of_id: Optional[int]
    similarity_score: Optional[float]
    explanation: str

class DashboardMetrics(BaseModel):
    total_tickets: int
    open_tickets: int
    in_progress_tickets: int
    resolved_today: int
    critical_open_count: int
    high_priority_open_count: int
    average_resolution_time_hours: float
    tickets_by_category: Dict[str, int]
    tickets_by_source: Dict[str, int]
    triage_completion_rate: float
    duplicate_rate: float

class AskTicketsResponse(BaseModel):
    answer: str
    relevant_ticket_ids: List[int]
    context_chunks_used: int
