from backend.services.email_ingestion import should_ingest_email


def test_support_issue_email_is_ingested():
    assert should_ingest_email(
        subject="URGENT: VPN down for remote staff",
        sender_email="employee@client.com",
        body="Our VPN connection is down and nobody can log in.",
        support_address="truenorthtech.support@gmail.com",
    ) is True


def test_newsletter_email_is_ignored():
    assert should_ingest_email(
        subject="Welcome to your new Gmail account",
        sender_email="no-reply@accounts.google.com",
        body="Here are tips to get started with your inbox.",
        support_address="truenorthtech.support@gmail.com",
    ) is False


def test_self_sent_email_is_ignored():
    assert should_ingest_email(
        subject="Test message",
        sender_email="truenorthtech.support@gmail.com",
        body="This is just a mailbox setup message.",
        support_address="truenorthtech.support@gmail.com",
    ) is False
