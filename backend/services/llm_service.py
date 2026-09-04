"""OpenAI-compatible AI triage and ticket-question service.

This module only creates suggestions. It never calls the Directory Service or
executes an action; a signed-in technician must approve any proposal later.
"""

import json
import logging
import re
from typing import Any, Dict, List, Tuple

from openai import OpenAI

from backend.core.config import get_settings
from backend.models.schemas import DirectoryActionProposal, TriageResult
from backend.models.ticket import TicketCategory, TicketPriority


settings = get_settings()
logger = logging.getLogger(__name__)

_PROPOSAL_MARKER = "\n\n[DIRECTORY_ACTION_PROPOSAL]\n"
_SAM_FIELD = re.compile(
    r"\b(?:(?:samaccountname|sam account name|username|user name)\s*(?:is|:|=)|account\s*[:=])\s*([A-Za-z0-9][A-Za-z0-9._-]{0,63})\b",
    re.IGNORECASE,
)
_MENTIONED_SAM = re.compile(r"(?<![A-Za-z0-9._-])@([A-Za-z0-9][A-Za-z0-9._-]{0,63})\b")
_GROUP_DN = re.compile(
    r"\bCN=[^,\r\n]+(?:,(?:CN|OU|DC)=[^,\r\n]+)+",
    re.IGNORECASE,
)


def _has_configured_key(value: str) -> bool:
    normalized = (value or "").strip().lower()
    return bool(normalized and normalized not in {"changeme", "placeholder", ""})


llm_client: OpenAI | None = None
if _has_configured_key(settings.LLM_API_KEY):
    llm_client = OpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
    logger.info("OpenAI-compatible LLM client initialized for %s", settings.LLM_BASE_URL)
else:
    logger.warning("No LLM_API_KEY set. Using local heuristic fallback for AI features.")


CATEGORY_RULES = (
    (("phishing", "malware", "ransomware", "virus", "breach", "hacked", "suspicious email", "suspicious link", "security incident"), TicketCategory.security, "Security Team"),
    (("password", "reset password", "mfa", "two factor", "locked out", "cannot log in", "can't log in", "login", "log in", "sign in", "account locked", "access denied", "permissions", "no access"), TicketCategory.access_request, "Help Desk"),
    (("print", "printer", "printing", "scanner", "scanning", "scan", "copier", "fax", "toner", "ink cartridge", "paper jam"), TicketCategory.printing, "Help Desk"),
    (("email", "outlook", "calendar", "meeting invite", "teams meeting", "office 365", "o365", "mail", "inbox", "mailbox", "exchange", "send email", "receive email"), TicketCategory.email_calendar, "Help Desk"),
    (("computer", "pc", "desktop", "laptop", "not turning on", "won't turn on", "won't start", "black screen", "blue screen", "bsod", "monitor", "keyboard", "mouse", "screen", "display", "headset", "webcam", "device", "hardware", "battery", "charger", "overheating", "slow computer", "freezing", "frozen"), TicketCategory.hardware, "Help Desk"),
    (("software", "install", "uninstall", "application", "app", "update", "upgrade", "licence", "license", "word", "excel", "powerpoint", "adobe", "chrome", "browser", "teams", "zoom", "program", "crashing", "crash", "error", "not loading", "not opening", "won't open", "bug", "broken", "exception"), TicketCategory.software, "Application Support"),
    (("vpn", "wifi", "wi-fi", "internet", "network", "connectivity", "no connection", "can't connect", "connection dropped", "firewall", "dns", "ip address", "ethernet", "bandwidth", "slow internet", "remote access"), TicketCategory.networking, "Infrastructure Team"),
    (("server", "outage", "down", "database", "sql", "backup", "data centre", "data center", "virtual machine", "vm", "cloud", "storage", "latency", "performance issue", "data issue", "report query"), TicketCategory.infrastructure, "Infrastructure Team"),
    (("feature", "enhancement", "improvement", "new feature", "would like", "request", "suggestion"), TicketCategory.feature_request, "Application Support"),
)


def extract_json(text: str) -> str:
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    return match.group(1) if match else text.strip()


def _clean_text(value: str) -> str:
    return " ".join((value or "").split())


def _friendly_name_from_email(submitter_email: str) -> str:
    local = (submitter_email or "").split("@")[0].strip()
    return local.replace(".", " ").replace("_", " ").title() if local else "there"


