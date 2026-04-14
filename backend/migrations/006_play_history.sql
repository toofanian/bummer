-- Create play_history table and enable RLS.
-- Tracks album plays with timestamps for home-screen recency
-- and digest listening stats.

create table if not exists play_history (
  id uuid primary key default gen_random_uuid(),
  album_id text not null,
  played_at timestamptz not null default now()
);

create index if not exists idx_play_history_played_at
  on play_history (played_at desc);

create index if not exists idx_play_history_album_id
  on play_history (album_id);

alter table play_history enable row level security;
