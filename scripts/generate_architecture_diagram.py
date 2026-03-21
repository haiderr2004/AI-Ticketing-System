from diagrams import Diagram, Cluster, Edge  # type: ignore
from diagrams.onprem.client import Users  # type: ignore
from diagrams.custom import Custom  # type: ignore
from diagrams.onprem.network import Nginx  # type: ignore
from diagrams.programming.framework import Fastapi  # type: ignore
from diagrams.programming.language import Python  # type: ignore
from diagrams.onprem.database import Postgresql  # type: ignore
from diagrams.saas.chat import Slack  # type: ignore
from diagrams.saas.identity import Auth0  # type: ignore
from diagrams.programming.framework import React  # type: ignore
from diagrams.onprem.compute import Server  # type: ignore
import urllib.request
import os

# Create docs directory if it doesn't exist
os.makedirs("docs", exist_ok=True)

# Note: We need some custom icons or we can use generic ones
# We'll use generic ones for Claude and ChromaDB to avoid download issues

with Diagram("AI Ticketing System Architecture", show=False, filename="docs/architecture"):
    
    with Cluster("Clients & Input Sources"):
        web_form = React("Web Form / Dashboard")
        email = Server("Email (IMAP)")
        slack_in = Slack("Slack Commands")
        github = Server("GitHub Webhooks")
        
        sources = [web_form, email, slack_in, github]

    with Cluster("Docker Compose Environment"):
        with Cluster("Frontend (React + Vite)"):
            frontend = Nginx("Frontend App")
            
        with Cluster("Backend (FastAPI)"):
            backend = Fastapi("API Server")
            processor = Python("Background Tasks\n(APScheduler & Pipelines)")
            backend - Edge(color="dashed") - processor
            
        with Cluster("Data Storage"):
            db = Postgresql("PostgreSQL (Relational)")
            chroma = Server("ChromaDB (Vector)")
            
    with Cluster("External APIs"):
        claude = Server("Anthropic Claude API\n(LLM & Triage)")
        slack_out = Slack("Slack Webhooks\n(Alerts)")
        smtp = Server("SMTP\n(Email Replies)")

    # Data flows
    # Inputs to Backend
    web_form >> backend
    frontend >> backend
    email >> backend
    slack_in >> backend
    github >> backend
    
    # Backend processing
    backend >> processor
    
    # Processor to external APIs
    processor >> Edge(label="Analyze & Triage") >> claude
    processor >> Edge(label="Alerts") >> slack_out
    processor >> Edge(label="Replies") >> smtp
    
    # Storage
    backend >> Edge(label="Read/Write") >> db
    processor >> Edge(label="Read/Write") >> db
    
    processor >> Edge(label="Semantic Search") >> chroma
    backend >> Edge(label="Semantic Search") >> chroma
