import logging
import httpx
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from backend.core.config import get_settings
from backend.models.ticket import TicketPriority

logger = logging.getLogger(__name__)
settings = get_settings()

def get_priority_emoji(priority: str) -> str:
    if priority == TicketPriority.critical.value:
        return "🔴"
    elif priority == TicketPriority.high.value:
        return "🟠"
    elif priority == TicketPriority.medium.value:
        return "🟡"
    return "🟢"

def notify_slack_new_ticket(ticket):
    """
    Sends a formatted Slack message for a new high/critical ticket.
    """
    if not settings.SLACK_WEBHOOK_URL:
        logger.warning("SLACK_WEBHOOK_URL not configured. Skipping Slack notification.")
        return

    emoji = get_priority_emoji(ticket.priority)
    ticket_url = f"{settings.FRONTEND_URL}/tickets/{ticket.id}"

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"New Ticket #{ticket.id}: {ticket.title}"
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*AI Summary:*\n{ticket.ai_summary or 'No summary generated.'}"
            }
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Priority:*\n{emoji} {ticket.priority}"},
                {"type": "mrkdwn", "text": f"*Category:*\n{ticket.category}"},
                {"type": "mrkdwn", "text": f"*Suggested Assignee:*\n{ticket.ai_suggested_assignee or 'Unassigned'}"}
            ]
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View Ticket"
                    },
                    "url": ticket_url,
                    "action_id": "view_ticket_action"
                }
            ]
        }
    ]

    try:
        response = httpx.post(
            settings.SLACK_WEBHOOK_URL,
            json={"blocks": blocks},
            timeout=10.0
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to send Slack notification for ticket #{ticket.id}: {e}")

def notify_slack_duplicate_detected(ticket, original_ticket_id: int):
    """
    Sends a Slack message noting that a duplicate was detected.
    """
    if not settings.SLACK_WEBHOOK_URL:
        return

    ticket_url = f"{settings.FRONTEND_URL}/tickets/{ticket.id}"
    original_url = f"{settings.FRONTEND_URL}/tickets/{original_ticket_id}"

    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"⚠️ *Duplicate Detected*\nTicket <{ticket_url}|#{ticket.id}> was flagged as a duplicate of <{original_url}|#{original_ticket_id}>."
            }
        }
    ]

    try:
        response = httpx.post(
            settings.SLACK_WEBHOOK_URL,
            json={"blocks": blocks},
            timeout=10.0
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to send Slack duplicate alert for ticket #{ticket.id}: {e}")

def send_email_reply(to_email: str, to_name: str, ticket_id: int, draft_reply: str):
    """
    Sends the drafted reply to the submitter via SMTP.
    """
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP settings not fully configured. Cannot send email reply.")
        return

    try:
        msg = MIMEMultipart()
        msg["From"] = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
        msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
        msg["Subject"] = f"Re: Your Support Ticket [#{ticket_id}]"

        # Add footer
        body = f"{draft_reply}\n\n---\nTicket Reference ID: #{ticket_id}"
        msg.attach(MIMEText(body, "plain"))

        # Connect and send
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"Successfully sent email reply for ticket #{ticket_id} to {to_email}")

    except Exception as e:
        logger.error(f"Failed to send email reply for ticket #{ticket_id}: {e}")
        # Note: Do not re-raise, we don't want to crash the background pipeline
