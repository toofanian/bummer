-- Add artist_images JSONB column to library_cache.
-- Stores { "Artist Name": "image_url" } map, populated on first
-- artist-images fetch and reused on subsequent requests.
ALTER TABLE public.library_cache
ADD COLUMN IF NOT EXISTS artist_images jsonb DEFAULT '{}';
