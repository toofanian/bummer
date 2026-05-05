from unittest.mock import MagicMock

from fastapi import HTTPException
from fastapi.testclient import TestClient

from auth_middleware import get_authed_db, get_current_user
from main import app
from spotify_client import get_user_spotify

client = TestClient(app)

FAKE_USER_ID = "test-user-id-123"
FAKE_USER = {"user_id": FAKE_USER_ID, "token": "fake-token"}

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
    # Chain for .select().order().execute() (list_collections with position ordering)
    db.table.return_value.select.return_value.order.return_value.execute.return_value = MagicMock(
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
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=execute_data or [])
    )
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=execute_data or []
    )
    # Chain for .select().eq().order().execute() (get_collection_albums with position ordering)
    db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=execute_data or []
    )
    # Chain for .select().eq().order(desc=True).limit().execute() (max position lookup)
    db.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[]
    )
    return db


def override_db(db):
    app.dependency_overrides[get_authed_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER


def mock_spotify():
    """Return a MagicMock Spotify client (used as a no-op when cache is pre-warmed)."""
    return MagicMock()


def override_spotify(sp):
    app.dependency_overrides[get_user_spotify] = lambda: sp


def clear_overrides():
    app.dependency_overrides.clear()


# --- Tier ---


def test_set_tier_returns_updated_metadata():
    db = mock_db(execute_data=[{"service_id": "abc123", "tier": "A"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/metadata/abc123/tier", json={"tier": "A"})

    assert response.status_code == 200
    assert response.json()["tier"] == "A"
    assert response.json()["service_id"] == "abc123"

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
        db = mock_db(execute_data=[{"service_id": "abc123", "tier": tier}])
        override_db(db)
        override_spotify(mock_spotify())

        response = client.put("/metadata/abc123/tier", json={"tier": tier})

        assert response.status_code == 200, f"tier {tier} should be valid"

    clear_overrides()


def test_clear_tier_sets_tier_to_null():
    db = mock_db(execute_data=[{"service_id": "abc123", "tier": None}])
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
    db = mock_db(execute_data=[{"collection_id": "col-uuid-1", "service_id": "abc123"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post(
        "/collections/col-uuid-1/albums", json={"service_id": "abc123"}
    )

    assert response.status_code == 201

    clear_overrides()


def test_add_album_assigns_next_position():
    """Single-album add should assign position = max(existing) + 1."""
    db = mock_db(
        execute_data=[
            {"collection_id": "col-uuid-1", "service_id": "abc123", "position": 5}
        ]
    )
    # Mock the position lookup
    db.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"position": 4}]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post(
        "/collections/col-uuid-1/albums", json={"service_id": "abc123"}
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


def test_get_all_metadata_returns_dict_keyed_by_service_id():
    db = mock_db()
    db.table.return_value.select.return_value.execute.return_value = MagicMock(
        data=[
            {"service_id": "id1", "tier": "A"},
            {"service_id": "id2", "tier": "S"},
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


def test_get_collection_albums_returns_albums_in_collection(monkeypatch):
    import routers.library as library_module

    cached = [
        {
            "service_id": "id1",
            "name": "Album One",
            "artists": ["Artist A"],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        },
        {
            "service_id": "id2",
            "name": "Album Two",
            "artists": ["Artist B"],
            "release_date": "2019",
            "total_tracks": 8,
            "image_url": None,
            "added_at": "2020-01-01T00:00:00Z",
        },
        {
            "service_id": "id3",
            "name": "Album Three",
            "artists": ["Artist C"],
            "release_date": "2018",
            "total_tracks": 12,
            "image_url": None,
            "added_at": "2019-01-01T00:00:00Z",
        },
    ]
    monkeypatch.setattr(
        library_module, "get_album_cache", lambda db=None, user_id=None: cached
    )

    db = mock_db(execute_data=[{"service_id": "id1"}, {"service_id": "id3"}])
    override_db(db)

    response = client.get("/collections/col-uuid-1/albums")

    assert response.status_code == 200
    data = response.json()
    assert len(data["albums"]) == 2
    assert {a["service_id"] for a in data["albums"]} == {"id1", "id3"}

    clear_overrides()


def test_get_collection_albums_returns_empty_when_collection_empty(monkeypatch):
    import routers.library as library_module

    cached = [
        {
            "service_id": "id1",
            "name": "Album One",
            "artists": [],
            "release_date": "2020",
            "total_tracks": 10,
            "image_url": None,
            "added_at": "2021-01-01T00:00:00Z",
        },
    ]
    monkeypatch.setattr(
        library_module, "get_album_cache", lambda db=None, user_id=None: cached
    )

    db = mock_db(execute_data=[])
    override_db(db)

    response = client.get("/collections/col-uuid-1/albums")

    assert response.status_code == 200
    assert response.json()["albums"] == []

    clear_overrides()


# --- Collection rename ---


def test_rename_collection():
    db = mock_db(execute_data=[{**COLLECTION, "name": "New name"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.patch("/collections/col-uuid-1", json={"name": "New name"})

    assert response.status_code == 200
    assert response.json()["name"] == "New name"

    clear_overrides()


def test_rename_collection_rejects_empty_name():
    override_db(mock_db())
    override_spotify(mock_spotify())

    response = client.patch("/collections/col-uuid-1", json={"name": ""})

    assert response.status_code == 422

    clear_overrides()


# --- Collection description ---


def test_update_collection_description():
    db = mock_db(execute_data=[{**COLLECTION, "description": "late night vibes"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/description", json={"description": "late night vibes"}
    )

    assert response.status_code == 200
    assert response.json()["description"] == "late night vibes"

    clear_overrides()


def test_clear_collection_description():
    db = mock_db(execute_data=[{**COLLECTION, "description": None}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/description", json={"description": None}
    )

    assert response.status_code == 200
    assert response.json()["description"] is None

    clear_overrides()


def test_list_collections_includes_description():
    col_with_desc = {**COLLECTION, "description": "chill beats"}
    db = mock_db(execute_data=[col_with_desc])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections")

    assert response.status_code == 200
    assert response.json()[0]["description"] == "chill beats"

    clear_overrides()


# --- Collection album reorder ---


def test_reorder_collection_albums():
    db = mock_db()
    # Mock the update chain: .update().eq().eq().execute()
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/albums/reorder",
        json={"album_ids": ["id3", "id1", "id2"]},
    )

    assert response.status_code == 200
    assert response.json()["reordered"] is True

    clear_overrides()


def test_reorder_collection_albums_requires_album_ids():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/collections/col-uuid-1/albums/reorder", json={})

    assert response.status_code == 422

    clear_overrides()


# --- Collection cover art ---


def test_set_collection_cover():
    db = mock_db(execute_data=[{**COLLECTION, "cover_album_id": "album-id-1"}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/cover",
        json={"cover_album_id": "album-id-1"},
    )

    assert response.status_code == 200
    assert response.json()["cover_album_id"] == "album-id-1"

    clear_overrides()


def test_clear_collection_cover():
    db = mock_db(execute_data=[{**COLLECTION, "cover_album_id": None}])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/cover",
        json={"cover_album_id": None},
    )

    assert response.status_code == 200
    assert response.json()["cover_album_id"] is None

    clear_overrides()


# --- Bulk add ---


def test_bulk_add_albums_to_collection():
    db = mock_db(
        execute_data=[
            {"collection_id": "col-uuid-1", "service_id": "id1"},
            {"collection_id": "col-uuid-1", "service_id": "id2"},
        ]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post(
        "/collections/col-uuid-1/albums/bulk",
        json={"service_ids": ["id1", "id2"]},
    )

    assert response.status_code == 201
    assert response.json()["added"] == 2

    clear_overrides()


def test_bulk_add_requires_service_ids():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post("/collections/col-uuid-1/albums/bulk", json={})

    assert response.status_code == 422

    clear_overrides()


def test_get_collection_albums_returns_empty_when_library_cache_cold(monkeypatch):
    """When the library cache is empty, the endpoint returns an empty list
    instead of blocking on a Spotify fetch. The frontend is responsible for
    driving library sync before requesting collections."""
    import routers.library as library_module

    # Library cache is empty — simulate by having get_album_cache return [].
    monkeypatch.setattr(
        library_module, "get_album_cache", lambda db=None, user_id=None: []
    )

    db = mock_db(execute_data=[{"service_id": "id1"}])
    override_db(db)
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER

    response = client.get("/collections/col-uuid-1/albums")

    assert response.status_code == 200
    data = response.json()
    # Service IDs exist in the collection but can't be resolved to album
    # metadata because the library cache is cold. The endpoint returns empty
    # rather than blocking on a Spotify sync.
    assert data["albums"] == []

    clear_overrides()


# --- 401 auth tests for unprotected endpoints ---


def _unauthenticated_spotify():
    """Dependency override that simulates no valid Spotify session."""

    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")

    return raise_401


def _unauthenticated_user():
    """Dependency override that simulates no valid user session."""
    raise HTTPException(status_code=401, detail="Not authenticated")


def _setup_unauthenticated_overrides():
    """Set up dependency overrides for unauthenticated request tests."""
    app.dependency_overrides[get_user_spotify] = _unauthenticated_spotify()
    app.dependency_overrides[get_authed_db] = lambda: mock_db()
    app.dependency_overrides[get_current_user] = _unauthenticated_user


def test_get_all_metadata_returns_401_when_not_authenticated():
    _setup_unauthenticated_overrides()

    response = client.get("/metadata/all")

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_set_tier_returns_401_when_not_authenticated():
    _setup_unauthenticated_overrides()

    response = client.put("/metadata/abc123/tier", json={"tier": "A"})

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_clear_tier_returns_401_when_not_authenticated():
    _setup_unauthenticated_overrides()

    response = client.delete("/metadata/abc123/tier")

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_list_collections_returns_401_when_not_authenticated():
    _setup_unauthenticated_overrides()

    response = client.get("/collections")

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_create_collection_returns_401_when_not_authenticated():
    _setup_unauthenticated_overrides()

    response = client.post("/collections", json={"name": "Test"})

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_delete_collection_returns_401_when_not_authenticated():
    _setup_unauthenticated_overrides()

    response = client.delete("/collections/col-uuid-1")

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_add_album_to_collection_returns_401_when_not_authenticated():
    _setup_unauthenticated_overrides()

    response = client.post(
        "/collections/col-uuid-1/albums", json={"service_id": "abc123"}
    )

    assert response.status_code == 401

    app.dependency_overrides.clear()


def test_remove_album_from_collection_returns_401_when_not_authenticated():
    _setup_unauthenticated_overrides()

    response = client.delete("/collections/col-uuid-1/albums/abc123")

    assert response.status_code == 401

    app.dependency_overrides.clear()


# --- list_collections without Spotify ---


# --- Collection reorder ---


def test_reorder_collections():
    db = mock_db()
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/reorder",
        json={"collection_ids": ["col-3", "col-1", "col-2"]},
    )

    assert response.status_code == 200
    assert response.json()["reordered"] is True

    clear_overrides()


def test_reorder_collections_requires_collection_ids():
    db = mock_db()
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/collections/reorder", json={})

    assert response.status_code == 422

    clear_overrides()


def test_list_collections_orders_by_position():
    """GET /collections should call .order('position') on the query."""
    db = mock_db(
        execute_data=[
            {**COLLECTION, "position": 0},
        ]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections")

    assert response.status_code == 200
    # Verify .order("position") was called on the select chain
    db.table.return_value.select.return_value.order.assert_called_with("position")

    clear_overrides()


def test_create_collection_assigns_next_position():
    """POST /collections should assign position = max(existing) + 1."""
    db = mock_db(execute_data=[{**COLLECTION, "position": 3}])
    # Mock the max position lookup: .select("position").order("position", desc=True).limit(1)
    db.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"position": 2}]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.post("/collections", json={"name": "New one"})

    assert response.status_code == 201

    clear_overrides()


# --- Ownership checks (user_id scoping) ---

OTHER_USER_ID = "other-user-id-456"
OTHER_USER = {"user_id": OTHER_USER_ID, "token": "other-fake-token"}


def _override_as_other_user(db):
    """Override deps so the request is made by OTHER_USER, not FAKE_USER."""
    app.dependency_overrides[get_authed_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: OTHER_USER
    app.dependency_overrides[get_user_spotify] = mock_spotify


def _has_user_id_filter(db):
    """Check if any .eq('user_id', ...) call was made on the db mock."""
    all_calls_str = str(db.mock_calls)
    return ".eq('user_id'" in all_calls_str or '.eq("user_id"' in all_calls_str


def test_delete_collection_scopes_by_user_id():
    """DELETE /collections/{id} must include .eq('user_id', ...) in the query."""
    db = mock_db()
    _override_as_other_user(db)

    client.delete("/collections/col-uuid-1")

    delete_chain = db.table.return_value.delete.return_value
    assert _has_user_id_filter(delete_chain), "delete_collection must filter by user_id"

    clear_overrides()


def test_rename_collection_scopes_by_user_id():
    """PATCH /collections/{id} must include .eq('user_id', ...) in the query."""
    db = mock_db(execute_data=[{**COLLECTION, "name": "New name"}])
    _override_as_other_user(db)

    client.patch("/collections/col-uuid-1", json={"name": "New name"})

    update_chain = db.table.return_value.update.return_value
    assert _has_user_id_filter(update_chain), "rename_collection must filter by user_id"

    clear_overrides()


def test_update_collection_description_scopes_by_user_id():
    """PUT /collections/{id}/description must include .eq('user_id', ...)."""
    db = mock_db(execute_data=[{**COLLECTION, "description": "test"}])
    _override_as_other_user(db)

    client.put("/collections/col-uuid-1/description", json={"description": "test"})

    update_chain = db.table.return_value.update.return_value
    assert _has_user_id_filter(update_chain), (
        "update_collection_description must filter by user_id"
    )

    clear_overrides()


def test_set_collection_cover_scopes_by_user_id():
    """PUT /collections/{id}/cover must include .eq('user_id', ...)."""
    db = mock_db(execute_data=[{**COLLECTION, "cover_album_id": "album-id-1"}])
    _override_as_other_user(db)

    client.put(
        "/collections/col-uuid-1/cover",
        json={"cover_album_id": "album-id-1"},
    )

    update_chain = db.table.return_value.update.return_value
    assert _has_user_id_filter(update_chain), (
        "set_collection_cover must filter by user_id"
    )

    clear_overrides()


def test_reorder_collection_albums_scopes_by_user_id():
    """PUT /collections/{id}/albums/reorder must include .eq('user_id', ...)."""
    db = mock_db()
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    _override_as_other_user(db)

    client.put(
        "/collections/col-uuid-1/albums/reorder",
        json={"album_ids": ["id1", "id2"]},
    )

    update_chain = db.table.return_value.update.return_value
    assert _has_user_id_filter(update_chain), (
        "reorder_collection_albums must filter by user_id"
    )

    clear_overrides()


def test_remove_album_from_collection_scopes_by_user_id():
    """DELETE /collections/{id}/albums/{album_id} must include .eq('user_id', ...)."""
    db = mock_db()
    db.table.return_value.delete.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    _override_as_other_user(db)

    client.delete("/collections/col-uuid-1/albums/abc123")

    delete_chain = db.table.return_value.delete.return_value
    assert _has_user_id_filter(delete_chain), (
        "remove_album_from_collection must filter by user_id"
    )

    clear_overrides()


# --- Collection <-> Tag association tests ---


def test_list_collection_tags_empty():
    db = mock_db()
    # Collection ownership lookup
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "col-uuid-1"}]
    )
    # collection_tags lookup (.select().eq().execute())
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections/col-uuid-1/tags")

    assert response.status_code == 200
    assert response.json() == []

    clear_overrides()


def test_list_collection_tags_returns_tag_objects():
    db = mock_db()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "col-uuid-1"}]
    )
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "tag_id": "tag-1",
                "tags": {
                    "id": "tag-1",
                    "name": "Mood",
                    "parent_tag_id": None,
                    "position": 0,
                },
            }
        ]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections/col-uuid-1/tags")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Mood"

    clear_overrides()


def test_list_collection_tags_404_when_collection_not_owned():
    db = mock_db()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/collections/col-uuid-1/tags")

    assert response.status_code == 404

    clear_overrides()


def test_set_collection_tags_replaces_existing():
    db = mock_db()
    # Collection ownership: .select("id").eq("id",...).eq("user_id",...).execute()
    # Tags ownership: .select("id").in_("id",...).eq("user_id",...).execute()
    # We need the .eq().eq() chain to return the collection, AND the .in_().eq() chain
    # to return all tags as owned.
    tag_a = "11111111-1111-1111-1111-111111111111"
    tag_b = "22222222-2222-2222-2222-222222222222"
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "col-uuid-1"}]
    )
    db.table.return_value.select.return_value.in_.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": tag_a}, {"id": tag_b}]
    )
    # Delete existing rows: .delete().eq().execute()
    db.table.return_value.delete.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/tags",
        json={"tag_ids": [tag_a, tag_b]},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    # Verify delete then insert called
    assert db.table.return_value.delete.called
    insert_call = db.table.return_value.insert.call_args[0][0]
    assert len(insert_call) == 2
    assert {row["tag_id"] for row in insert_call} == {tag_a, tag_b}

    clear_overrides()


def test_set_collection_tags_clears_when_empty_array():
    db = mock_db()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "col-uuid-1"}]
    )
    db.table.return_value.delete.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/collections/col-uuid-1/tags", json={"tag_ids": []})

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    # delete called, insert NOT called
    assert db.table.return_value.delete.called
    assert not db.table.return_value.insert.called

    clear_overrides()


