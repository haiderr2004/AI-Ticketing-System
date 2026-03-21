import json
import logging
import re
from typing import Dict, Any, List, Tuple
from anthropic import Anthropic
from backend.core.config import get_settings
from backend.models.schemas import TriageResult
from backend.models.ticket import TicketPriority, TicketCategory

try:
    from google import genai
    from google.genai import types
    has_genai = True
except ImportError:
    has_genai = False

settings = get_settings()
logger = logging.getLogger(__name__)

# Initialize clients. The API key must be provided in settings.
anthropic_client = Anthropic(api_key=settings.ANTHROPIC_API_KEY) if settings.ANTHROPIC_API_KEY else None
gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY) if (has_genai and settings.GEMINI_API_KEY) else None

def extract_json(text: str) -> str:
    """Helper to extract JSON block from AI's response if it wraps it in markdown"""
    match = re.search(r'```(?:json)?\s*(.*?)\s*```', text, re.DOTALL)
    if match:
        return match.group(1)
    return text.strip()

def run_triage(title: str, description: str, submitter_email: str) -> TriageResult:
    """
    Uses Claude or Gemini to automatically triage an incoming ticket.
    Returns a structured TriageResult.
    """
    if not anthropic_client and not gemini_client:
        logger.warning("No AI API Key set. Returning fallback triage result.")
        return _get_fallback_triage()

    system_prompt = (
        "You are a highly skilled, senior IT support specialist tasked with triaging incoming support tickets. "
        "Your job is to read the ticket details and output ONLY a valid, raw JSON object matching the exact schema requested. "
        "Do not include any introductory or concluding text, and do not wrap the JSON in markdown blocks. Just the JSON."
    )

    user_prompt = f"""
Please triage the following IT support ticket.

Ticket Title: {title}
Submitter Email: {submitter_email or 'Unknown'}
Ticket Description:
{description}

Instructions:
1. Classify the ticket into exactly one of these categories:
   [{', '.join([c.value for c in TicketCategory])}]
2. Assign a priority from this exact list:
   [{', '.join([p.value for p in TicketPriority])}]
3. Write a concise 1-2 sentence summary of the issue.
4. Write a professional, empathetic draft reply to the submitter acknowledging their issue, addressing them by name if available from the email, and ending with '— IT Support'.
5. Suggest an assignee from this roster: [Infrastructure Team, Security Team, Application Support, Database Team, Help Desk, Management].
6. Provide a confidence score between 0.0 and 1.0 representing how clearly the ticket matches the chosen category and priority.
7. Provide a brief 1-2 sentence reasoning for your classification.

Your output MUST be parseable by Python's `json.loads()`.
Return ONLY this exact JSON structure:
{{
  "category": "chosen_category_here",
  "priority": "chosen_priority_here",
  "summary": "Your summary here...",
  "draft_reply": "Your draft reply here...",
  "suggested_assignee": "chosen_assignee_here",
  "confidence_score": 0.95,
  "reasoning": "Your reasoning here..."
}}
"""

    try:
        if gemini_client:
            response = gemini_client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=[system_prompt + "\n\n" + user_prompt],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=1024,
                )
            )
            content = response.text
        else:
            response = anthropic_client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1
            )
            content = response.content[0].text
            
        json_str = extract_json(content)
        parsed_json = json.loads(json_str)
        
        # Will raise ValidationError if shape is wrong, triggering fallback
        return TriageResult(**parsed_json)
        
    except Exception as e:
        logger.error(f"Failed to triage ticket via AI: {e}")
        return _get_fallback_triage()

def _get_fallback_triage() -> TriageResult:
    return TriageResult(
        category=TicketCategory.other,
        priority=TicketPriority.medium,
        summary="Automated triage failed. Needs manual review.",
        draft_reply="Hello, we have received your ticket and our team will review it shortly. — IT Support",
        suggested_assignee="Help Desk",
        confidence_score=0.0,
        reasoning="Fallback triggered due to AI error or missing API key."
    )

def ask_tickets(question: str, ticket_contexts: List[str]) -> Tuple[str, List[int]]:
    """
    Answers a user question based on historical ticket context.
    """
    if not anthropic_client and not gemini_client:
        return "AI API Key not set. Cannot perform search.", []
        
    context_text = "\n\n".join(ticket_contexts)
    
    system_prompt = (
        "You are an IT analytics assistant. Answer the user's question using ONLY the ticket contexts provided. "
        "If the answer is not contained in the context, say so. "
        "Always cite specific ticket IDs (e.g., '#42') in your answer."
    )
    
    user_prompt = f"Ticket Contexts:\n{context_text}\n\nQuestion: {question}"

    try:
        if gemini_client:
            response = gemini_client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=[system_prompt + "\n\n" + user_prompt],
                config=types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=1024,
                )
            )
            answer = response.text
        else:
            response = anthropic_client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0
            )
            answer = response.content[0].text
        
        # Extract referenced ticket IDs via regex (e.g., #123)
        referenced_ids = [int(match.group(1)) for match in re.finditer(r'#(\d+)', answer)]
        # De-duplicate
        referenced_ids = list(set(referenced_ids))
        
        return answer, referenced_ids
    except Exception as e:
        logger.error(f"Failed to answer question via AI: {e}")
        return "Sorry, I encountered an error while trying to answer your question.", []

def generate_weekly_digest(ticket_stats: Dict[str, Any]) -> str:
    """
    Generates a readable weekly summary from a stats dictionary.
    """
    if not anthropic_client and not gemini_client:
        return "AI digest unavailable. API Key not configured."
        
    system_prompt = "You are a senior IT manager writing a concise, professional weekly digest for your team."
    user_prompt = (
        f"Based on the following weekly ticket statistics, write a 3-4 sentence readable summary. "
        f"Highlight any alarming trends or positive outcomes.\n\nStats:\n{json.dumps(ticket_stats, indent=2)}"
    )

    try:
        if gemini_client:
            response = gemini_client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=[system_prompt + "\n\n" + user_prompt],
                config=types.GenerateContentConfig(
                    temperature=0.4,
                    max_output_tokens=500,
                )
            )
            return response.text.strip()
        else:
            response = anthropic_client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=500,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.4
            )
            return response.content[0].text.strip()
    except Exception as e:
        logger.error(f"Failed to generate digest via AI: {e}")
        return "Digest generation failed."
