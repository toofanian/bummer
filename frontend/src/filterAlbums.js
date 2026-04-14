export function filterAlbums(albums, query) {
  if (!query) return albums
  const q = query.toLowerCase()
  return albums.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.artists.some(artist => artist.toLowerCase().includes(q))
  )
}
