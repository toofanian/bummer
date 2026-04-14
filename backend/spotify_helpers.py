import spotipy


def fetch_all_albums(sp: spotipy.Spotify):
    """Fetch all saved albums from Spotify, handling pagination.

    Returns (items, total) where items is a list of raw Spotify album objects
    and total is the user's total saved album count.
    """
    all_items = []
    total = None
    offset = 0
    limit = 50

    while total is None or offset < total:
        result = sp.current_user_saved_albums(limit=limit, offset=offset)
        total = result["total"]
        all_items.extend(result["items"])
        offset += len(result["items"])
        if not result["next"]:
            break

    return all_items, total
