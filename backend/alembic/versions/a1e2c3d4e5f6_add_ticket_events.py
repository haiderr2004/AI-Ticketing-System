"""add append-only ticket events

Revision ID: a1e2c3d4e5f6
Revises: 6cb5133760b8
"""
from alembic import op
import sqlalchemy as sa

revision = "a1e2c3d4e5f6"
down_revision = "6cb5133760b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ticket_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_subject", sa.String(length=256), nullable=False),
        sa.Column("actor_dn", sa.String(length=2048), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("previous_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
    )
    op.create_index("ix_ticket_events_ticket_id", "ticket_events", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_ticket_events_ticket_id", table_name="ticket_events")
    op.drop_table("ticket_events")
