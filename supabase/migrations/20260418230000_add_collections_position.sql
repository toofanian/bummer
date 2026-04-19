-- Add position column for drag-reorder of collections
ALTER TABLE collections ADD COLUMN position integer;

-- Backfill existing rows: assign position based on created_at order (per user)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1 AS pos
  FROM collections
)
UPDATE collections SET position = ranked.pos FROM ranked WHERE collections.id = ranked.id;

-- Make position NOT NULL after backfill
ALTER TABLE collections ALTER COLUMN position SET NOT NULL;

-- Index for efficient ordering queries
CREATE INDEX idx_collections_user_position ON collections (user_id, position);
