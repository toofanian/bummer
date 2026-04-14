-- backend/migrations/007_multi_user.sql
-- Phase 1: Wipe existing data (no migration — fresh start)
TRUNCATE TABLE play_history, library_snapshots, library_cache,
               collection_albums, collections, album_metadata
               RESTART IDENTITY CASCADE;

-- Phase 2: Add user_id to existing tables
ALTER TABLE album_metadata
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE collections
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE collection_albums
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE library_cache
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE library_snapshots
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

ALTER TABLE play_history
  ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id);

-- Phase 3: New tables
CREATE TABLE IF NOT EXISTS invite_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  redeemed_by UUID REFERENCES auth.users(id),
  redeemed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id),
  invite_code_used TEXT REFERENCES invite_codes(code),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spotify_tokens (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id),
  client_id     TEXT NOT NULL,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Phase 4: RLS policies
ALTER TABLE album_metadata    ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotify_tokens    ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname
           FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Per-user isolation policies
CREATE POLICY user_isolation ON album_metadata
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON collections
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON collection_albums
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON library_cache
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON library_snapshots
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON play_history
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY user_isolation ON invite_codes
  USING (redeemed_by = auth.uid());

CREATE POLICY user_isolation ON profiles
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY user_isolation ON spotify_tokens
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
