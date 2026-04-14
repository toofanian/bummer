-- Enable RLS on library tables (missed in 002_enable_rls.sql)
-- Service role key bypasses RLS, so backend is unaffected.
alter table library_cache enable row level security;
alter table library_snapshots enable row level security;
