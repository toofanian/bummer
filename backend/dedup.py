from collections import defaultdict

try:
    from supabase import Client
except ImportError:
    Client = object  # type: ignore[assignment,misc]


def _normalize_for_matching(s: str) -> str:
    """Lowercase and strip whitespace for dedup matching."""
    return s.strip().lower()


def _dedup_key(album: dict) -> tuple[str, str, int]:
    """Return (normalized_first_artist, normalized_name, total_tracks) for matching."""
    artists = album.get("artists", [])
    first_artist = ""
    if artists:
        a = artists[0]
        first_artist = a["name"] if isinstance(a, dict) else a
    return (
        _normalize_for_matching(first_artist),
        _normalize_for_matching(album.get("name", "")),
        album.get("total_tracks", 0),
    )


def _pick_winner(albums: list[dict]) -> tuple[dict, list[dict]]:
    """Pick the newest album as winner. Returns (winner, losers).

    Sorts by release_date descending, then added_at descending as tiebreaker.
    """

    def sort_key(album):
        return (album.get("release_date") or "", album.get("added_at") or "")

    ranked = sorted(albums, key=sort_key, reverse=True)
    return ranked[0], ranked[1:]


def find_duplicates(albums: list[dict]) -> list[tuple[dict, list[dict]]]:
    """Group albums by dedup key, return (winner, losers) for each duplicate group.

    Only groups with 2+ albums are returned. Singletons are ignored.
    """
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for album in albums:
        key = _dedup_key(album)
        groups[key].append(album)

    results = []
    for group in groups.values():
        if len(group) >= 2:
            winner, losers = _pick_winner(group)
            results.append((winner, losers))
    return results


def _migrate_metadata(db: Client, user_id: str, old_id: str, new_id: str) -> None:
    """Migrate tier and collection memberships from old to new service_id."""
    # Migrate tier (only if new doesn't have one)
    new_tier = (
        db.table("album_metadata")
        .select("tier")
        .eq("service_id", new_id)
        .eq("user_id", user_id)
        .execute()
    )
    old_tier = (
        db.table("album_metadata")
        .select("tier")
        .eq("service_id", old_id)
        .eq("user_id", user_id)
        .execute()
    )
    if old_tier.data and old_tier.data[0].get("tier"):
        if not new_tier.data or not new_tier.data[0].get("tier"):
            db.table("album_metadata").upsert(
                {"service_id": new_id, "tier": old_tier.data[0]["tier"], "user_id": user_id}
            ).execute()
        db.table("album_metadata").delete().eq("service_id", old_id).eq("user_id", user_id).execute()

    # Migrate collection memberships
    old_memberships = (
        db.table("collection_albums")
        .select("collection_id, position")
        .eq("service_id", old_id)
        .eq("user_id", user_id)
        .execute()
    )
    for membership in old_memberships.data:
        existing = (
            db.table("collection_albums")
            .select("service_id")
            .eq("collection_id", membership["collection_id"])
            .eq("service_id", new_id)
            .execute()
        )
        if not existing.data:
            db.table("collection_albums").upsert(
                {
                    "collection_id": membership["collection_id"],
                    "service_id": new_id,
                    "position": membership["position"],
                    "user_id": user_id,
                }
            ).execute()
    db.table("collection_albums").delete().eq("service_id", old_id).eq("user_id", user_id).execute()


def apply_dedup(db: Client, user_id: str, albums: list[dict]) -> list[dict]:
    """Find cross-ID duplicates, migrate metadata, record dedup, return filtered list."""
    dupes = find_duplicates(albums)
    if not dupes:
        return albums

    loser_ids = set()
    for winner, losers in dupes:
        for loser in losers:
            _migrate_metadata(db, user_id, loser["service_id"], winner["service_id"])
            db.table("deduped_albums").insert(
                {
                    "old_service_id": loser["service_id"],
                    "new_service_id": winner["service_id"],
                    "user_id": user_id,
                }
            ).execute()
            loser_ids.add(loser["service_id"])

    return [a for a in albums if a["service_id"] not in loser_ids]
