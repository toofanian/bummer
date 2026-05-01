from unittest.mock import MagicMock

from dedup import _dedup_key, _normalize_for_matching, _pick_winner, apply_dedup, find_duplicates


def _mock_db():
    """Mock DB that routes table calls and tracks interactions."""
    db = MagicMock()
    tables = {}

    def table_router(name):
        if name not in tables:
            tables[name] = MagicMock()
            tables[name].select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            tables[name].select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            tables[name].upsert.return_value.execute.return_value = MagicMock(data=[])
            tables[name].insert.return_value.execute.return_value = MagicMock(data=[])
            tables[name].delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return tables[name]

    db.table.side_effect = table_router
    db._tables = tables
    return db


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


def test_apply_dedup_no_duplicates_returns_albums_unchanged():
    db = _mock_db()
    albums = [
        {"service_id": "a", "name": "A", "artists": [{"name": "X", "id": "x"}], "total_tracks": 10, "release_date": "2020", "added_at": "2021-01-01T00:00:00Z"},
    ]
    result = apply_dedup(db, "user1", albums)
    assert result == albums
    db.table.assert_not_called()


def test_apply_dedup_removes_loser_and_records():
    db = _mock_db()
    albums = [
        {"service_id": "old1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo"}], "total_tracks": 17, "release_date": "2016-08-20", "added_at": "2017-01-01T00:00:00Z"},
        {"service_id": "new1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo2"}], "total_tracks": 17, "release_date": "2016-08-20", "added_at": "2023-06-01T00:00:00Z"},
    ]

    result = apply_dedup(db, "user1", albums)

    assert len(result) == 1
    assert result[0]["service_id"] == "new1"

    # Dedup record inserted
    deduped_table = db._tables["deduped_albums"]
    deduped_table.insert.assert_called_once()
    insert_arg = deduped_table.insert.call_args[0][0]
    assert insert_arg["old_service_id"] == "old1"
    assert insert_arg["new_service_id"] == "new1"
    assert insert_arg["user_id"] == "user1"


def test_apply_dedup_migrates_tier():
    db = _mock_db()
    metadata_table = db._tables.setdefault("album_metadata", MagicMock())

    tier_responses = {
        "new1": MagicMock(data=[]),
        "old1": MagicMock(data=[{"service_id": "old1", "tier": "S", "user_id": "user1"}]),
    }

    def select_side_effect(*args, **kwargs):
        eq_mock = MagicMock()
        def eq_service(field, value):
            eq2 = MagicMock()
            def eq_user(field2, value2):
                execute_mock = MagicMock()
                execute_mock.execute.return_value = tier_responses.get(value, MagicMock(data=[]))
                return execute_mock
            eq2.eq.side_effect = eq_user
            return eq2
        eq_mock.eq.side_effect = eq_service
        return eq_mock

    metadata_table.select.side_effect = select_side_effect

    def table_router(name):
        if name == "album_metadata":
            return metadata_table
        if name not in db._tables:
            db._tables[name] = MagicMock()
            db._tables[name].select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            db._tables[name].insert.return_value.execute.return_value = MagicMock(data=[])
            db._tables[name].delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        return db._tables[name]

    db.table.side_effect = table_router

    albums = [
        {"service_id": "old1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo"}], "total_tracks": 17, "release_date": "2016", "added_at": "2017-01-01T00:00:00Z"},
        {"service_id": "new1", "name": "Blonde", "artists": [{"name": "Frank Ocean", "id": "fo2"}], "total_tracks": 17, "release_date": "2016", "added_at": "2023-06-01T00:00:00Z"},
    ]

    result = apply_dedup(db, "user1", albums)
    assert len(result) == 1

    metadata_table.upsert.assert_called_once()
    upsert_arg = metadata_table.upsert.call_args[0][0]
    assert upsert_arg["service_id"] == "new1"
    assert upsert_arg["tier"] == "S"
