"""Backfill library_changes from existing library_snapshots.

Run once after deploying the library_changes table.
Usage: cd backend && python scripts/backfill_changes.py
"""

import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
db = create_client(url, key)


def backfill():
    users = (
        db.table("library_snapshots").select("user_id").execute()
    ).data
    unique_users = list({r["user_id"] for r in users})
    print(f"Found {len(unique_users)} users with snapshots")

    for user_id in unique_users:
        snapshots = (
            db.table("library_snapshots")
            .select("snapshot_date, album_ids")
            .eq("user_id", user_id)
            .order("snapshot_date", desc=False)
            .execute()
        ).data

        if len(snapshots) < 2:
            print(f"  User {user_id[:8]}...: {len(snapshots)} snapshot(s), skipping")
            continue

        changes_created = 0
        for i in range(1, len(snapshots)):
            older = set(snapshots[i - 1]["album_ids"])
            newer = set(snapshots[i]["album_ids"])
            added = list(newer - older)
            removed = list(older - newer)
            if added or removed:
                db.table("library_changes").insert(
                    {
                        "user_id": user_id,
                        "changed_at": snapshots[i]["snapshot_date"] + "T06:00:00+00:00",
                        "added_ids": added,
                        "removed_ids": removed,
                    }
                ).execute()
                changes_created += 1

        print(
            f"  User {user_id[:8]}...: {len(snapshots)} snapshots -> {changes_created} change events"
        )

    print("Backfill complete.")


if __name__ == "__main__":
    backfill()
