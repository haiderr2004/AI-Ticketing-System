import pytest
import json
from unittest.mock import patch, MagicMock

from backend.services.claude_service import run_triage
from backend.models.schemas import TriageResult
from backend.models.ticket import TicketCategory, TicketPriority

@pytest.fixture
def mock_anthropic_client():
    with patch("backend.services.claude_service.anthropic_client") as mock_client:
        yield mock_client

def test_run_triage_valid_json(mock_anthropic_client):
    # Setup mock response
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text='''```json
{
  "category": "bug",
  "priority": "high",
  "summary": "Test summary",
  "draft_reply": "Test draft reply",
  "suggested_assignee": "Help Desk",
  "confidence_score": 0.95,
  "reasoning": "Test reasoning"
}
```''')]
    mock_anthropic_client.messages.create.return_value = mock_message

    result = run_triage(
        title="App crashing",
        description="The app crashes on startup.",
        submitter_email="user@test.com"
    )

    assert isinstance(result, TriageResult)
    assert result.category == TicketCategory.bug
    assert result.priority == TicketPriority.high
    assert result.confidence_score == 0.95
    assert result.summary == "Test summary"

def test_run_triage_malformed_json_fallback(mock_anthropic_client):
    # Setup mock response with invalid JSON
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="This is not JSON at all.")]
    mock_anthropic_client.messages.create.return_value = mock_message

    result = run_triage(
        title="App crashing",
        description="The app crashes on startup.",
        submitter_email="user@test.com"
    )

    # Should hit fallback
    assert isinstance(result, TriageResult)
    assert result.category == TicketCategory.other
    assert result.priority == TicketPriority.medium
    assert result.confidence_score == 0.0
    assert "Automated triage failed" in result.summary

def test_run_triage_prompt_includes_details(mock_anthropic_client):
    # Setup standard mock response
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text='{"category": "other", "priority": "low", "summary": "s", "draft_reply": "d", "suggested_assignee": "Help Desk", "confidence_score": 0.5, "reasoning": "r"}')]
    mock_anthropic_client.messages.create.return_value = mock_message

    run_triage(
        title="My Specific Title 123",
        description="My Specific Description 456",
        submitter_email="user@test.com"
    )

    # Verify the prompt passed to the API call
    call_kwargs = mock_anthropic_client.messages.create.call_args.kwargs
    messages = call_kwargs.get("messages", [])
    assert len(messages) == 1
    user_prompt = messages[0]["content"]

    assert "My Specific Title 123" in user_prompt
    assert "My Specific Description 456" in user_prompt
    assert "user@test.com" in user_prompt

def test_confidence_score_range():
    # If the mocked AI returns a confidence score outside 0-1, it should raise a ValidationError
    # and trigger fallback. Let's test that.
    with patch("backend.services.claude_service.anthropic_client") as client:
        mock_message = MagicMock()
        mock_message.content = [MagicMock(text='''{
          "category": "bug",
          "priority": "high",
          "summary": "s",
          "draft_reply": "d",
          "suggested_assignee": "Help Desk",
          "confidence_score": 1.5,
          "reasoning": "r"
        }''')]
        client.messages.create.return_value = mock_message

        result = run_triage("t", "d", "e")
        
        # 1.5 is > 1.0, so ValidationError happens in TriageResult instantiation -> fallback!
        assert result.confidence_score == 0.0
        assert result.category == TicketCategory.other
