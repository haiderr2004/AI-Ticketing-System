"""Database-backed ticket work queue with bounded retries and stale-lock recovery."""

import logging
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.database import SessionLocal
from backend.models.ticket import Ticket, TicketProcessingJob, get_utc_now
from backend.services.ticket_processor import process_ticket


logger = logging.getLogger(__name__)
_LOCK_TIMEOUT = timedelta(minutes=10)


def enqueue_ticket_processing(db: Session, ticket: Ticket, job_type: str = "triage") -> TicketProcessingJob:
    """Add one active job per ticket/type; caller owns the transaction."""
    db.flush()
    active = (
        db.query(TicketProcessingJob)
        .filter(
            TicketProcessingJob.ticket_id == ticket.id,
            TicketProcessingJob.job_type == job_type,
            TicketProcessingJob.status.in_(("pending", "running")),
        )
        .order_by(TicketProcessingJob.id.desc())
        .first()
    )
    if active:
        return active
    job = TicketProcessingJob(
        ticket_id=ticket.id,
        job_type=job_type,
        idempotency_key=f"{job_type}:{ticket.id}:{uuid4().hex}",
    )
    try:
        with db.begin_nested():
            db.add(job)
            db.flush()
        return job
    except IntegrityError:
        # A concurrent request won the active-job race. The savepoint keeps the
        # caller's ticket transaction usable while we return the winning job.
        active = (
            db.query(TicketProcessingJob)
            .filter(
                TicketProcessingJob.ticket_id == ticket.id,
                TicketProcessingJob.job_type == job_type,
                TicketProcessingJob.status.in_(("pending", "running")),
            )
            .one()
        )
        return active


def claim_next_job(db: Session) -> TicketProcessingJob | None:
    now = get_utc_now()
    stale_before = now - _LOCK_TIMEOUT
    db.query(TicketProcessingJob).filter(
        TicketProcessingJob.status == "running",
        TicketProcessingJob.locked_at < stale_before,
        TicketProcessingJob.attempts >= TicketProcessingJob.max_attempts,
    ).update(
        {
            TicketProcessingJob.status: "failed",
            TicketProcessingJob.locked_at: None,
            TicketProcessingJob.last_error_code: "WORKER_TIMEOUT",
        },
        synchronize_session=False,
    )
    db.commit()
    eligible = or_(
        and_(TicketProcessingJob.status == "pending", TicketProcessingJob.available_at <= now),
        and_(
            TicketProcessingJob.status == "running",
            TicketProcessingJob.locked_at < stale_before,
            TicketProcessingJob.attempts < TicketProcessingJob.max_attempts,
        ),
    )
    query = db.query(TicketProcessingJob).filter(eligible).order_by(TicketProcessingJob.created_at, TicketProcessingJob.id)
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    job = query.first()
    if not job:
        return None
    job.status = "running"
    job.attempts += 1
    job.locked_at = now
    job.last_error_code = None
    db.commit()
    db.refresh(job)
    return job


def run_one_job() -> bool:
    """Claim and process at most one job. Returns whether work was claimed."""
    db = SessionLocal()
    try:
        job = claim_next_job(db)
        if not job:
            return False
        job_id, ticket_id = int(job.id), int(job.ticket_id)
    finally:
        db.close()

    try:
        process_ticket(ticket_id)
    except Exception:
        logger.warning("Ticket processing job %s failed.", job_id)
        _finish_job(job_id, succeeded=False)
    else:
        _finish_job(job_id, succeeded=True)
    return True


def _finish_job(job_id: int, succeeded: bool) -> None:
    db = SessionLocal()
    try:
        job = db.query(TicketProcessingJob).filter(TicketProcessingJob.id == job_id).one_or_none()
        if job is None:
            return
        now = get_utc_now()
        job.locked_at = None
        if succeeded:
            job.status = "completed"
            job.completed_at = now
            job.last_error_code = None
        elif job.attempts >= job.max_attempts:
            job.status = "failed"
            job.last_error_code = "PROCESSING_FAILED"
        else:
            job.status = "pending"
            job.available_at = now + timedelta(seconds=min(300, 15 * (2 ** (job.attempts - 1))))
            job.last_error_code = "PROCESSING_RETRY"
        db.commit()
    finally:
        db.close()
