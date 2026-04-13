"""
Document ingestion pipeline.

Supports PDF, CSV, TXT, and Markdown files.
Documents are chunked and embedded into ChromaDB under a named collection.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from config import get_settings
from rag import get_embeddings, get_vector_store

logger = logging.getLogger(__name__)
settings = get_settings()


def _load_pdf(path: Path) -> list[Document]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    docs = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            docs.append(
                Document(
                    page_content=text,
                    metadata={"source": path.name, "page": i + 1},
                )
            )
    return docs


def _load_csv(path: Path) -> list[Document]:
    import pandas as pd

    df = pd.read_csv(path)
    docs = []
    for idx, row in df.iterrows():
        # Join all non-null columns into a single text block
        text = "\n".join(
            f"{col}: {val}" for col, val in row.items() if pd.notna(val)
        )
        if text.strip():
            docs.append(
                Document(
                    page_content=text,
                    metadata={"source": path.name, "row": int(idx)},
                )
            )
    return docs


def _load_text(path: Path) -> list[Document]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if text.strip():
        return [Document(page_content=text, metadata={"source": path.name})]
    return []


LOADERS = {
    ".pdf": _load_pdf,
    ".csv": _load_csv,
    ".txt": _load_text,
    ".md": _load_text,
    ".markdown": _load_text,
}


def load_file(path: Path) -> list[Document]:
    """Load a single file into LangChain Documents based on its extension."""
    suffix = path.suffix.lower()
    loader = LOADERS.get(suffix)
    if loader is None:
        raise ValueError(f"Unsupported file type: {suffix}")
    logger.info("Loading file: %s", path.name)
    return loader(path)


def ingest_file(
    path: Path,
    collection_name: str = "default",
    overwrite: bool = False,
) -> int:
    """
    Load, chunk, embed, and store a document file in ChromaDB.

    Returns the number of chunks added.
    """
    docs = load_file(path)
    if not docs:
        logger.warning("No content extracted from %s", path.name)
        return 0

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
    )
    chunks = splitter.split_documents(docs)
    logger.info(
        "Split %s into %d chunks for collection '%s'",
        path.name,
        len(chunks),
        collection_name,
    )

    vector_store = get_vector_store(collection_name)

    if overwrite:
        # Remove existing documents from this source
        try:
            existing = vector_store.get(where={"source": path.name})
            if existing and existing["ids"]:
                vector_store.delete(ids=existing["ids"])
                logger.info(
                    "Removed %d existing chunks for %s", len(existing["ids"]), path.name
                )
        except Exception as e:
            logger.warning("Could not remove existing chunks: %s", e)

    vector_store.add_documents(chunks)
    logger.info("Ingested %d chunks into collection '%s'", len(chunks), collection_name)
    return len(chunks)


def ingest_directory(
    directory: Path,
    collection_name: str = "default",
    overwrite: bool = False,
) -> dict[str, int]:
    """Ingest all supported files in a directory. Returns {filename: chunk_count}."""
    results: dict[str, int] = {}
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() in LOADERS:
            try:
                count = ingest_file(path, collection_name, overwrite)
                results[path.name] = count
            except Exception as e:
                logger.error("Failed to ingest %s: %s", path.name, e)
                results[path.name] = -1
    return results
