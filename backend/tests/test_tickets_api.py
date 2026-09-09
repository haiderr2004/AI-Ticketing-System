import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.models.database import Base, get_db
from backend.models.ticket import TicketStatus, Ticket, TicketEvent, TicketProcessingJob
from backend.auth.technician import TechnicianIdentity, require_technician
from backend.routers import tickets as tickets_router
from backend.services.directory_client import (
    DirectoryActionRejected,
    DirectoryServiceUnavailable,
)

# Setup an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    del app.dependency_overrides[get_db]

def test_create_ticket_success(client, db_session):
    response = client.post("/tickets/", json={
        "title": "My computer is broken",
        "description": "It won't turn on since the power outage yesterday.",
        "submitter_name": "Test User",
        "submitter_email": "test@example.com",
        "source": "web_form"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "My computer is broken"
    assert data["status"] == "open"
    assert "id" in data
    job = db_session.query(TicketProcessingJob).filter_by(ticket_id=data["id"]).one()
    assert job.status == "pending"
    assert job.job_type == "triage"

def test_create_ticket_validation_error(client):
    # Title too short (< 5 chars)
    response = client.post("/tickets/", json={
        "title": "Bad",
        "description": "This description is definitely long enough to pass validation.",
        "source": "web_form"
    })
    assert response.status_code == 422

def test_get_ticket_by_id(client):
    # Create first
    create_resp = client.post("/tickets/", json={
        "title": "Valid title here",
        "description": "Valid description length over 20 characters.",
        "source": "web_form"
    })
    ticket_id = create_resp.json()["id"]

    # Get
    response = client.get(f"/tickets/{ticket_id}")
    assert response.status_code == 200
    assert response.json()["id"] == ticket_id

def test_get_nonexistent_ticket(client):
    response = client.get("/tickets/9999")
    assert response.status_code == 404


def test_ticket_guidance_requires_a_technician_session(client, db_session):
    ticket = Ticket(title="Password reset request", description="The user forgot their password and needs help.")
    db_session.add(ticket)
    db_session.commit()

    response = client.get(f"/tickets/{ticket.id}/guidance")

    assert response.status_code == 401


def test_processing_health_requires_auth_and_exposes_only_counts(client):
    assert client.get("/tickets/processing/health").status_code == 401
    app.dependency_overrides[require_technician] = lambda: TechnicianIdentity(
        subject="jdoe", dn="CN=John Doe,OU=IT,DC=example,DC=test", exp_timestamp=1.0
    )
    try:
        response = client.get("/tickets/processing/health")
    finally:
        del app.dependency_overrides[require_technician]

    assert response.status_code == 200
    assert set(response.json()) == {"status", "pending", "running", "failed", "oldest_pending_age_seconds"}


def test_ticket_guidance_is_ticket_scoped_cited_and_redacted(client, db_session):
    ticket = Ticket(
        title="Password reset request",
        description="Reset access for jane.doe@example.test after verification.",
        submitter_email="jane.doe@example.test",
    )
    db_session.add(ticket)
    db_session.commit()
    app.dependency_overrides[require_technician] = lambda: TechnicianIdentity(
        subject="jdoe", dn="CN=John Doe,OU=IT,DC=example,DC=test", exp_timestamp=1.0
    )
    try:
        response = client.get(f"/tickets/{ticket.id}/guidance")
    finally:
        del app.dependency_overrides[require_technician]

    assert response.status_code == 200
    payload = response.json()
    assert payload["ticket_id"] == ticket.id
    assert payload["citations"] == [{"article_id": "KB-ACCESS-002", "title": "Handle password reset requests", "version": "1.0"}]
    assert "jane.doe@example.test" not in str(payload)
    assert len(payload["recommended_checks"]) == 3

def test_list_tickets_pagination(client):
    # Create 3 tickets
    for i in range(3):
        client.post("/tickets/", json={
            "title": f"Ticket number {i}",
            "description": "Valid description length over 20 characters.",
            "source": "web_form"
        })
        
    response = client.get("/tickets/?page=1&size=2")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["page"] == 1

def test_activity_events_require_a_technician_session(client):
    response = client.get("/tickets/activity/events")
    assert response.status_code == 401

def test_activity_events_filter_and_redact_directory_metadata(client, db_session):
    identity = TechnicianIdentity(subject="tech1", dn="CN=Tech,OU=IT,DC=example,DC=test", exp_timestamp=9999999999)
    app.dependency_overrides[require_technician] = lambda: identity
    ticket = Ticket(title="Activity test", description="A ticket used only for activity contract coverage.", source="web_form")
    db_session.add(ticket)
    db_session.commit()
    db_session.add_all([
        TicketEvent(ticket_id=ticket.id, actor_subject="tech1", actor_dn=identity.dn, event_type="DIRECTORY_ACTION_EXECUTED", new_value='{"action":"ADD_GROUP","target_sam_account_name":"testuser1","group_dns":["CN=Sensitive"]}'),
        TicketEvent(ticket_id=ticket.id, actor_subject="tech1", actor_dn=identity.dn, event_type="STATUS_CHANGED", new_value='"resolved"'),
    ])
    db_session.commit()
    now = datetime.now(timezone.utc)
    response = client.get("/tickets/activity/events", params={"start_at": (now - timedelta(days=1)).isoformat(), "end_at": (now + timedelta(minutes=1)).isoformat(), "target": "testuser1", "limit": 1, "offset": 0})
    del app.dependency_overrides[require_technician]
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["entries"][0]["target_account"] == "testuser1"
    assert data["entries"][0]["safe_metadata"] == {"action": "ADD_GROUP"}
    assert "group_dns" not in str(data)

def test_update_ticket_status_sets_resolved_at(client):
    create_resp = client.post("/tickets/", json={
        "title": "Need to resolve this",
        "description": "Valid description length over 20 characters.",
        "source": "web_form"
    })
    ticket_id = create_resp.json()["id"]
    
    # Assert initially no resolved_at
    assert create_resp.json()["resolved_at"] is None
    
    # Update to resolved
    unauthenticated = client.patch(f"/tickets/{ticket_id}", json={"status": "resolved"})
    assert unauthenticated.status_code == 401

    app.dependency_overrides[require_technician] = lambda: TechnicianIdentity(
        subject="portal_admin", dn="CN=Portal Admin,DC=example,DC=test", exp_timestamp=1.0
    )
    try:
        patch_resp = client.patch(f"/tickets/{ticket_id}", json={"status": "resolved"})
    finally:
        del app.dependency_overrides[require_technician]

    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "resolved"
    assert patch_resp.json()["resolved_at"] is not None


def test_directory_action_requires_a_technician_session(client):
    create_resp = client.post("/tickets/", json={
        "title": "Reset access for new employee",
        "description": "Please reset the account password for the new employee.",
        "source": "web_form",
    })

    response = client.post(
        f"/tickets/{create_resp.json()['id']}/approve-directory-action",
        json={
            "action": "reset_password",
            "target_sam_account_name": "jdoe",
            "new_password": "A-safe-test-password1!",
        },
    )

    assert response.status_code == 401


def test_invalid_directory_password_is_not_echoed_in_validation_response(client):
    submitted_password = "too-short"
    app.dependency_overrides[require_technician] = lambda: TechnicianIdentity(
        subject="jdoe", dn="CN=John Doe,OU=IT,DC=example,DC=test", exp_timestamp=1.0
    )
    try:
        response = client.post(
            "/tickets/1/approve-directory-action",
            json={
                "action": "reset_password",
                "target_sam_account_name": "jdoe",
                "new_password": submitted_password,
            },
        )
    finally:
        del app.dependency_overrides[require_technician]

    assert response.status_code == 422
    assert submitted_password not in response.text


def test_approved_directory_action_resolves_ticket_and_records_safe_event(client, db_session, monkeypatch):
    class FakeDirectoryClient:
        async def add_group(self, target_sam_account_name, group_dns, ticket_id):
            assert target_sam_account_name == "jdoe"
            assert group_dns == ["CN=IT-Staff,OU=IT,DC=example,DC=test"]
            assert ticket_id is not None
            return {"success": True, "ticket_id": ticket_id}

    monkeypatch.setattr(tickets_router, "DirectoryServiceClient", lambda: FakeDirectoryClient())
    app.dependency_overrides[require_technician] = lambda: TechnicianIdentity(
        subject="jdoe", dn="CN=John Doe,OU=IT,DC=example,DC=test", exp_timestamp=1.0
    )
    try:
        create_resp = client.post("/tickets/", json={
            "title": "Grant IT group access",
            "description": "Grant the employee the requested IT support group access.",
            "source": "web_form",
        })
        ticket_id = create_resp.json()["id"]
        response = client.post(
            f"/tickets/{ticket_id}/approve-directory-action",
            json={
                "action": "add_group",
                "target_sam_account_name": "jdoe",
                "group_dns": ["CN=IT-Staff,OU=IT,DC=example,DC=test"],
            },
        )
    finally:
        del app.dependency_overrides[require_technician]

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    events = db_session.query(TicketEvent).filter(TicketEvent.ticket_id == ticket_id).all()
    action_event = next(event for event in events if event.event_type == "DIRECTORY_ACTION_EXECUTED")
    assert action_event.actor_subject == "jdoe"
    assert '"ticket_id": ' in action_event.new_value
    assert "IT-Staff" not in action_event.new_value


def test_rejected_directory_action_stays_in_progress_and_is_audited(client, db_session, monkeypatch):
    class FakeDirectoryClient:
        async def reset_password(self, *_args, **_kwargs):
            raise DirectoryActionRejected("rejected")

    monkeypatch.setattr(tickets_router, "DirectoryServiceClient", lambda: FakeDirectoryClient())
    app.dependency_overrides[require_technician] = lambda: TechnicianIdentity(
        subject="jdoe", dn="CN=John Doe,OU=IT,DC=example,DC=test", exp_timestamp=1.0
    )
    try:
        create_resp = client.post("/tickets/", json={
            "title": "Reset access for test user",
            "description": "Please reset the password because the user cannot sign in.",
            "source": "web_form",
        })
        ticket_id = create_resp.json()["id"]
        response = client.post(
            f"/tickets/{ticket_id}/approve-directory-action",
            json={
                "action": "reset_password",
                "target_sam_account_name": "jdoe",
                "new_password": "A-safe-test-password1!",
            },
        )
    finally:
        del app.dependency_overrides[require_technician]

    assert response.status_code == 400
    ticket = db_session.query(Ticket).filter(Ticket.id == ticket_id).one()
    assert ticket.status == "in_progress"
    event = db_session.query(TicketEvent).filter(TicketEvent.ticket_id == ticket_id).one()
    assert event.event_type == "DIRECTORY_ACTION_FAILED"
    assert "A-safe-test-password1!" not in event.new_value


def test_unknown_directory_outcome_is_not_marked_resolved(client, db_session, monkeypatch):
    class FakeDirectoryClient:
        async def reset_password(self, *_args, **_kwargs):
            raise DirectoryServiceUnavailable("timeout")

    monkeypatch.setattr(tickets_router, "DirectoryServiceClient", lambda: FakeDirectoryClient())
    app.dependency_overrides[require_technician] = lambda: TechnicianIdentity(
        subject="jdoe", dn="CN=John Doe,OU=IT,DC=example,DC=test", exp_timestamp=1.0
    )
    try:
        create_resp = client.post("/tickets/", json={
            "title": "Reset access after a timeout",
            "description": "Please reset the password for the test account after timeout.",
            "source": "web_form",
        })
        ticket_id = create_resp.json()["id"]
        response = client.post(
            f"/tickets/{ticket_id}/approve-directory-action",
            json={
                "action": "reset_password",
                "target_sam_account_name": "jdoe",
                "new_password": "A-safe-test-password1!",
            },
        )
    finally:
        del app.dependency_overrides[require_technician]

    assert response.status_code == 503
    ticket = db_session.query(Ticket).filter(Ticket.id == ticket_id).one()
    assert ticket.status == "in_progress"
    event = db_session.query(TicketEvent).filter(TicketEvent.ticket_id == ticket_id).one()
    assert event.event_type == "DIRECTORY_ACTION_OUTCOME_UNKNOWN"

def test_search_parameter_filters_correctly(client, db_session):
    client.post("/tickets/", json={
        "title": "VPN is down",
        "description": "Valid description length over 20 characters.",
        "source": "web_form"
    })
    client.post("/tickets/", json={
        "title": "Printer jammed",
        "description": "Valid description length over 20 characters.",
        "source": "web_form"
    })
    
    response = client.get("/tickets/?search=VPN")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "VPN is down"
