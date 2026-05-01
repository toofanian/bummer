# Duplicate Album Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically deduplicate albums after library sync when Spotify re-uploads an album under a new ID, migrating user metadata and suppressing the old version from future syncs.

**Architecture:** A new `deduped_albums` Supabase table records old→new mappings. A pure-function dedup module (`backend/dedup.py`) handles matching, winner selection, and metadata migration. The `sync-complete` endpoint calls into this module after upserting the cache. Suppressed albums are filtered out before the cache upsert.

**Tech Stack:** Python 3.12, FastAPI, Supabase (Postgres), pytest

---

### Task 1: Create the `deduped_albums` migration

**Files:**
- Create: `supabase/migrations/<timestamp>_create_deduped_albums.sql`

- [ ] **Step 1: Generate migration file**

Run: `supabase migration new create_deduped_albums`

- [ ] **Step 2: Write migration SQL**

Edit the generated file to contain:

```sql
CREATE TABLE public.deduped_albums (
    old_service_id text NOT NULL,
    new_service_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    deduped_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, old_service_id)
);

ALTER TABLE public.deduped_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own deduped albums"
    ON public.deduped_albums FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deduped albums"
    ON public.deduped_albums FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own deduped albums"
    ON public.deduped_albums FOR DELETE
    USING (auth.uid() = user_id);
```

- [ ] **Step 3: Apply migration to prod**

Run: `supabase db push` or use the Supabase MCP `apply_migration` tool.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_create_deduped_albums.sql
git commit -m "Add deduped_albums migration [136]"
```

---

### Task 2: Implement normalization and matching logic

**Files:**
- Create: `backend/dedup.py`
- Create: `backend/tests/test_dedup.py`

- [ ] **Step 1: Write failing test for `_normalize_for_matching`**

In `backend/tests/test_dedup.py`:

```python
from dedup import _normalize_for_matching


def test_normalize_strips_whitespace_and_lowercases():
    assert _normalize_for_matching("  Led Zeppelin  ") == "led zeppelin"


def test_normalize_handles_empty_string():
    assert _normalize_for_matching("") == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dedup'`

- [ ] **Step 3: Implement `_normalize_for_matching`**

Create `backend/dedup.py`:

```python
def _normalize_for_matching(s: str) -> str:
    """Lowercase and strip whitespace for dedup matching."""
    return s.strip().lower()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py -v`
Expected: PASS

- [ ] **Step 5: Write failing test for `_dedup_key`**

Append to `backend/tests/test_dedup.py`:

```python
from dedup import _dedup_key


def test_dedup_key_uses_first_artist_name_album_name_track_count():
    album = {
        "service_id": "abc",
        "name": "Abbey Road",
        "artists": [{"name": "The Beatles", "id": "art1"}],
        "total_tracks": 17,
    }
    assert _dedup_key(album) == ("the beatles", "abbey road", 17)


def test_dedup_key_with_string_artists():
    album = {
        "service_id": "abc",
        "name": "Abbey Road",
        "artists": ["The Beatles"],
        "total_tracks": 17,
    }
    assert _dedup_key(album) == ("the beatles", "abbey road", 17)


def test_dedup_key_multiple_artists_uses_first():
    album = {
        "service_id": "abc",
        "name": "Watch the Throne",
        "artists": [
            {"name": "JAY-Z", "id": "a1"},
            {"name": "Kanye West", "id": "a2"},
        ],
        "total_tracks": 12,
    }
    assert _dedup_key(album) == ("jay-z", "watch the throne", 12)
```

- [ ] **Step 6: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py -v`
Expected: FAIL — `ImportError`

- [ ] **Step 7: Implement `_dedup_key`**

Add to `backend/dedup.py`:

```python
def _dedup_key(album: dict) -> tuple[str, str, int]:
    """Return (normalized_first_artist, normalized_name, total_tracks) for matching."""
    artists = album.get("artists", [])
    first_artist = ""
    if artists:
        a = artists[0]
        first_artist = a["name"] if isinstance(a, dict) else a
    return (
        _normalize_for_matching(first_artist),
        _normalize_for_matching(album.get("name", "")),
        album.get("total_tracks", 0),
    )
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/dedup.py backend/tests/test_dedup.py
git commit -m "Add dedup key normalization and matching [136]"
```

---

### Task 3: Implement winner selection logic

**Files:**
- Modify: `backend/dedup.py`
- Modify: `backend/tests/test_dedup.py`

- [ ] **Step 1: Write failing test for `_pick_winner`**

Append to `backend/tests/test_dedup.py`:

```python
from dedup import _pick_winner


