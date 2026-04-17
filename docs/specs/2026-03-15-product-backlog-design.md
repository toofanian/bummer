# Product Backlog — Design Spec

**Date:** 2026-03-15
**Scope:** Complete product backlog organized by capability columns with user flows and item specs

## Design Philosophy

Crate is a library-first music app. Album art is the only color — the UI is a clean, dark, neutral shell that stays out of the way. There is no shuffle. Albums are complete works played front-to-back. Organization is flexible and multi-membership. Discovery starts from what you already own and extends outward.

Platform concerns (multi-user, Apple Music, monetization) are a separate track from the product backlog. They don't compete for priority against UX features.

## Backlog Structure

Four capability columns, each anchored by a user flow:

1. **Play** — playback control, device management, state continuity
2. **Organize** — collections, artist grouping, curation tools
3. **Discover** — artist discographies, catalog search, library management
4. **Know** — stats, digest, changelog, library understanding

Plus **Polish** (cross-cutting QoL) and **Platform** (infrastructure/growth).

---

## Column 1: Play

### User Flow

You open Crate. You're on Home — you see what you played today, this week, and some rediscover suggestions. You tap an album. Playback starts on your preferred device (your HomePod, not some random browser tab). You see the progress bar and tap ahead to the second verse. You glance at the track list — track 5 is up next. You close the app, come back later, and Crate still shows the album row highlighted for what's currently playing.

### Items

#### 1. Smart Device Selection

**Problem:** Playback starts on a seemingly random device. Users have to fix it after the fact.

**Solution:**
- On first play or app launch, check available Spotify Connect devices
- Let the user set a **default device** (persisted in localStorage, later DB for multi-user)
- Let the user **suppress devices** they never want (e.g., stale Chromecast, "Web Player")
- If the default device is unavailable, show a quick device picker instead of silently falling back
- Settings accessible from the playback bar (gear icon or device name tap)

**Backend:** No changes needed — the existing `/playback/devices` and `/playback/transfer` endpoints are sufficient. Device preference is client-side state.

**Frontend:**
- New `DevicePreferences` component (modal or dropdown from playback bar)
- Modify `handlePlay` in `App.jsx` to check preferred device before initiating playback
- Modify `usePlayback.js` to expose device preference logic
- Persist preferences in localStorage under a `crate_device_prefs` key

#### 2. Playback Seek

**Problem:** The progress bar in both desktop PlaybackBar and mobile FullScreenNowPlaying is display-only. Users expect to tap/click to jump to a position.

**Solution:**
- Make the progress bar interactive — click (desktop) or tap (mobile) to seek
- Use Spotify's `/me/player/seek` endpoint via a new `PUT /playback/seek` backend route
- Show a time tooltip on hover (desktop) or on touch (mobile)
- Maintain the thin, minimal visual style

**Backend:** New endpoint:
- `PUT /playback/seek` — body: `{ "position_ms": int }` — calls `sp.seek_track(position_ms)`, returns 204