def _derive_priority(text: str, category: TicketCategory) -> TicketPriority:
    if any(term in text for term in ("critical", "outage", "server down", "everyone", "all users", "whole office", "security breach", "ransomware", "hacked", "entire company", "business down")):
        return TicketPriority.critical
    if any(term in text for term in ("urgent", "cannot", "can't", "unable", "not working", "won't turn on", "won't start", "black screen", "blue screen", "bsod", "locked out", "vpn", "no internet", "no access", "down", "broken", "not turning on", "stopped working")):
        return TicketPriority.high
    if category == TicketCategory.feature_request or any(term in text for term in ("how do i", "question", "minor", "suggestion", "would like", "enhancement")):
        return TicketPriority.low
    return TicketPriority.medium


def _infer_category_and_assignee(title: str, description: str) -> Tuple[TicketCategory, str, List[str]]:
    combined_text = f"{title} {description}".lower()
    best_matches: List[str] = []
    best_category = TicketCategory.support
    best_assignee = "Help Desk"
    for keywords, category, assignee in CATEGORY_RULES:
        matches = [keyword for keyword in keywords if keyword in combined_text]
        if len(matches) > len(best_matches):
            best_matches, best_category, best_assignee = matches, category, assignee
    if not best_matches and any(word in combined_text for word in ("help", "issue", "problem", "not working", "broken")):
        return TicketCategory.support, "Help Desk", ["general support"]
    return best_category, best_assignee, best_matches


def _extract_sam_account_name(text: str) -> str | None:
    match = _SAM_FIELD.search(text) or _MENTIONED_SAM.search(text)
    return match.group(1) if match else None


def detect_directory_action(title: str, description: str) -> DirectoryActionProposal | None:
    """Suggest only supported actions when the ticket explicitly identifies a user."""
    combined = f"{title}\n{description}"
    target = _extract_sam_account_name(combined)
    if not target:
        return None
    normalized = combined.casefold()
    if any(phrase in normalized for phrase in ("reset password", "password reset", "forgot password", "forgotten password")):
        return DirectoryActionProposal(action="reset_password", target_sam_account_name=target)
    if any(phrase in normalized for phrase in ("add to group", "group membership", "grant access", "group access")):
        group_match = _GROUP_DN.search(combined)
        return DirectoryActionProposal(
            action="add_group",
            target_sam_account_name=target,
            group_dns=[group_match.group(0).rstrip(" .;")] if group_match else [],
        )
    return None


def format_triage_reasoning(result: TriageResult) -> str:
    """Store proposal metadata inside the existing reasoning field, never separately."""
    if not result.directory_action:
        return result.reasoning
    proposal = result.directory_action.model_dump()
    return f"{result.reasoning}{_PROPOSAL_MARKER}{json.dumps(proposal, sort_keys=True)}"


def _build_local_triage(title: str, description: str, submitter_email: str, reason_prefix: str) -> TriageResult:
    clean_title, clean_description = _clean_text(title), _clean_text(description)
    category, assignee, matches = _infer_category_and_assignee(clean_title, clean_description)
    priority = _derive_priority(f"{clean_title} {clean_description}".lower(), category)
    first_sentence = re.split(r"(?<=[.!?])\s+", clean_description)[0] if clean_description else clean_title or "Support request received."
    summary = (f"{clean_title}: {first_sentence}" if clean_title and first_sentence.lower() not in clean_title.lower() else first_sentence or clean_title)[:220]
    reasoning = f"{reason_prefix} Local triage matched keywords: {', '.join(matches)}." if matches else f"{reason_prefix} No strong keyword match was found, so the ticket was routed for general support review."
    proposal = detect_directory_action(clean_title, clean_description)
    if proposal:
        reasoning += " A directory action is only a technician-reviewed proposal."
    return TriageResult(
        category=category,
        priority=priority,
        summary=summary or "Support request received and queued for review.",
        draft_reply=f"Hello {_friendly_name_from_email(submitter_email)}, we have received your support request about '{clean_title or 'your issue'}'. It has been logged with a {priority.value} priority and routed to {assignee}. — IT Support",
        suggested_assignee=assignee,
        confidence_score=round(0.55 if not matches else min(0.9, 0.6 + (0.1 * len(matches))), 2),
        reasoning=reasoning,
        directory_action=proposal,
    )


