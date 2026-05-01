from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest


def make_db_with_token(expired=False, has_refresh=True):
    expires_at = datetime.now(timezone.utc) + (
        timedelta(seconds=-10) if expired else timedelta(seconds=3600)
    )
    token_row = {
        "user_id": "user-123",
        "client_id": "test-client-id",
        "access_token": "test-access-token",
        "refresh_token": "test-refresh-token" if has_refresh else None,
        "expires_at": expires_at.isoformat(),
    }
    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        token_row
    ]
    return mock_db, token_row


def test_get_spotify_for_user_valid_token():
    from spotify_client import get_spotify_for_user

    db, _ = make_db_with_token()
    result = get_spotify_for_user("user-123", db)
    assert result is not None


def test_get_spotify_for_user_does_not_select_star():
    """select('*') over-fetches; should only request needed columns."""
    from spotify_client import get_spotify_for_user

    db, _ = make_db_with_token()
    get_spotify_for_user("user-123", db)
    select_call = db.table.return_value.select
    select_call.assert_called_once()
    selected_cols = select_call.call_args[0][0]
    assert selected_cols != "*", (
        "Should not use select('*') — fetch only needed columns"
    )


def test_get_spotify_for_user_no_tokens_raises():
    from fastapi import HTTPException

    from spotify_client import get_spotify_for_user

    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    with pytest.raises(HTTPException) as exc_info:
        get_spotify_for_user("user-123", mock_db)
    assert exc_info.value.status_code == 401


def test_get_spotify_for_user_refreshes_expired_token():
    from spotify_client import get_spotify_for_user

    db, _ = make_db_with_token(expired=True)
    new_token_response = {
        "access_token": "new-access-token",
        "expires_in": 3600,
    }
    mock_response = MagicMock()
    mock_response.json.return_value = new_token_response
    mock_response.raise_for_status = MagicMock()
    with patch("spotify_client.requests.post", return_value=mock_response):
        result = get_spotify_for_user("user-123", db)
    db.table.return_value.update.assert_called_once()
    assert result is not None