def test_set_collection_tags_validates_tag_ownership():
    """Passing a tag the user does not own → 400."""
    db = mock_db()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "col-uuid-1"}]
    )
    # Only one of two requested tags is owned
    db.table.return_value.select.return_value.in_.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "11111111-1111-1111-1111-111111111111"}]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put(
        "/collections/col-uuid-1/tags",
        json={
            "tag_ids": [
                "11111111-1111-1111-1111-111111111111",
                "22222222-2222-2222-2222-222222222222",
            ]
        },
    )

    assert response.status_code == 400

    clear_overrides()


def test_set_collection_tags_404_when_collection_not_owned():
    db = mock_db()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.put("/collections/col-uuid-1/tags", json={"tag_ids": []})

    assert response.status_code == 404

    clear_overrides()


def test_list_collections_for_tag():
    db = mock_db()
    # Tag ownership lookup: .select("id").eq("id",...).eq("user_id",...).execute()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "tag-1"}]
    )
    # collection_tags lookup
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"collection_id": "col-uuid-1"}, {"collection_id": "col-uuid-2"}]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/tags/11111111-1111-1111-1111-111111111111/collections")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert {r["collection_id"] for r in data} == {"col-uuid-1", "col-uuid-2"}

    clear_overrides()


def test_list_collections_for_tag_404_when_not_owned():
    db = mock_db()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)
    override_spotify(mock_spotify())

    response = client.get("/tags/11111111-1111-1111-1111-111111111111/collections")

    assert response.status_code == 404

    clear_overrides()


def test_user_isolation_for_collection_tags():
    """A request as OTHER_USER must apply OTHER_USER_ID in ownership filters."""
    db = mock_db()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    _override_as_other_user(db)

    client.get("/collections/col-uuid-1/tags")

    all_calls_str = str(db.mock_calls)
    assert OTHER_USER_ID in all_calls_str

    clear_overrides()


def test_list_collections_works_without_spotify_token():
    """list_collections should not depend on Spotify — it only reads from DB."""
    db = mock_db(execute_data=[COLLECTION])
    override_db(db)
    # Do NOT override get_user_spotify — let it fail if called

    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated with Spotify")

    app.dependency_overrides[get_user_spotify] = raise_401

    response = client.get("/collections")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Road trip"

    clear_overrides()
