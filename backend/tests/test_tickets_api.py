import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.models.database import Base, get_db
from backend.models.ticket import TicketStatus, Ticket

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

# Mock the background task so we don't call Claude during API tests
@pytest.fixture(autouse=True)
def mock_process_ticket_async():
    with patch("backend.routers.tickets.process_ticket_async") as mock_process:
        yield mock_process

def test_create_ticket_success(client):
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
    patch_resp = client.patch(f"/tickets/{ticket_id}", json={
        "status": "resolved"
    })
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "resolved"
    assert patch_resp.json()["resolved_at"] is not None

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
