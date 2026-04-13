from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2:1b"
    # Context window — 2048 is enough for prompt + context + generation and is faster
    OLLAMA_NUM_CTX: int = 2048

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./chroma_db"

    # Knowledge base upload staging directory
    KNOWLEDGE_BASE_DIR: str = "./knowledge_base"

    # Authentication
    # Single shared password for all users
    APP_PASSWORD: str = "changeme"
    SECRET_KEY: str = "change-this-to-a-long-random-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    # Embeddings
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # RAG settings
    # Fewer chunks = less prefill tokens = faster generation
    RETRIEVAL_TOP_K: int = 2
    CHUNK_SIZE: int = 400
    CHUNK_OVERLAP: int = 60

    model_config = {"env_file": ".env"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
