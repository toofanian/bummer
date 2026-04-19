import { useState, useMemo, useCallback, useRef, memo } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useIsMobile } from '../hooks/useIsMobile'
import MobileAlbumCard, { ArtistLinks } from './MobileAlbumCard'

const EMPTY_ARRAY = []

const COLUMNS = [
  { key: 'name',        label: 'Album'      },
  { key: 'artists',     label: 'Artist'     },
  { key: 'release_date',label: 'Year',       width: 64  },
  { key: 'added_at',    label: 'Date Added', width: 110 },
  { key: 'listens',     label: 'Listens',    width: 80  },
]

function formatYear(dateStr) {
  return dateStr ? dateStr.slice(0, 4) : '—'
}

function formatDateAdded(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function sortAlbums(albums, key, direction, listenCounts) {
  return [...albums].sort((a, b) => {
    let aVal, bVal
    if (key === 'artists') {
      aVal = a.artists.join(', ')
      bVal = b.artists.join(', ')
    } else if (key === 'listens') {
      aVal = (listenCounts || {})[a.service_id] || 0
      bVal = (listenCounts || {})[b.service_id] || 0
    } else {
      aVal = a[key] ?? ''
      bVal = b[key] ?? ''
    }
    if (aVal < bVal) return direction === 'asc' ? -1 : 1
    if (aVal > bVal) return direction === 'asc' ? 1 : -1
    return 0
  })
}

// Returns a flat ordered list of { type: 'album'|'track', id: string } for keyboard navigation.
// Track entries are only included for expanded albums that have finished loading.
function buildNavList(sorted, expanded) {
  const list = []
  for (const album of sorted) {
    list.push({ type: 'album', id: `row-album-${album.service_id}` })
    const exp = expanded[album.service_id]
    if (exp && !exp.loading) {
      for (const t of exp.tracks) {
        list.push({ type: 'track', id: `row-track-${t.service_id}` })
      }
    }
  }
  return list
}


const DesktopAlbumRow = memo(function DesktopAlbumRow({ album, isExpanded, isPlaying, expandedEntry, playingTrackId, playingTrackName, onPlay, onPlayTrack, onExpand, navigateRow, dragHandleProps, sortableRef, sortableStyle, isSelected, onToggleSelect, collectionCount, onArtistClick, listenCount }) {
  function handleAlbumKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      navigateRow(`row-album-${album.service_id}`, 'down')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      navigateRow(`row-album-${album.service_id}`, 'up')
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (!isExpanded) onExpand(album.service_id)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (isExpanded) onExpand(album.service_id)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onPlay && onPlay(album.service_id)
    } else if (e.key === 'Escape') {
      e.currentTarget.blur()
    }
  }

  return [
    <tr
      key={album.service_id}
      ref={sortableRef}
      style={sortableStyle}
      id={`row-album-${album.service_id}`}
      className={`album-row border-b border-border transition-colors duration-100 hover:bg-hover focus:outline-none focus:bg-selected focus:shadow-[inset_3px_0_0_var(--color-accent)]${isPlaying ? ' now-playing bg-now-playing' : ''}`}
      tabIndex={0}
      onKeyDown={handleAlbumKeyDown}
      onDoubleClick={() => onPlay && onPlay(album.service_id)}
    >
      {dragHandleProps && (
        <td className="px-1 py-1.5 align-middle">
          <button
            aria-label="Drag to reorder"
            className="drag-handle bg-transparent border-none text-text-dim cursor-grab p-0 text-lg touch-none"
            onClick={(e) => e.stopPropagation()}
            {...dragHandleProps}
          >⠿</button>
        </td>
      )}
      <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle">
        <button
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          onClick={() => onExpand(album.service_id)}
          className="expand-btn bg-transparent border-none text-text-dim cursor-pointer p-0 transition-colors duration-150 hover:text-text"
          style={{ fontSize: 20 }}
        >
          <span className={`expand-chevron${isExpanded ? ' expanded' : ''}`}>▸</span>
        </button>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle relative">
        {isPlaying ? (
          <span className="now-playing-indicator inline-flex items-end justify-center w-10 h-10">
            <span className="eq-bar"></span>
            <span className="eq-bar"></span>
            <span className="eq-bar"></span>
            <span className="eq-bar"></span>
          </span>
        ) : album.image_url
          ? <img src={album.image_url} alt={album.name} width={40} height={40} className="rounded-sm object-cover block" />
          : <img src={null} alt="No cover" width={40} height={40} className="rounded-sm object-cover block" style={{ background: '#333' }} />
        }
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle">{album.name}</td>
      <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle"><ArtistLinks artists={album.artists} onArtistClick={onArtistClick} /></td>
      <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle">{formatYear(album.release_date)}</td>
      <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle">{formatDateAdded(album.added_at)}</td>
      <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle text-center text-text-dim">{listenCount ?? 0}</td>
      <td className="px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis align-middle text-center">
        {onToggleSelect && (
          <button
            className={`mx-auto bg-transparent border cursor-pointer w-[22px] h-[22px] rounded-full text-xs font-semibold flex items-center justify-center p-0${isSelected ? ' text-accent border-accent bg-surface-2' : collectionCount > 0 ? ' bg-surface-2 border-accent text-accent' : ' border-transparent text-text-dim'}`}
            aria-label={isSelected ? 'Selected' : collectionCount > 0 ? `${collectionCount} collections` : 'Add to collection'}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(album.service_id) }}
          >
            {isSelected ? '✓' : collectionCount > 0 ? collectionCount : '+'}
          </button>
        )}
      </td>
    </tr>,
    isExpanded && expandedEntry && (
      <TrackList
        key={`${album.service_id}-tracks`}
        tracks={expandedEntry.tracks}
        loading={expandedEntry.loading}
        onPlayTrack={onPlayTrack}
        playingTrackId={playingTrackId}
        playingTrackName={playingTrackName}
        navigateRow={navigateRow}
        hasHandleColumn={!!dragHandleProps}
        onCollapseToAlbum={() => {
          onExpand(album.service_id)
          setTimeout(() => document.getElementById(`row-album-${album.service_id}`)?.focus(), 0)
        }}
      />
    ),
  ]
})