def test_pick_winner_prefers_later_release_date():
    old = {"service_id": "old1", "release_date": "2020-01-01", "added_at": "2022-06-01T00:00:00Z"}
    new = {"service_id": "new1", "release_date": "2023-01-01", "added_at": "2021-01-01T00:00:00Z"}
    winner, loser = _pick_winner([old, new])
    assert winner["service_id"] == "new1"
    assert loser["service_id"] == "old1"


def test_pick_winner_uses_added_at_as_tiebreaker():
    a = {"service_id": "a1", "release_date": "2020-01-01", "added_at": "2022-01-01T00:00:00Z"}
    b = {"service_id": "b1", "release_date": "2020-01-01", "added_at": "2023-06-01T00:00:00Z"}
    winner, loser = _pick_winner([a, b])
    assert winner["service_id"] == "b1"
    assert loser["service_id"] == "a1"


def test_pick_winner_handles_partial_release_dates():
    """Spotify sometimes returns just a year like '2020' instead of full date."""
    old = {"service_id": "old1", "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"}
    new = {"service_id": "new1", "release_date": "2023", "added_at": "2022-01-01T00:00:00Z"}
    winner, loser = _pick_winner([old, new])
    assert winner["service_id"] == "new1"


def test_pick_winner_three_albums_picks_newest():
    a = {"service_id": "a", "release_date": "2018", "added_at": "2019-01-01T00:00:00Z"}
    b = {"service_id": "b", "release_date": "2023", "added_at": "2023-06-01T00:00:00Z"}
    c = {"service_id": "c", "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"}
    winner, losers = _pick_winner([a, b, c])
    assert winner["service_id"] == "b"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py::test_pick_winner_prefers_later_release_date -v`
Expected: FAIL

- [ ] **Step 3: Implement `_pick_winner`**

Note: `_pick_winner` returns `(winner, loser)` for pairs and `(winner, [losers])` for 3+. Since 3+ duplicates is rare, simplify: always return `(winner, list_of_losers)`. Update tests accordingly.

Add to `backend/dedup.py`:

```python
def _pick_winner(albums: list[dict]) -> tuple[dict, list[dict]]:
    """Pick the newest album as winner. Returns (winner, losers).

    Sorts by release_date descending, then added_at descending as tiebreaker.
    """
    def sort_key(album):
        return (album.get("release_date") or "", album.get("added_at") or "")

    ranked = sorted(albums, key=sort_key, reverse=True)
    return ranked[0], ranked[1:]
```

- [ ] **Step 4: Update tests to use `(winner, losers)` list return**

Replace the test functions written in Step 1:

```python
def test_pick_winner_prefers_later_release_date():
    old = {"service_id": "old1", "release_date": "2020-01-01", "added_at": "2022-06-01T00:00:00Z"}
    new = {"service_id": "new1", "release_date": "2023-01-01", "added_at": "2021-01-01T00:00:00Z"}
    winner, losers = _pick_winner([old, new])
    assert winner["service_id"] == "new1"
    assert [l["service_id"] for l in losers] == ["old1"]


def test_pick_winner_uses_added_at_as_tiebreaker():
    a = {"service_id": "a1", "release_date": "2020-01-01", "added_at": "2022-01-01T00:00:00Z"}
    b = {"service_id": "b1", "release_date": "2020-01-01", "added_at": "2023-06-01T00:00:00Z"}
    winner, losers = _pick_winner([a, b])
    assert winner["service_id"] == "b1"
    assert [l["service_id"] for l in losers] == ["a1"]


def test_pick_winner_handles_partial_release_dates():
    old = {"service_id": "old1", "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"}
    new = {"service_id": "new1", "release_date": "2023", "added_at": "2022-01-01T00:00:00Z"}
    winner, losers = _pick_winner([old, new])
    assert winner["service_id"] == "new1"


