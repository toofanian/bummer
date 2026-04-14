import { useState, useEffect } from 'react'
import AlbumRow from './AlbumRow'
import { apiFetch } from '../api'

function AlwaysRow({ title, albums, onPlay }) {
  if (albums && albums.length > 0) {
    return <AlbumRow title={title} albums={albums} onPlay={onPlay} />
  }
  return (
    <section className="mb-6 md:mb-8">
      <h2 className="text-xl font-bold mb-4 text-text">{title}</h2>
      <p className="text-sm text-text-dim italic">Nothing yet</p>
    </section>
  )
}

function mergeRecentlyPlayed(today, thisWeek) {
  const seen = new Set()
  const merged = []
  for (const album of [...today, ...thisWeek]) {
    if (!seen.has(album.spotify_id)) {
      seen.add(album.spotify_id)
      merged.push(album)
    }
  }
  return merged
}

export default function HomePage({ onPlay, session }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    apiFetch(`/home?tz=${encodeURIComponent(tz)}`, {}, session)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <p className="p-6 text-text-dim">Loading...</p>

  const recentlyPlayed = data ? mergeRecentlyPlayed(data.today, data.this_week) : []
  const recentlyAdded = data?.recently_added ?? []

  const isEmpty = data &&
    recentlyPlayed.length === 0 &&
    recentlyAdded.length === 0 &&
    data.rediscover.length === 0 &&
    data.recommended.length === 0

  if (!data || isEmpty) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-text-dim text-base">
        <p>Start playing albums to see your listening history here.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:px-6 md:py-4">
      <AlwaysRow title="Recently Played" albums={recentlyPlayed} onPlay={onPlay} />
      <AlwaysRow title="Recently Added" albums={recentlyAdded} onPlay={onPlay} />
      <AlbumRow title="You Might Like" albums={data.recommended} onPlay={onPlay} />
      <AlbumRow title="Rediscover" albums={data.rediscover} onPlay={onPlay} />
    </div>
  )
}
