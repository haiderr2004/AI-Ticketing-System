from types import SimpleNamespace

from backend.models.schemas import TriageResult
from backend.services import llm_service


def test_local_triage_proposes_only_an_explicit_password_reset_target(monkeypatch):
    monkeypatch.setattr(llm_service, "llm_client", None)

    result = llm_service.run_triage(
        title="Password reset request",
        description="Please reset password. Username: jdoe.",
        submitter_email="jane.doe@example.test",
    )

    assert isinstance(result, TriageResult)
    assert result.directory_action is not None
    assert result.directory_action.action == "reset_password"
    assert result.directory_action.target_sam_account_name == "jdoe"
    assert "jane.doe" not in result.directory_action.target_sam_account_name


def test_local_triage_does_not_treat_account_state_as_a_target(monkeypatch):
    monkeypatch.setattr(llm_service, "llm_client", None)

    result = llm_service.run_triage(
        title="Password reset request",
        description="My account is locked and I forgot my password.",
        submitter_email="jane.doe@example.test",
    )

    assert result.directory_action is None


def test_local_triage_proposes_group_request_without_executing_it(monkeypatch):
    monkeypatch.setattr(llm_service, "llm_client", None)

    result = llm_service.run_triage(
        title="Grant group access",
        description="Add to group. sAMAccountName: jdoe. Group: CN=IT-Staff,OU=IT,DC=example,DC=test",
        submitter_email="",
    )

    assert result.directory_action is not None
    assert result.directory_action.action == "add_group"
    assert result.directory_action.target_sam_account_name == "jdoe"
    assert result.directory_action.group_dns == ["CN=IT-Staff,OU=IT,DC=example,DC=test"]


def test_local_triage_preserves_nested_cn_group_dn(monkeypatch):
    monkeypatch.setattr(llm_service, "llm_client", None)

    result = llm_service.run_triage(
        title="Grant group access",
        description=(
            "Add to group. sAMAccountName: testuser1. "
            "Group: CN=Domain Guests,CN=Users,DC=homelab,DC=local"
        ),
        submitter_email="",
    )

    assert result.directory_action is not None
    assert result.directory_action.group_dns == [
        "CN=Domain Guests,CN=Users,DC=homelab,DC=local"
    ]


def test_reasoning_persists_safe_proposal_metadata_without_password(monkeypatch):
    monkeypatch.setattr(llm_service, "llm_client", None)
    result = llm_service.run_triage(
        title="Password reset request",
        description="Reset password for username: jdoe.",
        submitter_email="",
    )

    persisted_reasoning = llm_service.format_triage_reasoning(result)

    assert "[DIRECTORY_ACTION_PROPOSAL]" in persisted_reasoning
    assert '"target_sam_account_name": "jdoe"' in persisted_reasoning
    assert "new_password" not in persisted_reasoning


def test_openai_compatible_response_is_parsed(monkeypatch):
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content='{"category":"access_request","priority":"high","summary":"Reset requested","draft_reply":"Reply","suggested_assignee":"Help Desk","confidence_score":0.9,"reasoning":"Explicit request","directory_action":null}'
                )
            )
        ]
    )
    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_kwargs: response))
    )
    monkeypatch.setattr(llm_service, "llm_client", fake_client)

    result = llm_service.run_triage(
        title="Specific title",
        description="Specific description",
        submitter_email="user@example.test",
    )

    assert result.summary == "Reset requested"


def test_openai_compatible_prompt_includes_ticket_pii(monkeypatch):
    captured = {}
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content='{"category":"support","priority":"medium","summary":"Summary","draft_reply":"Reply","suggested_assignee":"Help Desk","confidence_score":0.7,"reasoning":"Reason"}'
                )
            )
        ]
    )

    def create(**kwargs):
        captured.update(kwargs)
        return response

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    monkeypatch.setattr(llm_service, "llm_client", fake_client)

    llm_service.run_triage(
        title="Specific title",
        description="Specific description",
        submitter_email="user@example.test",
    )

    prompt = captured["messages"][1]["content"]
    assert "Specific title" in prompt
    assert "Specific description" in prompt
    assert "user@example.test" in prompt


def test_malformed_provider_response_uses_local_fallback(monkeypatch):
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="not json"))]
    )
    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_kwargs: response))
    )
    monkeypatch.setattr(llm_service, "llm_client", fake_client)

    result = llm_service.run_triage(
        title="Application crash",
        description="The application crashes whenever it starts.",
        submitter_email="user@example.test",
    )

    assert isinstance(result, TriageResult)
    assert result.summary
    assert 0.0 <= result.confidence_score <= 1.0


def test_invalid_provider_confidence_uses_local_fallback(monkeypatch):
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content='{"category":"support","priority":"high","summary":"Summary","draft_reply":"Reply","suggested_assignee":"Help Desk","confidence_score":1.5,"reasoning":"Reason"}'
                )
            )
        ]
    )
    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_kwargs: response))
    )
    monkeypatch.setattr(llm_service, "llm_client", fake_client)

    result = llm_service.run_triage(
        title="Password reset",
        description="I am locked out of payroll.",
        submitter_email="user@example.test",
    )

    assert 0.0 <= result.confidence_score <= 1.0
    assert result.draft_reply


def test_provider_cannot_propose_a_target_missing_from_the_ticket(monkeypatch):
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content='{"category":"access_request","priority":"high","summary":"Reset requested","draft_reply":"Reply","suggested_assignee":"Help Desk","confidence_score":0.9,"reasoning":"Explicit request","directory_action":{"action":"reset_password","target_sam_account_name":"administrator","group_dns":[]}}'
                )
            )
        ]
    )
    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_kwargs: response))
    )
    monkeypatch.setattr(llm_service, "llm_client", fake_client)

    result = llm_service.run_triage(
        title="Password help",
        description="I forgot my password but did not include an account name.",
        submitter_email="user@example.test",
    )

    assert result.directory_action is None


def test_ask_tickets_uses_local_fallback_without_a_configured_provider(monkeypatch):
    monkeypatch.setattr(llm_service, "llm_client", None)

    answer, references = llm_service.ask_tickets(
        "how many tickets do we have",
        ["Ticket #4 - VPN down", "Ticket #7 - Password reset"],
    )

    assert "2 relevant ticket(s)" in answer
    assert references == [4, 7]


def test_ask_tickets_provider_failure_uses_local_fallback(monkeypatch):
    def fail(**_kwargs):
        raise RuntimeError("provider unavailable")

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=fail))
    )
    monkeypatch.setattr(llm_service, "llm_client", fake_client)

    answer, references = llm_service.ask_tickets(
        "how many tickets do we have",
        ["Ticket #4 - VPN down", "Ticket #7 - Password reset"],
    )

    assert "2 relevant ticket(s)" in answer
    assert references == [4, 7]
