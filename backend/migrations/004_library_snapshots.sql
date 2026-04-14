create table if not exists library_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date unique not null,
  album_ids text[] not null default '{}',
  total integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_library_snapshots_date
  on library_snapshots (snapshot_date desc);
