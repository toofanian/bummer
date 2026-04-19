import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import { useIsMobile } from '../hooks/useIsMobile'

function AlbumList({ albums, onPlay }) {
  if (!albums || albums.length === 0) {
    return <div className="px-4 py-6 text-text-dim text-sm italic">Nothing yet</div>
  }

  const cols = 3
  const display = albums.slice(0, albums.length - (albums.length % cols) || albums.length)

  return (
    <div className="grid grid-cols-3 gap-1 p-2">
      {display.map(album => (
        <div
          key={album.service_id}
          data-testid={`album-item-${album.service_id}`}
          onClick={() => onPlay(album.service_id)}
          className="cursor-pointer active:scale-95 active:opacity-80 transition-transform duration-150"
        >
          {album.image_url ? (
            <img src={album.image_url} alt={album.name} className="w-full aspect-square rounded-md object-cover block" />
          ) : (
            <div className="w-full aspect-square rounded-md bg-surface-2" />
          )}
        </div>
      ))}
    </div>
  )
}

const TABS = [
  { id: 'played', label: 'Recently Played' },
  { id: 'added', label: 'Recently Added' },
  { id: 'recommended', label: 'Related' },
  { id: 'rediscover', label: 'Rediscover' },
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
        <div className="flex border-b border-border flex-shrink-0" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-xs font-bold tracking-wider uppercase transition-colors duration-150 ${
                activeTab === tab.id ? 'text-text border-b-2 border-accent' : 'text-text-dim hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          <AlbumList albums={sections[activeTab]} onPlay={onPlay} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {TABS.map((tab, i) => (
        <div key={tab.id} className="flex-1 flex flex-col">
          <div className="px-4 py-3 text-sm font-bold tracking-wider uppercase text-text text-center flex-shrink-0">{tab.label}</div>
          <div className="flex-1 overflow-y-auto">
            <AlbumList albums={sections[tab.id]} onPlay={onPlay} />
          </div>
        </div>
      ))}
    </div>
  )
}
