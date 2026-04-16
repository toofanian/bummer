import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AlbumTable from './components/AlbumTable'
import CollectionsPane from './components/CollectionsPane'
import CollectionDetailHeader from './components/CollectionDetailHeader'
import PlaybackBar from './components/PlaybackBar'
import NowPlayingPane from './components/NowPlayingPane'
import DigestPanel from './components/DigestPanel'
import { filterAlbums } from './filterAlbums'
import { usePlayback } from './usePlayback'
import DevicePicker from './components/DevicePicker'
import HomePage from './components/HomePage'
import BottomTabBar from './components/BottomTabBar'
import MiniPlaybackBar from './components/MiniPlaybackBar'
import FullScreenNowPlaying from './components/FullScreenNowPlaying'
import ArtistsView from './components/ArtistsView'
import LibraryViewToggle from './components/LibraryViewToggle'
import { useIsMobile } from './hooks/useIsMobile'
import { useAuth } from './hooks/useAuth'
import { useSpotifyAuth } from './hooks/useSpotifyAuth'
import SignupScreen from './components/SignupScreen'
import OnboardingWizard from './components/OnboardingWizard'
import BulkAddBar from './components/BulkAddBar'
import SettingsMenu from './components/SettingsMenu'
import { apiFetch } from './api'
import { IS_PREVIEW } from './previewMode'
const CACHE_KEY = 'bsi_albums_cache'

