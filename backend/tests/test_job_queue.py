from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.models.database import Base
from backend.models.ticket import Ticket, TicketProcessingJob, get_utc_now
from backend.services import job_queue
from backend.services.job_queue import claim_next_job, enqueue_ticket_processing


def _session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def _session_factory():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_enqueue_is_idempotent_while_work_is_active():
    db = _session()
    try:
        ticket = Ticket(title="Password reset request", description="A sufficiently detailed support request.")
        db.add(ticket)
        first = enqueue_ticket_processing(db, ticket)
        second = enqueue_ticket_processing(db, ticket)
        db.commit()

        assert first.id == second.id
        assert db.query(TicketProcessingJob).count() == 1
    finally:
        db.close()


def test_claim_marks_job_running_and_increments_attempts():
    db = _session()
    try:
        ticket = Ticket(title="VPN issue", description="A sufficiently detailed support request.")
        db.add(ticket)
        enqueue_ticket_processing(db, ticket)
        db.commit()

        claimed = claim_next_job(db)

        assert claimed is not None
        assert claimed.status == "running"
        assert claimed.attempts == 1
        assert claimed.locked_at is not None
        assert claim_next_job(db) is None
    finally:
        db.close()


def test_stale_running_job_can_be_reclaimed_without_exposing_an_error():
    db = _session()
    try:
        ticket = Ticket(title="Mail issue", description="A sufficiently detailed support request.")
        db.add(ticket)
        job = enqueue_ticket_processing(db, ticket)
        db.flush()
        job.status = "running"
        job.attempts = 1
        job.locked_at = get_utc_now() - timedelta(minutes=11)
        db.commit()

        claimed = claim_next_job(db)

        assert claimed is not None
        assert claimed.id == job.id
        assert claimed.attempts == 2
        assert claimed.last_error_code is None
    finally:
        db.close()


def test_exhausted_stale_job_is_failed_instead_of_left_running():
    db = _session()
    try:
        ticket = Ticket(title="Mail issue", description="A sufficiently detailed support request.")
        db.add(ticket)
        job = enqueue_ticket_processing(db, ticket)
        db.flush()
        job.status = "running"
        job.attempts = job.max_attempts
        job.locked_at = get_utc_now() - timedelta(minutes=11)
        db.commit()

        assert claim_next_job(db) is None
        db.refresh(job)
        assert job.status == "failed"
        assert job.last_error_code == "WORKER_TIMEOUT"
    finally:
        db.close()


def test_worker_completes_a_claimed_job(monkeypatch):
    factory = _session_factory()
    db = factory()
    ticket = Ticket(title="Account issue", description="A sufficiently detailed support request.")
    db.add(ticket)
    enqueue_ticket_processing(db, ticket)
    db.commit()
    ticket_id = ticket.id
    db.close()
    processed = []
    monkeypatch.setattr(job_queue, "SessionLocal", factory)
    monkeypatch.setattr(job_queue, "process_ticket", lambda claimed_ticket_id: processed.append(claimed_ticket_id))

    assert job_queue.run_one_job() is True

    db = factory()
    job = db.query(TicketProcessingJob).one()
    assert processed == [ticket_id]
    assert job.status == "completed"
    assert job.completed_at is not None
    db.close()


def test_worker_records_only_a_generic_retry_code(monkeypatch):
    factory = _session_factory()
    db = factory()
    ticket = Ticket(title="Account issue", description="A sufficiently detailed support request.")
    db.add(ticket)
    enqueue_ticket_processing(db, ticket)
    db.commit()
    db.close()
    monkeypatch.setattr(job_queue, "SessionLocal", factory)

    def fail(_ticket_id):
        raise RuntimeError("provider echoed sensitive ticket content")

    monkeypatch.setattr(job_queue, "process_ticket", fail)
    assert job_queue.run_one_job() is True

    db = factory()
    job = db.query(TicketProcessingJob).one()
    assert job.status == "pending"
    assert job.last_error_code == "PROCESSING_RETRY"
    assert "sensitive" not in str(job.last_error_code)
    db.close()
