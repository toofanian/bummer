from collections import defaultdict


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
