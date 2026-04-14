#!/usr/bin/env python3
"""
One-shot script to parse MRCS-PART-A-QUESTION-BANK.txt and load it
into the deployed question bank via the API.

Usage:
    python scripts/parse_question_bank.py

The script will prompt for your site password if MRCS_PASSWORD is not set
as an environment variable.
"""
from __future__ import annotations

import getpass
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("requests is not installed. Run: pip install requests")

# ---------------------------------------------------------------------------
# Configuration — edit these if needed
# ---------------------------------------------------------------------------

API_BASE  = os.getenv("MRCS_API", "https://mrcs-revision.online/api")
BANK_FILE = os.getenv(
    "MRCS_BANK_FILE",
    str(Path(__file__).parent.parent / "knowledge_bases" / "MRCS-PART-A-QUESTION-BANK.txt"),
)

# ---------------------------------------------------------------------------

def login(username: str, password: str) -> str:
    r = requests.post(
        f"{API_BASE}/auth/login",
        json={"username": username, "password": password},
        timeout=15,
    )
    if r.status_code == 401:
        sys.exit("Wrong username or password.")
    r.raise_for_status()
    return r.json()["access_token"]


def main() -> None:
    bank_path = Path(BANK_FILE)
    if not bank_path.exists():
        sys.exit(
            f"Question bank file not found:\n  {bank_path}\n"
            "Set MRCS_BANK_FILE to the correct path."
        )

    print(f"Reading {bank_path} …")
    text = bank_path.read_text(encoding="utf-8", errors="replace")
    print(f"  {len(text):,} characters, {text.count(chr(10)):,} lines")

    username = os.getenv("MRCS_USERNAME") or input("Username: ")
    password = os.getenv("MRCS_PASSWORD") or getpass.getpass("Password: ")
    print("Logging in …")
    token = login(username, password)
    print("  OK")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # Check current count before parsing
    r = requests.get(f"{API_BASE}/questions/bank/count", headers=headers, timeout=10)
    r.raise_for_status()
    before = r.json()["count"]
    print(f"Questions in bank before: {before}")

    print("Parsing and storing questions (this may take a few seconds) …")
    r = requests.post(
        f"{API_BASE}/questions/bank/parse",
        headers=headers,
        json={"text": text, "source": "MRCS-PART-A-QUESTION-BANK.txt"},
        timeout=120,
    )
    if not r.ok:
        sys.exit(f"Parse failed ({r.status_code}): {r.text}")

    result = r.json()
    print(f"\n  Stored this run : {result['stored']}")
    print(f"  Total in bank   : {result['total']}")
    print("\nDone. The Question Bank tab is ready to use.")


if __name__ == "__main__":
    main()
