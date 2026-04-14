from unittest.mock import MagicMock, patch


def test_get_db_uses_service_role_key():
    """get_db must use SUPABASE_SERVICE_KEY (service role) to bypass RLS."""
    mock_client = MagicMock()
    with (
        patch("db.create_client", return_value=mock_client) as mock_create,
        patch.dict(
            "os.environ",
            {
                "SUPABASE_URL": "https://example.supabase.co",
                "SUPABASE_SERVICE_KEY": "service-key-123",
            },
        ),
    ):
        from db import get_db

        result = get_db()
        mock_create.assert_called_once_with(
            "https://example.supabase.co", "service-key-123"
        )
        assert result is mock_client
