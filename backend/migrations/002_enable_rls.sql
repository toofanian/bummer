-- Enable RLS on all tables (service role bypasses RLS, so backend is unaffected)
alter table album_metadata enable row level security;
alter table collections enable row level security;
alter table collection_albums enable row level security;
