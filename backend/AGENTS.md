# Backend Instructions

- Keep route handlers in `routers/`, schemas at API boundaries, persistence in `models/`, and external/AI behavior in `services/`.
- Validate inputs with Pydantic and use explicit response/error contracts.
- Preserve Alembic migration history; do not replace migration workflows with direct schema edits.
- Keep provider, email, Slack, and embedding integrations replaceable and mockable.
- Avoid network calls in unit tests. Use deterministic fakes for AI output, time, notifications, and embeddings.
- Protect ingestion endpoints and sensitive ticket/customer fields; never log request secrets or full sensitive payloads.
- Run backend pytest and relevant migration/startup checks after changes.

