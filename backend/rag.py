"""
RAG (Retrieval-Augmented Generation) pipeline.

Uses ChromaDB for vector storage and Ollama for LLM inference.
Embeddings are generated locally with sentence-transformers.
"""
from __future__ import annotations

import logging
from typing import AsyncIterator, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Embeddings (loaded once at module level)
# ---------------------------------------------------------------------------
_embeddings: Optional[HuggingFaceEmbeddings] = None


def get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        logger.info("Loading embedding model: %s", settings.EMBEDDING_MODEL)
        _embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return _embeddings


# ---------------------------------------------------------------------------
# Vector store helpers
# ---------------------------------------------------------------------------

def get_vector_store(collection_name: str = "default") -> Chroma:
    return Chroma(
        collection_name=collection_name,
        embedding_function=get_embeddings(),
        persist_directory=settings.CHROMA_PERSIST_DIR,
    )


def list_collections() -> list[str]:
    """Return all collection names that have at least one document."""
    import chromadb

    client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    return [c.name for c in client.list_collections()]


def collection_document_count(collection_name: str) -> int:
    import chromadb

    client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    try:
        col = client.get_collection(collection_name)
        return col.count()
    except Exception:
        return 0


def delete_collection(collection_name: str) -> None:
    import chromadb

    client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    client.delete_collection(collection_name)


# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------

def get_llm() -> ChatOllama:
    return ChatOllama(
        model=settings.OLLAMA_MODEL,
        base_url=settings.OLLAMA_BASE_URL,
        temperature=0.3,
        num_ctx=settings.OLLAMA_NUM_CTX,
    )


def get_practice_llm() -> ChatOllama:
    """Model for practice question generation."""
    return ChatOllama(
        model="llama3.1:8b",
        base_url=settings.OLLAMA_BASE_URL,
        temperature=0.5,
        num_ctx=settings.OLLAMA_NUM_CTX,
    )


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

QA_SYSTEM_PROMPT = """You are a knowledgeable medical education assistant specialising in MRCS Part A \
exam preparation. Your role is to give clear, accurate, and well-structured answers based on the \
provided context documents.

Guidelines:
- Prioritise information from the provided context.
- If the context does not contain enough information, say so clearly before drawing on general knowledge.
- Use precise anatomical, physiological, and clinical terminology appropriate for a surgical trainee.
- Keep answers concise but complete. Use bullet points or numbered lists when helpful.
- Never fabricate references or citations.

Context:
{context}
"""

QA_HUMAN_PROMPT = "{question}"

PRACTICE_SYSTEM_PROMPT = """Write one MRCS Part A Single Best Answer question on the topic given by the user. Base it on the context below.

Use this exact format:

**Question:**
[clinical scenario ending in a question]

A. [option]
B. [option]
C. [option]
D. [option]
E. [option]

**Correct Answer:** [letter]

**Explanation:**
[2-3 sentences explaining the correct answer and why the others are wrong]

Context:
{context}"""

PRACTICE_HUMAN_PROMPT = "Generate a Single Best Answer question on the topic: {topic}"

FOLLOWUP_SYSTEM_PROMPT = """You are an MRCS Part A tutor. A student has just reviewed the following practice question:

{practice_question}

Answer their follow-up question concisely and accurately. Use correct surgical and medical terminology."""


# ---------------------------------------------------------------------------
# Core RAG functions
# ---------------------------------------------------------------------------

def _format_docs(docs: list) -> str:
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


def _retrieve_from_collections(collection_names: list[str], query: str) -> list:
    """Retrieve and merge chunks from multiple collections, deduplicating by content."""
    all_docs: list = []
    for name in collection_names:
        try:
            vs = get_vector_store(name)
            docs = vs.similarity_search(query, k=settings.RETRIEVAL_TOP_K)
            all_docs.extend(docs)
        except Exception:
            continue
    seen: set[int] = set()
    unique: list = []
    for doc in all_docs:
        h = hash(doc.page_content)
        if h not in seen:
            seen.add(h)
            unique.append(doc)
    return unique[:settings.RETRIEVAL_TOP_K]


def answer_question(
    question: str,
    collection_names: Optional[list[str]] = None,
    collection_name: str = "default",
) -> str:
    """Retrieve relevant chunks and answer the question synchronously."""
    names = collection_names or [collection_name]
    retriever = RunnableLambda(lambda q: _retrieve_from_collections(names, q))

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", QA_SYSTEM_PROMPT),
            ("human", QA_HUMAN_PROMPT),
        ]
    )

    chain = (
        {"context": retriever | _format_docs, "question": RunnablePassthrough()}
        | prompt
        | get_llm()
        | StrOutputParser()
    )

    return chain.invoke(question)


def stream_answer(
    question: str,
    collection_names: Optional[list[str]] = None,
    collection_name: str = "default",
) -> AsyncIterator[str]:
    """Stream the LLM response token by token."""
    names = collection_names or [collection_name]
    retriever = RunnableLambda(lambda q: _retrieve_from_collections(names, q))

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", QA_SYSTEM_PROMPT),
            ("human", QA_HUMAN_PROMPT),
        ]
    )

    chain = (
        {"context": retriever | _format_docs, "question": RunnablePassthrough()}
        | prompt
        | get_llm()
        | StrOutputParser()
    )

    return chain.astream(question)


def generate_practice_question(
    topic: str = "any topic covered in the knowledge base",
    collection_names: Optional[list[str]] = None,
    collection_name: str = "default",
) -> str:
    """Generate an SBA practice question based on the knowledge base."""
    import random

    names = collection_names or [collection_name]
    results = _retrieve_from_collections(names, topic)
    if not results:
        return (
            "No documents found in the knowledge base. "
            "Please upload some study materials first."
        )

    random.shuffle(results)
    context = _format_docs(results)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", PRACTICE_SYSTEM_PROMPT),
            ("human", PRACTICE_HUMAN_PROMPT),
        ]
    )

    chain = prompt | get_practice_llm() | StrOutputParser()
    return chain.invoke({"context": context, "topic": topic})


async def stream_practice_question(
    topic: str = "any topic covered in the knowledge base",
    collection_names: Optional[list[str]] = None,
    collection_name: str = "default",
) -> AsyncIterator[str]:
    """Stream an SBA practice question token by token."""
    import random

    names = collection_names or [collection_name]
    results = _retrieve_from_collections(names, topic)
    if not results:
        yield (
            "No documents found in the knowledge base. "
            "Please upload some study materials first."
        )
        return

    random.shuffle(results)
    context = _format_docs(results)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", PRACTICE_SYSTEM_PROMPT),
            ("human", PRACTICE_HUMAN_PROMPT),
        ]
    )

    chain = prompt | get_practice_llm() | StrOutputParser()
    async for token in chain.astream({"context": context, "topic": topic}):
        yield token


async def stream_followup(
    practice_question: str,
    user_question: str,
) -> AsyncIterator[str]:
    """Stream a follow-up answer using the practice question as direct context."""
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", FOLLOWUP_SYSTEM_PROMPT),
            ("human", "{user_question}"),
        ]
    )
    chain = prompt | get_llm() | StrOutputParser()
    async for token in chain.astream({"practice_question": practice_question, "user_question": user_question}):
        yield token
