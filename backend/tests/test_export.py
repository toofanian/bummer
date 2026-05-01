import csv
import io
import json
import zipfile
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from auth_middleware import get_authed_db, get_current_user
from main import app

client = TestClient(app)

FAKE_USER_ID = "test-user-id-123"
FAKE_USER = {"user_id": FAKE_USER_ID, "token": "fake-token"}

FAKE_ALBUMS = [
    {
        "service_id": "spotify-1",
        "name": "OK Computer",
        "artists": ["Radiohead"],
        "release_date": "1997-05-28",
        "image_url": "https://img/1",
        "added_at": "2024-01-15T10:00:00Z",
    },
    {
        "service_id": "spotify-2",
        "name": "Kid A",
        "artists": ["Radiohead"],
        "release_date": "2000-10-02",
        "image_url": "https://img/2",
        "added_at": "2024-02-20T12:00:00Z",
    },
]

FAKE_COLLECTIONS = [
    {
        "id": "col-1",
        "name": "Road Trip",
        "description": "Driving music",
        "created_at": "2024-03-01T00:00:00Z",
    },
]

FAKE_COLLECTION_ALBUMS = [
    {
        "collection_id": "col-1",
        "service_id": "spotify-1",
        "position": 0,
    },
]

FAKE_TIERS = [
    {"service_id": "spotify-1", "tier": "S"},
]


def _mock_db():
    db = MagicMock()
    # Keep stable references so assertions work across repeated db.table() calls
    _tables = {}

    def table_router(table_name):
        if table_name in _tables:
            return _tables[table_name]
        mock_table = MagicMock()
        if table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": FAKE_ALBUMS}])
            )
        elif table_name == "collections":
            # Support both filtered (.eq) and unfiltered (.execute) paths
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=FAKE_COLLECTIONS)
            )
            mock_table.select.return_value.execute.return_value = MagicMock(
                data=FAKE_COLLECTIONS
            )
        elif table_name == "collection_albums":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=FAKE_COLLECTION_ALBUMS)
            )
            mock_table.select.return_value.execute.return_value = MagicMock(
                data=FAKE_COLLECTION_ALBUMS
            )
        elif table_name == "album_metadata":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=FAKE_TIERS)
            )
            mock_table.select.return_value.execute.return_value = MagicMock(
                data=FAKE_TIERS
            )
        _tables[table_name] = mock_table
        return mock_table

    db.table.side_effect = table_router
    return db


def _override(db):
    app.dependency_overrides[get_authed_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER


def _clear():
    app.dependency_overrides.clear()


def _get_zip(response):
    return zipfile.ZipFile(io.BytesIO(response.content))


# --- Tests ---


def test_export_returns_zip():
    db = _mock_db()
    _override(db)
    try:
        res = client.get("/export")
        assert res.status_code == 200
        assert "application/zip" in res.headers["content-type"]
        assert "bummer-export" in res.headers["content-disposition"]
        zf = _get_zip(res)
        assert set(zf.namelist()) == {
            "albums.csv",
            "collections.csv",
            "collection_albums.csv",
            "export.json",
        }
    finally:
        _clear()


def test_export_albums_csv():
    db = _mock_db()
    _override(db)
    try:
        res = client.get("/export")
        zf = _get_zip(res)
        reader = csv.DictReader(io.StringIO(zf.read("albums.csv").decode()))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[0]["title"] == "OK Computer"
        assert rows[0]["artist"] == "Radiohead"
        assert rows[0]["spotify_id"] == "spotify-1"
        assert rows[0]["tier"] == "S"
        assert rows[1]["tier"] == ""  # no tier for spotify-2
    finally:
        _clear()


def test_export_collections_csv():
    db = _mock_db()
    _override(db)
    try:
        res = client.get("/export")
        zf = _get_zip(res)
        reader = csv.DictReader(io.StringIO(zf.read("collections.csv").decode()))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["name"] == "Road Trip"
        assert rows[0]["description"] == "Driving music"
    finally:
        _clear()


def test_export_collection_albums_csv():
    db = _mock_db()
    _override(db)
    try:
        res = client.get("/export")
        zf = _get_zip(res)
        reader = csv.DictReader(io.StringIO(zf.read("collection_albums.csv").decode()))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["collection_name"] == "Road Trip"
        assert rows[0]["album_title"] == "OK Computer"
        assert rows[0]["spotify_id"] == "spotify-1"
        assert rows[0]["position"] == "0"
    finally:
        _clear()


def test_export_json():
    db = _mock_db()
    _override(db)
    try:
        res = client.get("/export")
        zf = _get_zip(res)
        data = json.loads(zf.read("export.json").decode())
        assert len(data["albums"]) == 2
        assert data["albums"][0]["title"] == "OK Computer"
        assert data["albums"][0]["tier"] == "S"
        assert len(data["collections"]) == 1
        assert data["collections"][0]["name"] == "Road Trip"
        assert len(data["collections"][0]["albums"]) == 1
        assert data["collections"][0]["albums"][0]["spotify_id"] == "spotify-1"
    finally:
        _clear()


def test_export_unauthenticated():
    app.dependency_overrides.clear()
    res = client.get("/export")
    assert res.status_code in (401, 403)


def test_export_filters_by_user_id():
    """Collections, collection_albums, and album_metadata must be filtered by user_id."""
    db = _mock_db()
    _override(db)
    try:
        res = client.get("/export")
        assert res.status_code == 200

        # Verify that collections, collection_albums, and album_metadata queries
        # include a .eq("user_id", ...) filter.
        # Access cached table mocks via the _tables dict built by _mock_db.
        for table_name in ("collections", "collection_albums", "album_metadata"):
            # Trigger table_router to get the cached mock
            table_mock = db.table(table_name)
            table_mock.select.return_value.eq.assert_called_with(
                "user_id", FAKE_USER_ID
            )
    finally:
        _clear()


def test_export_empty_library():
    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        # All tables now use .select(...).eq(...).execute() chain
        mock_table.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )
        return mock_table

    db.table.side_effect = table_router
    _override(db)
    try:
        res = client.get("/export")
        assert res.status_code == 200
        zf = _get_zip(res)
        reader = csv.DictReader(io.StringIO(zf.read("albums.csv").decode()))
        assert list(reader) == []
        data = json.loads(zf.read("export.json").decode())
        assert data["albums"] == []
        assert data["collections"] == []
    finally:
        _clear()
