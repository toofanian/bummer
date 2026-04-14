from unittest.mock import MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient

from db import get_db
from main import app
from spotify_client import get_spotify

client = TestClient(app)

COLLECTION = {
    "id": "col-uuid-1",
    "name": "Road trip",
    "created_at": "2021-01-01T00:00:00Z",
    "updated_at": "2021-06-15T00:00:00Z",
}


def mock_db(execute_data=None):
    """Return a MagicMock Supabase client whose .execute() returns given data."""
    db = MagicMock()
    db.table.return_value.select.return_value.execute.return_value = MagicMock(
        data=execute_data or []
    )
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=execute_data or [])
    )
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=execute_data or []
    )
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(
        data=execute_data or []
    )
    db.table.return_value.delete.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    db.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    return db


def override_db(db):
    app.dependency_overrides[get_db] = lambda: db


def mock_spotify():
    """Return a MagicMock Spotify client (used as a no-op when cache is pre-warmed)."""
    return MagicMock()


def override_spotify(sp):
    app.dependency_overrides[get_spotify] = lambda: sp


def clear_overrides():
    app.dependency_overrides.clear()


# --- Tier ---


def test_set_tier_returns_updated_metadata():
    db = mock_db(execute_data=[{"spotify_id": "abc123", "tier": "A"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/metadata/abc123/tier", json={"tier": "A"})

    assert response.status_code == 200
    assert response.json()["tier"] == "A"
    assert response.json()["spotify_id"] == "abc123"

    clear_overrides()


def test_set_tier_rejects_invalid_value():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/metadata/abc123/tier", json={"tier": "Z"})

    assert response.status_code == 422

    clear_overrides()


def test_set_tier_accepts_all_valid_tiers():
    for tier in ["S", "A", "B", "C", "D"]:
        db = mock_db(execute_data=[{"spotify_id": "abc123", "tier": tier}])
        override_db(db)
        override_spotify(mock_spotify())

        response = client.put("/metadata/abc123/tier", json={"tier": tier})

        assert response.status_code == 200, f"tier {tier} should be valid"

    clear_overrides()


def test_clear_tier_sets_tier_to_null():
    db = mock_db(execute_data=[{"spotify_id": "abc123", "tier": None}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.delete("/metadata/abc123/tier")

    assert response.status_code == 200
    assert response.json()["tier"] is None

    clear_overrides()


# --- Collections ---


def test_list_collections_returns_empty_list():
    db = mock_db(execute_data=[])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections")

    assert response.status_code == 200
    assert response.json() == []

    clear_overrides()


def test_list_collections_returns_all_collections():
    db = mock_db(execute_data=[COLLECTION])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Road trip"
    assert data[0]["id"] == "col-uuid-1"

    clear_overrides()


def test_list_collections_includes_album_count():
    """GET /collections must include album_count on each row."""
    collection_with_count = {**COLLECTION, "collection_albums": [{"count": 3}]}
    db = mock_db(execute_data=[collection_with_count])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["album_count"] == 3

    clear_overrides()


def test_list_collections_includes_created_at_and_updated_at():
    """GET /collections must include created_at and updated_at on each row."""
    db = mock_db(execute_data=[COLLECTION])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections")

    assert response.status_code == 200
    data = response.json()
    assert data[0]["created_at"] == "2021-01-01T00:00:00Z"
    assert data[0]["updated_at"] == "2021-06-15T00:00:00Z"

    clear_overrides()


def test_create_collection_returns_new_collection():
    db = mock_db(execute_data=[COLLECTION])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post("/collections", json={"name": "Road trip"})

    assert response.status_code == 201
    assert response.json()["name"] == "Road trip"

    clear_overrides()


def test_create_collection_requires_name():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post("/collections", json={})

    assert response.status_code == 422

    clear_overrides()


def test_delete_collection():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.delete("/collections/col-uuid-1")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}

    clear_overrides()


def test_add_album_to_collection():
    db = mock_db(execute_data=[{"collection_id": "col-uuid-1", "spotify_id": "abc123"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post(
        "/collections/col-uuid-1/albums", json={"spotify_id": "abc123"}
    )

    assert response.status_code == 201

    clear_overrides()


def test_remove_album_from_collection():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.delete("/collections/col-uuid-1/albums/abc123")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}

    clear_overrides()


# --- Bulk metadata ---


def test_get_all_metadata_returns_dict_keyed_by_spotify_id():
    db = mock_db()
    db.table.return_value.select.return_value.execute.return_value = MagicMock(
        data=[
            {"spotify_id": "id1", "tier": "A"},
            {"spotify_id": "id2", "tier": "S"},
        ]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/metadata/all")

    assert response.status_code == 200
    data = response.json()
    assert data["id1"]["tier"] == "A"
    assert data["id2"]["tier"] == "S"

    clear_overrides()


def test_get_all_metadata_returns_empty_dict_when_no_metadata():
    db = mock_db(execute_data=[])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/metadata/all")

    assert response.status_code == 200
    assert response.json() == {}

    clear_overrides()


# --- Collection albums ---


def test_get_collection_albums_returns_albums_in_collection():
    import routers.library as library_module

    library_module._cache["albums"] = [
        {
            "spotify_id": "id1",
            "name": "Album One",
            "artists": ["Artist A"],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        },
        {
            "spotify_id": "id2",
            "name": "Album Two",
            "artists": ["Artist B"],
            "release_date": "2019",
            "total_tracks": 8,
            "image_url": None,
            "added_at": "2020-01-01T00:00:00Z",
        },
        {
            "spotify_id": "id3",
            "name": "Album Three",
            "artists": ["Artist C"],
            "release_date": "2018",
            "total_tracks": 12,
            "image_url": None,
            "added_at": "2019-01-01T00:00:00Z",
        },
    ]
    library_module._cache["total"] = 3
    library_module._cache["fetched_at"] = __import__("time").time()

    db = mock_db(execute_data=[{"spotify_id": "id1"}, {"spotify_id": "id3"}])
    override_db(db)
    override_spotify(mock_spotify())  # cache is warm; Spotify won't actually be called

    response = client.get("/collections/col-uuid-1/albums")

    assert response.status_code == 200
    data = response.json()
    assert len(data["albums"]) == 2
    assert {a["spotify_id"] for a in data["albums"]} == {"id1", "id3"}

    library_module.clear_cache()
    clear_overrides()


def test_get_collection_albums_returns_empty_when_collection_empty():
    import routers.library as library_module

    library_module._cache["albums"] = [
        {
            "spotify_id": "id1",
            "name": "Album One",
            "artists": [],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        },
    ]
    library_module._cache["total"] = 1
    library_module._cache["fetched_at"] = __import__("time").time()

    db = mock_db(execute_data=[])
    override_db(db)
    override_spotify(mock_spotify())  # cache is warm; Spotify won't actually be called

    response = client.get("/collections/col-uuid-1/albums")

    assert response.status_code == 200
    assert response.json()["albums"] == []

    library_module.clear_cache()
    clear_overrides()


def test_get_collection_albums_warms_cache_when_cold():
    """When the library cache is empty, the endpoint must fetch from Spotify
    rather than returning an empty list."""
    from unittest.mock import MagicMock

    import routers.library as library_module
    from spotify_client import get_spotify

    library_module.clear_cache()  # ensure cache is cold

    # Spotify mock returns one saved-album item
    sp = MagicMock()
    sp.current_user_saved_albums.return_value = {
        "items": [
            {
                "added_at": "2021-01-01T00:00:00Z",
                "album": {
                    "id": "id1",
                    "name": "Album One",
                    "artists": [{"name": "Artist A"}],
                    "release_date": "2020",
                    "total_tracks": 10,
                    "images": [],
                },
            }
        ],
        "total": 1,
        "next": None,
    }
    app.dependency_overrides[get_spotify] = lambda: sp

    db = mock_db(execute_data=[{"spotify_id": "id1"}])
    override_db(db)

    response = client.get("/collections/col-uuid-1/albums")

    assert response.status_code == 200
    data = response.json()
    assert len(data["albums"]) == 1
    assert data["albums"][0]["spotify_id"] == "id1"
    assert data["albums"][0]["name"] == "Album One"

    library_module.clear_cache()
    app.dependency_overrides.clear()


# --- 401 auth tests for unprotected endpoints ---


def _unauthenticated_spotify():
    """Dependency override that simulates no valid Spotify session."""

    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")

    return raise_401


def test_get_all_metadata_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_db] = lambda: mock_db()

    response = client.get("/metadata/all")

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_set_tier_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_db] = lambda: mock_db()

    response = client.put("/metadata/abc123/tier", json={"tier": "A"})

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_clear_tier_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_db] = lambda: mock_db()

    response = client.delete("/metadata/abc123/tier")

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_list_collections_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_db] = lambda: mock_db()

    response = client.get("/collections")

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_create_collection_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_db] = lambda: mock_db()

    response = client.post("/collections", json={"name": "Test"})

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_delete_collection_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_db] = lambda: mock_db()

    response = client.delete("/collections/col-uuid-1")

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_add_album_to_collection_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_db] = lambda: mock_db()

    response = client.post(
        "/collections/col-uuid-1/albums", json={"spotify_id": "abc123"}
    )

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_remove_album_from_collection_returns_401_when_not_authenticated():
    app.dependency_overrides[get_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_db] = lambda: mock_db()

    response = client.delete("/collections/col-uuid-1/albums/abc123")

    assert response.status_code == 401

    app.dependency_overrides.clear()
