"""Run a SQL migration file against Supabase. Usage: python migrate.py migrations/001_initial.sql"""

import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")

PROJECT_REF = os.getenv("SUPABASE_URL", "").replace("https://", "").split(".")[0]
TOKEN = os.getenv("SUPABASE_ACCESS_TOKEN")

if not PROJECT_REF or not TOKEN:
    sys.exit("Missing SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env")

sql_file = sys.argv[1] if len(sys.argv) > 1 else None
if not sql_file:
    sys.exit("Usage: python migrate.py <sql_file>")

sql = open(sql_file).read()

r = httpx.post(
    f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
    headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    json={"query": sql},
)

if r.status_code in (200, 201):
    print(f"✓ Migration applied: {sql_file}")
else:
    print(f"✗ Failed ({r.status_code}): {r.text}")
    sys.exit(1)
