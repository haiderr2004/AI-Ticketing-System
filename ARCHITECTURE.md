# Project Architecture & Mental Model

This document breaks down the components, file structures, and data flow of the AI-Powered IT Ticketing System we have built so far (Phases 1 through 6).

---

## 1. System Overview

At a high level, this system consists of two decoupled pieces communicating over an API:
1. **The Backend**: A Python/FastAPI server connected to a SQLite database and a ChromaDB vector store.
2. **The Frontend**: A React/Vite Single Page Application (SPA) styled with Tailwind CSS.

They are packaged and run together using **Docker Compose**, with Nginx serving the frontend and proxying API calls to the backend.

---

## 2. Backend Architecture (FastAPI)

The backend is organized into standard architectural layers. Think of a request coming in and hitting these layers in order: **Routers -> Services -> Models/Database**.

### Directory Structure
```text
backend/
├── main.py                   # The Entry Point
├── core/
│   └── config.py             # Environment configuration (Pydantic Settings)
├── models/
│   ├── database.py           # SQLAlchemy Engine and Session setup
│   ├── ticket.py             # SQLAlchemy ORM Model (The Database Table)
│   └── schemas.py            # Pydantic Models (Validation for incoming/outgoing JSON)
├── routers/
│   ├── tickets.py            # CRUD API endpoints for managing tickets
│   ├── triage.py             # Endpoint for natural language search (/triage/ask)
│   ├── analytics.py          # Dashboard metric endpoints
│   └── ingest.py             # Endpoints to receive tickets from external sources (Webhooks)
└── services/
    ├── claude_service.py       # Handles Claude API calls (triage, drafting, searching)
    ├── embedding_service.py    # Handles ChromaDB logic and generating vector embeddings
    ├── duplicate_detector.py   # Checks incoming tickets against embeddings for duplicates
    ├── ticket_processor.py     # The central "Brain" orchestrating the background pipeline
    ├── notification_service.py # Sends Slack alerts and Email replies
    └── email_ingestion.py      # Background worker polling IMAP to convert emails to tickets
```

### The Data Flow (Ticket Creation Lifecycle)
1. **Intake**: A user submits a ticket via the Web Form (hitting `routers/tickets.py`) or sends an email (polled by `services/email_ingestion.py`).
2. **Database Insert**: The ticket is saved to `tickets.db` as "Open" with no AI classification yet. 
3. **Background Processing**: The endpoint immediately returns a success response to the user so they don't have to wait. In the background, it kicks off `process_ticket_async` (`services/ticket_processor.py`).
4. **The Pipeline (`process_ticket_async`)**:
   - Calls Claude to categorize the ticket, prioritize it, and draft a reply.
   - Takes the text and passes it to the `embedding_service` to generate a vector and store it in ChromaDB.
   - Takes the vector and asks `duplicate_detector.py` to find open tickets with > 85% similarity.
   - Updates the SQLite database with the new AI data and duplicate status.
   - Calls `notification_service.py` to ping Slack if the ticket is critical.

---

## 3. Frontend Architecture (React)

The frontend is a React application utilizing `react-router` for navigation and `react-query` to fetch data from the FastAPI backend.

### Directory Structure
```text
frontend/
├── index.html                # Main HTML file, loads main.jsx
├── src/
│   ├── main.jsx              # React Entry Point (Wraps App in QueryClient)
│   ├── App.jsx               # Application Shell & Route definitions
│   ├── index.css             # Tailwind base imports and CSS variables
│   ├── api/
│   │   └── client.js         # Axios instance and all backend fetch functions
│   ├── components/
│   │   ├── AskTicketsChat.jsx # The chat widget for querying tickets
│   │   ├── DashboardMetrics.jsx # The stat cards on the dashboard
│   │   └── TicketList.jsx     # The reusable table for displaying tickets
│   └── pages/
│       ├── Dashboard.jsx      # Homepage (Metrics, AI Digest, Chat)
│       ├── Tickets.jsx        # Full Queue (Filtering, Pagination)
│       ├── TicketDetail.jsx   # Specific Ticket (AI Triage panel, status edits)
│       └── NewTicket.jsx      # Submission Form
```

### Key Frontend Concepts
- **TanStack React Query**: Used in the `pages` components (e.g., `useQuery({ queryKey: ['tickets'], queryFn: getTickets })`). It automatically handles loading states, caching, and background refetching (like polling a ticket until AI finishes triaging it).
- **Tailwind CSS**: Utility classes used directly in `className` tags to build the UI quickly without separate CSS files.

---

## 4. Containerization (Docker)

To make the app easy to run without manual setup, we bundled it into Docker containers.

1. **`Dockerfile.backend`**: Starts with Python, installs the dependencies from `requirements.txt`, and sets the default command to run `uvicorn` (the FastAPI web server).
2. **`Dockerfile.frontend`**: 
   - *Stage 1*: Uses Node.js to install dependencies and run `npm run build` (compiling the React app into static HTML/JS/CSS).
   - *Stage 2*: Uses an Nginx web server to serve those static files. It uses a custom `nginx.conf` to proxy any requests going to `/api/*` directly into the backend container, eliminating CORS issues.
3. **`docker-compose.yml`**: Defines how the containers talk to each other.
   - Defines a `backend` service, mapping port 8000.
   - Defines a `frontend` service, mapping port 80 (accessible on your browser at `localhost`).
   - Defines persistent volumes so ChromaDB (`chroma_data`) and the Database aren't wiped when containers restart.
