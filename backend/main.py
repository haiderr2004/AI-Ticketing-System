from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from backend.core.config import get_settings
from backend.models.database import create_tables
from backend.services.email_ingestion import start_email_polling
from backend.routers import tickets, analytics, triage, ingest

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up application...")
    create_tables()
    start_email_polling()
    yield
    # Shutdown
    logger.info("Shutting down application...")

app = FastAPI(
    title="AI Ticketing System API",
    description="Backend for the AI-powered IT Ticketing System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
origins = [
    settings.FRONTEND_URL,
    "http://localhost:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(tickets.router, prefix="/tickets", tags=["Tickets"])
app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
app.include_router(triage.router, prefix="/triage", tags=["Triage"])
app.include_router(ingest.router, prefix="/ingest", tags=["Ingest"])

@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "version": app.version}

@app.get("/", tags=["System"])
def root():
    return {
        "message": "Welcome to the AI Ticketing System API",
        "docs_url": "/docs",
        "health_check": "/health"
    }
