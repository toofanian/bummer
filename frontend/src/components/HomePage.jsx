import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../api'
import { useIsMobile } from '../hooks/useIsMobile'
import TabBar from './TabBar'

const BATCH_SIZE = 30

function AlbumList({ albums, onPlay }) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => {
    setVisibleCount(BATCH_SIZE)
  }, [albums])

  const handleIntersect = useCallback((entries) => {
    if (entries[0].isIntersecting) {
      setVisibleCount(prev => Math.min(prev + BATCH_SIZE, albums.length))
    }
  }, [albums.length])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(handleIntersect, { threshold: 0 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleIntersect])

  if (!albums || albums.length === 0) {
    return <div className="px-4 py-6 text-text-dim text-sm italic">Nothing yet</div>
  }

  const visible = albums.slice(0, visibleCount)
  const hasMore = visibleCount < albums.length

  return (
    <div className="grid grid-cols-3 gap-1 pt-0 px-2 pb-2">
      {visible.map(album => (
        <div
          key={album.service_id}
          data-testid={`album-item-${album.service_id}`}
          onClick={() => onPlay(album.service_id)}
          className="cursor-pointer will-change-transform hover:scale-105 hover:brightness-110 active:scale-95 active:opacity-80 transition-all duration-200 ease-out"
        >
          {album.image_url ? (
            <img src={album.image_url} alt={album.name} className="w-full aspect-square rounded-md object-cover block" />
          ) : (
            <div className="w-full aspect-square rounded-md bg-surface-2" />
          )}
        </div>
      ))}
      {hasMore && <div ref={sentinelRef} data-testid="load-more-sentinel" className="h-1" />}
    </div>
  )
}

const TABS = [
  { id: 'played', label: 'Recently Played', shortLabel: 'Played' },
  { id: 'added', label: 'Recently Added', shortLabel: 'Added' },
  { id: 'recommended', label: 'Related', shortLabel: 'Related' },
  { id: 'rediscover', label: 'Lost', shortLabel: 'Lost' },
]

export default function HomePage({ onPlay, session }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('played')

  useEffect(() => {
    apiFetch('/home', {}, session)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <p className="p-6 text-text-dim">Loading...</p>

  const sections = data ? {
    played: data.recently_played ?? [],
    added: data.recently_added ?? [],
    recommended: data.recommended ?? [],
    rediscover: data.rediscover ?? [],
  } : { played: [], added: [], recommended: [], rediscover: [] }

  const isEmpty = Object.values(sections).every(s => s.length === 0)

  if (!data || isEmpty) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-text-dim text-base">
        <p>Start playing albums to see your listening history here.</p>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <TabBar
          tabs={TABS.map(t => ({ id: t.id, label: t.shortLabel }))}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="flex-1 overflow-y-auto prompt-row-scroll">
          <AlbumList albums={sections[activeTab]} onPlay={onPlay} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {TABS.map((tab, i) => (
        <div key={tab.id} className="flex-1 flex flex-col">
          <div className="px-4 py-2 text-sm font-bold tracking-wider uppercase text-text text-center flex-shrink-0 flex items-center justify-center" style={{ height: 40 }}>{tab.label}</div>
          <div className="flex-1 overflow-y-auto prompt-row-scroll">
            <AlbumList albums={sections[tab.id]} onPlay={onPlay} />
          </div>
        </div>
      ))}
    </div>
  )
}
