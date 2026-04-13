"""
Question bank: parse a structured text file of SBA questions into SQLite
and serve random questions instantly (no LLM required).

Handles two formats found in the MRCS question bank:
  1. Labelled options  — "A. Option text"
  2. Unlabelled options — five plain indented lines before "ANSWER IS X"
"""
from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = "./question_bank.db"

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            question    TEXT NOT NULL,
            option_a    TEXT,
            option_b    TEXT,
            option_c    TEXT,
            option_d    TEXT,
            option_e    TEXT,
            answer      TEXT,
            explanation TEXT,
            source      TEXT
        )
    """)
    conn.commit()
    conn.close()


def question_count() -> int:
    conn = get_db()
    n = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    conn.close()
    return n


def random_question() -> Optional[dict]:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM questions WHERE option_a IS NOT NULL AND option_e IS NOT NULL "
        "ORDER BY RANDOM() LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def clear_source(source: str) -> int:
    conn = get_db()
    cur = conn.execute("DELETE FROM questions WHERE source = ?", (source,))
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    return deleted


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

_ANSWER_RE = re.compile(r'\bANSWER\s+IS\s+([A-E])\b', re.IGNORECASE)
_NOISE_RE  = re.compile(r'MCQS\s+MRCS[-\s]*A|^\s*\d+\s*$', re.MULTILINE | re.IGNORECASE)


def parse_and_store(text: str, source: str = "question_bank") -> int:
    """
    Parse all questions from `text` and insert them into SQLite.
    Returns the number of questions successfully stored.
    """
    init_db()
    matches = list(_ANSWER_RE.finditer(text))
    stored = 0

    for i, match in enumerate(matches):
        correct = match.group(1).upper()

        # Block before this answer = question + options
        block_start = matches[i - 1].end() if i > 0 else 0
        qblock = text[block_start:match.start()]

        # Block after this answer until next answer = explanation
        expl_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        explanation = _clean(text[match.end():expl_end])

        q = _parse_block(qblock)
        if not q:
            continue

        conn = get_db()
        conn.execute(
            """INSERT INTO questions
               (question, option_a, option_b, option_c, option_d, option_e, answer, explanation, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                q["question"],
                q.get("a"), q.get("b"), q.get("c"), q.get("d"), q.get("e"),
                correct,
                explanation[:1000],
                source,
            ),
        )
        conn.commit()
        conn.close()
        stored += 1

    return stored


def _clean(text: str) -> str:
    """Remove noise (page numbers, running headers) and collapse whitespace."""
    text = _NOISE_RE.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _parse_block(text: str) -> Optional[dict]:
    """
    Extract question and five options from a raw text block.
    Returns dict with keys: question, a, b, c, d, e  — or None if parsing fails.
    """
    text = _clean(text)
    if not text:
        return None

    # ── Format 1: labelled options ( A. / B. / … ) ──────────────────────────
    if re.search(r'^[A-E]\.\s', text, re.MULTILINE):
        # Split at each option label
        parts = re.split(r'\n(?=[A-E]\.\s)', text)
        options: dict[str, str] = {}
        question_parts: list[str] = []

        for part in parts:
            m = re.match(r'^([A-E])\.\s+(.*)', part.strip(), re.DOTALL)
            if m:
                letter = m.group(1).lower()
                options[letter] = re.sub(r'\s+', ' ', m.group(2)).strip()
            else:
                question_parts.append(part.strip())

        question = " ".join(question_parts).strip()
        # Remove trailing "Select one answer only." boilerplate
        question = re.sub(r'\s*Select one answer only\.?\s*$', '', question, flags=re.IGNORECASE)

        if question and len(options) == 5:
            return {"question": question, **options}

    # ── Format 2: unlabelled options (last 5 non-empty lines) ──────────────
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    lines = [ln for ln in lines if not re.match(r'^\d+$', ln)]

    if len(lines) >= 6:
        opts = lines[-5:]
        question = re.sub(r'\s+', ' ', " ".join(lines[:-5])).strip()
        if question:
            return {
                "question": question,
                "a": opts[0], "b": opts[1], "c": opts[2],
                "d": opts[3], "e": opts[4],
            }

    return None


# ---------------------------------------------------------------------------
# Format a stored question as markdown (matches LLM-generated format)
# ---------------------------------------------------------------------------

def format_as_markdown(row: dict) -> str:
    """Convert a SQLite row into the same markdown format as LLM-generated questions."""
    q = (
        f"**Question:**\n{row['question']}\n\n"
        f"A. {row['option_a']}\n"
        f"B. {row['option_b']}\n"
        f"C. {row['option_c']}\n"
        f"D. {row['option_d']}\n"
        f"E. {row['option_e']}\n"
    )
    if row.get("answer"):
        q += f"\n**Correct Answer:** {row['answer']}\n"
    if row.get("explanation"):
        q += f"\n**Explanation:**\n{row['explanation']}\n"
    return q
