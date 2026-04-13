"""
FastAPI backend for the Medical Exam LLM application.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import authenticate, require_auth
from config import get_settings
from ingest import LOADERS, ingest_file
from question_bank import (
    format_as_markdown,
    init_db,
    parse_and_store,
    question_count,
    random_question,
    random_questions,
)
from rag import (
    answer_question,
    collection_document_count,
    delete_collection,
    generate_practice_question,
    list_collections,
    stream_answer,
    stream_followup,
    stream_practice_question,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title="Medical Exam LLM",
    description="MRCS Part A revision assistant powered by local LLM",
    version="1.0.0",
)

# Allow the React dev server and same-origin production builds
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:80",
        "http://mrcs-revision.online",
        "https://mrcs-revision.online",
        "http://www.mrcs-revision.online",
        "https://www.mrcs-revision.online",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure knowledge base upload directory exists
os.makedirs(settings.KNOWLEDGE_BASE_DIR, exist_ok=True)

# Ensure question bank DB is initialised on startup
init_db()

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@app.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    token = authenticate(body.password)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# Chat / Q&A
# ---------------------------------------------------------------------------


class QuestionRequest(BaseModel):
    question: str
    collections: list[str] = ["default"]


class AnswerResponse(BaseModel):
    answer: str
    collections: list[str]


@app.post("/chat/ask", response_model=AnswerResponse)
def ask(body: QuestionRequest, _: str = Depends(require_auth)):
    """Ask a question and get a complete answer (non-streaming)."""
    collections = list_collections()
    if collections and body.collection not in collections:
        # Fall back to first available collection
        body.collection = collections[0]
    try:
        answer = answer_question(body.question, collection_name=body.collection)
    except Exception as e:
        logger.error("Error answering question: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    return AnswerResponse(answer=answer, collection=body.collection)


@app.post("/chat/stream")
async def ask_stream(body: QuestionRequest, _: str = Depends(require_auth)):
    """Ask a question and receive a streaming response (Server-Sent Events)."""
    all_cols = list_collections()
    req_cols = [c for c in body.collections if c in all_cols] or (all_cols[:1] if all_cols else ["default"])

    async def event_generator():
        try:
            async for token in stream_answer(  # type: ignore[arg-type]
                body.question, collection_names=req_cols
            ):
                yield f"data: {json.dumps(token)}\n\n"
        except Exception as e:
            logger.error("Streaming error: %s", e)
            yield f'data: "[ERROR] {e}"\n\n'
        yield 'data: "[DONE]"\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")


class FollowUpRequest(BaseModel):
    practice_question: str
    user_question: str


@app.post("/chat/followup/stream")
async def followup_stream(body: FollowUpRequest, _: str = Depends(require_auth)):
    """Stream a follow-up answer for a practice question (SSE)."""

    async def event_generator():
        try:
            async for token in stream_followup(
                practice_question=body.practice_question,
                user_question=body.user_question,
            ):
                yield f"data: {json.dumps(token)}\n\n"
        except Exception as e:
            logger.error("Follow-up streaming error: %s", e)
            yield f'data: "[ERROR] {e}"\n\n'
        yield 'data: "[DONE]"\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Practice mode
# ---------------------------------------------------------------------------


class PracticeRequest(BaseModel):
    topic: str = "any topic covered in the knowledge base"
    collections: list[str] = ["default"]


class PracticeResponse(BaseModel):
    question_text: str
    collections: list[str]


@app.post("/practice/generate", response_model=PracticeResponse)
def generate_question(body: PracticeRequest, _: str = Depends(require_auth)):
    """Generate an MRCS-style SBA practice question from the knowledge base."""
    all_cols = list_collections()
    req_cols = [c for c in body.collections if c in all_cols] or (all_cols[:1] if all_cols else ["default"])
    try:
        question_text = generate_practice_question(
            topic=body.topic, collection_names=req_cols
        )
    except Exception as e:
        logger.error("Error generating practice question: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    return PracticeResponse(question_text=question_text, collections=req_cols)


@app.post("/practice/stream")
async def stream_practice(body: PracticeRequest, _: str = Depends(require_auth)):
    """Stream an MRCS SBA practice question token by token (SSE)."""
    all_cols = list_collections()
    req_cols = [c for c in body.collections if c in all_cols] or (all_cols[:1] if all_cols else ["default"])

    async def event_generator():
        try:
            async for token in stream_practice_question(
                topic=body.topic, collection_names=req_cols
            ):
                yield f"data: {json.dumps(token)}\n\n"
        except Exception as e:
            logger.error("Error streaming practice question: %s", e)
            yield f'data: "[ERROR] {e}"\n\n'
        yield 'data: "[DONE]"\n\n'

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Knowledge base management
# ---------------------------------------------------------------------------


class CollectionInfo(BaseModel):
    name: str
    document_count: int


@app.get("/knowledge-base/collections", response_model=list[CollectionInfo])
def get_collections(_: str = Depends(require_auth)):
    """List all available knowledge base collections."""
    names = list_collections()
    return [
        CollectionInfo(name=n, document_count=collection_document_count(n))
        for n in names
    ]


@app.post("/knowledge-base/upload", response_model=dict)
async def upload_document(
    file: UploadFile = File(...),
    collection: str = Form("default"),
    overwrite: bool = Form(False),
    _: str = Depends(require_auth),
):
    """Upload and ingest a document into the specified collection."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in LOADERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Supported: {', '.join(LOADERS)}",
        )

    # Write to a temp file then ingest
    with tempfile.NamedTemporaryFile(
        delete=False, suffix=suffix, prefix="upload_"
    ) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        # Use original filename in metadata
        tmp_path_named = tmp_path.parent / (file.filename or tmp_path.name)
        tmp_path.rename(tmp_path_named)

        chunk_count = ingest_file(tmp_path_named, collection_name=collection, overwrite=overwrite)
    except Exception as e:
        logger.error("Ingestion failed for %s: %s", file.filename, e)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")
    finally:
        # Clean up temp file if it still exists
        tmp_named = tmp_path.parent / (file.filename or tmp_path.name)
        if tmp_named.exists():
            tmp_named.unlink()

    return {
        "filename": file.filename,
        "collection": collection,
        "chunks_added": chunk_count,
        "message": f"Successfully ingested {chunk_count} chunks into collection '{collection}'",
    }