def test_pick_winner_three_albums_picks_newest():
    a = {"service_id": "a", "release_date": "2018", "added_at": "2019-01-01T00:00:00Z"}
    b = {"service_id": "b", "release_date": "2023", "added_at": "2023-06-01T00:00:00Z"}
    c = {"service_id": "c", "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"}
    winner, losers = _pick_winner([a, b, c])
    assert winner["service_id"] == "b"
    assert len(losers) == 2
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/dedup.py backend/tests/test_dedup.py
git commit -m "Add winner selection logic for dedup [136]"
```

---

### Task 4: Implement `find_duplicates` grouping function

**Files:**
- Modify: `backend/dedup.py`
- Modify: `backend/tests/test_dedup.py`

- [ ] **Step 1: Write failing test for `find_duplicates`**

Append to `backend/tests/test_dedup.py`:

```python
from dedup import find_duplicates


def test_find_duplicates_returns_empty_for_no_dupes():
    albums = [
        {"service_id": "a", "name": "Album A", "artists": [{"name": "X", "id": "x"}], "total_tracks": 10, "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"},
        {"service_id": "b", "name": "Album B", "artists": [{"name": "Y", "id": "y"}], "total_tracks": 8, "release_date": "2019", "added_at": "2020-01-01T00:00:00Z"},
    ]
    assert find_duplicates(albums) == []


def test_find_duplicates_detects_same_artist_name_tracks():
    old = {"service_id": "old1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo"}], "total_tracks": 17, "release_date": "2016-08-20", "added_at": "2017-01-01T00:00:00Z"}
    new = {"service_id": "new1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo2"}], "total_tracks": 17, "release_date": "2016-08-20", "added_at": "2023-06-01T00:00:00Z"}
    unrelated = {"service_id": "u1", "name": "Channel Orange", "artists": [{"name": "Frank Ocean", "id": "fo"}], "total_tracks": 17, "release_date": "2012", "added_at": "2013-01-01T00:00:00Z"}

    results = find_duplicates([old, new, unrelated])

    assert len(results) == 1
    winner, losers = results[0]
    assert winner["service_id"] == "new1"
    assert [l["service_id"] for l in losers] == ["old1"]


def test_find_duplicates_ignores_different_track_counts():
    """Same artist+name but different track count = not a duplicate (deluxe edition)."""
    standard = {"service_id": "s1", "name": "Rumours", "artists": ["Fleetwood Mac"], "total_tracks": 11, "release_date": "1977", "added_at": "2020-01-01T00:00:00Z"}
    deluxe = {"service_id": "d1", "name": "Rumours", "artists": ["Fleetwood Mac"], "total_tracks": 22, "release_date": "2013", "added_at": "2020-06-01T00:00:00Z"}

    assert find_duplicates([standard, deluxe]) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py::test_find_duplicates_returns_empty_for_no_dupes -v`
Expected: FAIL

- [ ] **Step 3: Implement `find_duplicates`**

Add to `backend/dedup.py`:

```python
from collections import defaultdict


def find_duplicates(albums: list[dict]) -> list[tuple[dict, list[dict]]]:
    """Group albums by dedup key, return (winner, losers) for each duplicate group.

    Only groups with 2+ albums are returned. Singletons are ignored.
    """
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for album in albums:
        key = _dedup_key(album)
        groups[key].append(album)

    results = []
    for group in groups.values():
        if len(group) >= 2:
            winner, losers = _pick_winner(group)
            results.append((winner, losers))
    return results
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/dedup.py backend/tests/test_dedup.py
git commit -m "Add find_duplicates grouping function [136]"
```

---

### Task 5: Implement metadata migration and dedup recording

**Files:**
- Modify: `backend/dedup.py`
- Modify: `backend/tests/test_dedup.py`

- [ ] **Step 1: Write failing test for `apply_dedup`**

`apply_dedup` is the top-level function called by `sync-complete`. It takes `db`, `user_id`, and `albums` (the full cached list), runs dedup, migrates metadata, records to `deduped_albums`, and returns the filtered album list.

Append to `backend/tests/test_dedup.py`:

```python
from unittest.mock import MagicMock, call

from dedup import apply_dedup


def _mock_db():
    """Mock DB that routes table calls and tracks interactions."""
    db = MagicMock()
    tables = {}

    def table_router(name):
        if name not in tables:
            tables[name] = MagicMock()
            # Default: select returns empty
            tables[name].select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            tables[name].select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            tables[name].upsert.return_value.execute.return_value = MagicMock(data=[])
            tables[name].insert.return_value.execute.return_value = MagicMock(data=[])
            tables[name].delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return tables[name]

    db.table.side_effect = table_router
    db._tables = tables
    return db


