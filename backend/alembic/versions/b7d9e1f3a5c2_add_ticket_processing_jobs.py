"""add durable ticket processing jobs

Revision ID: b7d9e1f3a5c2
Revises: a1e2c3d4e5f6
"""

from alembic import op
import sqlalchemy as sa


revision = "b7d9e1f3a5c2"
down_revision = "a1e2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ticket_processing_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_type", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_ticket_processing_jobs_idempotency_key"),
        sa.CheckConstraint("status IN ('pending', 'running', 'completed', 'failed')", name="ck_ticket_processing_jobs_status"),
        sa.CheckConstraint("attempts >= 0 AND max_attempts BETWEEN 1 AND 10", name="ck_ticket_processing_jobs_attempts"),
    )
    op.create_index("ix_ticket_processing_jobs_ticket_id", "ticket_processing_jobs", ["ticket_id"])
    op.create_index("ix_ticket_processing_jobs_status", "ticket_processing_jobs", ["status"])
    op.create_index(
        "uq_ticket_processing_jobs_active_ticket_type",
        "ticket_processing_jobs",
        ["ticket_id", "job_type"],
        unique=True,
        sqlite_where=sa.text("status IN ('pending', 'running')"),
        postgresql_where=sa.text("status IN ('pending', 'running')"),
    )


def downgrade() -> None:
    op.drop_index("uq_ticket_processing_jobs_active_ticket_type", table_name="ticket_processing_jobs")
    op.drop_index("ix_ticket_processing_jobs_status", table_name="ticket_processing_jobs")
    op.drop_index("ix_ticket_processing_jobs_ticket_id", table_name="ticket_processing_jobs")
    op.drop_table("ticket_processing_jobs")
