-- Add description to collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS description text;

-- Add position to collection_albums for manual ordering
ALTER TABLE collection_albums ADD COLUMN IF NOT EXISTS position integer;

-- Backfill position for existing rows based on insertion order
WITH numbered AS (
  SELECT collection_id, spotify_id, ROW_NUMBER() OVER (PARTITION BY collection_id ORDER BY added_at, spotify_id) AS rn
  FROM collection_albums
)
UPDATE collection_albums
SET position = numbered.rn
FROM numbered
WHERE collection_albums.collection_id = numbered.collection_id AND collection_albums.spotify_id = numbered.spotify_id;

-- Add cover_album_id to collections
ALTER TABLE collections ADD COLUMN IF NOT EXISTS cover_album_id text;
