-- Seed data for the preview user — public schema rows only.
--
-- Applied to the PROD Supabase DB as a one-time bootstrap during
-- sub-project C cutover. Previews share the prod DB (Supabase
-- branching is Pro-only and we're on the free tier), so the preview
-- user's rows live in prod alongside real users' rows, isolated by
-- user_id + RLS.
--
-- NOTE: This file intentionally does NOT insert into `auth.users`.
-- Inserting directly creates a GoTrue-incompatible row (no matching
-- `auth.identities` entry) which breaks the admin API for the entire
-- project. The preview user must be created via
-- `POST /auth/v1/admin/users` (see docs/specs/... for the curl
-- command) which generates both the auth.users row and the
-- auth.identities row, then accepts our hardcoded id:
--
--   00000000-0000-0000-0000-000000000001
--
-- The plaintext password used by sign_in_with_password is stored
-- only in the Vercel preview-scope env var PREVIEW_USER_PASSWORD.
--
-- Every public-schema insert below uses ON CONFLICT DO NOTHING so
-- this file is idempotent and safe to re-apply at any time to reset
-- the preview user's library/collections state. To fully reset:
--   DELETE FROM public.collection_albums WHERE user_id = '0...01';
--   DELETE FROM public.collections        WHERE user_id = '0...01';
--   DELETE FROM public.library_cache      WHERE user_id = '0...01';
--   DELETE FROM public.music_tokens       WHERE user_id = '0...01';
--   DELETE FROM public.profiles           WHERE id      = '0...01';
-- ...then re-run this file.
--
-- The hardcoded UUID matches:
--   - backend/auth_middleware.py    PREVIEW_USER_ID
--   - frontend/src/previewMode.js   PREVIEW_USER_ID

-- ---------------------------------------------------------------
-- 1. Profile row
-- ---------------------------------------------------------------
INSERT INTO public.profiles (id, service_type, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'spotify', now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. Music tokens (fake Spotify credentials)
-- ---------------------------------------------------------------
-- Pre-expired on purpose: the backend's get_user_spotify() has a
-- preview-mode short-circuit that returns a stub Spotipy client
-- without attempting the refresh, so the expired tokens never hit
-- the real Spotify token endpoint.
INSERT INTO public.music_tokens (
    user_id, service_type, client_id, access_token, refresh_token,
    expires_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'spotify',
    'PREVIEW_FAKE_CLIENT_ID',
    'PREVIEW_FAKE_ACCESS',
    'PREVIEW_FAKE_REFRESH',
    now() - interval '1 day',
    now()
)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Library cache (single row with jsonb albums blob)
-- ---------------------------------------------------------------
-- library_cache is ONE row per user with an `albums` jsonb array.
-- Each album object matches NormalizedAlbum (service_id, name,
-- artists, release_date, total_tracks, image_url, added_at).
-- Using real Spotify album IDs so cover art URLs (i.scdn.co) resolve.
-- Cover art on Spotify's CDN is public — no token required.
INSERT INTO public.library_cache (id, user_id, albums, total, synced_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '[
      {
        "service_id": "5ht7ItJgpBH7W6vJ5BqpPr",
        "name": "In Rainbows",
        "artists": ["Radiohead"],
        "release_date": "2007-12-28",
        "total_tracks": 10,
        "image_url": "https://i.scdn.co/image/ab67616d0000b27383b9b7d4a6b9bcd6e8e46c9c",
        "added_at": "2024-01-01T00:00:00Z"
      },
      {
        "service_id": "6dVIqQ8qmQ5GBnJ9shOYGE",
        "name": "Currents",
        "artists": ["Tame Impala"],
        "release_date": "2015-07-17",
        "total_tracks": 13,
        "image_url": "https://i.scdn.co/image/ab67616d0000b2739e1cfc756886ac782e363d79",
        "added_at": "2024-01-02T00:00:00Z"
      },
      {
        "service_id": "1bt6q2SruMsBtcerNVtpZB",
        "name": "channel ORANGE",
        "artists": ["Frank Ocean"],
        "release_date": "2012-07-10",
        "total_tracks": 17,
        "image_url": "https://i.scdn.co/image/ab67616d0000b273c5649add07ed3720be9d5526",
        "added_at": "2024-01-03T00:00:00Z"
      },
      {
        "service_id": "2ANVost0y2y52ema1E9xAZ",
        "name": "To Pimp a Butterfly",
        "artists": ["Kendrick Lamar"],
        "release_date": "2015-03-15",
        "total_tracks": 16,
        "image_url": "https://i.scdn.co/image/ab67616d0000b273cdb645498cd3d8a2db4d05e1",
        "added_at": "2024-01-04T00:00:00Z"
      },
      {
        "service_id": "3mH6qwIy9crq0I9YQbOuY1",
        "name": "Blonde",
        "artists": ["Frank Ocean"],
        "release_date": "2016-08-20",
        "total_tracks": 17,
        "image_url": "https://i.scdn.co/image/ab67616d0000b2737aae60ba998ac4b7b7a79e4c",
        "added_at": "2024-01-05T00:00:00Z"
      },
      {
        "service_id": "4LH4d3cOWNNsVw41Gqt2kv",
        "name": "The Dark Side of the Moon",
        "artists": ["Pink Floyd"],
        "release_date": "1973-03-01",
        "total_tracks": 10,
        "image_url": "https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe",
        "added_at": "2024-01-06T00:00:00Z"
      },
      {
        "service_id": "6FJxoadUE4JNVwWHghBwnb",
        "name": "A Seat at the Table",
        "artists": ["Solange"],
        "release_date": "2016-09-30",
        "total_tracks": 21,
        "image_url": "https://i.scdn.co/image/ab67616d0000b2738f3f8ab55f8580c47cb4f2c9",
        "added_at": "2024-01-07T00:00:00Z"
      },
      {
        "service_id": "6s84u2TUpR3wdUv4NgKA2j",
        "name": "Ctrl",
        "artists": ["SZA"],
        "release_date": "2017-06-09",
        "total_tracks": 14,
        "image_url": "https://i.scdn.co/image/ab67616d0000b273d08c0bb2a4b1c87cf8f8a7c5",
        "added_at": "2024-01-08T00:00:00Z"
      },
      {
        "service_id": "0JWYKonHNBqYG24TeBS2Oo",
        "name": "Kid A",
        "artists": ["Radiohead"],
        "release_date": "2000-10-02",
        "total_tracks": 11,
        "image_url": "https://i.scdn.co/image/ab67616d0000b27364b0fb8f69ac83323ba57db9",
        "added_at": "2024-01-09T00:00:00Z"
      },
      {
        "service_id": "2noRn2Aes5aoNVsU6iWThc",
        "name": "good kid, m.A.A.d city",
        "artists": ["Kendrick Lamar"],
        "release_date": "2012-10-22",
        "total_tracks": 12,
        "image_url": "https://i.scdn.co/image/ab67616d0000b273db5b77e94a4b7c1e2cf2fbde",
        "added_at": "2024-01-10T00:00:00Z"
      }
    ]'::jsonb,
    10,
    now()
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. A single collection with 3 albums
-- ---------------------------------------------------------------
INSERT INTO public.collections (
    id, user_id, name, description, created_at, updated_at
)
VALUES (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000001',
    'Sample Collection',
    'Preview fixture — seeded by supabase/seed.sql',
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.collection_albums (
    collection_id, service_id, user_id, position, added_at
)
VALUES
    ('00000000-0000-0000-0000-0000000000a1', '6dVIqQ8qmQ5GBnJ9shOYGE',
     '00000000-0000-0000-0000-000000000001', 0, now()),
    ('00000000-0000-0000-0000-0000000000a1', '1bt6q2SruMsBtcerNVtpZB',
     '00000000-0000-0000-0000-000000000001', 1, now()),
    ('00000000-0000-0000-0000-0000000000a1', '3mH6qwIy9crq0I9YQbOuY1',
     '00000000-0000-0000-0000-000000000001', 2, now())
ON CONFLICT (collection_id, service_id) DO NOTHING;
