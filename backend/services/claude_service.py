import json
import logging
import re
from typing import Any, Dict, List, Tuple

from openai import OpenAI

from backend.core.config import get_settings
from backend.models.schemas import TriageResult
from backend.models.ticket import TicketCategory, TicketPriority

settings = get_settings()
logger = logging.getLogger(__name__)


def _has_real_key(value: str) -> bool:
    normalized = (value or "").strip().lower()
    return bool(normalized and normalized not in {"your_anthropic_api_key_here", "changeme", "placeholder", ""})


# Use LM Studio / OpenAI-compatible client when key is set, otherwise local fallback
llm_client: OpenAI | None = None
if _has_real_key(settings.LLM_API_KEY):
    llm_client = OpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
    logger.info(f"LLM client initialised → {settings.LLM_BASE_URL} ({settings.LLM_MODEL})")
else:
    logger.warning("No LLM_API_KEY set. Using local heuristic fallback for all AI features.")

CATEGORY_RULES = (
    # Security — highest specificity, check first
    (("phishing", "malware", "ransomware", "virus", "breach", "hacked", "suspicious email", "suspicious link", "security incident"), TicketCategory.security, "Security Team"),
    # Access / Identity
    (("password", "reset password", "mfa", "two factor", "locked out", "cannot log in", "can't log in", "login", "log in", "sign in", "account locked", "access denied", "permissions", "no access"), TicketCategory.access_request, "Help Desk"),
    # Printing
    (("print", "printer", "printing", "scanner", "scanning", "scan", "copier", "fax", "toner", "ink cartridge", "paper jam"), TicketCategory.printing, "Help Desk"),
    # Email & Calendar
    (("email", "outlook", "calendar", "meeting invite", "teams meeting", "office 365", "o365", "mail", "inbox", "mailbox", "exchange", "send email", "receive email"), TicketCategory.email_calendar, "Help Desk"),
    # Hardware — computers, devices, peripherals
    (("computer", "pc", "desktop", "laptop", "not turning on", "won't turn on", "won't start", "black screen", "blue screen", "bsod", "monitor", "keyboard", "mouse", "screen", "display", "headset", "webcam", "device", "hardware", "battery", "charger", "overheating", "slow computer", "freezing", "frozen"), TicketCategory.hardware, "Help Desk"),
    # Software — apps, installations, crashes
    (("software", "install", "uninstall", "application", "app", "update", "upgrade", "licence", "license", "word", "excel", "powerpoint", "adobe", "chrome", "browser", "teams", "zoom", "program", "crashing", "crash", "error", "not loading", "not opening", "won't open", "bug", "broken", "exception"), TicketCategory.software, "Application Support"),
    # Networking — connectivity
    (("vpn", "wifi", "wi-fi", "internet", "network", "connectivity", "no connection", "can't connect", "connection dropped", "firewall", "dns", "ip address", "ethernet", "bandwidth", "slow internet", "remote access"), TicketCategory.networking, "Infrastructure Team"),
    # Infrastructure — servers, datacenter, outages
    (("server", "outage", "down", "database", "sql", "backup", "data centre", "data center", "virtual machine", "vm", "cloud", "storage", "latency", "performance issue", "data issue", "report query"), TicketCategory.infrastructure, "Infrastructure Team"),
    # Feature requests
    (("feature", "enhancement", "improvement", "new feature", "would like", "request", "suggestion"), TicketCategory.feature_request, "Application Support"),
)


def extract_json(text: str) -> str:
    """Helper to extract JSON block from AI output if it wraps it in markdown."""
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        return match.group(1)
    return text.strip()


def _clean_text(value: str) -> str:
    return " ".join((value or "").split())


def _friendly_name_from_email(submitter_email: str) -> str:
    local = (submitter_email or "").split("@")[0].strip()
    if not local:
        return "there"
    return local.replace(".", " ").replace("_", " ").title()


