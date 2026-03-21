import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.models.database import get_db
from backend.models.ticket import Ticket
from backend.models.schemas import AskTicketsRequest, AskTicketsResponse
from backend.services.embedding_service import find_similar_tickets
from backend.services.claude_service import ask_tickets

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/ask", response_model=AskTicketsResponse)
def ask_triage_question(request: AskTicketsRequest, db: Session = Depends(get_db)):
    question = request.question
    
    # 1. Find relevant tickets via vector search (top 10)
    similar_results = find_similar_tickets(
        title=question, 
        description="", 
        top_k=10
    )
    
    if not similar_results:
        return AskTicketsResponse(
            answer="No relevant tickets found to answer your question.",
            relevant_ticket_ids=[],
            context_chunks_used=0
        )
        
    relevant_ids = [res[0] for res in similar_results]
    
    # 2. Fetch those tickets from the database
    tickets = db.query(Ticket).filter(Ticket.id.in_(relevant_ids)).all()
    
    # 3. Format context strings for Claude
    contexts = []
    for t in tickets:
        context_str = f"Ticket #{t.id} - {t.title}\nStatus: {t.status} | Priority: {t.priority}\nSummary: {t.ai_summary or t.description}"
        contexts.append(context_str)
        
    # 4. Ask Claude
    answer_text, cited_ids = ask_tickets(question, contexts)
    
    return AskTicketsResponse(
        answer=answer_text,
        relevant_ticket_ids=cited_ids,
        context_chunks_used=len(contexts)
    )
