import { useEffect, useState } from 'react'
import AlbumTable from './components/AlbumTable'
import CollectionsPane from './components/CollectionsPane'
import PlaybackBar from './components/PlaybackBar'
import NowPlayingPane from './components/NowPlayingPane'
import { filterAlbums } from './filterAlbums'
import { usePlayback } from './usePlayback'
import './App.css'

const API = 'http://127.0.0.1:8000'

export default function App() {
  const [view, setView] = useState('library') // 'library' | 'collections' | collection object
  const [albums, setAlbums] = useState([])
  const [collections, setCollections] = useState([])
  const [collectionAlbums, setCollectionAlbums] = useState([])
  // albumCollectionMap: { [spotify_id]: string[] } — IDs of collections the album belongs to
  const [albumCollectionMap, setAlbumCollectionMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const [paneOpen, setPaneOpen] = useState(false)
  const [playbackMessage, setPlaybackMessage] = useState(null)
  const { state: playback, play, playTrack, pause, previousTrack, nextTrack, setVolume } = usePlayback()
  const nowPlayingAlbum = albums.find(a => a.name === playback.track?.album)
  const nowPlayingSpotifyId = nowPlayingAlbum?.spotify_id ?? null
  const nowPlayingImageUrl = nowPlayingAlbum?.image_url ?? null

  useEffect(() => {
    fetch(`${API}/auth/status`)
      .then(r => r.json())
      .then(({ authenticated }) => {
        if (!authenticated) { window.location.href = `${API}/auth/login`; return }
        return Promise.all([
          fetch(`${API}/library/albums`).then(r => r.json()),
          fetch(`${API}/collections`).then(r => r.json()),
        ]).then(([libraryData, collectionsData]) => {
          setAlbums(libraryData.albums)
          setCollections(collectionsData)
          // Eagerly fetch all collection memberships so albumCollectionMap is
          // populated on first render rather than lazily as the user navigates
          return Promise.all(
            collectionsData.map(col =>
              fetch(`${API}/collections/${col.id}/albums`).then(r => r.json())
            )
          ).then(results => {
            const map = {}
            results.forEach((data, i) => {
              const colId = collectionsData[i].id
              ;(data.albums ?? []).forEach(album => {
                if (!map[album.spotify_id]) map[album.spotify_id] = []
                map[album.spotify_id].push(colId)
              })
            })
            setAlbumCollectionMap(map)
          })
        })
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreateCollection(name) {
    // Optimistic update: add a temporary collection immediately so the UI
    // reflects the new entry without waiting for the network. On success the
    // temp entry is swapped for the real server response. On failure it is
    // removed, leaving state clean.
    const tmpId = `tmp-${Date.now()}`
    const tmpCollection = { id: tmpId, name }
    setCollections(prev => [...prev, tmpCollection])

    try {
      const res = await fetch(`${API}/collections`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Failed to create collection')
      const created = await res.json()
      // Replace the temporary entry with the real one from the server
      setCollections(prev => prev.map(c => c.id === tmpId ? created : c))
    } catch {
      // Rollback: remove the optimistic entry
      setCollections(prev => prev.filter(c => c.id !== tmpId))
    }
  }

  async function handleDeleteCollection(id) {
    // Optimistic update: remove the collection and its album memberships from
    // state immediately. Keep a snapshot of both for rollback if the API call
    // fails, so the UI is never left in a broken / inconsistent state.
    let removedCollection
    setCollections(prev => {
      removedCollection = prev.find(c => c.id === id)
      return prev.filter(c => c.id !== id)
    })

    const prevAlbumCollectionMap = albumCollectionMap
    setAlbumCollectionMap(prev => {
      const next = {}
      for (const [spotifyId, colIds] of Object.entries(prev)) {
        next[spotifyId] = colIds.filter(cid => cid !== id)
      }
      return next
    })

    try {
      const res = await fetch(`${API}/collections/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete collection')
    } catch {
      // Rollback: restore the removed collection and its album memberships
      if (removedCollection) {
        setCollections(prev => [...prev, removedCollection])
      }
      setAlbumCollectionMap(prevAlbumCollectionMap)
    }
  }

  async function handleFetchCollectionAlbums(collectionId) {
    const res = await fetch(`${API}/collections/${collectionId}/albums`)
    const data = await res.json()
    // Update albumCollectionMap with this collection's membership
    if (data.albums) {
      setAlbumCollectionMap(prev => {
        const next = { ...prev }
        data.albums.forEach(album => {
          if (!next[album.spotify_id]) next[album.spotify_id] = []
          if (!next[album.spotify_id].includes(collectionId)) {
            next[album.spotify_id] = [...next[album.spotify_id], collectionId]
          }
        })
        return next
      })
    }
    return data.albums
  }

  async function handleEnterCollection(collection) {
    const res = await fetch(`${API}/collections/${collection.id}/albums`)
    const data = await res.json()
    setCollectionAlbums(data.albums)
    setView(collection)
  }

  async function handleFetchTracks(spotifyId) {
    const res = await fetch(`${API}/library/albums/${spotifyId}/tracks`)
    const data = await res.json()
    return data.tracks
  }

  async function handlePlay(spotifyId) {
    if (playingId === spotifyId && playback.is_playing) {
      await pause()
      return null
    } else {
      const prevPlayingId = playingId
      setPlayingId(spotifyId) // optimistic
      const err = await play(`spotify:album:${spotifyId}`)
      if (err) {
        setPlayingId(prevPlayingId) // revert
        if (err === 'no_device') {
          setPlaybackMessage({ code: 'NO_DEVICE', text: 'No Spotify device found. Open Spotify on any device and try again.' })
          setTimeout(() => setPlaybackMessage(null), 4000)
        }
      }
      return err
    }
  }

  async function handlePlayTrack(trackUri) {
    return await playTrack(trackUri)
  }

  function handleFocusAlbum(spotifyId) {
    if (view !== 'library') {
      setView('library')
      setTimeout(() => {
        const el = document.getElementById(`row-album-${spotifyId}`)
        el?.focus()
        el?.scrollIntoView({ block: 'center' })
      }, 0)
    } else {
      const el = document.getElementById(`row-album-${spotifyId}`)
      el?.focus()
      el?.scrollIntoView({ block: 'center' })
    }
  }

  /**
   * Toggle an album into/out of a collection.
   * add=true  → add album to collection
   * add=false → remove album from collection
   */
  async function handleToggleCollection(spotifyId, collectionId, add) {
    if (add) {
      await fetch(`${API}/collections/${collectionId}/albums`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotify_id: spotifyId }),
      })
      setAlbumCollectionMap(prev => {
        const existing = prev[spotifyId] || []
        if (existing.includes(collectionId)) return prev
        return { ...prev, [spotifyId]: [...existing, collectionId] }
      })
    } else {
      await fetch(`${API}/collections/${collectionId}/albums/${spotifyId}`, { method: 'DELETE' })
      setAlbumCollectionMap(prev => ({
        ...prev,
        [spotifyId]: (prev[spotifyId] || []).filter(id => id !== collectionId),
      }))
    }
  }

  if (error) return <p style={{ padding: '2rem', color: '#f88' }}>Error: {error}</p>

  const isInCollection = view !== 'library' && view !== 'collections'

  return (
    <div className="app" style={paneOpen ? { paddingRight: '300px' } : {}}>
      <header className="app-header">
        <h1>Library</h1>
        <input
          className="search-input"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <nav>
          <button className={view === 'library' ? 'active' : ''} onClick={() => { setView('library'); setSearch('') }}>
            Albums {albums.length ? `(${albums.length})` : ''}
          </button>
          <button className={view === 'collections' || isInCollection ? 'active' : ''} onClick={() => { setView('collections'); setSearch('') }}>
            Collections {collections.length ? `(${collections.length})` : ''}
          </button>
        </nav>
      </header>

      <div className="app-body">
        {view === 'library' && (
          <div className="table-wrap">
            <AlbumTable
              albums={filterAlbums(albums, search)}
              loading={loading}
              onFetchTracks={handleFetchTracks}
              onPlay={handlePlay}
              onPlayTrack={handlePlayTrack}
              playingId={playback.is_playing ? playingId : null}
              playingTrackName={playback.track?.name ?? null}
              collections={collections}
              albumCollectionMap={albumCollectionMap}
              onToggleCollection={handleToggleCollection}
              onCreateCollection={handleCreateCollection}
            />
          </div>
        )}

        {view === 'collections' && (
          <div className="table-wrap">
            <CollectionsPane
              collections={search ? collections.filter(c => {
                const q = search.toLowerCase()
                if (c.name.toLowerCase().includes(q)) return true
                return albums.some(a =>
                  (albumCollectionMap[a.spotify_id] || []).includes(c.id) &&
                  (a.name.toLowerCase().includes(q) ||
                   a.artists.some(artist => artist.toLowerCase().includes(q)))
                )
              }) : collections}
              onEnter={handleEnterCollection}
              onDelete={handleDeleteCollection}
              onCreate={handleCreateCollection}
              onFetchAlbums={handleFetchCollectionAlbums}
            />
          </div>
        )}

        {isInCollection && (
          <div className="collection-detail">
            <div className="collection-detail-header">
              <button onClick={() => setView('collections')}>← Back</button>
              <h2>{view.name}</h2>
              <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{filterAlbums(collectionAlbums, search).length} albums</span>
            </div>
            <div className="table-wrap">
              <AlbumTable
                albums={filterAlbums(collectionAlbums, search)}
                loading={false}
                onFetchTracks={handleFetchTracks}
                onPlay={handlePlay}
                onPlayTrack={handlePlayTrack}
                playingId={playback.is_playing ? playingId : null}
                playingTrackName={playback.track?.name ?? null}
                collections={collections}
                albumCollectionMap={albumCollectionMap}
                onToggleCollection={handleToggleCollection}
                onCreateCollection={handleCreateCollection}
              />
            </div>
          </div>
        )}
      </div>
      <NowPlayingPane
        state={playback}
        open={paneOpen}
        onClose={() => setPaneOpen(false)}
        onFetchTracks={handleFetchTracks}
        albumSpotifyId={nowPlayingSpotifyId}
        albumImageUrl={nowPlayingImageUrl}
        onPlayTrack={handlePlayTrack}
      />
      <PlaybackBar
        state={playback}
        onPlay={play}
        onPause={pause}
        onPrevious={previousTrack}
        onNext={nextTrack}
        onSetVolume={setVolume}
        paneOpen={paneOpen}
        onTogglePane={() => setPaneOpen(p => !p)}
        albumImageUrl={nowPlayingImageUrl}
        message={playbackMessage}
        nowPlayingSpotifyId={nowPlayingSpotifyId}
        onFocusAlbum={handleFocusAlbum}
      />
    </div>
  )
}