def _derive_priority(text: str, category: TicketCategory) -> TicketPriority:
    critical_terms = ("critical", "outage", "server down", "everyone", "all users", "whole office", "security breach", "ransomware", "hacked", "entire company", "business down")
    high_terms = ("urgent", "cannot", "can't", "unable", "not working", "won't turn on", "won't start", "black screen", "blue screen", "bsod", "locked out", "vpn", "no internet", "no access", "down", "broken", "not turning on", "stopped working")
    low_terms = ("how do i", "question", "minor", "suggestion", "would like", "enhancement")

    if any(term in text for term in critical_terms):
        return TicketPriority.critical
    if any(term in text for term in high_terms):
        return TicketPriority.high
    if category in (TicketCategory.feature_request,) or any(term in text for term in low_terms):
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
            best_matches = matches
            best_category = category
            best_assignee = assignee

    if not best_matches and any(word in combined_text for word in ("help", "issue", "problem", "not working", "broken")):
        return TicketCategory.support, "Help Desk", ["general support"]

    if not best_matches:
        return TicketCategory.other, "Help Desk", []

    return best_category, best_assignee, best_matches


def _build_local_triage(title: str, description: str, submitter_email: str, reason_prefix: str) -> TriageResult:
    clean_title = _clean_text(title)
    clean_description = _clean_text(description)
    category, assignee, matches = _infer_category_and_assignee(clean_title, clean_description)
    priority = _derive_priority(f"{clean_title} {clean_description}".lower(), category)

    first_sentence = re.split(r"(?<=[.!?])\s+", clean_description)[0] if clean_description else clean_title or "Support request received."
    summary = f"{clean_title}: {first_sentence}" if clean_title and first_sentence.lower() not in clean_title.lower() else (first_sentence or clean_title)
    summary = summary[:220] or "Support request received and queued for review."

    name = _friendly_name_from_email(submitter_email)
    draft_reply = (
        f"Hello {name}, we have received your support request about '{clean_title or 'your issue'}'. "
        f"It has been logged with a {priority.value} priority and routed to {assignee}. — IT Support"
    )

    confidence = 0.55 if not matches else min(0.9, 0.6 + (0.1 * len(matches)))
    reasoning = (
        f"{reason_prefix} Local triage matched keywords: {', '.join(matches)}."
        if matches else f"{reason_prefix} No strong keyword match was found, so the ticket was routed for general support review."
    )

    return TriageResult(
        category=category,
        priority=priority,
        summary=summary,
        draft_reply=draft_reply,
        suggested_assignee=assignee,
        confidence_score=round(confidence, 2),
        reasoning=reasoning,
    )


def run_triage(title: str, description: str, submitter_email: str) -> TriageResult:
    """Use LLM when available, otherwise fall back to local heuristic triage."""
    if not llm_client:
        logger.warning("No LLM client. Using local heuristic triage.")
        return _build_local_triage(title, description, submitter_email, "No AI model configured.")

    system_prompt = (
        "You are a senior IT support specialist triaging incoming support tickets. "
        "Output ONLY a valid raw JSON object. No markdown, no extra text — just the JSON."
    )

    user_prompt = f"""Triage this IT support ticket.

Title: {title}
Submitter Email: {submitter_email or 'Unknown'}
Description:
{description}

Instructions:
1. Category — pick exactly one: [{', '.join([c.value for c in TicketCategory])}]
2. Priority — pick exactly one: [{', '.join([p.value for p in TicketPriority])}]
3. Summary — 1-2 sentences describing the issue.
4. Draft reply — professional, empathetic, address the submitter by first name if derivable from email, end with '— IT Support'.
5. Suggested assignee — pick from: [Infrastructure Team, Security Team, Application Support, Database Team, Help Desk, Management]
6. Confidence score — 0.0 to 1.0.
7. Reasoning — 1-2 sentences explaining your classification.

Return ONLY this JSON:
{{
  "category": "...",
  "priority": "...",
  "summary": "...",
  "draft_reply": "...",
  "suggested_assignee": "...",
  "confidence_score": 0.0,
  "reasoning": "..."
}}"""

    try:
        response = llm_client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=1024,
        )
        content = response.choices[0].message.content or ""
        parsed_json = json.loads(extract_json(content))
        return TriageResult(**parsed_json)
    except Exception as e:
        logger.error(f"LLM triage failed: {e}")
        return _build_local_triage(title, description, submitter_email, "AI model was unavailable.")


