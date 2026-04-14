import os
from supabase import create_client, Client


def get_db() -> Client:
    """FastAPI dependency — returns a Supabase client."""
    return create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_KEY"),
    )
