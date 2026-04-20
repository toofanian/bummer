-- Fix: unique constraint must match the upsert on_conflict columns (snapshot_date, user_id)
-- Old: UNIQUE(snapshot_date) — prevents multi-user snapshots and doesn't match on_conflict
ALTER TABLE public.library_snapshots DROP CONSTRAINT library_snapshots_snapshot_date_key;
ALTER TABLE public.library_snapshots ADD CONSTRAINT library_snapshots_snapshot_date_user_id_key UNIQUE (snapshot_date, user_id);
