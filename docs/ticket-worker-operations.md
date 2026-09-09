# Ticket processing worker

Ticket creation and re-triage write a durable job in the same database transaction as the ticket. The API process does not call the AI provider, embedding service, or notification service after returning a response.

## Startup

1. Back up the ticket database using the environment's established database backup procedure.
2. Run `python -m alembic -c backend/alembic.ini upgrade head` from the repository root, or run `python -m alembic upgrade head` from `backend`.
3. Start the API normally.
4. Start exactly one worker initially with `python -m backend.worker`.

Docker Compose runs the migration as a one-shot service before starting the API and worker. `POSTGRES_PASSWORD` and `TICKETING_DATABASE_URL` must be supplied through `.env` or the deployment secret store.

## Health and recovery

- Pending jobs remain in `ticket_processing_jobs` across API or worker restarts.
- A job locked for more than ten minutes can be reclaimed.
- Processing is retried up to three times with bounded exponential delay.
- Stored failures use generic codes and never persist provider responses or ticket content.
- A failed optional embedding or notification stage does not discard completed ticket triage.

Stop the worker before database maintenance. If rollback is required, stop the worker and API, restore the database backup, deploy the previous application version, and only then restart services. Do not downgrade the migration while newer code is running.

Relative SQLite URLs such as `sqlite:///./tickets.db` are resolved against the repository root, so the API, worker, and Alembic target the same file regardless of their current working directory.