def test_apply_dedup_no_duplicates_returns_albums_unchanged():
    db = _mock_db()
    albums = [
        {"service_id": "a", "name": "A", "artists": [{"name": "X", "id": "x"}], "total_tracks": 10, "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"},
    ]
    result = apply_dedup(db, "user1", albums)
    assert result == albums
    # No deduped_albums insert
    db._tables.get("deduped_albums") is None or db._tables["deduped_albums"].insert.assert_not_called()


def test_apply_dedup_removes_loser_and_records():
    db = _mock_db()
    # No existing tier or collection for the old album
    albums = [
        {"service_id": "old1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo"}], "total_tracks": 17, "release_date": "2016-08-20", "added_at": "2017-01-01T00:00:00Z"},
        {"service_id": "new1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo2"}], "total_tracks": 17, "release_date": "2016-08-20", "added_at": "2023-06-01T00:00:00Z"},
    ]

    result = apply_dedup(db, "user1", albums)

    # Only winner remains
    assert len(result) == 1
    assert result[0]["service_id"] == "new1"

    # Dedup record inserted
    deduped_table = db._tables["deduped_albums"]
    deduped_table.insert.assert_called_once()
    insert_arg = deduped_table.insert.call_args[0][0]
    assert insert_arg["old_service_id"] == "old1"
    assert insert_arg["new_service_id"] == "new1"
    assert insert_arg["user_id"] == "user1"


def test_apply_dedup_migrates_tier():
    db = _mock_db()
    # Old album has tier S, new album has no tier
    metadata_table = db._tables.setdefault("album_metadata", MagicMock())

    # When checking new album's tier: no row
    # When checking old album's tier: has row
    tier_responses = {
        "new1": MagicMock(data=[]),
        "old1": MagicMock(data=[{"service_id": "old1", "tier": "S", "user_id": "user1"}]),
    }

    def select_side_effect(*args, **kwargs):
        eq_mock = MagicMock()
        def eq_service(field, value):
            eq2 = MagicMock()
            def eq_user(field2, value2):
                return tier_responses.get(value, MagicMock(data=[]))
            eq2.eq.side_effect = eq_user
            return eq2
        eq_mock.eq.side_effect = eq_service
        return eq_mock

    metadata_table.select.side_effect = select_side_effect

    def table_router(name):
        if name == "album_metadata":
            return metadata_table
        if name not in db._tables:
            db._tables[name] = MagicMock()
            db._tables[name].select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            db._tables[name].insert.return_value.execute.return_value = MagicMock(data=[])
            db._tables[name].delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return db._tables[name]

    db.table.side_effect = table_router

    albums = [
        {"service_id": "old1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo"}], "total_tracks": 17, "release_date": "2016", "added_at": "2017-01-01T00:00:00Z"},
        {"service_id": "new1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo2"}], "total_tracks": 17, "release_date": "2016", "added_at": "2023-06-01T00:00:00Z"},
    ]

    result = apply_dedup(db, "user1", albums)
    assert len(result) == 1

    # Should have upserted the tier to the new service_id
    metadata_table.upsert.assert_called_once()
    upsert_arg = metadata_table.upsert.call_args[0][0]
    assert upsert_arg["service_id"] == "new1"
    assert upsert_arg["tier"] == "S"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py::test_apply_dedup_no_duplicates_returns_albums_unchanged -v`
Expected: FAIL

- [ ] **Step 3: Implement `apply_dedup`**

Add to `backend/dedup.py`:

```python
from supabase import Client


def _migrate_metadata(db: Client, user_id: str, old_id: str, new_id: str):
    """Migrate tier and collection memberships from old to new service_id."""
    # Migrate tier (only if new doesn't have one)
    new_tier = (
        db.table("album_metadata")
        .select("tier")
        .eq("service_id", new_id)
        .eq("user_id", user_id)
        .execute()
    )
    old_tier = (
        db.table("album_metadata")
        .select("tier")
        .eq("service_id", old_id)
        .eq("user_id", user_id)
        .execute()
    )
    if old_tier.data and old_tier.data[0].get("tier"):
        if not new_tier.data or not new_tier.data[0].get("tier"):
            db.table("album_metadata").upsert(
                {"service_id": new_id, "tier": old_tier.data[0]["tier"], "user_id": user_id}
            ).execute()
        # Delete old tier row
        db.table("album_metadata").delete().eq("service_id", old_id).eq("user_id", user_id).execute()

    # Migrate collection memberships
    old_memberships = (
        db.table("collection_albums")
        .select("collection_id, position")
        .eq("service_id", old_id)
        .eq("user_id", user_id)
        .execute()
    )
    for membership in old_memberships.data:
        # Check if new album already in this collection
        existing = (
            db.table("collection_albums")
            .select("service_id")
            .eq("collection_id", membership["collection_id"])
            .eq("service_id", new_id)
            .execute()
        )
        if not existing.data:
            db.table("collection_albums").upsert(
                {
                    "collection_id": membership["collection_id"],
                    "service_id": new_id,
                    "position": membership["position"],
                    "user_id": user_id,
                }
            ).execute()
    # Delete old collection memberships
    db.table("collection_albums").delete().eq("service_id", old_id).eq("user_id", user_id).execute()


