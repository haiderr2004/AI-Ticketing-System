import pytest
import chromadb
from unittest.mock import patch, MagicMock
import numpy as np

from backend.services.duplicate_detector import check_for_duplicates
from backend.services.embedding_service import _get_combined_text, add_ticket_embedding
from backend.models.ticket import Ticket, TicketStatus

class MockSentenceTransformer:
    def encode(self, text):
        # Return a simple deterministic embedding based on keywords so tests can pass without real models
        embedding = np.zeros(384)
        if "VPN" in text:
            embedding[0] = 1.0
        elif "mouse" in text:
            embedding[1] = 1.0
        elif "printer" in text:
            embedding[2] = 1.0
            if "cyan ink" not in text:
                # Add a component to change the angle, so cosine similarity is less than 1
                # e.g. [0, 0, 1, 0.8] vs [0, 0, 1, 0] 
                # dot product = 1, magnitudes = 1 and sqrt(1.64) ~ 1.28
                # cosine = 1 / 1.28 = 0.78 (which is below default 0.85)
                embedding[3] = 0.8
        return embedding

@pytest.fixture(autouse=True)
def setup_ephemeral_chromadb(monkeypatch):
    """
    Replaces the persistent ChromaDB client with an in-memory (ephemeral) one
    for the duration of the tests. Also ensures we have a valid collection.
    """
    client = chromadb.EphemeralClient()
    try:
        client.delete_collection("test_tickets")
    except Exception:
        pass
    collection = client.get_or_create_collection(name="test_tickets", metadata={"hnsw:space": "cosine"})
    
    # Patch the global module variables in embedding_service
    monkeypatch.setattr("backend.services.embedding_service.chroma_client", client)
    monkeypatch.setattr("backend.services.embedding_service.collection", collection)
    
    # Also patch the model so tests don't require internet or large downloads
    monkeypatch.setattr("backend.services.embedding_service.model", MockSentenceTransformer())
    
    yield collection

@pytest.fixture
def mock_db_session():
    # Mocking the SQLAlchemy session to return mock Ticket objects
    session = MagicMock()
    
    def mock_query(*args, **kwargs):
        query_mock = MagicMock()
        def mock_filter(*filter_args, **filter_kwargs):
            filter_mock = MagicMock()
            def mock_first():
                # We need to simulate the DB lookup: returning an Open ticket
                t = Ticket(id=1, title="Original Ticket", status=TicketStatus.open.value)
                return t
            filter_mock.first = mock_first
            return filter_mock
        query_mock.filter = mock_filter
        return query_mock
        
    session.query = mock_query
    return session

def test_identical_tickets_are_duplicates(mock_db_session):
    # Add an initial ticket to our in-memory chroma
    add_ticket_embedding(ticket_id=101, title="VPN Broken", description="VPN drops every 5 minutes after KB5034441.", summary=None)
    
    # Check a new, virtually identical ticket
    result = check_for_duplicates(mock_db_session, ticket_id=201, title="VPN Broken", description="VPN drops every 5 minutes after KB5034441.")
    
    assert result.is_duplicate is True
    assert result.duplicate_of_id == 101
    assert result.similarity_score is not None
    assert result.similarity_score >= 0.99
    assert "matches ticket #101" in result.explanation

def test_unrelated_tickets_are_not_duplicates(mock_db_session):
    add_ticket_embedding(ticket_id=102, title="VPN Broken", description="VPN drops every 5 minutes after KB5034441.", summary=None)
    
    result = check_for_duplicates(mock_db_session, ticket_id=202, title="Need new mouse", description="My mouse scroll wheel is completely broken.")
    
    assert result.is_duplicate is False
    assert result.duplicate_of_id is None
    # Score should be below the 0.85 threshold

def test_ticket_not_duplicate_of_itself(mock_db_session):
    add_ticket_embedding(ticket_id=103, title="VPN Broken", description="VPN drops every 5 minutes.", summary=None)
    
    # We pass exclude_id=103
    result = check_for_duplicates(mock_db_session, ticket_id=103, title="VPN Broken", description="VPN drops every 5 minutes.")
    
    assert result.is_duplicate is False

def test_similarity_threshold_can_be_adjusted(mock_db_session, monkeypatch):
    add_ticket_embedding(ticket_id=104, title="Printer issue", description="The printer is out of cyan ink.", summary=None)
    
    # We query with something slightly similar but not identical
    # By default, it might score around 0.6 - 0.7
    # Let's drop the threshold to 0.1 to force a match
    monkeypatch.setattr("backend.services.duplicate_detector.SIMILARITY_THRESHOLD", 0.1)
    
    result = check_for_duplicates(mock_db_session, ticket_id=204, title="Printer broken", description="The printer has no ink left.")
    
    assert result.is_duplicate is True
