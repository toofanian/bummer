from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app
from spotify_client import get_spotify

client = TestClient(app, follow_redirects=False)


def override_spotify_authenticated():
    """Override get_spotify to simulate a valid Spotify session."""
    from unittest.mock import MagicMock

    app.dependency_overrides[get_spotify] = lambda: MagicMock()


def override_spotify_unauthenticated():
    """Override get_spotify to simulate an unauthenticated user."""

    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")

    app.dependency_overrides[get_spotify] = raise_401


def clear_overrides():
    app.dependency_overrides.clear()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_redirects_to_spotify():
    with patch("routers.auth.get_oauth") as mock_get_oauth:
        mock_oauth = MagicMock()
        mock_oauth.get_authorize_url.return_value = (
            "https://accounts.spotify.com/authorize?foo=bar"
        )
        mock_get_oauth.return_value = mock_oauth

        response = client.get("/auth/login")

        assert response.status_code == 307
        assert "accounts.spotify.com" in response.headers["location"]


def test_callback_exchanges_code_and_redirects_to_frontend():
    with patch("routers.auth.get_oauth") as mock_get_oauth:
        mock_oauth = MagicMock()
        mock_get_oauth.return_value = mock_oauth

        response = client.get("/auth/callback?code=test_code")

        mock_oauth.get_access_token.assert_called_once_with("test_code")
        assert response.status_code == 307
        assert "localhost:5173" in response.headers["location"]


def test_status_returns_authenticated_when_token_is_valid():
    with patch("routers.auth.get_oauth") as mock_get_oauth:
        mock_oauth = MagicMock()
        mock_oauth.get_cached_token.return_value = {"access_token": "tok"}
        mock_oauth.is_token_expired.return_value = False
        mock_get_oauth.return_value = mock_oauth

        response = client.get("/auth/status")

        assert response.status_code == 200
        assert response.json() == {"authenticated": True}


def test_status_returns_unauthenticated_when_no_token():
    with patch("routers.auth.get_oauth") as mock_get_oauth:
        mock_oauth = MagicMock()
        mock_oauth.get_cached_token.return_value = None
        mock_get_oauth.return_value = mock_oauth

        response = client.get("/auth/status")

        assert response.json() == {"authenticated": False}


def test_status_returns_unauthenticated_when_token_expired():
    with patch("routers.auth.get_oauth") as mock_get_oauth:
        mock_oauth = MagicMock()
        mock_oauth.get_cached_token.return_value = {"access_token": "tok"}
        mock_oauth.is_token_expired.return_value = True
        mock_get_oauth.return_value = mock_oauth

        response = client.get("/auth/status")

        assert response.json() == {"authenticated": False}


def test_logout_removes_cache_file():
    override_spotify_authenticated()
    with (
        patch("routers.auth.os.path.exists", return_value=True),
        patch("routers.auth.os.remove") as mock_remove,
    ):
        response = client.post("/auth/logout")

        mock_remove.assert_called_once()
        assert response.json() == {"authenticated": False}

    clear_overrides()


def test_logout_is_safe_when_no_cache_file():
    override_spotify_authenticated()
    with (
        patch("routers.auth.os.path.exists", return_value=False),
        patch("routers.auth.os.remove") as mock_remove,
    ):
        response = client.post("/auth/logout")

        mock_remove.assert_not_called()
        assert response.json() == {"authenticated": False}

    clear_overrides()


def test_logout_returns_401_when_not_authenticated():
    override_spotify_unauthenticated()

    response = client.post("/auth/logout")

    assert response.status_code == 401

    clear_overrides()
