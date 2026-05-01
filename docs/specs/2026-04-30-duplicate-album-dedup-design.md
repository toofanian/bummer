# Duplicate Album Dedup Design [136]

## Problem

Spotify artists sometimes re-upload albums under a new ID. Spotify hides the old version in their UI, but both remain in the user's library. Since we pull from the library API, we display both — resulting in duplicates.

## Solution

Add an automatic dedup step at the end of library sync that detects cross-ID duplicates, keeps the newer version, migrates user metadata, and suppresses the old version from future syncs.

## Matching

Strict match on `(normalized_artist_name, normalized_album_name, total_tracks)`.

Normalization: lowercase, strip leading/trailing whitespace.

This avoids false positives on deluxe editions or remasters that share a name but differ in track count.

## Winner Selection

When a duplicate pair is found, the winner is determined by:

1. Later `release_date` wins
2. Ties broken by later `added_at`

## Metadata Migration

Before removing the loser, migrate user data from old service_id to new:

1. **album_metadata** (tiers): copy old → new, only if new doesn't already have a tier
2. **collection_albums**: copy old → new for each collection, only if new isn't already in that collection
3. Delete old service_id's rows from both tables

## Suppression Table

New `deduped_albums` table:

| Column | Type | Notes |
|--------|------|-------|
| `old_service_id` | text | PK (with user_id) |
| `new_service_id` | text | not null |
| `user_id` | uuid | PK, FK to auth.users |
| `deduped_at` | timestamptz | default now() |

RLS policy: users can only read/write their own rows.

## Sync Flow Changes

Current flow:
1. Fetch pages from Spotify
2. `sync-complete`: upsert to `library_cache`, compute diff, log to `library_changes`

New flow:
1. Fetch pages from Spotify (unchanged)
2. **Filter**: remove any album whose `service_id` appears as `old_service_id` in `deduped_albums` for this user
3. Upsert to `library_cache` (unchanged)
4. **Dedup**: group cached albums by (artist, name, track_count), find duplicate groups, for each group: pick winner, migrate metadata, insert `deduped_albums` record, remove loser from cache
5. Log changes (unchanged)

## Logging

Dedup actions are recorded in the `deduped_albums` table. No UI for this initially — the table serves as an audit trail and enables a future undo feature.

## No UI Changes

Dedup is fully transparent to the user. Duplicates simply stop appearing after sync.

## Testing

- Unit tests for normalization logic
- Unit tests for winner selection (release_date priority, added_at tiebreaker)
- Unit tests for metadata migration (tier copy, collection copy, no-overwrite semantics)
- Integration test for full dedup flow: sync with duplicates → verify one remains, metadata migrated, dedup record created
- Integration test for suppression: re-sync after dedup → verify old album filtered out
