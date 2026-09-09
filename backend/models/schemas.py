from pydantic import BaseModel, Field, ConfigDict, EmailStr, model_validator
from typing import Literal, Optional, List, Dict, Any
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


class DirectoryActionApproval(BaseModel):
    """A one-time technician approval for an already supported AD operation."""

    action: Literal["reset_password", "add_group"]
    target_sam_account_name: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    new_password: Optional[str] = Field(default=None, min_length=12, max_length=512)
    group_dns: List[str] = Field(default_factory=list, min_length=0, max_length=25)

    @model_validator(mode="after")
    def validate_action_payload(self) -> "DirectoryActionApproval":
        if self.action == "reset_password":
            if not self.new_password:
                raise ValueError("A new password is required for a password reset.")
            if self.group_dns:
                raise ValueError("Group assignments are not valid for a password reset.")
        elif self.action == "add_group":
            if not self.group_dns:
                raise ValueError("At least one group is required for a group assignment.")
            if self.new_password is not None:
                raise ValueError("A password is not valid for a group assignment.")
        return self


class DirectoryActionProposal(BaseModel):
    """AI-suggested directory action that still requires technician approval."""

    action: Literal["reset_password", "add_group"]
    target_sam_account_name: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    group_dns: List[str] = Field(default_factory=list, max_length=25)

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
    summary: str = Field(min_length=1, max_length=220)
    draft_reply: str = Field(min_length=1, max_length=2000)
    suggested_assignee: str = Field(min_length=1, max_length=100)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    reasoning: str = Field(min_length=1, max_length=1000)
    directory_action: Optional[DirectoryActionProposal] = None

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
    unassigned_tickets: int
    average_resolution_time_hours: float
    tickets_by_category: Dict[str, int]
    tickets_by_source: Dict[str, int]
    triage_completion_rate: float
    duplicate_rate: float


class GuidanceCitation(BaseModel):
    article_id: str = Field(pattern=r"^KB-[A-Z]+-\d{3}$")
    title: str = Field(min_length=1, max_length=160)
    version: str = Field(pattern=r"^\d+\.\d+$")


class GuidanceCheck(BaseModel):
    step: str = Field(min_length=1, max_length=500)
    citation: GuidanceCitation


class TicketGuidanceResponse(BaseModel):
    ticket_id: int = Field(ge=1)
    evidence_status: Literal["supported", "insufficient"]
    observations: List[str] = Field(max_length=8)
    hypotheses: List[str] = Field(max_length=3)
    recommended_checks: List[GuidanceCheck] = Field(max_length=3)
    citations: List[GuidanceCitation] = Field(max_length=3)
    notice: str = Field(min_length=1, max_length=300)


class ProcessingQueueHealth(BaseModel):
    status: Literal["healthy", "degraded"]
    pending: int = Field(ge=0)
    running: int = Field(ge=0)
    failed: int = Field(ge=0)
    oldest_pending_age_seconds: int = Field(ge=0)