function TrackList({ tracks, loading, onPlayTrack, playingTrackId, playingTrackName, navigateRow, onCollapseToAlbum, hasHandleColumn }) {
  const totalColumns = hasHandleColumn ? 9 : 8
  if (loading) return (
    <tr>
      <td colSpan={totalColumns} className="px-2 py-2 text-text-dim" style={{ paddingLeft: 60 }}>Loading tracks…</td>
    </tr>
  )
  return [
    <tr key="track-header" className="text-xs text-text-dim border-b border-border">
      {hasHandleColumn && <td></td>}
      <td></td>
      <td className="text-xs text-text-dim text-center">#</td>
      <td>Name</td>
      <td>Artists</td>
      <td></td>
      <td className="text-text-dim">Duration</td>
      <td></td>
      <td></td>
    </tr>,
    ...tracks.map(t => {
      const isPlaying = playingTrackId === t.service_id
      const isTrackPlaying = playingTrackName && t.name === playingTrackName

      function handleTrackKeyDown(e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          navigateRow && navigateRow(`row-track-${t.service_id}`, 'down')
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          navigateRow && navigateRow(`row-track-${t.service_id}`, 'up')
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          onCollapseToAlbum && onCollapseToAlbum()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          onPlayTrack && onPlayTrack(`spotify:track:${t.service_id}`)
        } else if (e.key === 'Escape') {
          e.currentTarget.blur()
        }
      }

      return (
        <tr
          key={t.track_number}
          id={`row-track-${t.service_id}`}
          className={`track-row text-sm border-b border-border transition-colors duration-100 hover:bg-hover focus:outline-none focus:bg-selected focus:shadow-[inset_3px_0_0_var(--color-accent)]${isTrackPlaying ? ' now-playing bg-now-playing' : ''}`}
          tabIndex={0}
          onKeyDown={handleTrackKeyDown}
          onClick={() => onPlayTrack && onPlayTrack(`spotify:track:${t.service_id}`)}
        >
          {hasHandleColumn && <td></td>}
          <td></td>
          <td className="text-text-dim text-xs text-center">
            {isPlaying ? (
              <span className="now-playing-indicator inline-flex items-center gap-0.5 h-3">
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
                <span className="eq-bar"></span>
              </span>
            ) : t.track_number}
          </td>
          <td>{t.name}</td>
          <td className="text-text-dim text-xs">{t.artists?.join(', ')}</td>
          <td></td>
          <td className="text-text-dim">{t.duration}</td>
          <td></td>
          <td></td>
        </tr>
      )
    }),
  ]
}

function SortableAlbumRow({ album, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: album.service_id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <DesktopAlbumRow
      album={album}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
      {...rest}
    />
  )
}

function SortableMobileCard({ album, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: album.service_id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <MobileAlbumCard
      album={album}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
      {...rest}
    />
  )
}

