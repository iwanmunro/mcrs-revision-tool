# MRCS Revision Assistant

A local, privacy-first AI revision tool for the **MRCS Part A** exam. Powered by a locally-running LLM via [Ollama](https://ollama.com) — no data ever leaves your machine.

---

## Features

| Feature | Description |
|---|---|
| **Ask a Question** | Free-form Q&A against your own study documents |
| **Practice Quiz** | Auto-generated MRCS-style Single Best Answer (SBA) questions |
| **Knowledge Base** | Upload PDFs, CSVs, text files, or Markdown; organise into named collections |
| **Expandable** | Add any topic beyond MRCS by creating a new collection |
| **Password protected** | Single shared password with JWT session tokens |
| **Fully local** | LLM runs on your machine via Ollama — no API keys required |

---

## Quick Start (Docker — recommended)

### 1. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows/Linux)
- [Ollama](https://ollama.com) **or** let Docker Compose run it for you

### 2. Clone and configure

```bash
git clone <your-repo-url> medical-exam-llm
cd medical-exam-llm

# Create your .env from the template
cp .env.example .env
```

Edit `.env` and at minimum change:

```
APP_PASSWORD=your-chosen-password
SECRET_KEY=<output of: python -c "import secrets; print(secrets.token_hex(32))">
```

### 3. Pull the LLM model

```bash
# Recommended default — fast, CPU-friendly (~2 GB)
ollama pull llama3.2
```

> **Alternatives** (set `OLLAMA_MODEL` in `.env`):
> - `phi3.5` — stronger reasoning, similar size
> - `llama3.1:8b` — higher quality, needs ~5 GB RAM, slower on CPU

### 4. Start everything

```bash
docker compose up --build
```

The app will be available at **http://localhost:3000**

---

## Running locally without Docker

### Backend

```bash
cd backend

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# Copy env file to backend directory
cp ../.env.example .env
# Edit .env as needed

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

Make sure Ollama is running (`ollama serve`) before starting the backend.

---

## Adding Study Materials

1. Go to the **Knowledge Base** tab in the app
2. Choose or create a collection (e.g. `mrcs_anatomy`, `mrcs_physiology`)
3. Drop in your files — supported formats:
   - **PDF** — textbooks, lecture notes, guidelines
   - **CSV** — question banks (one row per question/answer pair)
   - **TXT / Markdown** — notes, summaries

The system automatically chunks and embeds documents. You can upload more files to any collection at any time.

### Recommended collection structure for MRCS Part A

| Collection | Contents |
|---|---|
| `mrcs_anatomy` | Gray's Anatomy, Last's Anatomy, Netter notes |
| `mrcs_physiology` | Ganong, Guyton summaries |
| `mrcs_pathology` | Robbins summaries, surgical pathology notes |
| `mrcs_pharmacology` | BNF notes, anaesthetic pharmacology |
| `mrcs_questions` | SBA question banks in CSV format |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser  (React + TypeScript + Tailwind CSS)        │
│   • Chat Q&A (streaming SSE)                        │
│   • Practice Quiz (SBA generator)                  │
│   • Knowledge Base manager                         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / SSE  (nginx proxy)
┌──────────────────────▼──────────────────────────────┐
│  FastAPI Backend                                    │
│   • JWT password auth                              │
│   • RAG pipeline (LangChain)                       │
│   • Document ingestion endpoint                    │
└──────┬───────────────────────────┬──────────────────┘
       │                           │
┌──────▼──────┐           ┌────────▼────────┐
│  ChromaDB   │           │  Ollama (LLM)   │
│  (vectors)  │           │  llama3.2 / etc │
│  local disk │           │  local CPU/GPU  │
└─────────────┘           └─────────────────┘
       ▲
┌──────┴──────────────────────┐
│  Embeddings                 │
│  sentence-transformers      │
│  all-MiniLM-L6-v2 (CPU)    │
└─────────────────────────────┘
```

---

## Deployment to Cloud

The Docker Compose setup is designed to be portable. To deploy to a cloud VM:

1. Provision a VM (e.g. AWS EC2, GCP Compute Engine, Azure VM)
   - Minimum: 4 vCPU, 8 GB RAM for `llama3.2`
   - Recommended: 8 vCPU, 16 GB RAM for `llama3.1:8b`
2. Install Docker on the VM
3. Copy the project and your `.env` file
4. Run `docker compose up -d`
5. Expose port 3000 (or configure a reverse proxy with HTTPS)

---

## Configuration Reference

All settings are in `.env`. See `.env.example` for full documentation.

| Variable | Default | Description |
|---|---|---|
| `APP_PASSWORD` | `changeme` | Shared access password |
| `SECRET_KEY` | *(must change)* | JWT signing secret |
| `OLLAMA_MODEL` | `llama3.2` | LLM model name |
| `RETRIEVAL_TOP_K` | `5` | Chunks retrieved per query |
| `CHUNK_SIZE` | `600` | Characters per chunk |
| `CHUNK_OVERLAP` | `100` | Overlap between chunks |
| `APP_PORT` | `3000` | Frontend port |

---

## Troubleshooting

**"No knowledge base found" warning**
→ Upload at least one document in the Knowledge Base tab.

**Slow responses**
→ The LLM runs on CPU by default. Expect ~2-5 tokens/sec on a modern Mac.
→ Apple Silicon (M1/M2/M3) is significantly faster via Metal acceleration in Ollama.
→ Switch to `llama3.2` (3B) for the fastest CPU inference.

**Ollama connection error**
→ Ensure Ollama is running: `ollama serve`
→ Confirm the model is pulled: `ollama list`

**Docker build fails**
→ Ensure Docker Desktop has at least 6 GB of memory allocated (Settings → Resources).
