import { useState, useEffect, useMemo } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useIsMobile } from '../hooks/useIsMobile'
import AlbumArtStrip from './AlbumArtStrip'
import AlbumPromptBar from './AlbumPromptBar'

function CollectionRow({ col, isMobile, renamingId, renameValue, setRenameValue, setRenamingId, submitRename, confirmingId, setConfirmingId, menuOpenId, setMenuOpenId, handleDeleteClick, handleConfirmDelete, handleCancelDelete, onEnter, artAlbums, dragHandleProps, sortableRef, sortableStyle }) {
  const isConfirming = confirmingId === col.id

  return (
    <div
      ref={sortableRef}
      style={sortableStyle}
      data-testid="collection-row"
      className="border-b border-border cursor-pointer hover:bg-hover transition-colors duration-150 group"
      onClick={() => onEnter(col)}
    >
      {isMobile ? (
        <>
          <div className="flex items-center justify-between px-4 py-2">
            {dragHandleProps && (
              <button
                aria-label="Drag to reorder"
                className="drag-handle bg-transparent border-none text-text-dim cursor-grab p-0 text-lg touch-none ml-1 mr-2"
                onClick={(e) => e.stopPropagation()}
                {...dragHandleProps}
              >⠿</button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {renamingId === col.id ? (
                  <input
                    className="text-sm font-medium text-text bg-transparent border-b border-accent outline-none w-full"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitRename(col)
                      if (e.key === 'Escape') { setRenamingId(null) }
                    }}
                    onBlur={() => submitRename(col)}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-sm font-medium text-text">{col.name}</span>
                )}
              </div>
              {col.album_count != null && (
                <div className="text-xs text-text-dim mt-0.5">{col.album_count} {col.album_count === 1 ? 'album' : 'albums'}</div>
              )}
              {col.description && (
                <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
              )}
            </div>
            <div onClick={e => e.stopPropagation()} className="relative">
              {renamingId === col.id ? null : confirmingId === col.id ? (
                <>
                  <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded mr-0.5 whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                  <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                </>
              ) : menuOpenId === col.id ? (
                <div className="flex gap-1">
                  <button className="bg-transparent border border-border text-text text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={() => { setMenuOpenId(null); setRenamingId(col.id); setRenameValue(col.name) }}>Rename</button>
                  <button className="bg-transparent border border-border text-delete-red text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={e => { setMenuOpenId(null); handleDeleteClick(e, col.id) }}>Delete</button>
                </div>
              ) : (
                <button className="bg-transparent border-none text-text-dim cursor-pointer text-lg p-1.5 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-surface-2 transition-opacity duration-150" aria-label="More options" onClick={() => setMenuOpenId(col.id)}>⋯</button>
              )}
            </div>
          </div>
          <div style={{ height: 62 }}>
            <AlbumArtStrip albums={artAlbums} size={62} />
          </div>
        </>
      ) : (
        <div className="flex items-stretch" style={{ height: 62 }}>
          {dragHandleProps && (
            <div className="flex items-center px-2">
              <button
                aria-label="Drag to reorder"
                className="drag-handle bg-transparent border-none text-text-dim cursor-grab p-0 text-lg touch-none"
                onClick={(e) => e.stopPropagation()}
                {...dragHandleProps}
              >⠿</button>
            </div>
          )}
          <div className="w-48 flex-shrink-0 flex items-center px-4">
            <div className="min-w-0">
              {renamingId === col.id ? (
                <input
                  className="text-sm font-medium text-text bg-transparent border-b border-accent outline-none w-full"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitRename(col)
                    if (e.key === 'Escape') { setRenamingId(null) }
                  }}
                  onBlur={() => submitRename(col)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <div className="text-sm font-medium text-text truncate">{col.name}</div>
              )}
              {col.album_count != null && (
                <div className="text-xs text-text-dim mt-0.5">{col.album_count} {col.album_count === 1 ? 'album' : 'albums'}</div>
              )}
              {col.description && (
                <div className="text-xs text-text-dim mt-0.5 truncate">{col.description}</div>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 flex items-center relative">
            <AlbumArtStrip albums={artAlbums} size={62} />
            <div onClick={e => e.stopPropagation()} className="absolute right-2 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {renamingId === col.id ? null : confirmingId === col.id ? (
                <div className="flex items-center gap-0.5 bg-surface/80 backdrop-blur-sm rounded-l px-2">
                  <button className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Confirm delete" onClick={e => handleConfirmDelete(e, col.id)}>Delete</button>
                  <button className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap" aria-label="Cancel" onClick={handleCancelDelete}>Cancel</button>
                </div>
              ) : menuOpenId === col.id ? (
                <div className="flex items-center gap-1 bg-surface/80 backdrop-blur-sm rounded-l px-2">
                  <button className="bg-transparent border border-border text-text text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={() => { setMenuOpenId(null); setRenamingId(col.id); setRenameValue(col.name) }}>Rename</button>
                  <button className="bg-transparent border border-border text-delete-red text-xs px-2 py-1 rounded cursor-pointer hover:bg-surface-2" onClick={e => { setMenuOpenId(null); handleDeleteClick(e, col.id) }}>Delete</button>
                </div>
              ) : (
                <button className="bg-surface/80 backdrop-blur-sm border-none text-text-dim cursor-pointer text-lg p-1.5 rounded-l hover:text-text transition-colors duration-150" aria-label="More options" onClick={() => setMenuOpenId(col.id)}>⋯</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableCollectionRow({ col, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: col.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <CollectionRow
      col={col}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
      {...rest}
    />
  )
}

export default function CollectionsPane({ collections, onEnter, onDelete, onCreate, onRename, onFetchAlbums, albumCollectionMap, collectionsForPicker, session, onBulkAdd, onCreateCollection, onReorder }) {
  const [artMap, setArtMap] = useState({})
  const [confirmingId, setConfirmingId] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!onFetchAlbums || !collections.length) return
    collections.forEach(col => {
      if (artMap[col.id]) return
      setArtMap(prev => ({ ...prev, [col.id]: { albums: [], loading: true } }))
      onFetchAlbums(col.id).then(albums => {
        setArtMap(prev => ({ ...prev, [col.id]: { albums, loading: false } }))
      })
    })
  }, [collections])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!confirmingId && !menuOpenId) return
    function handleDocClick() {
      setConfirmingId(null)
      setMenuOpenId(null)
    }
    const id = setTimeout(() => {
      document.addEventListener('click', handleDocClick)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handleDocClick)
    }
  }, [confirmingId, menuOpenId])

  function handleDeleteClick(e, colId) {
    e.stopPropagation()
    if (confirmingId !== colId) {
      setConfirmingId(colId)
    }
  }

  function handleConfirmDelete(e, colId) {
    e.stopPropagation()
    onDelete(colId)
    setConfirmingId(null)
  }

  function handleCancelDelete(e) {
    e.stopPropagation()
    setConfirmingId(null)
  }

  function submitRename(col) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== col.name) {
      onRename(col.id, trimmed)
    }
    setRenamingId(null)
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  )

  const sortableIds = useMemo(() => collections.map(c => c.id), [collections])

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortableIds.indexOf(active.id)
    const newIndex = sortableIds.indexOf(over.id)
    const newOrder = arrayMove(sortableIds, oldIndex, newIndex)
    onReorder?.(newOrder)
  }

  const rowProps = {
    isMobile,
    renamingId,
    renameValue,
    setRenameValue,
    setRenamingId,
    submitRename,
    confirmingId,
    setConfirmingId,
    menuOpenId,
    setMenuOpenId,
    handleDeleteClick,
    handleConfirmDelete,
    handleCancelDelete,
    onEnter,
  }

  function renderRow(col) {
    const artEntry = artMap[col.id]
    const artAlbums = artEntry ? artEntry.albums : []

    if (onReorder) {
      return (
        <SortableCollectionRow
          key={col.id}
          col={col}
          artAlbums={artAlbums}
          {...rowProps}
        />
      )
    }
    return (
      <CollectionRow
        key={col.id}
        col={col}
        artAlbums={artAlbums}
        {...rowProps}
      />
    )
  }

  const rowList = (
    <div className="flex-1 overflow-y-auto">
      {collections.map(col => renderRow(col))}
    </div>
  )

  return (
    <div className="w-full flex flex-col h-full overflow-hidden">
      {collections.length === 0 ? (
        <p className="p-4 text-sm text-text-dim italic">No collections yet.</p>
      ) : onReorder ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {rowList}
          </SortableContext>
        </DndContext>
      ) : (
        rowList
      )}
      <AlbumPromptBar
        albumCollectionMap={albumCollectionMap || {}}
        collections={collectionsForPicker || []}
        session={session}
        onBulkAdd={async (collectionId, albumIds) => {
          if (onBulkAdd) await onBulkAdd(collectionId, albumIds)
          if (onFetchAlbums) {
            const albums = await onFetchAlbums(collectionId)
            setArtMap(prev => ({ ...prev, [collectionId]: { albums, loading: false } }))
          }
        }}
        onCreate={onCreateCollection || (() => {})}
      />
    </div>
  )
}
