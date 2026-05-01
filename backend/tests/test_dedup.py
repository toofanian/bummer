from dedup import _dedup_key, _normalize_for_matching, _pick_winner, find_duplicates


def test_normalize_strips_whitespace_and_lowercases():
    assert _normalize_for_matching("  Led Zeppelin  ") == "led zeppelin"


def test_normalize_handles_empty_string():
    assert _normalize_for_matching("") == ""


def test_dedup_key_uses_first_artist_name_album_name_track_count():
    album = {
        "service_id": "abc",
        "name": "Abbey Road",
        "artists": [{"name": "The Beatles", "id": "art1"}],
        "total_tracks": 17,
    }
    assert _dedup_key(album) == ("the beatles", "abbey road", 17)


def test_dedup_key_with_string_artists():
    album = {
        "service_id": "abc",
        "name": "Abbey Road",
        "artists": ["The Beatles"],
        "total_tracks": 17,
    }
    assert _dedup_key(album) == ("the beatles", "abbey road", 17)


def test_dedup_key_multiple_artists_uses_first():
    album = {
        "service_id": "abc",
        "name": "Watch the Throne",
        "artists": [
            {"name": "JAY-Z", "id": "a1"},
            {"name": "Kanye West", "id": "a2"},
        ],
        "total_tracks": 12,
    }
    assert _dedup_key(album) == ("jay-z", "watch the throne", 12)


def test_pick_winner_prefers_later_release_date():
    old = {"service_id": "old1", "release_date": "2020-01-01", "added_at": "2022-06-01T00:00:00Z"}
    new = {"service_id": "new1", "release_date": "2023-01-01", "added_at": "2021-01-01T00:00:00Z"}
    winner, losers = _pick_winner([old, new])
    assert winner["service_id"] == "new1"
    assert [l["service_id"] for l in losers] == ["old1"]


def test_pick_winner_uses_added_at_as_tiebreaker():
    a = {"service_id": "a1", "release_date": "2020-01-01", "added_at": "2022-01-01T00:00:00Z"}
    b = {"service_id": "b1", "release_date": "2020-01-01", "added_at": "2023-06-01T00:00:00Z"}
    winner, losers = _pick_winner([a, b])
    assert winner["service_id"] == "b1"
    assert [l["service_id"] for l in losers] == ["a1"]


def test_pick_winner_handles_partial_release_dates():
    old = {"service_id": "old1", "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"}
    new = {"service_id": "new1", "release_date": "2023", "added_at": "2022-01-01T00:00:00Z"}
    winner, losers = _pick_winner([old, new])
    assert winner["service_id"] == "new1"


def test_pick_winner_three_albums_picks_newest():
    a = {"service_id": "a", "release_date": "2018", "added_at": "2019-01-01T00:00:00Z"}
    b = {"service_id": "b", "release_date": "2023", "added_at": "2023-06-01T00:00:00Z"}
    c = {"service_id": "c", "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"}
    winner, losers = _pick_winner([a, b, c])
    assert winner["service_id"] == "b"
    assert len(losers) == 2


def test_find_duplicates_returns_empty_for_no_dupes():
    albums = [
        {"service_id": "a", "name": "Album A", "artists": [{"name": "X", "id": "x"}], "total_tracks": 10, "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"},
        {"service_id": "b", "name": "Album B", "artists": [{"name": "Y", "id": "y"}], "total_tracks": 8, "release_date": "2019", "added_at": "2020-01-01T00:00:00Z"},
    ]
    assert find_duplicates(albums) == []


def test_find_duplicates_detects_same_artist_name_tracks():
    old = {"service_id": "old1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo"}], "total_tracks": 17, "release_date": "2016-08-20", "added_at": "2017-01-01T00:00:00Z"}
    new = {"service_id": "new1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo2"}], "total_tracks": 17, "release_date": "2016-08-20", "added_at": "2023-06-01T00:00:00Z"}
    unrelated = {"service_id": "u1", "name": "Channel Orange", "artists": [{"name": "Frank Ocean", "id": "fo"}], "total_tracks": 17, "release_date": "2012", "added_at": "2013-01-01T00:00:00Z"}

    results = find_duplicates([old, new, unrelated])

    assert len(results) == 1
    winner, losers = results[0]
    assert winner["service_id"] == "new1"
    assert [l["service_id"] for l in losers] == ["old1"]


def test_find_duplicates_ignores_different_track_counts():
    """Same artist+name but different track count = not a duplicate (deluxe edition)."""
    standard = {"service_id": "s1", "name": "Rumours", "artists": ["Fleetwood Mac"], "total_tracks": 11, "release_date": "1977", "added_at": "2020-01-01T00:00:00Z"}
    deluxe = {"service_id": "d1", "name": "Rumours", "artists": ["Fleetwood Mac"], "total_tracks": 22, "release_date": "2013", "added_at": "2020-06-01T00:00:00Z"}

    assert find_duplicates([standard, deluxe]) == []