def _build_local_ticket_answer(question: str, ticket_contexts: List[str], reason_prefix: str = "") -> Tuple[str, List[int]]:
    if not ticket_contexts:
        return "There is no ticket context available yet.", []

    question_lower = (question or "").lower()
    referenced_ids = sorted({int(match.group(1)) for match in re.finditer(r"#(\d+)", "\n\n".join(ticket_contexts))})
    open_count = sum(1 for ctx in ticket_contexts if "Status: open" in ctx)
    in_progress_count = sum(1 for ctx in ticket_contexts if "Status: in_progress" in ctx)
    resolved_count = sum(1 for ctx in ticket_contexts if "Status: resolved" in ctx)
    high_priority_count = sum(1 for ctx in ticket_contexts if "Priority: high" in ctx or "Priority: critical" in ctx)

    prefix = f"{reason_prefix} " if reason_prefix else ""

    if any(term in question_lower for term in ("how many", "count", "total")):
        answer = (
            f"{prefix}Based on the available ticket context, there are {len(ticket_contexts)} relevant ticket(s). "
            f"Open: {open_count}, in progress: {in_progress_count}, resolved: {resolved_count}."
        )
    elif any(term in question_lower for term in ("high priority", "critical", "urgent")):
        answer = f"{prefix}I found {high_priority_count} high or critical priority ticket(s) in the current context."
    elif any(term in question_lower for term in ("vpn", "login", "password", "email", "server", "outlook")):
        matching = [ctx.splitlines()[0] for ctx in ticket_contexts if any(term in ctx.lower() for term in question_lower.split())]
        if matching:
            answer = f"{prefix}Here are the most relevant ticket(s): " + "; ".join(matching[:3])
        else:
            answer = f"{prefix}I could not find a direct match in the current ticket context, but {len(ticket_contexts)} related ticket(s) were reviewed."
    else:
        answer = (
            f"{prefix}I reviewed {len(ticket_contexts)} relevant ticket(s). "
            f"Referenced tickets: {', '.join(f'#{ticket_id}' for ticket_id in referenced_ids[:5]) or 'none listed'}"
        )

    return answer, referenced_ids[:5]


def ask_tickets(question: str, ticket_contexts: List[str]) -> Tuple[str, List[int]]:
    """Answer a ticket question using the LLM with full ticket context."""
    if not llm_client:
        return _build_local_ticket_answer(question, ticket_contexts, "Using local ticket analysis.")

    context_text = "\n\n---\n\n".join(ticket_contexts)

    system_prompt = (
        "You are an expert IT support analytics assistant for TrueNorth Tech. "
        "You have access to the full ticket database shown below. "
        "Answer the user's question accurately using the ticket data provided. "
        "Always reference specific ticket IDs (e.g. #42) when relevant. "
        "Be concise, helpful, and professional. "
        "IMPORTANT: You are a read-only analytics assistant. You cannot modify tickets, assign tickets, "
        "change statuses, or take any actions in the system. If a user asks you to assign, resolve, close, "
        "or change anything, clearly explain that you cannot make changes and direct them to use the ticket "
        "detail page to make updates manually. "
        "If the answer cannot be determined from the available data, say so clearly."
    )
    user_prompt = f"=== TICKET DATABASE ===\n\n{context_text}\n\n=== QUESTION ===\n{question}"

    try:
        response = llm_client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=1024,
        )
        answer = response.choices[0].message.content or ""
        referenced_ids = sorted({int(m.group(1)) for m in re.finditer(r"#(\d+)", answer)})
        return answer, referenced_ids
    except Exception as e:
        logger.error(f"LLM ask_tickets failed: {e}")
        return _build_local_ticket_answer(question, ticket_contexts, "AI model was unavailable.")


def generate_weekly_digest(ticket_stats: Dict[str, Any]) -> str:
    """Generate a readable weekly summary from ticket statistics."""
    total      = ticket_stats.get("new_tickets_this_week", 0)
    resolved   = ticket_stats.get("resolved_tickets_this_week", 0)
    categories = ticket_stats.get("category_breakdown", {})
    top_cat    = max(categories, key=lambda k: categories[k]) if categories else "unclassified"

    if not llm_client:
        return (
            f"This week the service desk received {total} new ticket(s) and resolved {resolved}. "
            f"The most frequent category was {top_cat.replace('_', ' ')}."
        )

    try:
        response = llm_client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a senior IT manager writing a concise weekly digest for your support team. Keep it under 4 sentences, professional, and highlight trends."},
                {"role": "user",   "content": f"Weekly stats:\n{json.dumps(ticket_stats, indent=2)}"},
            ],
            temperature=0.4,
            max_tokens=300,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        logger.error(f"LLM weekly digest failed: {e}")
        return f"This week: {total} new ticket(s), {resolved} resolved. Top category: {top_cat.replace('_', ' ')}."

