import os

from supabase import Client, create_client


def get_db() -> Client:
    """FastAPI dependency — returns a Supabase client."""
    return create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_KEY"),
    )
