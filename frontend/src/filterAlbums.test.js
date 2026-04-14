import { filterAlbums } from './filterAlbums'

const ALBUMS = [
  { spotify_id: '1', name: 'Love Deluxe', artists: ['Sade'] },
  { spotify_id: '2', name: 'Room On Fire', artists: ['The Strokes'] },
  { spotify_id: '3', name: 'Promises', artists: ['Sade', 'Floating Points'] },
]

test('returns all albums when query is empty', () => {
  expect(filterAlbums(ALBUMS, '')).toHaveLength(3)
})

test('filters by album name (case-insensitive)', () => {
  expect(filterAlbums(ALBUMS, 'love')).toEqual([ALBUMS[0]])
})

test('filters by artist name (case-insensitive)', () => {
  expect(filterAlbums(ALBUMS, 'sade')).toEqual([ALBUMS[0], ALBUMS[2]])
})

test('matches partial words', () => {
  expect(filterAlbums(ALBUMS, 'strok')).toEqual([ALBUMS[1]])
})

test('returns empty array when nothing matches', () => {
  expect(filterAlbums(ALBUMS, 'zzz')).toEqual([])
})
