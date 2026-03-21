import logging
import os
from typing import List, Tuple, Optional
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings as ChromaSettings
from backend.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Initialize SentenceTransformer model
try:
    model = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    logger.error(f"Failed to load SentenceTransformer model: {e}")
    model = None

# Initialize ChromaDB client
try:
    # Ensure directory exists
    os.makedirs(settings.CHROMADB_PATH, exist_ok=True)
    
    chroma_client = chromadb.PersistentClient(
        path=settings.CHROMADB_PATH,
        settings=ChromaSettings(allow_reset=True)
    )
    
    collection = chroma_client.get_or_create_collection(
        name=settings.CHROMADB_COLLECTION,
        metadata={"hnsw:space": "cosine"}
    )
except Exception as e:
    logger.error(f"Failed to initialize ChromaDB: {e}")
    chroma_client = None
    collection = None

def _get_combined_text(title: str, description: str, summary: Optional[str] = None) -> str:
    parts = [f"Title: {title}", f"Description: {description}"]
    if summary:
        parts.append(f"Summary: {summary}")
    return "\n".join(parts)

def add_ticket_embedding(ticket_id: int, title: str, description: str, summary: Optional[str] = None):
    """
    Generates embedding for a ticket and stores it in ChromaDB.
    """
    if model is None or collection is None:
        logger.warning(f"Embedding service not fully initialized. model={model}, collection={collection}. Skipping add_ticket_embedding.")
        return

    text = _get_combined_text(title, description, summary)
    
    try:
        embedding = model.encode(text).tolist()  # type: ignore
        
        collection.add(
            ids=[str(ticket_id)],
            embeddings=[embedding],
            metadatas=[{"title": title, "summary": summary or ""}],
            documents=[text]
        )
    except Exception as e:
        logger.error(f"Failed to add embedding for ticket {ticket_id}: {e}")

def find_similar_tickets(title: str, description: str, top_k: int = 5, exclude_id: Optional[int] = None) -> List[Tuple[int, float]]:
    """
    Searches ChromaDB for the most semantically similar tickets.
    Returns list of tuples: (ticket_id, similarity_score).
    """
    if model is None or collection is None:
        logger.warning(f"Embedding service not fully initialized. model={model}, collection={collection}. Skipping find_similar_tickets.")
        return []

    text = _get_combined_text(title, description)
    
    try:
        embedding = model.encode(text).tolist()  # type: ignore
        
        results = collection.query(
            query_embeddings=[embedding],
            n_results=top_k + (1 if exclude_id is not None else 0),
            include=["distances"]
        )
        
        similar_tickets = []
        if results["ids"] and len(results["ids"]) > 0:
            ids = results["ids"][0]
            distances = results["distances"][0] if "distances" in results and results["distances"] else []
            
            for doc_id, dist in zip(ids, distances):
                ticket_id = int(doc_id)
                # Skip the excluded ID
                if exclude_id is not None and ticket_id == exclude_id:
                    continue
                    
                # Cosine distance to similarity score
                similarity = 1.0 - dist
                similar_tickets.append((ticket_id, float(similarity)))
                
                # Truncate to top_k if we grabbed an extra to account for exclusion
                if len(similar_tickets) >= top_k:
                    break
                    
        return similar_tickets
    except Exception as e:
        logger.error(f"Failed to find similar tickets: {e}")
        return []

def remove_ticket_embedding(ticket_id: int):
    """
    Deletes a ticket's embedding from ChromaDB.
    """
    if collection is None:
        return
        
    try:
        collection.delete(ids=[str(ticket_id)])
    except Exception as e:
        logger.error(f"Failed to remove embedding for ticket {ticket_id}: {e}")
