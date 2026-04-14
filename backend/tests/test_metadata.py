from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from main import app
from db import get_db

client = TestClient(app)

COLLECTION = {"id": "col-uuid-1", "name": "Road trip", "created_at": "2021-01-01T00:00:00Z"}


def mock_db(execute_data=None):
    """Return a MagicMock Supabase client whose .execute() returns given data."""
    db = MagicMock()
    db.table.return_value.select.return_value.execute.return_value = MagicMock(data=execute_data or [])
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=execute_data or [])
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=execute_data or [])
    db.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    db.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    return db


def override_db(db):
    app.dependency_overrides[get_db] = lambda: db


def clear_overrides():
    app.dependency_overrides.clear()


# --- Tier ---

def test_set_tier_returns_updated_metadata():
    db = mock_db(execute_data=[{"spotify_id": "abc123", "tier": "A"}])
    override_db(db)

    response = client.put("/metadata/abc123/tier", json={"tier": "A"})

    assert response.status_code == 200
    assert response.json()["tier"] == "A"
    assert response.json()["spotify_id"] == "abc123"

    clear_overrides()


def test_set_tier_rejects_invalid_value():
    db = mock_db()
    override_db(db)

    response = client.put("/metadata/abc123/tier", json={"tier": "Z"})

    assert response.status_code == 422

    clear_overrides()


def test_set_tier_accepts_all_valid_tiers():
    for tier in ["S", "A", "B", "C", "D"]:
        db = mock_db(execute_data=[{"spotify_id": "abc123", "tier": tier}])
        override_db(db)

        response = client.put("/metadata/abc123/tier", json={"tier": tier})

        assert response.status_code == 200, f"tier {tier} should be valid"

    clear_overrides()


def test_clear_tier_sets_tier_to_null():
    db = mock_db(execute_data=[{"spotify_id": "abc123", "tier": None}])
    override_db(db)

    response = client.delete("/metadata/abc123/tier")

    assert response.status_code == 200
    assert response.json()["tier"] is None

    clear_overrides()


# --- Collections ---

def test_list_collections_returns_empty_list():
    db = mock_db(execute_data=[])
    override_db(db)

    response = client.get("/collections")

    assert response.status_code == 200
    assert response.json() == []

    clear_overrides()


def test_list_collections_returns_all_collections():
    db = mock_db(execute_data=[COLLECTION])
    override_db(db)

    response = client.get("/collections")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Road trip"
    assert data[0]["id"] == "col-uuid-1"

    clear_overrides()


def test_create_collection_returns_new_collection():
    db = mock_db(execute_data=[COLLECTION])
    override_db(db)

    response = client.post("/collections", json={"name": "Road trip"})

    assert response.status_code == 201
    assert response.json()["name"] == "Road trip"

    clear_overrides()


def test_create_collection_requires_name():
    db = mock_db()
    override_db(db)

    response = client.post("/collections", json={})

    assert response.status_code == 422

    clear_overrides()


def test_delete_collection():
    db = mock_db()
    override_db(db)

    response = client.delete("/collections/col-uuid-1")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}

    clear_overrides()


def test_add_album_to_collection():
    db = mock_db(execute_data=[{"collection_id": "col-uuid-1", "spotify_id": "abc123"}])
    override_db(db)

    response = client.post("/collections/col-uuid-1/albums", json={"spotify_id": "abc123"})

    assert response.status_code == 201

    clear_overrides()


def test_remove_album_from_collection():
    db = mock_db()
    override_db(db)

    response = client.delete("/collections/col-uuid-1/albums/abc123")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}

    clear_overrides()


# --- Bulk metadata ---

def test_get_all_metadata_returns_dict_keyed_by_spotify_id():
    db = mock_db()
    db.table.return_value.select.return_value.execute.return_value = MagicMock(data=[
        {"spotify_id": "id1", "tier": "A"},
        {"spotify_id": "id2", "tier": "S"},
    ])
    override_db(db)

    response = client.get("/metadata/all")

    assert response.status_code == 200
    data = response.json()
    assert data["id1"]["tier"] == "A"
    assert data["id2"]["tier"] == "S"

    clear_overrides()


def test_get_all_metadata_returns_empty_dict_when_no_metadata():
    db = mock_db(execute_data=[])
    override_db(db)

    response = client.get("/metadata/all")

    assert response.status_code == 200
    assert response.json() == {}

    clear_overrides()
