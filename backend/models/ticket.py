import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, Enum as SQLAlchemyEnum, ForeignKey
from backend.models.database import Base

class TicketStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"
    duplicate = "duplicate"

class TicketPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class TicketCategory(str, enum.Enum):
    bug = "bug"
    feature_request = "feature_request"
    support = "support"
    infrastructure = "infrastructure"
    security = "security"
    access_request = "access_request"
    other = "other"

class TicketSource(str, enum.Enum):
    email = "email"
    web_form = "web_form"
    slack = "slack"
    api = "api"
    github = "github"

def get_utc_now():
    return datetime.now(timezone.utc)

class Ticket(Base):
    __tablename__ = "tickets"

    # Identity columns
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, server_default=None)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    # Submitter columns
    submitter_name = Column(String, nullable=True)
    submitter_email = Column(String, nullable=True)
    source = Column(String, nullable=False, default=TicketSource.web_form.value)

    # Content columns
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)

    # AI-generated columns
    ai_summary = Column(Text, nullable=True)
    ai_draft_reply = Column(Text, nullable=True)
    ai_suggested_assignee = Column(String, nullable=True)
    ai_confidence_score = Column(Float, nullable=True)
    triage_reasoning = Column(Text, nullable=True)

    # Classification columns
    status = Column(String, nullable=False, default=TicketStatus.open.value)
    priority = Column(String, nullable=True)
    category = Column(String, nullable=True)
    assigned_to = Column(String, nullable=True)

    # Duplicate detection columns
    is_duplicate = Column(Boolean, default=False)
    duplicate_of_id = Column(Integer, ForeignKey("tickets.id"), nullable=True)
    similarity_score = Column(Float, nullable=True)

    # Notification columns
    slack_notified = Column(Boolean, default=False)
    email_reply_sent = Column(Boolean, default=False)

    # Timing columns
    triage_completed_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
