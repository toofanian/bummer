import { memo } from 'react'

export function ArtistLinks({ artists, onArtistClick }) {
  if (!onArtistClick) return artists.join(', ')
  return artists.map((artist, i) => (
    <span key={artist}>
      {i > 0 && ', '}
      <span
        data-testid={`artist-link-${artist}`}
        className="cursor-pointer hover:underline"
        role="button"
        onClick={(e) => { e.stopPropagation(); onArtistClick(artist) }}
      >
        {artist}
      </span>
    </span>
  ))
}

const MobileAlbumCard = memo(function MobileAlbumCard({ album, isExpanded, isPlaying, exp, playingTrackName, onPlay, onPlayTrack, onExpand, dragHandleProps, sortableRef, sortableStyle, isSelected, onToggleSelect, collectionCount, onArtistClick }) {
  return (
    <div ref={sortableRef} style={sortableStyle}>
      <div
        data-testid={`album-card-${album.service_id}`}
        className={`album-card flex items-center gap-3 px-4 py-2.5 border-b border-border cursor-pointer transition-colors duration-100 min-h-16 active:bg-selected${isPlaying ? ' now-playing bg-now-playing' : ''}`}
        onClick={() => onPlay && onPlay(album.service_id)}
      >
        {dragHandleProps && (
          <button
            aria-label="Drag to reorder"
            className="drag-handle bg-transparent border-none text-text-dim cursor-grab p-1 text-lg flex-shrink-0 touch-none"
            onClick={(e) => e.stopPropagation()}
            {...dragHandleProps}
          >⠿</button>
        )}
        <div className="relative flex-shrink-0 w-11 h-11">
          {album.image_url
            ? <img src={album.image_url} alt={album.name} width={44} height={44} className="w-11 h-11 rounded object-cover flex-shrink-0" />
            : <div className="w-11 h-11 rounded bg-surface-2" />
          }
          {isPlaying && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
              <span className="now-playing-indicator inline-flex items-center gap-0.5 h-3">
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
              </span>
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-text truncate">{album.name}</span>
          <span className="text-xs text-text-dim truncate"><ArtistLinks artists={album.artists} onArtistClick={onArtistClick} /></span>
        </div>
        {onToggleSelect && (
          <button
            className={`bg-transparent border cursor-pointer w-[22px] h-[22px] rounded-full text-xs font-semibold flex items-center justify-center p-0${isSelected ? ' text-accent border-accent bg-surface-2' : collectionCount > 0 ? ' bg-surface-2 border-accent text-accent' : ' border-transparent text-text-dim'}`}
            aria-label={isSelected ? 'Selected' : collectionCount > 0 ? `${collectionCount} collections` : 'Add to collection'}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(album.service_id) }}
          >
            {isSelected ? '✓' : collectionCount > 0 ? collectionCount : '+'}
          </button>
        )}
        <button
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          className="bg-transparent border-none text-text-dim cursor-pointer p-2 text-lg flex-shrink-0 min-w-11 min-h-11 flex items-center justify-center rounded"
          onClick={e => { e.stopPropagation(); onExpand(album.service_id) }}
        >
          <span className={`expand-chevron${isExpanded ? ' expanded' : ''}`}>▸</span>
        </button>
      </div>

      {isExpanded && (
        <div className="bg-surface">
          {exp.loading ? (
            <div className="album-card-track-row flex items-center gap-2.5 px-4 py-2.5 min-h-11 border-t border-border" style={{ paddingLeft: 72 }}>
              <span className="text-text-dim text-xs">Loading tracks…</span>
            </div>
          ) : (
            exp.tracks.map(t => {
              const isActive = playingTrackName && t.name === playingTrackName
              return (
                <div
                  key={t.track_number}
                  className={`album-card-track-row flex items-center gap-2.5 px-4 py-2.5 min-h-11 cursor-pointer border-t border-border${isActive ? ' now-playing bg-now-playing' : ''}`}
                  style={{ paddingLeft: 72 }}
                  onClick={() => onPlayTrack && onPlayTrack(`spotify:track:${t.service_id}`)}
                >
                  <span className="text-xs text-text-dim w-5 text-right flex-shrink-0">{t.track_number}</span>
                  <span className={`text-sm text-text flex-1 min-w-0 truncate${isActive ? ' font-semibold' : ''}`}>{t.name}</span>
                  <span className="text-xs text-text-dim flex-shrink-0">{t.duration}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
})

export default MobileAlbumCard
