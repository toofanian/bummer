import os

from supabase import Client, create_client

_service_client: Client | None = None


def get_service_db() -> Client:
    """Returns a Supabase client using the service role key (bypasses RLS).
    Use only for admin operations: background sync, invite generation, token storage by backend."""
    global _service_client
    if _service_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv(
            "SUPABASE_SERVICE_ROLE_KEY"
        )
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _service_client = create_client(url, key)
    return _service_client


# Keep get_db as an alias so existing code continues to work during migration
def get_db() -> Client:
    return get_service_db()
