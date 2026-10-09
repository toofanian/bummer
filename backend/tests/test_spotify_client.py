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


def _spotify_error_response(status_code, body):
    import json

    import requests

    response = requests.Response()
    response.status_code = status_code
    response._content = json.dumps(body).encode()
    response.url = "https://accounts.spotify.com/api/token"
    return response


def test_no_tokens_raises_reauth_required():
    from spotify_client import SpotifyReauthRequired, get_spotify_for_user

    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    with pytest.raises(SpotifyReauthRequired):
        get_spotify_for_user("user-123", mock_db)


def test_refresh_invalid_grant_deletes_row_and_raises_reauth():
    """Expired/revoked refresh token: wipe the dead row, ask for re-auth."""
    from spotify_client import SpotifyReauthRequired, get_spotify_for_user

    db, _ = make_db_with_token(expired=True)
    response = _spotify_error_response(
        400,
        {"error": "invalid_grant", "error_description": "Refresh token expired"},
    )
    with patch("spotify_client.requests.post", return_value=response):
        with pytest.raises(SpotifyReauthRequired) as exc_info:
            get_spotify_for_user("user-123", db)

    assert exc_info.value.status_code == 401
    db.table.return_value.delete.assert_called_once()
    # Scoped to the user AND the exact token that was rejected, so a row that
    # another instance refreshed in the meantime is never wiped.
    delete_chain = db.table.return_value.delete.return_value
    delete_chain.eq.assert_called_once_with("user_id", "user-123")
    delete_chain.eq.return_value.eq.assert_called_once_with(
        "refresh_token", "test-refresh-token"
    )
    db.table.return_value.update.assert_not_called()


def test_refresh_invalid_grant_uses_row_refreshed_by_another_instance():
    """Rotated-token race: our token was rejected because another instance
    already refreshed. The fresh row must survive and be used."""
    from spotify_client import get_spotify_for_user

    db, expired_row = make_db_with_token(expired=True)
    fresh_row = {
        **expired_row,
        "access_token": "fresh-access-token",
        "refresh_token": "rotated-refresh-token",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }
    select_execute = db.table.return_value.select.return_value.eq.return_value.execute
    select_execute.side_effect = [
        MagicMock(data=[dict(expired_row)]),
        MagicMock(data=[dict(expired_row)]),
        MagicMock(data=[fresh_row]),
    ]
    delete_chain = db.table.return_value.delete.return_value
    delete_chain.eq.return_value.eq.return_value.execute.return_value.data = []

    response = _spotify_error_response(400, {"error": "invalid_grant"})
    with patch("spotify_client.requests.post", return_value=response):
        with patch("spotify_client.spotipy.Spotify") as mock_spotify:
            get_spotify_for_user("user-123", db)

    mock_spotify.assert_called_once_with(auth="fresh-access-token")


def test_refresh_failure_logs_spotify_error_body(caplog):
    from spotify_client import SpotifyReauthRequired, get_spotify_for_user

    db, _ = make_db_with_token(expired=True)
    response = _spotify_error_response(
        400,
        {"error": "invalid_grant", "error_description": "Refresh token expired"},
    )
    with (
        caplog.at_level("ERROR", logger="spotify_client"),
        patch("spotify_client.requests.post", return_value=response),
        pytest.raises(SpotifyReauthRequired),
    ):
        get_spotify_for_user("user-123", db)

    assert "invalid_grant" in caplog.text
    assert "user-123" in caplog.text
    assert "400" in caplog.text


@pytest.mark.parametrize(
    "status_code,body",
    [
        (400, {"error": "invalid_client", "error_description": "Invalid client"}),
        (503, {"error": "server_error"}),
    ],
)
def test_refresh_other_errors_keep_row_and_raise(status_code, body, caplog):
    """Only invalid_grant means the token is dead; anything else must not wipe it."""
    import requests

    from spotify_client import get_spotify_for_user

    db, _ = make_db_with_token(expired=True)
    response = _spotify_error_response(status_code, body)
    with (
        caplog.at_level("ERROR", logger="spotify_client"),
        patch("spotify_client.requests.post", return_value=response),
        pytest.raises(requests.HTTPError),
    ):
        get_spotify_for_user("user-123", db)

    db.table.return_value.delete.assert_not_called()
    assert body["error"] in caplog.text


def test_refresh_non_json_error_body_keeps_row_and_raises():
    import requests

    from spotify_client import get_spotify_for_user

    db, _ = make_db_with_token(expired=True)
    response = requests.Response()
    response.status_code = 400
    response._content = b"<html>Bad Request</html>"
    with (
        patch("spotify_client.requests.post", return_value=response),
        pytest.raises(requests.HTTPError),
    ):
        get_spotify_for_user("user-123", db)

    db.table.return_value.delete.assert_not_called()


def test_undecryptable_token_raises_and_keeps_row(caplog):
    """A key problem is an operator error: fail loudly, never wipe the row."""
    from cryptography.fernet import Fernet

    from crypto import TokenDecryptError
    from spotify_client import get_spotify_for_user

    db, token_row = make_db_with_token(expired=True)
    token_row["refresh_token"] = (
        Fernet(Fernet.generate_key()).encrypt(b"real-refresh-token").decode()
    )
    with (
        caplog.at_level("ERROR", logger="spotify_client"),
        patch.dict("os.environ", {"TOKEN_ENCRYPTION_KEY": ""}),
        patch("spotify_client.requests.post") as mock_post,
        pytest.raises(TokenDecryptError),
    ):
        get_spotify_for_user("user-123", db)

    mock_post.assert_not_called()
    db.table.return_value.delete.assert_not_called()
    assert "user-123" in caplog.text


def test_reauth_required_returned_as_401_with_code():
    """The API exposes a machine-readable code the frontend can route on."""
    from fastapi.testclient import TestClient

    from auth_middleware import get_current_user
    from main import app
    from spotify_client import SpotifyReauthRequired

    app.dependency_overrides[get_current_user] = lambda: {"user_id": "user-123"}
    try:
        with (
            patch("routers.auth.get_service_db", return_value=MagicMock()),
            patch(
                "routers.auth.get_spotify_for_user",
                side_effect=SpotifyReauthRequired(),
            ),
        ):
            response = TestClient(app).post("/auth/refresh-spotify-token")
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 401
    assert response.json()["code"] == "spotify_reauth_required"
    assert isinstance(response.json()["detail"], str)
