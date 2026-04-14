-- Add updated_at column to collections table
alter table collections
    add column updated_at timestamptz default now();

-- Function: bump collections.updated_at whenever a row in collection_albums changes
create or replace function touch_collection_updated_at()
returns trigger
language plpgsql
as $$
declare
    affected_collection_id uuid;
begin
    if TG_OP = 'DELETE' then
        affected_collection_id := OLD.collection_id;
    else
        affected_collection_id := NEW.collection_id;
    end if;

    update collections
       set updated_at = now()
     where id = affected_collection_id;

    return null;
end;
$$;

-- Trigger: fire after INSERT on collection_albums
create trigger trg_collection_albums_insert
after insert on collection_albums
for each row execute function touch_collection_updated_at();

-- Trigger: fire after DELETE on collection_albums
create trigger trg_collection_albums_delete
after delete on collection_albums
for each row execute function touch_collection_updated_at();
