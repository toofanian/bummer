create table if not exists library_cache (
  id text primary key,
  albums jsonb not null default '[]'::jsonb,
  total integer not null default 0,
  synced_at timestamptz not null default now()
);
