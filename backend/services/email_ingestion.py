import logging
import imaplib
import email
from email.header import decode_header
from apscheduler.schedulers.background import BackgroundScheduler
from backend.core.config import get_settings
from backend.models.database import SessionLocal
from backend.models.ticket import Ticket, TicketSource
from backend.services.ticket_processor import process_ticket_async

logger = logging.getLogger(__name__)
settings = get_settings()

scheduler = BackgroundScheduler()

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
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            if content_type == "text/plain" and "attachment" not in content_disposition:
                return part.get_payload(decode=True).decode(errors="replace")
    else:
        return msg.get_payload(decode=True).decode(errors="replace")
    return ""

def poll_mailbox():
    if not settings.IMAP_HOST or not settings.IMAP_USER or not settings.IMAP_PASSWORD:
        return

    logger.info("Polling IMAP mailbox for new tickets...")
    try:
        mail = imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT)
        mail.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        mail.select("inbox")

        status, messages = mail.search(None, "UNSEEN")
        if status != "OK":
            return

        email_ids = messages[0].split()
        if not email_ids:
            return

        db = SessionLocal()
        try:
            for e_id in email_ids:
                status, msg_data = mail.fetch(e_id, "(RFC822)")
                if status != "OK":
                    continue

                for response_part in msg_data:
                    if isinstance(response_part, tuple):
                        msg = email.message_from_bytes(response_part[1])
                        subject = get_decoded_header(msg["Subject"])
                        
                        from_header = get_decoded_header(msg["From"])
                        # Parse "Name <email@example.com>"
                        if "<" in from_header and ">" in from_header:
                            sender_name = from_header.split("<")[0].strip()
                            sender_email = from_header.split("<")[1].split(">")[0].strip()
                        else:
                            sender_name = ""
                            sender_email = from_header.strip()

                        body = get_email_body(msg)

                        # Create ticket
                        new_ticket = Ticket(
                            title=subject[:255] if subject else "No Subject",
                            description=body or "No Description",
                            submitter_name=sender_name,
                            submitter_email=sender_email,
                            source=TicketSource.email.value
                        )
                        db.add(new_ticket)
                        db.commit()
                        db.refresh(new_ticket)

                        # Kick off processing synchronously in this background thread
                        # Real FastAPI BackgroundTasks would be used via the router, but here 
                        # we are already in an APScheduler background thread.
                        process_ticket_async(new_ticket.id)
                        
                        # Mark as read (usually fetching RFC822 does this automatically, but let's be explicit)
                        mail.store(e_id, '+FLAGS', '\\Seen')

        finally:
            db.close()

        mail.close()
        mail.logout()

    except Exception as e:
        logger.error(f"Error polling mailbox: {e}")

def start_email_polling():
    if not settings.IMAP_HOST or not settings.IMAP_USER or not settings.IMAP_PASSWORD:
        logger.info("IMAP settings not configured. Email polling will not start.")
        return

    logger.info(f"Starting email polling every {settings.EMAIL_POLL_INTERVAL} seconds.")
    scheduler.add_job(poll_mailbox, 'interval', seconds=settings.EMAIL_POLL_INTERVAL)
    scheduler.start()
