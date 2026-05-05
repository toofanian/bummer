"""Tests for /tags CRUD endpoints (Task 2 of collections overhaul)."""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from auth_middleware import get_authed_db, get_current_user
from main import app

client = TestClient(app)

FAKE_USER_ID = "test-user-id-123"
FAKE_USER = {"user_id": FAKE_USER_ID, "token": "fake-token"}

OTHER_USER_ID = "other-user-id-456"
OTHER_USER = {"user_id": OTHER_USER_ID, "token": "other-fake-token"}


def make_db():
    """Return a generic MagicMock supabase client; tests configure chains as needed."""
    return MagicMock()


def override_db(db, user=FAKE_USER):
    app.dependency_overrides[get_authed_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user


def clear_overrides():
    app.dependency_overrides.clear()


# --- list_tags ---


def test_list_tags_empty_returns_empty_array():
    db = make_db()
    db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)

    response = client.get("/tags")

    assert response.status_code == 200
    assert response.json() == []

    clear_overrides()


def test_list_tags_returns_user_tags():
    rows = [
        {
            "id": "tag-1",
            "name": "Mood",
            "parent_tag_id": None,
            "position": 0,
            "created_at": "2026-01-01T00:00:00Z",
        }
    ]
    db = make_db()
    db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=rows
    )
    override_db(db)

    response = client.get("/tags")

    assert response.status_code == 200
    assert response.json() == rows
    # Confirm user_id scoping
    db.table.return_value.select.return_value.eq.assert_called_with(
        "user_id", FAKE_USER_ID
    )

    clear_overrides()


# --- create_tag ---


def test_create_root_tag_assigns_position_zero():
    db = make_db()
    # No existing siblings
    db.table.return_value.select.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
        data=[]
    )
    inserted = {
        "id": "tag-new",
        "name": "Mood",
        "parent_tag_id": None,
        "position": 0,
        "created_at": "2026-01-01T00:00:00Z",
    }
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[inserted]
    )
    override_db(db)

    response = client.post("/tags", json={"name": "Mood"})

    assert response.status_code == 201
    data = response.json()
    assert data["position"] == 0
    assert data["name"] == "Mood"
    # Verify insert payload included position 0
    insert_call = db.table.return_value.insert.call_args[0][0]
    assert insert_call["position"] == 0
    assert insert_call["parent_tag_id"] is None
    assert insert_call["user_id"] == FAKE_USER_ID

    clear_overrides()


def test_create_sibling_tag_assigns_next_position():
    db = make_db()
    # Existing root siblings at positions 0, 1
    db.table.return_value.select.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
        data=[{"position": 0}, {"position": 1}]
    )
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "tag-new",
                "name": "Energy",
                "parent_tag_id": None,
                "position": 2,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    override_db(db)

    response = client.post("/tags", json={"name": "Energy"})

    assert response.status_code == 201
    insert_call = db.table.return_value.insert.call_args[0][0]
    assert insert_call["position"] == 2

    clear_overrides()


def test_create_child_tag_with_parent_id():
    db = make_db()
    # No existing siblings under this parent
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    parent_id = "11111111-1111-1111-1111-111111111111"
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "tag-child",
                "name": "Chill",
                "parent_tag_id": parent_id,
                "position": 0,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    override_db(db)

    response = client.post(
        "/tags", json={"name": "Chill", "parent_tag_id": parent_id}
    )

    assert response.status_code == 201
    insert_call = db.table.return_value.insert.call_args[0][0]
    assert insert_call["parent_tag_id"] == parent_id

    clear_overrides()


def test_create_duplicate_sibling_name_returns_409():
    db = make_db()
    db.table.return_value.select.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
        data=[]
    )
    db.table.return_value.insert.return_value.execute.side_effect = Exception(
        "duplicate key value violates unique constraint"
    )
    override_db(db)

    response = client.post("/tags", json={"name": "Mood"})

    assert response.status_code == 409

    clear_overrides()


# --- rename_tag ---


def test_rename_tag():
    db = make_db()
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "tag-1",
                "name": "New Name",
                "parent_tag_id": None,
                "position": 0,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    override_db(db)

    tag_id = "11111111-1111-1111-1111-111111111111"
    response = client.patch(f"/tags/{tag_id}", json={"name": "New Name"})

    assert response.status_code == 200
    assert response.json()["name"] == "New Name"

    clear_overrides()


def test_rename_tag_not_found_returns_404():
    db = make_db()
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)

    tag_id = "11111111-1111-1111-1111-111111111111"
    response = client.patch(f"/tags/{tag_id}", json={"name": "x"})

    assert response.status_code == 404

    clear_overrides()


# --- delete_tag ---


def test_delete_tag_cascades_to_children():
    """DB cascade is enforced by the FK ON DELETE CASCADE; endpoint just deletes the row."""
    db = make_db()
    db.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "tag-1"}]
    )
    override_db(db)

    tag_id = "11111111-1111-1111-1111-111111111111"
    response = client.delete(f"/tags/{tag_id}")

    assert response.status_code == 204

    clear_overrides()


def test_delete_tag_not_found_returns_404():
    db = make_db()
    db.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)

    tag_id = "11111111-1111-1111-1111-111111111111"
    response = client.delete(f"/tags/{tag_id}")

    assert response.status_code == 404

    clear_overrides()


# --- move_tag ---


def test_move_tag_changes_parent_and_position():
    db = make_db()
    new_parent = "22222222-2222-2222-2222-222222222222"
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "tag-1",
                "name": "Moved",
                "parent_tag_id": new_parent,
                "position": 3,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    override_db(db)

    tag_id = "11111111-1111-1111-1111-111111111111"
    response = client.put(
        f"/tags/{tag_id}/move",
        json={"parent_tag_id": new_parent, "position": 3},
    )

    assert response.status_code == 200
    update_payload = db.table.return_value.update.call_args[0][0]
    assert update_payload["parent_tag_id"] == new_parent
    assert update_payload["position"] == 3

    clear_overrides()


# --- reorder ---


def test_reorder_siblings():
    db = make_db()
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db)

    response = client.put(
        "/tags/reorder",
        json={
            "parent_tag_id": None,
            "tag_ids": [
                "11111111-1111-1111-1111-111111111111",
                "22222222-2222-2222-2222-222222222222",
                "33333333-3333-3333-3333-333333333333",
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    # Three update calls, one per id
    assert db.table.return_value.update.call_count == 3

    clear_overrides()


# --- ownership / user isolation ---


def test_user_cannot_see_other_users_tags():
    """list_tags must filter by current user's id, so a request as OTHER_USER
    queries with OTHER_USER_ID."""
    db = make_db()
    db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[]
    )
    override_db(db, user=OTHER_USER)

    response = client.get("/tags")

    assert response.status_code == 200
    db.table.return_value.select.return_value.eq.assert_called_with(
        "user_id", OTHER_USER_ID
    )

    clear_overrides()


def test_rename_tag_scopes_by_user_id():
    db = make_db()
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": "tag-1",
                "name": "x",
                "parent_tag_id": None,
                "position": 0,
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
    )
    override_db(db, user=OTHER_USER)

    tag_id = "11111111-1111-1111-1111-111111111111"
    client.patch(f"/tags/{tag_id}", json={"name": "x"})

    all_calls_str = str(db.mock_calls)
    assert OTHER_USER_ID in all_calls_str

    clear_overrides()
