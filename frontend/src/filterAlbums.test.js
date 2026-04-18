import { filterAlbums } from './filterAlbums'

const ALBUMS = [
  { service_id: '1', name: 'Love Deluxe', artists: ['Sade'] },
  { service_id: '2', name: 'Room On Fire', artists: ['The Strokes'] },
  { service_id: '3', name: 'Promises', artists: ['Sade', 'Floating Points'] },
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

test('returns empty array when albums is null or undefined', () => {
  expect(filterAlbums(null, 'sade')).toEqual([])
  expect(filterAlbums(undefined, 'sade')).toEqual([])
  expect(filterAlbums(null, '')).toEqual([])
})
