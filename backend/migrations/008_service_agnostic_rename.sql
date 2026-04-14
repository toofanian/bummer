-- Migration: Make Crate music-service agnostic
-- Renames spotify-specific columns/tables to generic names
-- Apply with: mcp__supabase__apply_migration or supabase CLI

-- 1. Rename spotify_tokens → music_tokens and add service_type
ALTER TABLE public.spotify_tokens RENAME TO music_tokens;
ALTER TABLE public.music_tokens ADD COLUMN service_type text NOT NULL DEFAULT 'spotify';

-- 2. Rename album_metadata.spotify_id → service_id
ALTER TABLE public.album_metadata DROP CONSTRAINT album_metadata_pkey;
ALTER TABLE public.album_metadata RENAME COLUMN spotify_id TO service_id;
ALTER TABLE public.album_metadata ADD PRIMARY KEY (service_id, user_id);

-- 3. Rename collection_albums.spotify_id → service_id
ALTER TABLE public.collection_albums DROP CONSTRAINT collection_albums_pkey;
ALTER TABLE public.collection_albums RENAME COLUMN spotify_id TO service_id;
ALTER TABLE public.collection_albums ADD PRIMARY KEY (collection_id, service_id);

-- 4. Add service_type to profiles
ALTER TABLE public.profiles ADD COLUMN service_type text NOT NULL DEFAULT 'spotify';

-- 5. Update RLS policies for renamed table
DROP POLICY IF EXISTS user_isolation ON public.music_tokens;
ALTER TABLE public.music_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON public.music_tokens
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 6. Rename FK constraint for clarity
ALTER TABLE public.music_tokens
  RENAME CONSTRAINT spotify_tokens_user_id_fkey TO music_tokens_user_id_fkey;