export default function App() {
  const [view, setView] = useState('home') // 'home' | 'library' | 'collections' | collection object
  const [albums, setAlbums] = useState([])
  const [collections, setCollections] = useState([])
  const [collectionAlbums, setCollectionAlbums] = useState([])
  // albumCollectionMap: { [service_id]: string[] } — IDs of collections the album belongs to
  const [albumCollectionMap, setAlbumCollectionMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [librarySubView, setLibrarySubViewRaw] = useState(() => {
    try {
      const stored = localStorage.getItem('library_view')
      const val = stored === 'artists' ? 'artists' : 'albums'
      localStorage.setItem('library_view', val)
      return val
    } catch { return 'albums' }
  }) // 'albums' | 'artists'
  const setLibrarySubView = (val) => {
    try { localStorage.setItem('library_view', val) } catch {}
    setLibrarySubViewRaw(val)
  }
  const [playingId, setPlayingId] = useState(null)
  const [paneOpen, setPaneOpen] = useState(false)
  const [digestOpen, setDigestOpen] = useState(false)
  const [playbackMessage, setPlaybackMessage] = useState(null)
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const { session, loading: authLoading, logout } = useAuth()
  const spotifyAuth = useSpotifyAuth()

  async function handleLogout() {
    spotifyAuth.logout()
    await logout()
  }
  const sessionRef = useRef(session)
  sessionRef.current = session
  const { state: playback, play, playTrack, pause, previousTrack, nextTrack, setVolume, fetchDevices, fetchQueue, seek, transferPlayback } = usePlayback(session)
  const [pendingPlayIntent, setPendingPlayIntent] = useState(null)
  // Shape: null | { type: 'album'|'track', contextUri?, trackUri?, albumId? }
  const [devicePickerOpen, setDevicePickerOpen] = useState(false)
  const [pickerRestrictedDevice, setPickerRestrictedDevice] = useState(false)
  // Picker is shown when: devicePickerOpen OR pendingPlayIntent !== null
  const isMobile = useIsMobile()
  const [selectedAlbumIds, setSelectedAlbumIds] = useState(new Set())
  const [targetArtist, setTargetArtist] = useState(null)
  // Collection playback: null | { collectionId: string, albumIds: string[], currentIndex: number }
  const [collectionPlayback, setCollectionPlayback] = useState(null)
  const collectionPlaybackRef = useRef(null)
  collectionPlaybackRef.current = collectionPlayback
  const isInCollection = view !== 'home' && view !== 'library' && view !== 'collections'
  const artistCount = useMemo(() => {
    const artists = new Set()
    for (const album of albums) {
      for (const artist of (album.artists ?? [])) {
        artists.add(artist)
      }
    }
    return artists.size
  }, [albums])
  const nowPlayingAlbum = useMemo(() => {
    const trackAlbumServiceId = playback.track?.album_service_id
    if (trackAlbumServiceId) {
      return albums.find(a => a.service_id === trackAlbumServiceId)
    }
    // Fallback (older backend responses without album_service_id)
    return albums.find(a => a.name === playback.track?.album)
  }, [albums, playback.track?.album_service_id, playback.track?.album])
  const nowPlayingServiceId = nowPlayingAlbum?.service_id ?? null
  const nowPlayingImageUrl = nowPlayingAlbum?.image_url ?? null

  // Restore playingId from Spotify playback state on reload
  useEffect(() => {
    if (playingId === null && nowPlayingServiceId && playback.is_playing) {
      setPlayingId(nowPlayingServiceId)
    }
  }, [nowPlayingServiceId, playback.is_playing, playingId])

  const loadData = useCallback(async () => {
    setError(null)
    setCollections([])
    setCollectionAlbums([])
    setAlbumCollectionMap({})

    // 1. Optimistic localStorage render
    const cached = (() => {
      try { return JSON.parse(localStorage.getItem(CACHE_KEY)) } catch { return null }
    })()
    const isColdStart = !(cached?.albums?.length)

    if (!isColdStart) {
      // Warm start: render cached albums immediately, show subtle syncing pulse
      setAlbums(cached.albums)
      setLoading(false)
      setSyncing(true)
    } else {
      // Cold start: loading screen with progress message
      setAlbums([])
      setLoading(true)
      setLoadingMessage('Syncing your library...')
    }

    try {
      // 2. Fetch current Supabase cache state (fast, bounded)
      const cacheResp = await apiFetch('/library/albums', {}, sessionRef.current).then(r => r.json())
      const serverAlbums = cacheResp.albums ?? []

      if (serverAlbums.length > 0) {
        setAlbums(serverAlbums)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            albums: serverAlbums,
            total: serverAlbums.length,
            cachedAt: new Date().toISOString(),
          }))
        } catch { /* storage full or unavailable */ }
      }

      // 3. Drive the sync loop — skip in preview (no real Spotify tokens) unless real Spotify is enabled.
      if (!IS_PREVIEW || previewRealSpotify) {
        setSyncing(true)
        let offset = 0
        let progress = null
        do {
          const resp = await apiFetch('/library/sync', {
            method: 'POST',
            body: JSON.stringify({ offset }),
          }, sessionRef.current).then(r => r.json())
          progress = resp
          if (isColdStart) {
            setLoadingMessage(
              `Syncing ${progress.total_in_cache} of ${progress.spotify_total} albums...`
            )
          }
          offset = progress.next_offset
        } while (!progress.done)

        // 4. Refetch the complete library
        const finalResp = await apiFetch('/library/albums', {}, sessionRef.current).then(r => r.json())
        setAlbums(finalResp.albums ?? [])
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            albums: finalResp.albums ?? [],
            total: (finalResp.albums ?? []).length,
            cachedAt: new Date().toISOString(),
          }))
        } catch { /* storage full or unavailable */ }
      }
      setSyncing(false)

      // 5. Continue to collections fetch
      setLoadingMessage('Loading collections...')
      const collectionsRaw = await apiFetch('/collections', {}, sessionRef.current).then(r => r.json())
      const collectionsData = Array.isArray(collectionsRaw) ? collectionsRaw : []
      setCollections(collectionsData)
      // Eagerly fetch all collection memberships so albumCollectionMap is
      // populated on first render rather than lazily as the user navigates.
      // Individual collection album fetches are non-fatal — a failure yields
      // an empty albums list for that collection rather than crashing the app.
      const results = await Promise.all(
        collectionsData.map(col =>
          apiFetch(`/collections/${col.id}/albums`, {}, sessionRef.current)
            .then(r => r.json())
            .catch(() => ({ albums: [] }))  // silent fallback
        )
      )
      const map = {}
      results.forEach((data, i) => {
        const colId = collectionsData[i].id
        ;(data.albums ?? []).forEach(album => {
          if (!map[album.service_id]) map[album.service_id] = []
          map[album.service_id].push(colId)
        })
      })
      setAlbumCollectionMap(map)
    } catch (err) {
      // If we had cached data, keep it visible and swallow the error — a
      // failed background sync shouldn't wipe a warm UI. On cold start the
      // user has nothing to show, so surface the error so they can retry.
      if (isColdStart) {
        setError(err.message)
      } else {
        console.warn('Background sync failed, keeping cached library:', err)
      }
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [])

  const hasSession = !!session

  // Fire-and-forget: ensure a library snapshot exists for today once the user
  // is authenticated (indicated by albums being loaded and no loading state).
  useEffect(() => {
    if (!loading && albums.length > 0) {
      apiFetch('/digest/ensure-snapshot', { method: 'POST' }, sessionRef.current).catch(() => {})
    }
  }, [loading, albums.length])

  // Clear selection when leaving library view
  useEffect(() => {
    if (view !== 'library') setSelectedAlbumIds(new Set())
  }, [view])

  // Escape key clears selection
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && selectedAlbumIds.size > 0) {
        setSelectedAlbumIds(new Set())
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedAlbumIds.size])

  async function handleCreateCollection(name) {
    // Optimistic update: add a temporary collection immediately so the UI
    // reflects the new entry without waiting for the network. On success the
    // temp entry is swapped for the real server response. On failure it is
    // removed, leaving state clean.
    const tmpId = `tmp-${Date.now()}`
    const tmpCollection = { id: tmpId, name }
    setCollections(prev => [...prev, tmpCollection])

    try {
      const res = await apiFetch('/collections', {
        method: 'POST', body: JSON.stringify({ name }),
      }, sessionRef.current)
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
      for (const [albumId, colIds] of Object.entries(prev)) {
        next[albumId] = colIds.filter(cid => cid !== id)
      }
      return next
    })

    try {
      const res = await apiFetch(`/collections/${id}`, { method: 'DELETE' }, sessionRef.current)
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
    const res = await apiFetch(`/collections/${collectionId}/albums`, {}, sessionRef.current)
    const data = await res.json()
    // Update albumCollectionMap with this collection's membership
    if (data.albums) {
      setAlbumCollectionMap(prev => {
        const next = { ...prev }
        data.albums.forEach(album => {
          if (!next[album.service_id]) next[album.service_id] = []
          if (!next[album.service_id].includes(collectionId)) {
            next[album.service_id] = [...next[album.service_id], collectionId]
          }
        })
        return next
      })
    }
    return data.albums
  }

  async function handleEnterCollection(collection) {
    const res = await apiFetch(`/collections/${collection.id}/albums`, {}, sessionRef.current)
    const data = await res.json()
    setCollectionAlbums(data.albums)
    setView(collection)
  }

  const handleFetchTracks = useCallback(async (albumId) => {
    const res = await apiFetch(`/library/albums/${albumId}/tracks`, {}, sessionRef.current)
    const data = await res.json()
    return data.tracks
  }, [])

  const playingIdRef = useRef(playingId)
  playingIdRef.current = playingId
  const isPlayingRef = useRef(playback.is_playing)
  isPlayingRef.current = playback.is_playing

  const serviceType = localStorage.getItem('music_service_type') || 'spotify'

  const handlePlay = useCallback(async (albumId) => {
    // Apple Music: deep-link to the native app instead of controlling playback
    if (serviceType === 'apple_music') {
      const album = albums.find(a => a.service_id === albumId) ||
                    collectionAlbums.find(a => a.service_id === albumId)
      const url = album?.catalog_url || `https://music.apple.com/album/${albumId}`
      window.open(url, '_blank')
      // Log the play intent for history/recommendations
      apiFetch('/home/history/log', {
        method: 'POST',
        body: JSON.stringify({ album_id: albumId }),
      }, sessionRef.current).catch(() => {})
      return null
    }

    // Spotify: existing playback control via backend
    if (playingIdRef.current === albumId && isPlayingRef.current) {
      await pause()
      return null
    } else {
      const contextUri = `spotify:album:${albumId}`
      const prevPlayingId = playingIdRef.current
      setPlayingId(albumId) // optimistic
      const err = await play(contextUri)
      if (err) {
        setPlayingId(prevPlayingId) // revert
        if (err === 'no_device') {
          setPendingPlayIntent({ type: 'album', contextUri, albumId })
          setDevicePickerOpen(true)
        } else if (err === 'restricted_device') {
          setPlaybackMessage({ code: 'RESTRICTED', text: 'This device restricts API playback. Start playing in Spotify first, then control it here.' })
          setTimeout(() => setPlaybackMessage(null), 6000)
        }
      }
      if (!err) {
        apiFetch('/home/history/log', {
          method: 'POST',
          body: JSON.stringify({ album_id: albumId }),
        }, sessionRef.current).catch(() => {})
      }
      return err
    }
  }, [play, pause, serviceType, albums, collectionAlbums])

  const handlePlayRef = useRef(handlePlay)
  handlePlayRef.current = handlePlay

  async function handlePlayCollection() {
    if (!isInCollection || !collectionAlbums.length) return
    const albumIds = collectionAlbums.map(a => a.service_id)
    setCollectionPlayback({ collectionId: view.id, albumIds, currentIndex: 0 })
    await handlePlay(albumIds[0])
  }

  const handleModalDeviceSelected = useCallback(async (deviceId) => {
    const intent = pendingPlayIntent
    if (!intent) return

    await transferPlayback(deviceId)

    let err
    if (intent.type === 'album') {
      const prevPlayingId = playingIdRef.current
      setPlayingId(intent.albumId)
      err = await play(intent.contextUri)
      if (err) {
        setPlayingId(prevPlayingId)
      }
    } else if (intent.type === 'track') {
      err = await playTrack(intent.trackUri)
    }

    if (err === 'no_device') {
      // Reopen picker with same intent
      setPendingPlayIntent(intent)
      setDevicePickerOpen(true)
    } else if (err === 'restricted_device') {
      setPickerRestrictedDevice(true)
      // Keep picker open with same intent
      setPendingPlayIntent(intent)
      setDevicePickerOpen(true)
    } else {
      // Success
      setDevicePickerOpen(false)
      setPendingPlayIntent(null)
      setPickerRestrictedDevice(false)
    }
  }, [pendingPlayIntent, transferPlayback, play, playTrack])

  const handlePlayTrack = useCallback(async (trackUri) => {
    const err = await playTrack(trackUri)
    if (err === 'no_device') {
      setPendingPlayIntent({ type: 'track', trackUri })
      setDevicePickerOpen(true)
    }
    return err
  }, [playTrack])

  function handleArtistClick(artistName) {
    setView('library')
    setLibrarySubView('artists')
    setTargetArtist(artistName)
  }

  function handleFocusAlbum(albumId) {
    if (view !== 'library') {
      setView('library')
      setTimeout(() => {
        const el = document.getElementById(`row-album-${albumId}`)
        el?.focus()
        el?.scrollIntoView({ block: 'center' })
      }, 0)
    } else {
      const el = document.getElementById(`row-album-${albumId}`)
      el?.focus()
      el?.scrollIntoView({ block: 'center' })
    }
  }

  /**
   * Toggle an album into/out of a collection.
   * add=true  → add album to collection
   * add=false → remove album from collection
   */
  const handleToggleCollection = useCallback(async (albumId, collectionId, add) => {
    if (add) {
      await apiFetch(`/collections/${collectionId}/albums`, {
        method: 'POST',
        body: JSON.stringify({ service_id: albumId }),
      }, sessionRef.current)
      setAlbumCollectionMap(prev => {
        const existing = prev[albumId] || []
        if (existing.includes(collectionId)) return prev
        return { ...prev, [albumId]: [...existing, collectionId] }
      })
    } else {
      await apiFetch(`/collections/${collectionId}/albums/${albumId}`, { method: 'DELETE' }, sessionRef.current)
      setAlbumCollectionMap(prev => ({
        ...prev,
        [albumId]: (prev[albumId] || []).filter(id => id !== collectionId),
      }))
    }
  }, [])

  async function handleReorderCollectionAlbums(albumIds) {
    // Optimistic reorder: rearrange collectionAlbums to match the new order
    const albumMap = Object.fromEntries(collectionAlbums.map(a => [a.service_id, a]))
    setCollectionAlbums(albumIds.map(id => albumMap[id]).filter(Boolean))

    try {
      const res = await apiFetch(`/collections/${view.id}/albums/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ album_ids: albumIds }),
      }, sessionRef.current)
      if (!res.ok) throw new Error('Failed to reorder')
    } catch {
      // Re-fetch server order on failure
      const res = await apiFetch(`/collections/${view.id}/albums`, {}, sessionRef.current)
      const data = await res.json()
      setCollectionAlbums(data.albums)
    }
  }

  async function handleUpdateCollectionDescription(collectionId, description) {
    await apiFetch(`/collections/${collectionId}/description`, {
      method: 'PUT',
      body: JSON.stringify({ description }),
    }, sessionRef.current)
    setCollections(prev => prev.map(c =>
      c.id === collectionId ? { ...c, description } : c
    ))
  }

  function handleToggleSelect(albumId) {
    setSelectedAlbumIds(prev => {
      const next = new Set(prev)
      if (next.has(albumId)) next.delete(albumId)
      else next.add(albumId)
      return next
    })
  }

  function handleClearSelection() {
    setSelectedAlbumIds(new Set())
  }

  async function handleBulkAdd(collectionId) {
    const ids = [...selectedAlbumIds]
    await apiFetch(`/collections/${collectionId}/albums/bulk`, {
      method: 'POST',
      body: JSON.stringify({ service_ids: ids }),
    }, sessionRef.current)
    // Update albumCollectionMap
    setAlbumCollectionMap(prev => {
      const next = { ...prev }
      ids.forEach(id => {
        if (!next[id]) next[id] = []
        if (!next[id].includes(collectionId)) {
          next[id] = [...next[id], collectionId]
        }
      })
      return next
    })
    // Update collection album count
    setCollections(prev => prev.map(c =>
      c.id === collectionId ? { ...c, album_count: (c.album_count || 0) + ids.length } : c
    ))
    setSelectedAlbumIds(new Set())
  }

  // Auto-advance to next album when current album finishes in collection playback
  useEffect(() => {
    const cp = collectionPlaybackRef.current
    if (!cp) return

    const currentAlbumId = cp.albumIds[cp.currentIndex]
    const currentAlbum = albums.find(a => a.service_id === currentAlbumId) ||
                         collectionAlbums.find(a => a.service_id === currentAlbumId)
    if (!currentAlbum) return

    const playbackAlbumServiceId = playback.track?.album_service_id
    const playbackAlbumName = playback.track?.album
    const isCurrentAlbumPlaying = playbackAlbumServiceId
      ? playbackAlbumServiceId === currentAlbum.service_id
      : playbackAlbumName === currentAlbum.name

    if (!isCurrentAlbumPlaying && playingIdRef.current === currentAlbumId) {
      const nextIndex = cp.currentIndex + 1
      if (nextIndex < cp.albumIds.length) {
        setCollectionPlayback(prev => prev ? { ...prev, currentIndex: nextIndex } : null)
        handlePlayRef.current(cp.albumIds[nextIndex])
      } else {
        setCollectionPlayback(null)
      }
    }
  }, [playback.track?.album_service_id, playback.track?.album, playback.is_playing])

  // Clear collection playback if we navigate to a different collection
  useEffect(() => {
    if (collectionPlayback && isInCollection && view.id !== collectionPlayback.collectionId) {
      setCollectionPlayback(null)
    }
  }, [view])

  // Auth gate
  const isSpotifyCallback = window.location.pathname === '/auth/spotify/callback'
  const hasLocalClientId = !!localStorage.getItem('spotify_client_id')
  const previewRealSpotify = IS_PREVIEW && import.meta.env.VITE_PREVIEW_REAL_SPOTIFY === 'true'
  // Onboarding check state: 'idle' | 'checking' | 'needs_onboarding' | 'reconnecting' | 'ready'
  const [onboardingCheckState, setOnboardingCheckState] = useState(() => {
    if (IS_PREVIEW && !previewRealSpotify) return 'ready' // Preview deploys skip onboarding (unless real Spotify is enabled)
    if (!session) return 'idle'
    if (isSpotifyCallback) return 'needs_onboarding' // OnboardingWizard handles callback
    if (hasLocalClientId) return 'ready'
    return 'checking'
  })

  // Transition from 'idle' once session arrives
  useEffect(() => {
    if (IS_PREVIEW && !previewRealSpotify) return
    if (onboardingCheckState !== 'idle' || !session) return
    if (isSpotifyCallback) {
      setOnboardingCheckState('needs_onboarding')
    } else if (hasLocalClientId) {
      setOnboardingCheckState('ready')
    } else {
      setOnboardingCheckState('checking')
    }
  }, [onboardingCheckState, session, isSpotifyCallback, hasLocalClientId])

  useEffect(() => {
    if (IS_PREVIEW && !previewRealSpotify) return
    if (onboardingCheckState !== 'checking' || !session) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/auth/spotify-status', {}, session)
        if (cancelled) return
        if (!res.ok) {
          setOnboardingCheckState('needs_onboarding')
          return
        }
        const data = await res.json()
        if (data.has_credentials && data.client_id) {
          localStorage.setItem('spotify_client_id', data.client_id)
          setOnboardingCheckState('reconnecting')
          try {
            await spotifyAuth.initiateLogin()
          } catch {
            if (!cancelled) setOnboardingCheckState('needs_onboarding')
          }
        } else {
          setOnboardingCheckState('needs_onboarding')
        }
      } catch {
        if (!cancelled) setOnboardingCheckState('needs_onboarding')
      }
    })()
    return () => { cancelled = true }
  }, [onboardingCheckState, session, spotifyAuth])

  // Re-run when session becomes available AND onboarding is complete
  useEffect(() => {
    if (hasSession && onboardingCheckState === 'ready') loadData()
  }, [loadData, hasSession, onboardingCheckState])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <SignupScreen />
  }

  if (onboardingCheckState === 'checking' || onboardingCheckState === 'reconnecting') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading…</div>
      </div>
    )
  }

  if (onboardingCheckState === 'needs_onboarding' || isSpotifyCallback) {
    return (
      <OnboardingWizard
        session={session}
        onComplete={() => window.location.reload()}
      />
    )
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4">
      <div className="w-9 h-9 border-[3px] border-border border-t-accent rounded-full animate-spin" />
      {loadingMessage && <p className="text-sm text-text-dim">{loadingMessage}</p>}
    </div>
  )

  if (error) return (
    <div className="p-8">
      <p className="text-[#f88]">Error: {error}</p>
      <button
        onClick={loadData}
        disabled={loading}
        className="mt-4 px-5 py-2 bg-surface-2 text-text border border-border rounded-lg text-base disabled:text-text-dim disabled:cursor-default transition-colors duration-150 hover:bg-hover"
      >
        {loading ? 'Loading…' : 'Retry'}
      </button>
    </div>
  )

  // Mobile layout
  if (isMobile) {
    return (
      <div className="app flex flex-col h-dvh">
        <header className="bg-surface border-b border-border flex items-center px-4 py-2 gap-3" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <h1>
            {view === 'home' ? 'Home' : view === 'library' ? 'Library' : view === 'collections' ? 'Collections' : view?.name ?? 'Collection'}
            {' '}<span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.35, letterSpacing: '0.05em' }}>{__APP_VERSION__}</span>
          </h1>
          {view === 'library' && (
            <LibraryViewToggle
              activeView={librarySubView}
              onViewChange={setLibrarySubView}
              albumCount={albums.length}
              artistCount={artistCount}
            />
          )}
          {(view === 'library' || view === 'collections' || isInCollection) && (
            <input
              className="flex-1 bg-surface-2 text-text border border-border rounded px-2.5 py-1 text-sm"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          )}
          <SettingsMenu onLogout={handleLogout} session={session} />
        </header>

        <div data-testid="mobile-content-area" className="flex-1 overflow-hidden flex flex-col" style={{ paddingBottom: playback.track ? 'calc(106px + env(safe-area-inset-bottom, 0px))' : 'calc(50px + env(safe-area-inset-bottom, 0px))' }}>
          {view === 'home' && (
            <div className="flex-1 overflow-y-auto">
              <HomePage onPlay={handlePlay} session={session} />
            </div>
          )}

          {view === 'library' && (
            <div className="flex-1 overflow-y-auto">
              {librarySubView === 'albums' ? (
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
                  selectable
                  selectedIds={selectedAlbumIds}
                  onToggleSelect={handleToggleSelect}
                  onArtistClick={handleArtistClick}
                />
              ) : (
                <ArtistsView
                  albums={albums}
                  search={search}
                  onFetchTracks={handleFetchTracks}
                  onPlay={handlePlay}
                  onPlayTrack={handlePlayTrack}
                  playingId={playback.is_playing ? playingId : null}
                  playingTrackName={playback.track?.name ?? null}
                  collections={collections}
                  albumCollectionMap={albumCollectionMap}
                  onToggleCollection={handleToggleCollection}
                  onCreateCollection={handleCreateCollection}
                  targetArtist={targetArtist}
                  onClearTargetArtist={() => setTargetArtist(null)}
                />
              )}
            </div>
          )}

          {view === 'collections' && (
            <div className="flex-1 overflow-y-auto">
              <CollectionsPane
                collections={search ? collections.filter(c => {
                  const q = search.toLowerCase()
                  if (c.name.toLowerCase().includes(q)) return true
                  return albums.some(a =>
                    (albumCollectionMap[a.service_id] || []).includes(c.id) &&
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
            <div className="flex flex-col flex-1 overflow-hidden">
              <CollectionDetailHeader
                name={view.name}
                description={view.description ?? null}
                albumCount={filterAlbums(collectionAlbums, search).length}
                onBack={() => setView('collections')}
                onDescriptionChange={(desc) => handleUpdateCollectionDescription(view.id, desc)}
                onPlay={handlePlayCollection}
              />
              <div className="flex-1 overflow-y-auto">
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
                  reorderable
                  onReorder={handleReorderCollectionAlbums}
                  onArtistClick={handleArtistClick}
                />
              </div>
            </div>
          )}
        </div>

        {selectedAlbumIds.size > 0 && (
          <BulkAddBar
            selectedCount={selectedAlbumIds.size}
            collections={collections}
            onAddToCollection={handleBulkAdd}
            onClear={handleClearSelection}
          />
        )}

        <FullScreenNowPlaying
          open={nowPlayingOpen}
          onClose={() => setNowPlayingOpen(false)}
          state={playback}
          onPlay={play}
          onPause={pause}
          onPrevious={previousTrack}
          onNext={nextTrack}
          onSetVolume={setVolume}
          onFetchTracks={handleFetchTracks}
          onPlayTrack={handlePlayTrack}
          albumServiceId={nowPlayingServiceId}
          albumImageUrl={nowPlayingImageUrl}
          onFetchDevices={fetchDevices}
          onTransferPlayback={transferPlayback}
          onOpenDevicePicker={() => { setDevicePickerOpen(true); setPickerRestrictedDevice(false) }}
          onSeek={seek}
          onFetchQueue={fetchQueue}
        />

        <MiniPlaybackBar
          state={playback}
          albumImageUrl={nowPlayingImageUrl}
          onPlayPause={() => playback.is_playing ? pause() : play()}
          onExpand={() => setNowPlayingOpen(true)}
          onFetchDevices={fetchDevices}
          onTransferPlayback={transferPlayback}
          onOpenDevicePicker={() => { setDevicePickerOpen(true); setPickerRestrictedDevice(false) }}
        />

        <BottomTabBar
          activeTab={view === 'home' || view === 'library' || view === 'collections' ? view : 'collections'}
          onTabChange={(tab) => {
            if (tab === 'digest') {
              setDigestOpen(d => !d)
            } else {
              setView(tab)
              setSearch('')
            }
          }}
        />

        <DigestPanel open={digestOpen} onClose={() => setDigestOpen(false)} onPlay={handlePlay} session={session} />
        {(devicePickerOpen || pendingPlayIntent) && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={() => { setDevicePickerOpen(false); setPendingPlayIntent(null); setPickerRestrictedDevice(false) }} />
            <div className="relative z-[401] w-[280px]">
              <DevicePicker
                onClose={() => { setDevicePickerOpen(false); setPendingPlayIntent(null); setPickerRestrictedDevice(false) }}
                onFetchDevices={fetchDevices}
                onDeviceSelected={handleModalDeviceSelected}
                restrictedDevice={pickerRestrictedDevice}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Desktop layout
  return (
    <div className="app flex flex-col h-dvh" style={(paneOpen || digestOpen) && !isMobile ? { paddingRight: digestOpen ? '340px' : '300px' } : {}}>
      <header className="h-14 bg-surface border-b border-border flex items-center px-5 gap-6">
        <h1>Bummer<span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.35, letterSpacing: '0.05em' }}>{__APP_VERSION__}</span></h1>
        <nav className="flex gap-1">
          <button
            className={`bg-transparent border-none text-sm cursor-pointer px-3 py-1.5 rounded transition-colors duration-150 hover:text-text hover:bg-hover${view === 'home' ? ' active text-text border-b-2 border-accent' : ' text-text-dim'}`}
            onClick={() => { setView('home'); setSearch('') }}
          >
            Home
          </button>
          <button
            className={`bg-transparent border-none text-sm cursor-pointer px-3 py-1.5 rounded transition-colors duration-150 hover:text-text hover:bg-hover${view === 'library' ? ' active text-text border-b-2 border-accent' : ' text-text-dim'}`}
            onClick={() => { setView('library'); setSearch('') }}
          >
            <span className={syncing ? 'animate-pulse' : undefined}>Library</span>
          </button>
          {view === 'library' && (
            <LibraryViewToggle
              activeView={librarySubView}
              onViewChange={setLibrarySubView}
              albumCount={albums.length}
              artistCount={artistCount}
            />
          )}
          <button
            className={`bg-transparent border-none text-sm cursor-pointer px-3 py-1.5 rounded transition-colors duration-150 hover:text-text hover:bg-hover${view === 'collections' || isInCollection ? ' active text-text border-b-2 border-accent' : ' text-text-dim'}`}
            onClick={() => { setView('collections'); setSearch('') }}
          >
            Collections
          </button>
        </nav>
        <input
          className="ml-auto w-48 bg-surface-2 text-text border border-border rounded px-2.5 py-1 text-sm"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          onClick={() => {
            setDigestOpen(d => {
              if (!d) setPaneOpen(false) // close NowPlaying when opening digest
              return !d
            })
          }}
          aria-label="Library digest"
          className="bg-transparent border-none text-text-dim p-1.5 cursor-pointer hover:text-text transition-colors duration-150"
          title="Library Digest"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="2" y="1" width="12" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <SettingsMenu onLogout={handleLogout} session={session} />
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {view === 'home' && (
          <div className="flex-1 overflow-y-auto pb-16">
            <HomePage onPlay={handlePlay} session={session} />
          </div>
        )}

        {view === 'library' && (
          <div className="flex-1 overflow-y-auto pb-16">
            {librarySubView === 'albums' ? (
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
                selectable
                selectedIds={selectedAlbumIds}
                onToggleSelect={handleToggleSelect}
                onArtistClick={handleArtistClick}
              />
            ) : (
              <ArtistsView
                albums={albums}
                search={search}
                onFetchTracks={handleFetchTracks}
                onPlay={handlePlay}
                onPlayTrack={handlePlayTrack}
                playingId={playback.is_playing ? playingId : null}
                playingTrackName={playback.track?.name ?? null}
                collections={collections}
                albumCollectionMap={albumCollectionMap}
                onToggleCollection={handleToggleCollection}
                onCreateCollection={handleCreateCollection}
                targetArtist={targetArtist}
                onClearTargetArtist={() => setTargetArtist(null)}
              />
            )}
          </div>
        )}

        {view === 'collections' && (
          <div className="flex-1 overflow-y-auto pb-16">
            <CollectionsPane
              collections={search ? collections.filter(c => {
                const q = search.toLowerCase()
                if (c.name.toLowerCase().includes(q)) return true
                return albums.some(a =>
                  (albumCollectionMap[a.service_id] || []).includes(c.id) &&
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
          <div className="flex flex-col flex-1 overflow-hidden">
            <CollectionDetailHeader
              name={view.name}
              description={view.description ?? null}
              albumCount={filterAlbums(collectionAlbums, search).length}
              onBack={() => setView('collections')}
              onDescriptionChange={(desc) => handleUpdateCollectionDescription(view.id, desc)}
              onPlay={handlePlayCollection}
            />
            <div className="flex-1 overflow-y-auto pb-16">
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
                reorderable
                onReorder={handleReorderCollectionAlbums}
                onArtistClick={handleArtistClick}
              />
            </div>
          </div>
        )}
      </div>
      {selectedAlbumIds.size > 0 && (
        <BulkAddBar
          selectedCount={selectedAlbumIds.size}
          collections={collections}
          onAddToCollection={handleBulkAdd}
          onClear={handleClearSelection}
        />
      )}
      <NowPlayingPane
        state={playback}
        open={paneOpen}
        onClose={() => setPaneOpen(false)}
        onFetchTracks={handleFetchTracks}
        albumServiceId={nowPlayingServiceId}
        albumImageUrl={nowPlayingImageUrl}
        onPlayTrack={handlePlayTrack}
        onFetchQueue={fetchQueue}
      />
      <DigestPanel
        open={digestOpen}
        onClose={() => setDigestOpen(false)}
        onPlay={handlePlay}
        session={session}
      />
      <PlaybackBar
        state={playback}
        onPlay={play}
        onPause={pause}
        onPrevious={previousTrack}
        onNext={nextTrack}
        onSetVolume={setVolume}
        onSeek={seek}
        paneOpen={paneOpen}
        onTogglePane={() => {
          setPaneOpen(p => {
            if (!p) setDigestOpen(false) // close digest when opening NowPlaying
            return !p
          })
        }}
        albumImageUrl={nowPlayingImageUrl}
        message={playbackMessage}
        nowPlayingServiceId={nowPlayingServiceId}
        onFocusAlbum={handleFocusAlbum}
        onFetchDevices={fetchDevices}
        onTransferPlayback={transferPlayback}
        onOpenDevicePicker={() => { setDevicePickerOpen(true); setPickerRestrictedDevice(false) }}
      />
      {(devicePickerOpen || pendingPlayIntent) && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setDevicePickerOpen(false); setPendingPlayIntent(null); setPickerRestrictedDevice(false) }} />
          <div className="relative z-[401] w-[280px]">
            <DevicePicker
              onClose={() => { setDevicePickerOpen(false); setPendingPlayIntent(null); setPickerRestrictedDevice(false) }}
              onFetchDevices={fetchDevices}
              onDeviceSelected={handleModalDeviceSelected}
              restrictedDevice={pickerRestrictedDevice}
            />
          </div>
        </div>
      )}
    </div>
  )
}