def apply_dedup(db: Client, user_id: str, albums: list[dict]) -> list[dict]:
    """Find cross-ID duplicates, migrate metadata, record dedup, return filtered list."""
    dupes = find_duplicates(albums)
    if not dupes:
        return albums

    loser_ids = set()
    for winner, losers in dupes:
        for loser in losers:
            _migrate_metadata(db, user_id, loser["service_id"], winner["service_id"])
            db.table("deduped_albums").insert(
                {
                    "old_service_id": loser["service_id"],
                    "new_service_id": winner["service_id"],
                    "user_id": user_id,
                }
            ).execute()
            loser_ids.add(loser["service_id"])

    return [a for a in albums if a["service_id"] not in loser_ids]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/dedup.py backend/tests/test_dedup.py
git commit -m "Add apply_dedup with metadata migration [136]"
```

---

### Task 6: Integrate dedup into sync-complete

**Files:**
- Modify: `backend/routers/library.py:141-166`
- Modify: `backend/tests/test_library.py`

- [ ] **Step 1: Write failing test for suppression filtering**

Append to `backend/tests/test_library.py`:

```python
def test_sync_complete_filters_suppressed_albums():
    """Albums in deduped_albums table are filtered out before cache upsert."""
    db = MagicMock()
    cache_mock = MagicMock()
    deduped_mock = MagicMock()
    changes_mock = MagicMock()

    # No existing cache (first sync)
    cache_mock.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    cache_mock.upsert.return_value.execute.return_value = MagicMock(data=[])

    # Suppression list: "old1" is a known deduped album
    deduped_mock.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"old_service_id": "old1"}]
    )

    def table_router(name):
        if name == "deduped_albums":
            return deduped_mock
        if name == "library_changes":
            return changes_mock
        return cache_mock

    db.table.side_effect = table_router
    override_db(db)

    albums = [
        {"service_id": "old1", "name": "Blonde", "artists": [], "total_tracks": 17, "release_date": "2016", "added_at": "2017-01-01T00:00:00Z", "image_url": None},
        {"service_id": "new1", "name": "Blonde", "artists": [], "total_tracks": 17, "release_date": "2016", "added_at": "2023-01-01T00:00:00Z", "image_url": None},
    ]

    response = client.post("/library/sync-complete", json={"albums": albums})
    assert response.status_code == 200

    # Cache upsert should only contain the non-suppressed album
    upsert_call = cache_mock.upsert.call_args[0][0]
    cached_ids = [a["service_id"] for a in upsert_call["albums"]]
    assert "old1" not in cached_ids
    assert "new1" in cached_ids

    clear_overrides()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_library.py::test_sync_complete_filters_suppressed_albums -v`
Expected: FAIL — sync-complete doesn't filter suppressed albums yet

- [ ] **Step 3: Modify sync-complete to add suppression + dedup**

Edit `backend/routers/library.py`, replacing the `sync_complete` function:

```python
@router.post("/sync-complete")
def sync_complete(
    body: SyncCompleteRequest,
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]

    # Filter out previously deduped albums
    suppressed = db.table("deduped_albums").select("old_service_id").eq("user_id", user_id).execute()
    suppressed_ids = {r["old_service_id"] for r in suppressed.data}
    albums = [a for a in body.albums if a["service_id"] not in suppressed_ids]

    # Read current cache to compute diff
    existing = _get_supabase_cache(db, user_id=user_id)
    if existing and existing.get("albums"):
        old_ids = {a["service_id"] for a in existing["albums"]}
        new_ids = {a["service_id"] for a in albums}
        added = list(new_ids - old_ids)
        removed = list(old_ids - new_ids)
        if added or removed:
            db.table("library_changes").insert(
                {
                    "user_id": user_id,
                    "added_ids": added,
                    "removed_ids": removed,
                }
            ).execute()

    _save_supabase_cache(db, albums, len(albums), user_id)

    # Run cross-ID dedup on the cached albums
    from dedup import apply_dedup

    deduped_albums = apply_dedup(db, user_id, albums)
    if len(deduped_albums) < len(albums):
        # Re-save cache with losers removed
        _save_supabase_cache(db, deduped_albums, len(deduped_albums), user_id)

    return {"total": len(deduped_albums)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_library.py -v`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `backend/.venv/bin/python -m pytest backend/tests/ -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py
git commit -m "Integrate dedup into sync-complete endpoint [136]"
```

---

### Task 7: End-to-end integration test

**Files:**
- Modify: `backend/tests/test_dedup.py`

- [ ] **Step 1: Write integration test for full dedup flow**

Append to `backend/tests/test_dedup.py`:

```python
def test_apply_dedup_full_flow_with_collections():
    """Integration: dedup migrates tier + collection, removes loser, records dedup."""
    db = MagicMock()
    tables = {}

    def make_table(name):
        t = MagicMock()
        t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        t.insert.return_value.execute.return_value = MagicMock(data=[])
        t.upsert.return_value.execute.return_value = MagicMock(data=[])
        t.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return t

    def table_router(name):
        if name not in tables:
            tables[name] = make_table(name)
        return tables[name]

    db.table.side_effect = table_router

    # Old album has tier B and is in collection "coll1"
    # Set up album_metadata responses
    am = make_table("album_metadata")
    new_tier_resp = MagicMock(data=[])  # new has no tier
    old_tier_resp = MagicMock(data=[{"service_id": "old1", "tier": "B", "user_id": "u1"}])
    am.select.return_value.eq.side_effect = lambda field, val: (
        MagicMock(eq=lambda f2, v2: old_tier_resp) if val == "old1"
        else MagicMock(eq=lambda f2, v2: new_tier_resp)
    )
    tables["album_metadata"] = am

    # Set up collection_albums responses
    ca = make_table("collection_albums")
    ca.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"collection_id": "coll1", "position": 3}]
    )
    # Check if new album already in collection: no
    def ca_select_side(*args, **kwargs):
        mock = MagicMock()
        def eq1(field, val):
            mock2 = MagicMock()
            if field == "service_id" and val == "old1":
                # Return old album's memberships
                mock2.eq.return_value.execute.return_value = MagicMock(
                    data=[{"collection_id": "coll1", "position": 3}]
                )
            elif field == "collection_id":
                # Checking if new album exists in collection
                mock2.eq.return_value.execute.return_value = MagicMock(data=[])
            else:
                mock2.eq.return_value.execute.return_value = MagicMock(data=[])
            return mock2
        mock.eq.side_effect = eq1
        return mock
    ca.select.side_effect = ca_select_side
    tables["collection_albums"] = ca

    db.table.side_effect = table_router

    albums = [
        {"service_id": "old1", "name": "Ctrl", "artists": [{"name": "SZA", "id": "s1"}], "total_tracks": 14, "release_date": "2017-06-09", "added_at": "2017-07-01T00:00:00Z"},
        {"service_id": "new1", "name": "Ctrl", "artists": [{"name": "SZA", "id": "s2"}], "total_tracks": 14, "release_date": "2017-06-09", "added_at": "2024-01-15T00:00:00Z"},
        {"service_id": "other", "name": "SOS", "artists": [{"name": "SZA", "id": "s1"}], "total_tracks": 23, "release_date": "2022", "added_at": "2023-01-01T00:00:00Z"},
    ]

    result = apply_dedup(db, "u1", albums)

    # Only winner + unrelated album remain
    result_ids = [a["service_id"] for a in result]
    assert "new1" in result_ids
    assert "other" in result_ids
    assert "old1" not in result_ids
    assert len(result) == 2

    # Dedup record was inserted
    tables["deduped_albums"].insert.assert_called_once()
```

- [ ] **Step 2: Run test to verify it passes**

Run: `backend/.venv/bin/python -m pytest backend/tests/test_dedup.py::test_apply_dedup_full_flow_with_collections -v`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `backend/.venv/bin/python -m pytest backend/tests/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_dedup.py
git commit -m "Add integration test for full dedup flow [136]"
```