@app.delete("/knowledge-base/collections/{collection_name}")
def remove_collection(collection_name: str, _: str = Depends(require_auth)):
    """Delete an entire collection from the vector store."""
    try:
        delete_collection(collection_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": f"Collection '{collection_name}' deleted."}


# ---------------------------------------------------------------------------
# Question bank
# ---------------------------------------------------------------------------


class ParseBankRequest(BaseModel):
    text: str
    source: str = "question_bank"


@app.post("/questions/bank/parse")
def parse_bank(body: ParseBankRequest, _: str = Depends(require_auth)):
    """Parse raw question bank text and store all found questions in SQLite."""
    try:
        stored = parse_and_store(body.text, source=body.source)
    except Exception as e:
        logger.error("Error parsing question bank: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    return {"stored": stored, "total": question_count()}


@app.get("/questions/bank/count")
def bank_count(_: str = Depends(require_auth)):
    """Return how many questions are in the bank."""
    return {"count": question_count()}


@app.get("/questions/bank/random")
def bank_random(_: str = Depends(require_auth)):
    """Return a random question from the bank as markdown."""
    row = random_question()
    if row is None:
        raise HTTPException(status_code=404, detail="No questions in bank. Upload and parse the question bank file first.")
    return {"question_text": format_as_markdown(row), "id": row["id"]}


@app.get("/questions/bank/batch")
def bank_batch(count: int = 5, _: str = Depends(require_auth)):
    """Return up to *count* distinct random questions from the bank."""
    rows = random_questions(count)
    if not rows:
        raise HTTPException(status_code=404, detail="No questions in bank.")
    return {
        "questions": [
            {"question_text": format_as_markdown(r), "id": r["id"]}
            for r in rows
        ]
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    return {"status": "ok", "model": settings.OLLAMA_MODEL}
