import logging
import os
from pathlib import Path
from typing import Any, List, Optional, Tuple

from backend.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

model: Any = None
chroma_client: Any = None
collection: Any = None


def _initialize_embedding_backend() -> None:
    """Initialize the optional local embedding backend without network telemetry."""
    global model, chroma_client, collection

    if not settings.EMBEDDINGS_ENABLED:
        logger.info("Ticket embeddings are disabled.")
        return

    try:
        model_path = Path(settings.EMBEDDING_MODEL_PATH).expanduser()
        if not settings.EMBEDDING_MODEL_PATH or not model_path.is_dir():
            logger.error(
                "Embeddings are enabled but EMBEDDING_MODEL_PATH is not a valid local directory."
            )
            return

        import chromadb
        from chromadb.config import Settings as ChromaSettings
        from sentence_transformers import SentenceTransformer

        os.makedirs(settings.CHROMADB_PATH, exist_ok=True)
        model = SentenceTransformer(str(model_path.resolve()))
        chroma_client = chromadb.PersistentClient(
            path=settings.CHROMADB_PATH,
            settings=ChromaSettings(
                allow_reset=False,
                anonymized_telemetry=False,
            ),
        )
        collection = chroma_client.get_or_create_collection(
            name=settings.CHROMADB_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
    except Exception:
        logger.error("Failed to initialize the optional embedding backend.")
        model = None
        chroma_client = None
        collection = None


_initialize_embedding_backend()


def _get_combined_text(title: str, description: str, summary: Optional[str] = None) -> str:
    parts = [f"Title: {title}", f"Description: {description}"]
    if summary:
        parts.append(f"Summary: {summary}")
    return "\n".join(parts)


def add_ticket_embedding(
    ticket_id: int,
    title: str,
    description: str,
    summary: Optional[str] = None,
) -> None:
    """
    Generates embedding for a ticket and stores it in ChromaDB.
    """
    if model is None or collection is None:
        logger.debug("Skipping ticket embedding because the embedding backend is unavailable.")
        return

    text = _get_combined_text(title, description, summary)
    
    try:
        embedding = model.encode(text).tolist()  # type: ignore
        
        # Persist only the derived vector and opaque ticket ID. The relational
        # database remains the sole store for ticket title, body, and summary.
        collection.upsert(
            ids=[str(ticket_id)],
            embeddings=[embedding],
        )
    except Exception:
        logger.error("Failed to store the embedding for ticket %s.", ticket_id)


def find_similar_tickets(
    title: str,
    description: str,
    top_k: int = 5,
    exclude_id: Optional[int] = None,
) -> List[Tuple[int, float]]:
    """
    Searches ChromaDB for the most semantically similar tickets.
    Returns list of tuples: (ticket_id, similarity_score).
    """
    if model is None or collection is None:
        logger.debug("Skipping similarity search because the embedding backend is unavailable.")
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
    except Exception:
        logger.error("Failed to search ticket embeddings.")
        return []


def remove_ticket_embedding(ticket_id: int) -> None:
    """
    Deletes a ticket's embedding from ChromaDB.
    """
    if collection is None:
        return
        
    try:
        collection.delete(ids=[str(ticket_id)])
    except Exception:
        logger.error("Failed to remove the embedding for ticket %s.", ticket_id)
