import { useRef } from 'react'

export default function AlbumRow({ title, albums, onPlay }) {
  const pointerStart = useRef({ x: 0, y: 0 })

  if (!albums || albums.length === 0) return null

  return (
    <section className="mb-6 md:mb-8">
      <h2 className="text-xl font-bold mb-4 text-text">{title}</h2>
      <div
        className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 md:grid md:overflow-hidden md:pb-0"
        style={{
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gridTemplateRows: 'repeat(2, auto)',
          gridAutoRows: 0,
        }}
      >
        {albums.map(album => (
          <div
            key={album.spotify_id}
            className="flex-shrink-0 w-[110px] md:w-auto cursor-pointer active:scale-95 active:opacity-80 md:hover:scale-[1.03] md:hover:shadow-lg transition-transform duration-150"
            style={{ scrollSnapAlign: 'start' }}
            data-testid={`album-card-${album.spotify_id}`}
            onPointerDown={e => { pointerStart.current = { x: e.clientX, y: e.clientY } }}
            onClick={e => {
              const dx = Math.abs(e.clientX - pointerStart.current.x)
              const dy = Math.abs(e.clientY - pointerStart.current.y)
              if (dx > 10 || dy > 10) return
              onPlay(album.spotify_id)
            }}
          >
            {album.image_url ? (
              <img
                className="w-[110px] h-[110px] md:w-full md:h-auto md:aspect-square rounded-md object-cover block"
                src={album.image_url}
                alt={album.name}
              />
            ) : (
              <div className="w-[110px] h-[110px] md:w-full md:h-auto md:aspect-square rounded-md bg-surface-2" />
            )}
            <div className="text-sm mt-1.5 text-text truncate">{album.name}</div>
            <div className="text-xs text-text-dim truncate">{album.artists.join(', ')}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
