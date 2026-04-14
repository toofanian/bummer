-- Album metadata: tier rating per album
create table album_metadata (
    spotify_id  text primary key,
    tier        text check (tier in ('S', 'A', 'B', 'C', 'D')),
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
);

-- Collections: named groups of albums
create table collections (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,
    created_at  timestamptz default now()
);

-- Many-to-many: albums in collections
create table collection_albums (
    collection_id  uuid references collections(id) on delete cascade,
    spotify_id     text not null,
    added_at       timestamptz default now(),
    primary key (collection_id, spotify_id)
);