export default function AlbumTable({
  albums,
  loading,
  onFetchTracks,
  onPlay,
  onPlayTrack,
  playingId,
  playingTrackId,
  playingTrackName = null,
  albumCollectionMap,
  reorderable = false,
  onReorder,
  selectedIds,
  onToggleSelect,
  onArtistClick,
  listenCounts,
}) {
  const [sortKey, setSortKey] = useState('added_at')
  const [sortDir, setSortDir] = useState('desc')
  const [expanded, setExpanded] = useState({})
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const isMobile = useIsMobile()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  )

  if (loading) return <p>Loading...</p>
  if (!albums.length) return <p>No albums found.</p>

  function handleHeaderClick(key) {
    if (reorderable) return // no sorting in reorderable mode
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'listens' ? 'desc' : 'asc')
    }
  }

  const handleExpand = useCallback(async (albumId) => {
    setExpanded(prev => {
      if (prev[albumId]) {
        const next = { ...prev }
        delete next[albumId]
        return next
      }
      return { ...prev, [albumId]: { tracks: [], loading: true } }
    })
    if (expandedRef.current[albumId]) return
    const tracks = await onFetchTracks(albumId)
    setExpanded(prev => prev[albumId] ? { ...prev, [albumId]: { tracks, loading: false } } : prev)
  }, [onFetchTracks])

  const sorted = useMemo(
    () => reorderable ? albums : sortAlbums(albums, sortKey, sortDir, listenCounts),
    [albums, sortKey, sortDir, reorderable, listenCounts],
  )

  const sortableIds = useMemo(() => sorted.map(a => a.service_id), [sorted])

  const navigateRow = useCallback((currentId, direction) => {
    const navList = buildNavList(sorted, expandedRef.current)
    const idx = navList.findIndex(entry => entry.id === currentId)
    if (idx === -1) return
    const nextIdx = direction === 'down' ? idx + 1 : idx - 1
    if (nextIdx < 0 || nextIdx >= navList.length) return
    document.getElementById(navList[nextIdx].id)?.focus()
  }, [sorted])

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortableIds.indexOf(active.id)
    const newIndex = sortableIds.indexOf(over.id)
    const newOrder = arrayMove(sortableIds, oldIndex, newIndex)
    onReorder?.(newOrder)
  }

  function renderMobileCard(album) {
    const isExpanded = !!expanded[album.service_id]
    const isPlaying = playingId === album.service_id
    const exp = expanded[album.service_id]
    const commonProps = {
      album,
      isExpanded,
      isPlaying,
      exp,
      playingTrackName,
      onPlay,
      onPlayTrack,
      onExpand: handleExpand,
      isSelected: selectedIds?.has(album.service_id),
      onToggleSelect,
      collectionCount: (albumCollectionMap?.[album.service_id] || []).length,
      onArtistClick,
    }

    if (reorderable) {
      return <SortableMobileCard key={album.service_id} {...commonProps} />
    }
    return <MobileAlbumCard key={album.service_id} {...commonProps} />
  }

  function renderDesktopRow(album) {
    const isExpanded = !!expanded[album.service_id]
    const isPlaying = playingId === album.service_id
    const commonProps = {
      album,
      isExpanded,
      isPlaying,
      expandedEntry: expanded[album.service_id],
      playingTrackId,
      playingTrackName,
      onPlay,
      onPlayTrack,
      onExpand: handleExpand,
      navigateRow,
      isSelected: selectedIds?.has(album.service_id),
      onToggleSelect,
      collectionCount: (albumCollectionMap?.[album.service_id] || []).length,
      onArtistClick,
      listenCount: (listenCounts || {})[album.service_id] || 0,
    }

    if (reorderable) {
      return <SortableAlbumRow key={album.service_id} {...commonProps} />
    }
    return <DesktopAlbumRow key={album.service_id} {...commonProps} />
  }

  if (isMobile) {
    const cardList = (
      <div className="album-card-list flex flex-col flex-1 overflow-y-auto">
        {sorted.map(album => renderMobileCard(album))}
      </div>
    )

    if (reorderable) {
      return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {cardList}
          </SortableContext>
        </DndContext>
      )
    }
    return cardList
  }

  const tableContent = (
    <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr>
          {reorderable && <th className="sticky top-0 z-[2] bg-bg border-b border-border" style={{ width: 36 }}></th>}
          <th className="sticky top-0 z-[2] bg-bg border-b border-border" style={{ width: 36 }}></th>
          <th className="sticky top-0 z-[2] bg-bg border-b border-border" style={{ width: 52 }}></th>
          {COLUMNS.map(col => (
            <th
              key={col.key}
              className={`sticky top-0 z-[2] bg-bg px-2 py-2.5 text-left text-xs font-semibold tracking-wider uppercase text-text-dim border-b border-border select-none whitespace-nowrap${reorderable ? '' : ' cursor-pointer'}`}
              style={col.width ? { width: col.width } : undefined}
              onClick={() => handleHeaderClick(col.key)}
            >
              {col.label}{!reorderable && sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
          ))}
          <th
            className="sticky top-0 z-[2] bg-bg px-2 py-2.5 text-center text-xs font-semibold tracking-wider uppercase text-text-dim border-b border-border select-none whitespace-nowrap"
            style={{ cursor: 'default', width: 120 }}
          >Collections</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(album => renderDesktopRow(album))}
      </tbody>
    </table>
  )

  if (reorderable) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {tableContent}
        </SortableContext>
      </DndContext>
    )
  }

  return tableContent
}
