#!/usr/bin/env python3
"""Generate invite codes and insert them into Supabase.

Usage:
    python scripts/generate_invite.py          # generates 1 code
    python scripts/generate_invite.py 3        # generates 3 codes
"""

import secrets
import string
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from db import get_service_db  # noqa: E402


def generate_code(length: int = 16) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    db = get_service_db()
    codes = []
    for _ in range(count):
        code = generate_code()
        db.table("invite_codes").insert({"code": code}).execute()
        codes.append(code)
        print(f"  {code}")
    print(f"\nGenerated {count} invite code(s). Share with friends.")


if __name__ == "__main__":
    main()