def _with_deterministic_proposal(result: TriageResult, title: str, description: str) -> TriageResult:
    """Trust only proposals derived from explicit, supported ticket text."""
    proposal = detect_directory_action(title, description)
    return result.model_copy(update={"directory_action": proposal})


def run_triage(title: str, description: str, submitter_email: str) -> TriageResult:
    """Use the configured OpenAI-compatible provider or the local heuristic fallback."""
    if not llm_client:
        return _build_local_triage(title, description, submitter_email, "No AI model configured.")
    system_prompt = "You are a senior IT support specialist. Return only valid JSON; you only suggest actions and never execute them."
    user_prompt = f"""Triage this IT support ticket.

Title: {title}
Submitter Email: {submitter_email or 'Unknown'}
Description: {description}

Return category, priority, summary, draft_reply, suggested_assignee, confidence_score (0-1), reasoning, and directory_action.
directory_action must be null or {{"action":"reset_password"|"add_group", "target_sam_account_name":"explicit sAMAccountName from the ticket", "group_dns":["only explicit full DNs"]}}.
Never infer a target from an email address. Never propose unsupported actions. The proposal requires a technician's later approval.
"""
    try:
        response = llm_client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            temperature=0.1,
            max_tokens=1024,
        )
        parsed = TriageResult(**json.loads(extract_json(response.choices[0].message.content or "")))
        return _with_deterministic_proposal(parsed, title, description)
    except Exception:
        logger.exception("OpenAI-compatible triage failed; using local fallback.")
        return _build_local_triage(title, description, submitter_email, "AI model was unavailable.")


def _build_local_ticket_answer(question: str, ticket_contexts: List[str], reason_prefix: str = "") -> Tuple[str, List[int]]:
    if not ticket_contexts:
        return "There is no ticket context available yet.", []
    referenced_ids = sorted({int(match.group(1)) for match in re.finditer(r"#(\d+)", "\n\n".join(ticket_contexts))})
    prefix = f"{reason_prefix} " if reason_prefix else ""
    if "how many" in question.lower() or "count" in question.lower() or "total" in question.lower():
        return f"{prefix}Based on the available ticket context, there are {len(ticket_contexts)} relevant ticket(s).", referenced_ids[:5]
    return f"{prefix}I reviewed {len(ticket_contexts)} relevant ticket(s). Referenced tickets: {', '.join(f'#{ticket_id}' for ticket_id in referenced_ids[:5]) or 'none listed'}", referenced_ids[:5]


def ask_tickets(question: str, ticket_contexts: List[str]) -> Tuple[str, List[int]]:
    if not llm_client:
        return _build_local_ticket_answer(question, ticket_contexts, "Using local ticket analysis.")
    context_text = "\n\n---\n\n".join(ticket_contexts)
    try:
        response = llm_client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a read-only ticket analytics assistant. Never take or suggest executing actions."},
                {"role": "user", "content": f"=== TICKET DATABASE ===\n\n{context_text}\n\n=== QUESTION ===\n{question}"},
            ],
            temperature=0.0,
            max_tokens=1024,
        )
        answer = response.choices[0].message.content or ""
        return answer, sorted({int(match.group(1)) for match in re.finditer(r"#(\d+)", answer)})[:5]
    except Exception:
        logger.exception("OpenAI-compatible ticket question failed; using local fallback.")
        return _build_local_ticket_answer(question, ticket_contexts, "AI model was unavailable.")


def generate_weekly_digest(ticket_stats: Dict[str, Any]) -> str:
    total, resolved = ticket_stats.get("new_tickets_this_week", 0), ticket_stats.get("resolved_tickets_this_week", 0)
    if not llm_client:
        return f"This week the service desk received {total} new ticket(s) and resolved {resolved}."
    try:
        response = llm_client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[{"role": "system", "content": "Write a concise professional IT support weekly digest."}, {"role": "user", "content": json.dumps(ticket_stats)}],
            temperature=0.4,
            max_tokens=300,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception:
        logger.exception("OpenAI-compatible weekly digest failed; using local fallback.")
        return f"This week the service desk received {total} new ticket(s) and resolved {resolved}."
