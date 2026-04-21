# Artist Profile Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display Spotify artist profile images in the artists view and digest top artists.

**Architecture:** Enrich artist data from plain strings to objects with `{name, id, image_url}`. Store artist IDs during library sync (already available in Spotify album response). Resolve artist images lazily via `sp.artists()` batch endpoint when needed. Display as circular thumbnails in both views.

**Tech Stack:** FastAPI, spotipy, React, Vitest, pytest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/routers/library.py` | Modify | Store artist objects `{name, id}` instead of plain strings in `_normalize_album` |
| `backend/routers/digest.py` | Modify | Add `_resolve_artist_images()` helper; update `get_stats` to return `image_url` per artist |
| `backend/tests/test_library.py` | Modify | Test new artist object format in normalized albums |
| `backend/tests/test_digest.py` | Modify | Test artist image resolution in stats response |
| `frontend/src/components/DigestView.jsx` | Modify | Add circular artist thumbnail in top artists rows |
| `frontend/src/components/DigestView.test.jsx` | Modify | Test artist image rendering and fallback |
| `frontend/src/components/ArtistsView.jsx` | Modify | Add circular artist profile photo left of each row |
| `frontend/src/components/ArtistsView.test.jsx` | Modify | Test artist image rendering and fallback |

---

### Task 1: Store artist objects in library sync

Update `_normalize_album` to store `{name, id}` instead of plain name strings. Spotify's album response already includes artist IDs in `album["artists"][i]["id"]`.

**Files:**
- Modify: `backend/routers/library.py:62-74`
- Test: `backend/tests/test_library.py`

- [ ] **Step 1: Write failing test for artist object format**

In `backend/tests/test_library.py`, add a test that verifies `_normalize_album` returns artist objects:

```python
def test_normalize_album_stores_artist_objects():
    from routers.library import _normalize_album

    item = {
        "added_at": "2026-01-01T00:00:00Z",
        "album": {
            "id": "abc123",
            "name": "Test Album",
            "artists": [
                {"name": "Artist One", "id": "art1"},
                {"name": "Artist Two", "id": "art2"},
            ],
            "images": [{"url": "https://img/1.jpg", "height": 640}],
            "release_date": "2026-01-01",
            "total_tracks": 10,
        },
    }
    result = _normalize_album(item)
    assert result["artists"] == [
        {"name": "Artist One", "id": "art1"},
        {"name": "Artist Two", "id": "art2"},
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_library.py::test_normalize_album_stores_artist_objects -v`
Expected: FAIL — artists are currently plain strings `["Artist One", "Artist Two"]`

- [ ] **Step 3: Update `_normalize_album` to store artist objects**

In `backend/routers/library.py`, change line 69 from:
```python
"artists": [a["name"] for a in album.get("artists", [])],
```
to:
```python
"artists": [{"name": a["name"], "id": a["id"]} for a in album.get("artists", [])],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_library.py::test_normalize_album_stores_artist_objects -v`
Expected: PASS

- [ ] **Step 5: Fix existing tests that assume string artists**

Existing tests in `test_library.py` use string artist arrays. Update test fixtures to expect new object format. Search for `"artists": [` in test_library.py and update each occurrence. For example, where a test creates mock album data with `"artists": ["X"]`, the assertion side should expect `[{"name": "X", "id": "..."}]` — but the mock *input* (Spotify API shape) stays the same since that already has `{"name": "X", "id": "..."}`.

Also update `ALBUM_CACHE` fixtures in `test_digest.py` — these represent cached data, so they need updating from `"artists": ["Artist A"]` to `"artists": [{"name": "Artist A", "id": "artA"}]`.

Run: `cd backend && .venv/bin/python -m pytest tests/ -x -v`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py backend/tests/test_digest.py
git commit -m "Store artist objects {name, id} in album cache instead of plain strings

Spotify album response already includes artist IDs. Store them
for later use resolving artist profile images.

Refs #95

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add backward-compatible artist name extraction

Code throughout digest.py and the frontend reads `artist` as a string. Add a helper to extract artist names from both old format (string) and new format (object), and use it where needed.

**Files:**
- Modify: `backend/routers/digest.py`
- Test: `backend/tests/test_digest.py`

- [ ] **Step 1: Write failing test for backward compatibility**

In `backend/tests/test_digest.py`, add a test that proves stats work with the new artist object format:

```python
def test_stats_works_with_artist_objects():
    """Stats endpoint handles artist objects {name, id} in album cache."""
    plays = [
        {"album_id": "a1", "played_at": "2026-04-10T10:00:00+00:00"},
        {"album_id": "a1", "played_at": "2026-04-11T10:00:00+00:00"},
    ]
    album_cache = [
        {
            "service_id": "a1",
            "name": "Album One",
            "artists": [{"name": "Artist A", "id": "artA"}],
            "image_url": "https://img/1.jpg",
        },
    ]

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.gte.return_value.execute.return_value = (
                MagicMock(data=plays)
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": album_cache}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db)
    try:
        res = client.get("/digest/stats")
        assert res.status_code == 200
        data = res.json()
        assert data["top_artists"][0]["artist"] == "Artist A"
        assert data["top_artists"][0]["play_count"] == 2
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_digest.py::test_stats_works_with_artist_objects -v`
Expected: FAIL — digest.py treats artists as strings, but now they're objects

- [ ] **Step 3: Add `_get_artist_name` helper and update digest.py**

At the top of `backend/routers/digest.py` (after imports), add:

```python
def _get_artist_name(artist) -> str:
    """Extract artist name from either string or {name, id} object format."""
    if isinstance(artist, dict):
        return artist["name"]
    return artist
```

Update `_resolve_album_metadata` (line ~40) where it builds the resolved dict — change:
```python
"artists": a["artists"],
```
to:
```python
"artists": a["artists"],
```
(No change needed here — it passes through the raw format.)

Update the artist counting loop (line ~183) from:
```python
for artist in album_meta["artists"]:
    artist_counts[artist] += play_counts[aid]
```
to:
```python
for artist in album_meta["artists"]:
    artist_counts[_get_artist_name(artist)] += play_counts[aid]
```

Also update the Spotify API fallback in `_resolve_album_metadata` (line ~56) from:
```python
"artists": [a["name"] for a in album.get("artists", [])],
```
to:
```python
"artists": [{"name": a["name"], "id": a["id"]} for a in album.get("artists", [])],
```

And update any other place in digest.py that reads artist names as strings — search for `a["name"] for a in` patterns.

- [ ] **Step 4: Run all digest tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_digest.py -x -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/digest.py backend/tests/test_digest.py
git commit -m "Add backward-compatible artist name extraction in digest

Handle both string and {name, id} object formats for artists.

Refs #95

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Resolve artist images in `get_stats`

Add `_resolve_artist_images()` that batch-fetches artist profile images via `sp.artists()` and include `image_url` in the stats response.

**Files:**
- Modify: `backend/routers/digest.py`
- Test: `backend/tests/test_digest.py`

- [ ] **Step 1: Write failing test for artist image_url in stats response**

```python
def test_stats_returns_artist_image_urls():
    """Stats response includes image_url for each top artist."""
    plays = [
        {"album_id": "a1", "played_at": "2026-04-10T10:00:00+00:00"},
    ]
    album_cache = [
        {
            "service_id": "a1",
            "name": "Album One",
            "artists": [{"name": "Artist A", "id": "artA"}],
            "image_url": "https://img/1.jpg",
        },
    ]

    sp = mock_spotify()
    sp.artists.return_value = {
        "artists": [
            {
                "id": "artA",
                "name": "Artist A",
                "images": [
                    {"url": "https://artist-img/artA-large.jpg", "height": 640},
                    {"url": "https://artist-img/artA-small.jpg", "height": 64},
                ],
            }
        ]
    }

    db = MagicMock()

    def table_router(table_name):
        mock_table = MagicMock()
        if table_name == "play_history":
            mock_table.select.return_value.gte.return_value.execute.return_value = (
                MagicMock(data=plays)
            )
        elif table_name == "library_cache":
            mock_table.select.return_value.eq.return_value.execute.return_value = (
                MagicMock(data=[{"albums": album_cache}])
            )
        return mock_table

    db.table.side_effect = table_router
    setup_overrides(db=db, sp=sp)
    try:
        res = client.get("/digest/stats")
        assert res.status_code == 200
        data = res.json()
        assert data["top_artists"][0]["image_url"] == "https://artist-img/artA-small.jpg"
        sp.artists.assert_called_once_with(["artA"])
    finally:
        clear_overrides()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_digest.py::test_stats_returns_artist_image_urls -v`
Expected: FAIL — `image_url` key not in response

- [ ] **Step 3: Add `_resolve_artist_images` and update `get_stats`**

In `backend/routers/digest.py`, add after `_get_artist_name`:

```python
def _resolve_artist_images(
    artist_names_and_ids: list[tuple[str, str | None]],
    sp: spotipy.Spotify,
) -> dict[str, str | None]:
    """Batch-resolve artist profile images from Spotify.

    Args:
        artist_names_and_ids: list of (name, spotify_id) tuples
        sp: authenticated Spotify client

    Returns:
        dict mapping artist name -> smallest image URL (or None)
    """
    result = {}
    # Collect IDs that need resolution
    ids_to_fetch = []
    name_by_id = {}
    for name, artist_id in artist_names_and_ids:
        if artist_id:
            ids_to_fetch.append(artist_id)
            name_by_id[artist_id] = name
        else:
            result[name] = None

    # Batch fetch in groups of 50 (Spotify API limit)
    for i in range(0, len(ids_to_fetch), 50):
        batch = ids_to_fetch[i : i + 50]
        try:
            resp = sp.artists(batch)
            for artist in resp.get("artists", []):
                if not artist:
                    continue
                name = name_by_id.get(artist["id"], artist["name"])
                images = artist.get("images", [])
                # Use smallest image for thumbnails
                smallest = min(images, key=lambda img: img.get("height", 0), default=None)
                result[name] = smallest["url"] if smallest else None
        except Exception:
            for aid in batch:
                result[name_by_id.get(aid, aid)] = None

    return result
```

Then update the end of `get_stats` to collect artist IDs and resolve images. Replace the `top_artists` list comprehension:

```python
    # Collect artist IDs from metadata for image resolution
    artist_id_map = {}  # name -> id
    for aid in play_counts:
        album_meta = meta_lookup.get(aid)
        if album_meta and album_meta.get("artists"):
            for artist in album_meta["artists"]:
                name = _get_artist_name(artist)
                if isinstance(artist, dict) and artist.get("id"):
                    artist_id_map[name] = artist["id"]

    top_artist_names = [name for name, _ in artist_counts.most_common(10)]
    artist_images = _resolve_artist_images(
        [(name, artist_id_map.get(name)) for name in top_artist_names],
        sp,
    )

    top_artists = [
        {
            "artist": name,
            "play_count": artist_counts[name],
            "image_url": artist_images.get(name),
        }
        for name in top_artist_names
    ]
```

- [ ] **Step 4: Run all digest tests**

Run: `cd backend && .venv/bin/python -m pytest tests/test_digest.py -x -v`
Expected: ALL PASS (existing tests may need `image_url` key added to assertions or the key can simply be present with `None` value)

- [ ] **Step 5: Fix any existing tests that assert exact top_artists shape**

The existing `test_stats_returns_top_albums_and_artists` asserts specific keys. Update it to also check `image_url` is present (value will be `None` since mock spotify doesn't have `.artists` set up). Also update `test_stats_top_artists_from_all_plays_not_just_top_albums` similarly.

Run: `cd backend && .venv/bin/python -m pytest tests/test_digest.py -x -v`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/digest.py backend/tests/test_digest.py
git commit -m "Resolve artist profile images via Spotify batch API in stats

Use sp.artists() to fetch profile images for top artists.
Returns smallest image for thumbnail use.

Refs #95

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add artist image to DigestView top artists

Add a 32px circular thumbnail to each top artist row in the digest stats.

**Files:**
- Modify: `frontend/src/components/DigestView.jsx:235-245`
- Test: `frontend/src/components/DigestView.test.jsx`

- [ ] **Step 1: Update test fixture to include image_url**

In `frontend/src/components/DigestView.test.jsx`, update `statsData.top_artists`:

```javascript
top_artists: [
  { artist: 'Popular Artist', play_count: 55, image_url: 'https://img/popular.jpg' },
  { artist: 'Second Artist', play_count: 33, image_url: null },
],
```

- [ ] **Step 2: Write failing test for artist image rendering**

Add to the `DigestView` describe block:

```javascript
it('renders artist profile images in top artists', async () => {
  render(<DigestView onPlay={() => {}} />)
  await waitFor(() => {
    const img = screen.getByAltText('Popular Artist')
    expect(img).toBeInTheDocument()
    expect(img.src).toContain('https://img/popular.jpg')
    expect(img.className).toContain('rounded-full')
  })
})

it('renders letter fallback when artist has no image', async () => {
  render(<DigestView onPlay={() => {}} />)
  await waitFor(() => {
    expect(screen.queryByAltText('Second Artist')).not.toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument() // first letter fallback
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run DigestView.test`
Expected: FAIL — no img elements or letter fallback in top artists

- [ ] **Step 4: Update DigestView top artists rendering**

In `frontend/src/components/DigestView.jsx`, replace the top artists map block (lines ~235-245) with:

```jsx
<div className="px-4 pt-4 pb-1 text-xs font-bold tracking-wider uppercase text-text-dim">Top Artists</div>
{stats.top_artists.map((item, i) => (
  <div key={item.artist} className="flex items-center gap-2.5 px-4 py-1.5">
    <span className="text-xs font-semibold text-text-dim w-5 text-right flex-shrink-0">{i + 1}</span>
    {item.image_url ? (
      <img
        src={item.image_url}
        alt={item.artist}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      />
    ) : (
      <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-text-dim text-sm font-semibold flex-shrink-0">
        {item.artist.charAt(0).toUpperCase()}
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-text truncate">{item.artist}</div>
    </div>
    <span className="text-xs font-semibold text-text-dim bg-border rounded-full py-0.5 px-[7px] flex-shrink-0">{item.play_count}</span>
  </div>
))}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test -- --run DigestView.test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DigestView.jsx frontend/src/components/DigestView.test.jsx
git commit -m "Add artist profile images to digest top artists

32px circular thumbnail with first-letter fallback when no image.

Refs #95

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Add artist image to ArtistsView rows

Add a 40px circular artist profile photo on the left of each artist row. The existing album art strip stays on the right.

**Files:**
- Modify: `frontend/src/components/ArtistsView.jsx:114-152`
- Test: `frontend/src/components/ArtistsView.test.jsx`

- [ ] **Step 1: Update test fixture albums to include artist objects with image_url**

The ArtistsView receives albums as props. Currently `artists` is an array of strings. After Task 1, it'll be objects. But ArtistsView groups by artist name — it needs to extract names and find image URLs.

Update `ALBUMS` in `ArtistsView.test.jsx`:

```javascript
const ALBUMS = [
  { service_id: 'a1', name: 'OK Computer', artists: [{ name: 'Radiohead', id: 'rh1', image_url: null }], image_url: '/rc1.jpg', release_date: '1997', added_at: '2024-01-01', total_tracks: 12 },
  { service_id: 'a2', name: 'Kid A', artists: [{ name: 'Radiohead', id: 'rh1', image_url: null }], image_url: '/rc2.jpg', release_date: '2000', added_at: '2024-02-01', total_tracks: 10 },
  { service_id: 'a3', name: 'Blue Train', artists: [{ name: 'John Coltrane', id: 'jc1', image_url: 'https://img/jc.jpg' }], image_url: '/jc1.jpg', release_date: '1958', added_at: '2024-03-01', total_tracks: 5 },
  { service_id: 'a4', name: 'Dummy', artists: [{ name: 'Portishead', id: 'ph1', image_url: null }], image_url: '/ph1.jpg', release_date: '1994', added_at: '2024-04-01', total_tracks: 11 },
]
```

Note: `image_url` on artist objects will need to be populated. Since this comes from cached album data (which won't have artist images yet — those are resolved lazily by the backend), the frontend artist view will need a way to get artist images. Two options:
- Pass artist images from a separate API call
- Add artist image resolution to the albums endpoint

For simplicity, the ArtistsView should accept an optional `artistImages` prop (a `{name: url}` map) fetched from a new lightweight endpoint or resolved client-side. However, the simplest approach matching the spec's "lazy resolution" is: the frontend calls the existing `/digest/stats` endpoint and extracts `image_url` from `top_artists`, then for the artists view, we add a new backend endpoint `GET /library/artist-images` that resolves images for given artist IDs.

**Simpler approach:** Add `artist_image_url` to the data the ArtistsView already has. The albums in cache will have artist IDs after Task 1. The frontend can call `sp.artists()` equivalent on the backend. Add a lightweight endpoint.

**Simplest approach for this task:** The ArtistsView component receives albums as props. Extract unique artist IDs from those albums, fetch images from a new `/library/artist-images` endpoint, and display them.

- [ ] **Step 2: Add backend endpoint for artist images**

In `backend/routers/library.py`, add:

```python
@router.get("/artist-images")
def get_artist_images(
    sp: spotipy.Spotify = Depends(get_user_spotify),
    db: Client = Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    """Return artist name -> image_url map for all artists in user's library."""
    from routers.digest import _get_artist_name, _resolve_artist_images

    albums = get_album_cache(db, user_id=user["user_id"])
    artist_id_map = {}
    for album in albums:
        for artist in album.get("artists", []):
            if isinstance(artist, dict) and artist.get("id"):
                artist_id_map[artist["name"]] = artist["id"]
            elif isinstance(artist, str):
                artist_id_map[artist] = None

    images = _resolve_artist_images(
        list(artist_id_map.items()), sp
    )
    return {"artist_images": images}
```

Write a test for this in `backend/tests/test_library.py`:

```python
def test_artist_images_returns_image_map():
    sp = MagicMock()
    sp.artists.return_value = {
        "artists": [
            {"id": "art1", "name": "Artist One", "images": [{"url": "https://img/art1.jpg", "height": 64}]},
        ]
    }
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"albums": [
            {"service_id": "a1", "name": "Album", "artists": [{"name": "Artist One", "id": "art1"}], "image_url": None},
        ]}]
    )
    setup_overrides(db=db, sp=sp)
    try:
        res = client.get("/library/artist-images")
        assert res.status_code == 200
        data = res.json()
        assert data["artist_images"]["Artist One"] == "https://img/art1.jpg"
    finally:
        clear_overrides()
```

- [ ] **Step 3: Write failing frontend test for artist profile image**

Add to `ArtistsView.test.jsx`:

```javascript
it('renders artist profile image when artistImages prop provides URL', () => {
  const artistImages = { 'John Coltrane': 'https://img/jc.jpg' }
  render(<ArtistsView {...defaultProps} artistImages={artistImages} />)
  const row = screen.getByTestId('artist-row-John Coltrane')
  const img = within(row).getByAltText('John Coltrane')
  expect(img).toBeInTheDocument()
  expect(img.src).toContain('https://img/jc.jpg')
  expect(img.className).toContain('rounded-full')
})

it('renders letter fallback when artistImages has no URL for artist', () => {
  render(<ArtistsView {...defaultProps} artistImages={{}} />)
  const row = screen.getByTestId('artist-row-John Coltrane')
  expect(within(row).queryByAltText('John Coltrane')).not.toBeInTheDocument()
  // Should show first letter in a circle
  const fallback = within(row).getByText('J')
  expect(fallback).toBeInTheDocument()
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run ArtistsView.test`
Expected: FAIL — no img or letter fallback in artist rows

- [ ] **Step 5: Update ArtistsView to accept artistImages prop and render thumbnails**

In `frontend/src/components/ArtistsView.jsx`, the component needs to:
1. Accept `artistImages` prop (default `{}`)
2. Extract artist name from both string and object formats
3. Add a circular image/fallback before the artist name in both mobile and desktop layouts

Update the artist name extraction (wherever `group.name` is derived from album artists) to handle both `"Artist"` and `{"name": "Artist", "id": "..."}` formats.

Add an `ArtistProfileImage` component at the top of the file:

```jsx
function ArtistProfileImage({ name, imageUrl, size = 40 }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-surface-2 flex items-center justify-center text-text-dim font-semibold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
```

Insert `<ArtistProfileImage name={group.name} imageUrl={artistImages[group.name]} />` in both mobile and desktop row layouts, before the artist name text.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test -- --run ArtistsView.test`
Expected: ALL PASS

- [ ] **Step 7: Update ArtistsView grouping to handle artist objects**

The ArtistsView groups albums by artist name. After Task 1, `album.artists` will be objects `[{name, id}]` instead of strings. Update the grouping logic to extract names:

```javascript
// Where artist names are extracted from album.artists:
const artistName = typeof artist === 'string' ? artist : artist.name
```

Run all ArtistsView tests: `cd frontend && npm test -- --run ArtistsView.test`
Expected: ALL PASS

- [ ] **Step 8: Wire up artist images fetch in parent component**

Find where ArtistsView is rendered (likely `App.jsx` or a parent layout), add a `useEffect` to fetch `/library/artist-images` and pass the result as the `artistImages` prop.

- [ ] **Step 9: Run all frontend tests**

Run: `cd frontend && npm test -- --run`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py frontend/src/components/ArtistsView.jsx frontend/src/components/ArtistsView.test.jsx
git commit -m "Add artist profile images to artists view

40px circular thumbnail with letter fallback. New /library/artist-images
endpoint resolves images via Spotify batch API.

Refs #95

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: End-to-end smoke test

Verify both views render correctly with real data.

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npm test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Push and verify preview deploy**

```bash
git push origin 108-top-artists-bug
```

Check the Vercel preview deploy for the PR. Verify:
- Digest stats page shows artist thumbnails next to top artists
- Artists view shows circular profile photos on each row
- Missing images show letter fallback circles
