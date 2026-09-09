import email
import imaplib
import logging
import re
from email.header import decode_header

from apscheduler.schedulers.background import BackgroundScheduler

from backend.core.config import get_settings
from backend.models.database import SessionLocal
from backend.models.ticket import Ticket, TicketSource
from backend.services.job_queue import enqueue_ticket_processing

logger = logging.getLogger(__name__)
settings = get_settings()

scheduler = BackgroundScheduler()

EXPLICIT_SUPPORT_PREFIXES = ("issue:", "ticket:", "support:", "urgent:")
SUPPORT_KEYWORDS = (
    "issue",
    "problem",
    "help",
    "urgent",
    "unable",
    "cannot",
    "can't",
    "vpn",
    "login",
    "log in",
    "password reset",
    "server down",
    "outage",
    "broken",
    "error",
    "failed",
    "access",
    "network",
    "wifi",
    "printer",
    "support",
    "ticket",
    "locked out",
)
IGNORED_EMAIL_PHRASES = (
    "welcome to gmail",
    "verify your email",
    "verification code",
    "security alert",
    "new sign-in",
    "google account",
    "newsletter",
    "promotion",
    "promo",
    "subscription",
    "receipt",
    "invoice",
    "getting started",
)
IGNORED_SENDER_TOKENS = ("no-reply", "noreply", "mailer-daemon", "postmaster", "donotreply")


def is_email_ingestion_configured() -> bool:
    return bool(settings.IMAP_HOST and settings.IMAP_USER and settings.IMAP_PASSWORD)


def should_ingest_email(subject: str, sender_email: str, body: str, support_address: str = "") -> bool:
    normalized_subject = (subject or "").strip().lower()
    normalized_sender = (sender_email or "").strip().lower()
    normalized_body = " ".join((body or "").lower().split())
    combined_text = f"{normalized_subject}\n{normalized_body}".strip()

    if not combined_text:
        return False

    if support_address and normalized_sender == support_address.strip().lower():
        return False

    if any(token in normalized_sender for token in IGNORED_SENDER_TOKENS):
        return False

    if any(normalized_subject.startswith(prefix) for prefix in EXPLICIT_SUPPORT_PREFIXES):
        return True

    if any(phrase in combined_text for phrase in IGNORED_EMAIL_PHRASES):
        return False

    return any(keyword in combined_text for keyword in SUPPORT_KEYWORDS)


def get_decoded_header(header_value):
    if not header_value:
        return ""
    decoded_fragments = decode_header(header_value)
    result = ""
    for fragment, encoding in decoded_fragments:
        if isinstance(fragment, bytes):
            result += fragment.decode(encoding or "utf-8", errors="replace")
        else:
            result += str(fragment)
    return result


def get_email_body(msg):
    html_fallback = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition") or "")
            if "attachment" in content_disposition.lower():
                continue

            payload = part.get_payload(decode=True) or b""
            decoded = payload.decode(errors="replace").strip()
            if content_type == "text/plain" and decoded:
                return decoded
            if content_type == "text/html" and decoded and not html_fallback:
                html_fallback = re.sub(r"<[^>]+>", " ", decoded)
    else:
        payload = msg.get_payload(decode=True) or b""
        return payload.decode(errors="replace").strip()

    return " ".join(html_fallback.split()).strip()


def poll_mailbox():
    result = {
        "configured": is_email_ingestion_configured(),
        "processed": 0,
        "skipped": 0,
        "message": "Email ingestion is not configured."
    }
    if not result["configured"]:
        logger.info(result["message"])
        return result

    logger.info("Polling IMAP mailbox for new tickets...")
    mail = None
    db = None
    try:
        mail = imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT)
        mail.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        mail.select("inbox")

        status, messages = mail.search(None, "UNSEEN")
        if status != "OK":
            result["message"] = "Unable to search the inbox for unread emails."
            return result

        email_ids = messages[0].split()
        if not email_ids:
            result["message"] = "No unread emails found."
            return result

        db = SessionLocal()
        for e_id in email_ids:
            status, msg_data = mail.fetch(e_id, "(RFC822)")
            if status != "OK":
                continue

            for response_part in msg_data:
                if not isinstance(response_part, tuple):
                    continue

                msg = email.message_from_bytes(response_part[1])
                subject = get_decoded_header(msg["Subject"])

                from_header = get_decoded_header(msg["From"])
                if "<" in from_header and ">" in from_header:
                    sender_name = from_header.split("<")[0].strip()
                    sender_email = from_header.split("<")[1].split(">")[0].strip()
                else:
                    sender_name = ""
                    sender_email = from_header.strip()

                body = get_email_body(msg)

                if not should_ingest_email(subject, sender_email, body, settings.IMAP_USER or ""):
                    result["skipped"] += 1
                    logger.info("Skipping non-support email from %s with subject '%s'", sender_email, subject)
                    mail.store(e_id, "+FLAGS", "\\Seen")
                    continue

                new_ticket = Ticket(
                    title=subject[:255] if subject else "No Subject",
                    description=body or "No Description",
                    submitter_name=sender_name,
                    submitter_email=sender_email,
                    source=TicketSource.email.value
                )
                db.add(new_ticket)
                db.flush()
                enqueue_ticket_processing(db, new_ticket)
                db.commit()
                db.refresh(new_ticket)
                result["processed"] += 1

                mail.store(e_id, "+FLAGS", "\\Seen")

        result["message"] = (
            f"Processed {result['processed']} email(s); "
            f"skipped {result['skipped']} non-support email(s)."
        )
        logger.info(result["message"])
        return result

    except Exception as e:
        result["message"] = f"Error polling mailbox: {e}"
        logger.error(result["message"])
        return result

    finally:
        if db:
            db.close()
        if mail:
            try:
                mail.close()
            except Exception:
                pass
            try:
                mail.logout()
            except Exception:
                pass


def start_email_polling():
    if not is_email_ingestion_configured():
        logger.info("IMAP settings not configured. Email polling will not start.")
        return

    if scheduler.running:
        logger.info("Email polling scheduler is already running.")
        return

    logger.info(f"Starting email polling every {settings.EMAIL_POLL_INTERVAL} seconds.")
    scheduler.add_job(
        poll_mailbox,
        "interval",
        seconds=settings.EMAIL_POLL_INTERVAL,
        id="imap-email-poll",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
