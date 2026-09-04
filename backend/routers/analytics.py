import logging
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.schemas import DashboardMetrics
from backend.models.ticket import Ticket, TicketPriority, TicketStatus, get_utc_now
from backend.services.llm_service import generate_weekly_digest
from backend.auth.technician import TechnicianIdentity, require_technician

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/metrics", response_model=DashboardMetrics)
def get_metrics(db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    now = get_utc_now()
    one_day_ago = now - timedelta(days=1)
    thirty_days_ago = now - timedelta(days=30)
    
    total_tickets = db.query(Ticket).count()
    
    if total_tickets == 0:
        return DashboardMetrics(
            total_tickets=0,
            open_tickets=0,
            in_progress_tickets=0,
            resolved_today=0,
            critical_open_count=0,
            high_priority_open_count=0,
            unassigned_tickets=0,
            average_resolution_time_hours=0.0,
            tickets_by_category={},
            tickets_by_source={},
            triage_completion_rate=0.0,
            duplicate_rate=0.0
        )
        
    open_tickets = db.query(Ticket).filter(Ticket.status == TicketStatus.open.value).count()
    in_progress_tickets = db.query(Ticket).filter(Ticket.status == TicketStatus.in_progress.value).count()
    
    resolved_today = db.query(Ticket).filter(
        Ticket.status == TicketStatus.resolved.value,
        Ticket.resolved_at >= one_day_ago
    ).count()
    
    critical_open_count = db.query(Ticket).filter(
        Ticket.status.in_([TicketStatus.open.value, TicketStatus.in_progress.value]),
        Ticket.priority == TicketPriority.critical.value
    ).count()
    
    high_priority_open_count = db.query(Ticket).filter(
        Ticket.status.in_([TicketStatus.open.value, TicketStatus.in_progress.value]),
        Ticket.priority == TicketPriority.high.value
    ).count()

    unassigned_tickets = db.query(Ticket).filter(
        Ticket.status.in_([TicketStatus.open.value, TicketStatus.in_progress.value]),
        or_(Ticket.assigned_to.is_(None), Ticket.assigned_to == "")
    ).count()
    
    # Average resolution time
    resolved_last_30_days = db.query(Ticket).filter(
        Ticket.status == TicketStatus.resolved.value,
        Ticket.resolved_at >= thirty_days_ago,
        Ticket.created_at != None,
        Ticket.resolved_at != None
    ).all()
    
    avg_res_time = 0.0
    if resolved_last_30_days:
        total_seconds = sum((t.resolved_at - t.created_at).total_seconds() for t in resolved_last_30_days)
        avg_res_time = (total_seconds / len(resolved_last_30_days)) / 3600.0

    # Breakdowns
    categories = db.query(Ticket.category, func.count(Ticket.id)).group_by(Ticket.category).all()
    tickets_by_category = {c[0] or "unclassified": c[1] for c in categories}
    
    sources = db.query(Ticket.source, func.count(Ticket.id)).group_by(Ticket.source).all()
    tickets_by_source = {s[0]: s[1] for s in sources}
    
    # Rates
    triaged_count = db.query(Ticket).filter(Ticket.triage_completed_at != None).count()
    triage_completion_rate = triaged_count / total_tickets
    
    duplicate_count = db.query(Ticket).filter(Ticket.is_duplicate == True).count()
    duplicate_rate = duplicate_count / total_tickets

    return DashboardMetrics(
        total_tickets=total_tickets,
        open_tickets=open_tickets,
        in_progress_tickets=in_progress_tickets,
        resolved_today=resolved_today,
        critical_open_count=critical_open_count,
        high_priority_open_count=high_priority_open_count,
        unassigned_tickets=unassigned_tickets,
        average_resolution_time_hours=round(avg_res_time, 2),
        tickets_by_category=tickets_by_category,
        tickets_by_source=tickets_by_source,
        triage_completion_rate=round(triage_completion_rate, 4),
        duplicate_rate=round(duplicate_rate, 4)
    )

@router.get("/trends")
def get_trends(db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    now = get_utc_now()
    seven_days_ago = now - timedelta(days=6)

    opened_rows = db.query(Ticket.created_at).filter(Ticket.created_at >= seven_days_ago).all()
    resolved_rows = db.query(Ticket.resolved_at).filter(
        Ticket.resolved_at != None,
        Ticket.resolved_at >= seven_days_ago
    ).all()

    opened_counts = {}
    for row in opened_rows:
        date_str = row.created_at.strftime('%Y-%m-%d')
        opened_counts[date_str] = opened_counts.get(date_str, 0) + 1

    closed_counts = {}
    for row in resolved_rows:
        date_str = row.resolved_at.strftime('%Y-%m-%d')
        closed_counts[date_str] = closed_counts.get(date_str, 0) + 1

    result = []
    for offset in range(7):
        day = seven_days_ago + timedelta(days=offset)
        date_str = day.strftime('%Y-%m-%d')
        result.append({
            "date": date_str,
            "opened": opened_counts.get(date_str, 0),
            "closed": closed_counts.get(date_str, 0),
        })

    return result

@router.get("/weekly-digest")
def get_weekly_digest(db: Session = Depends(get_db), _technician: TechnicianIdentity = Depends(require_technician)):
    seven_days_ago = get_utc_now() - timedelta(days=7)
    
    total_last_week = db.query(Ticket).filter(Ticket.created_at >= seven_days_ago).count()
    resolved_last_week = db.query(Ticket).filter(
        Ticket.resolved_at >= seven_days_ago,
        Ticket.status == TicketStatus.resolved.value
    ).count()
    
    categories = db.query(Ticket.category, func.count(Ticket.id)).filter(
        Ticket.created_at >= seven_days_ago
    ).group_by(Ticket.category).all()
    
    stats = {
        "new_tickets_this_week": total_last_week,
        "resolved_tickets_this_week": resolved_last_week,
        "category_breakdown": {c[0] or "unclassified": c[1] for c in categories}
    }
    
    digest = generate_weekly_digest(stats)
    return {"digest": digest}