**Frontend:**
- Modify `PlaybackBar.jsx` progress bar to handle click events, calculate position from click coordinates
- Modify `FullScreenNowPlaying.jsx` progress bar similarly for touch events
- Add `seek` function to `usePlayback.js`
- After a seek, optimistically update the displayed progress position immediately (don't wait for the next 3-second poll to reflect the new position)

#### 3. Queue Visibility

**Problem:** When playing an album, there's no indication of what track comes next.

**Solution:**
- In the expanded track list (both AlbumTable and FullScreenNowPlaying), show a subtle "up next" indicator on the track that follows the currently playing one
- Visual: a small `Next ›` label or dimmed highlight on the next track row
- Always album order — Crate does not acknowledge shuffle
- No queue management — Spotify owns the queue; Crate just shows the album's natural sequence

**Backend:** No changes — track order is already returned by `/library/albums/{id}/tracks`.

**Frontend:**
- Modify `AlbumTable.jsx` expanded track rendering to highlight the next track
- Modify `FullScreenNowPlaying.jsx` track list similarly
- Derive "next track" from the track list and current playing track. Note: `playingTrackName` alone is fragile (duplicate track names within an album). Enrich the `/playback/state` response to include `track.spotify_id` (from `item["id"]`) for reliable matching.

#### 4. Playback State Persistence

**Problem:** `playingId` (which album row is highlighted) is React state and lost on reload. The playback polling reconnects to Spotify's state, but the album row highlight doesn't restore.

**Solution:**
- On app mount, after playback state is fetched, match the playing album against the album list to restore `playingId`
- This already partially works (see `nowPlayingAlbum` memo in App.jsx which matches by album name) — the gap is that `playingId` itself isn't set from it on mount
- Set `playingId` from `nowPlayingAlbum.spotify_id` when playback state arrives and `playingId` is null
- **Known limitation:** The current `/playback/state` response returns `album` as a name string, so matching is by name. Duplicate album names across artists could cause mismatches. Enrich the response to include `track.album_spotify_id` (from `item["album"]["id"]`) for reliable matching. This enrichment also benefits #3 (Queue Visibility).

**Backend:** Enrich `/playback/state` response to include `track.spotify_id` and `track.album_spotify_id` from the Spotify playback state.

**Frontend:**
- Add a `useEffect` in `App.jsx` that sets `playingId` from `nowPlayingAlbum` when playback is active and `playingId` is null

---

## Column 2: Organize

### User Flow

You've got 400 albums. You create a collection called "Late Night" and want to throw 15 albums in quickly — you multi-select from the library and add them in one action. You add a description: "low energy, headphone albums." You drag them into a deliberate order — Grouper first, then Burial, then Brian Eno. Friday night you hit play on the collection — it plays those albums front-to-back in your curated sequence. Later you make a "Best of 2025" collection the same way. One album lives in both. You switch to the Artists sub-view to see everything grouped by artist. You check your collection coverage — 60% organized, 40% still floating.

### Items

#### 5. Collections: Full Philosophy

Collections are Crate's organizational primitive — flexible, multi-membership, user-defined album shelves. An album can belong to any number of collections. Collections are not playlists (no track-level ordering) — they are curated album sequences.

**Schema migrations:** Items 5a, 5b, and 5d each add columns to existing tables. These must be handled via a new Supabase migration file (`backend/migrations/00X_collections_enhancements.sql`) that:
1. Adds `description` (text, nullable) to `collections`
2. Adds `position` (integer, nullable) to `collection_albums`, backfills existing rows with sequential values based on insertion order (`created_at` or rowid)
3. Adds `cover_album_id` (text, nullable) to `collections`

All three columns are nullable so the migration is non-breaking against existing data.

**5a. Collection Descriptions**
- Optional one-line description per collection
- Shown on the collection card and at the top of the collection detail view
- Backend: `description` column added via migration above
- Frontend: editable inline on collection detail view, shown as subtitle on cards

**5b. Collection Ordering**
- Albums within a collection have a user-defined order
- Drag-to-reorder on both desktop and mobile
- Backend: `position` column added via migration above; backfilled for existing rows
- Reorder endpoint: `PUT /collections/{id}/albums/reorder` — body: `{ "album_ids": ["id1", "id2", ...] }` — bulk-updates position values
- Frontend: drag handles on album rows within collection detail view

**5c. Bulk Add**
- Multi-select mode in the library: tap/click to select multiple albums, then "Add to Collection" action
- Selection UI: checkbox overlay on album art, floating action bar at bottom ("X selected — Add to Collection")
- Adds all selected albums to the chosen collection in one API call
- Backend: new endpoint `POST /collections/{id}/albums/bulk` — body: `{ "spotify_ids": ["id1", "id2", ...] }`

**5d. Collection Cover Art**
- Auto-generated 2x2 grid of the first 4 album covers (already partially implemented in card UI)
- Option to pin a single album's art as the collection cover
- Backend: `cover_album_id` column added via migration above
- Frontend: long-press or menu option on an album within a collection to "Set as Cover"

#### 6. Collection Playback

- Play button on collection detail view and collection card
- Plays albums in the collection's curated order (by `position`)
- Each album plays front-to-back, then the next album starts
- Implementation: client-side "collection playback" state tracks the active collection and current album index within it
- **Auto-advance detection strategy:** The playback polling loop knows the current album's track list and track count. When the poll detects that the last track of the current album has finished (progress near duration on the final track, then playback stops or context changes), Crate advances to the next album in the collection. Key edge cases:
  - If the user manually changes the track/album outside Crate (e.g., in native Spotify), Crate should detect the context mismatch and exit collection playback mode gracefully (clear the collection playback state)
  - If Spotify auto-plays a recommended track after the album ends, Crate detects the context URI mismatch and overrides by starting the next collection album
  - If no more albums remain in the collection, collection playback state clears naturally
- Visual indicator: show which collection is currently being played through, and progress (e.g., "Album 3 of 8")

#### 7. Smart Collections (stretch)

Auto-populated collections based on user-defined rules. Examples:
- "All jazz albums added in the last 6 months"
- "Albums I haven't listened to in 90 days"
- "All albums by artists with 3+ albums in library"

This requires genre/tag data (which Spotify provides per artist, not per album) and more complex query logic. Parked as a stretch goal. **Gate to un-park:** items 5a–5d and #6 (Collection Playback) are all complete and stable. At that point, evaluate whether the data model supports rule-based queries.

#### 8. Artists Grouping View (existing, spec'd)

Already designed in `docs/specs/2026-03-14-artists-grouping-design.md`. Toggle within Library that groups albums by artist, with artist detail view showing their albums.

#### 9. Tier Ratings UI (parked)

Backend built (S/A/B/C/D on `album_metadata`). Intentionally hidden from UI. Will surface when there's a clear UX vision for what tiers mean — potentially tied to smart collections, stats, or a personal rating workflow.

---

## Column 3: Discover

### User Flow

You're in your library looking at a Radiohead album. You tap into the artist detail view and see your 3 saved Radiohead albums. Below that: "More by Radiohead" — their full discography from Spotify. Albums you own are marked "In Library." You spot *Amnesiac*, tap it, see the track list, and save it. Now you want something completely different — you go to Search, type "Khruangbin," and get album results. Not tracks, not playlists — albums. You find *Con Todo El Mundo*, preview its tracks, and add it to your library and your "Late Night" collection in one motion.

### Items

#### 10. Artist Discography Browse

**Prerequisite:** Artists Grouping View (#8)

- In the artist detail view, below the user's saved albums, add a "More by [Artist]" section
- Fetch the artist's full album discography from Spotify API (`sp.artist_albums()`)
- Filter to `album` type (exclude singles, compilations, appearances unless user opts in)
- Albums already in the user's library show an "In Library" badge
- Tap an unsaved album to preview its track list
- "Save to Library" button adds it to the user's Spotify saved albums and refreshes the library cache

**Backend:**
- New endpoint: `GET /library/artists/{artist_id}/discography` — fetches from Spotify, cross-references with library cache, returns albums with `in_library` boolean
- New endpoint: `PUT /library/albums/{spotify_id}/save` — calls `sp.current_user_saved_albums_add([spotify_id])`, invalidates library cache

**Frontend:**
- Extend the artist detail view (from #8) with the discography section
- Reuse `AlbumRow` horizontal scroll component or a vertical list depending on count

#### 11. Album Search & Browse

A search view that queries the full Spotify catalog with an album-first approach.

- New "Search" or "Browse" tab/view accessible from navigation
- Search input queries Spotify's search API with `type=album`
- Results: album art, name, artist, year — card grid or list
- Tap to expand: show track list, album details
- "Save to Library" button on unsaved albums
- "Add to Collection" option alongside save
- Albums already in library show "In Library" badge
- No track results, no playlist results — albums only

**Backend:**
- New endpoint: `GET /discover/search?q=<query>` — calls `sp.search(q, type='album')`, cross-references with library cache for `in_library` badges
- Reuses `PUT /library/albums/{spotify_id}/save` from #10

**Frontend:**
- New `DiscoverPage.jsx` component
- New nav entry: on desktop as a header tab, on mobile as a bottom tab bar entry (replaces or augments existing 4 tabs)
- Mobile: 5-tab bottom bar (Home, Library, Search, Collections, Digest). Five tabs is standard for mobile music apps (Spotify, Apple Music). The Digest tab replaces the current toggle behavior — it becomes a full-screen view on mobile rather than a panel toggle.

#### 12. Add/Remove Albums from Library (existing)

Two independent capabilities:

- **Remove (no dependencies):** unsave albums directly from Crate's library view. Confirmation dialog since it affects the actual Spotify library. Backend: `DELETE /library/albums/{spotify_id}` — calls `sp.current_user_saved_albums_delete([spotify_id])`, invalidates cache. Frontend: action on album row (long-press menu or swipe on mobile, right-click or icon on desktop). Can be built standalone without #10 or #11.
- **Add (depends on #10 and #11):** save albums discovered via Artist Discography or Album Search. Uses `PUT /library/albums/{spotify_id}/save`. Only makes sense once there's a UI surface showing unsaved albums.

---

## Column 4: Know

### User Flow

You open the Digest panel and see that you added 4 albums this week and removed 1. You switch to the changelog for a scrollable history — March 3: added 2, removed 1. You're curious about patterns, so you open Stats: your most played album this month is *In Rainbows*, you have 47 albums you've never played through Crate, and 60% of your library is organized into collections. You notice your listening has been heavily hip-hop lately — maybe time to revisit your jazz shelf.

### Items

#### 13. Library Changelog (existing)

Distinct from the Digest panel (which is date-range-gated). The changelog is a scrollable, chronological history of library changes:
- "March 3: +2 albums (Blonde, Channel Orange), -1 album (Random Access Memories)"
- Built on the existing `library_snapshots` table — diff consecutive snapshots
- Lives as a new section within the Digest panel (below the existing added/removed/listened sections), with a "View full changelog" link that opens a scrollable full history
- Backend: new endpoint `GET /digest/changelog?limit=30` — returns the last N snapshot diffs with album metadata

#### 14. Listening Stats Dashboard

A dedicated stats view built on `play_history`. Not a Spotify Wrapped clone — focused on library usage patterns:

- **Most played albums** — all time and last 30 days
- **Never played through Crate** — albums in library with zero plays in `play_history`. Note: `play_history` only tracks plays initiated through Crate, not native Spotify plays. Label accordingly in the UI.
- **Listening streaks** — consecutive days with at least one play
- **Collection coverage** — what % of library albums are in at least one collection
- **Artist concentration** — top artists by play count, visualized as a simple bar chart or ranked list

**Backend:**
- New endpoint: `GET /stats` — aggregates from `play_history`, cross-references library cache and collection data
- Returns pre-computed sections (most played, never played, streaks, coverage)

**Frontend:**
- New `StatsPage.jsx` component
- Accessible from nav (desktop tab or mobile tab)
- Clean, minimal data presentation — numbers and lists, not elaborate charts

#### 15. Digest Panel (done)

Already built and shipped. Date-range picker, added/removed/listened sections.

---

## Polish (cross-cutting)

#### 16. Album Sort Persistence

Save the user's preferred library sort order (column + direction) to localStorage. Restore on app load.

#### 17. Horizontal Text Overflow Tooltip (existing)

When column text is clipped on narrow windows, show a hover tooltip with the full text.

#### 18. Performance Audit (existing)

Profile initial load and Spotify sync. Key targets:
- The N+1 collection-album fetch waterfall on load (fetch all memberships in one query)
- Cold-start Spotify sync latency
- localStorage cache hydration speed

#### 19. Keyboard Shortcuts Help

`?` keystroke opens a small overlay listing available keyboard shortcuts. Low effort, high discoverability.

#### 20. PWA Install Prompt

Audit and polish the PWA manifest for proper home screen install on iPhone. Standalone display mode, app icon, splash screen.

---

## Platform (independent track)

#### P1. Multi-User Pivot (Crate)

As spec'd in `MULTI_USER_STRATEGY.md`. Rename, BYOK, multi-user DB schema, invite system, open source. Phases 1-4 detailed there.

#### P2. Apple Music Support

Add Apple Music as an alternative music client. The "Crate" name is intentionally client-agnostic. Requires a parallel auth flow, API client, and library sync — significant scope.

#### P3. Monetization

As outlined in MULTI_USER_STRATEGY.md Phase 2. 30-day trial, one-time fee for hosted instance, Stripe integration. Self-hosting remains free.

---

## Dependencies

```
#8 (Artists View) ──► #10 (Artist Discography)
#10 (Artist Discography) ──► #12-add (Add Albums)
#11 (Album Search) ──► #12-add (Add Albums)
#12-remove (Remove Albums) ──► (no dependencies — can be built standalone)
#5 (Collections Philosophy) ──► #6 (Collection Playback)
#5 + #6 (Collections complete) ──► #7 (Smart Collections)
#3 + #4 (Queue Visibility + State Persistence) ──► enrich /playback/state (shared prerequisite)
```

## Priority Guidance

Within each column, items are listed in suggested implementation order. Columns are independent and can be worked in parallel. Suggested column priority:

1. **Play** — highest daily-use impact, smallest scope
2. **Organize** — collections philosophy is the biggest UX gap today
3. **Discover** — natural extension once Organize is solid
4. **Know** — nice-to-have, builds on existing infrastructure

Polish items can be picked up anytime as low-effort wins. Platform items are on their own timeline driven by strategic needs.

## Source of Truth

This spec is the authoritative reference for backlog item details. `BACKLOG.md` at the project root is a summary index that links here. When updating items, update this spec first, then sync `BACKLOG.md`.
