import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AlbumArtStrip from './AlbumArtStrip'

const ROW_HEIGHT = 40
const THUMB_SIZE = 28
const MAX_THUMBS = 4

// Exported for unit tests — pure helper that computes the reordered id list.
export function __computeReorder(orderedIds, activeId, overId) {
  if (activeId === overId) return orderedIds
  const oldIndex = orderedIds.indexOf(activeId)
  const newIndex = orderedIds.indexOf(overId)
  if (oldIndex < 0 || newIndex < 0) return orderedIds
  return arrayMove(orderedIds, oldIndex, newIndex)
}

function CollectionRow({
  col,
  artAlbums,
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
  onOpen,
  onManageTags,
  dragHandleProps,
  sortableRef,
  sortableStyle,
}) {
  const isConfirming = confirmingId === col.id
  const isRenaming = renamingId === col.id
  const isMenuOpen = menuOpenId === col.id

  return (
    <div
      ref={sortableRef}
      style={{ ...sortableStyle, height: ROW_HEIGHT }}
      data-testid="collection-list-row"
      className="flex items-center gap-2 px-2 border-b border-border cursor-pointer hover:bg-bg-elevated transition-colors duration-150 group"
      onClick={() => {
        if (isRenaming) return
        onOpen?.(col)
      }}
      onMouseLeave={() => {
        if (isMenuOpen) setMenuOpenId(null)
        if (isConfirming) setConfirmingId(null)
      }}
    >
      {dragHandleProps && (
        <button
          aria-label="Drag to reorder"
          className="drag-handle bg-transparent border-none text-text-dim cursor-grab p-0 text-base touch-none flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          {...dragHandleProps}
        >
          ⠿
        </button>
      )}
      <div className="flex-shrink-0" style={{ height: THUMB_SIZE }}>
        <AlbumArtStrip albums={(artAlbums || []).slice(0, MAX_THUMBS)} size={THUMB_SIZE} />
      </div>
      <div className="min-w-0 flex-1 flex items-center">
        {isRenaming ? (
          <input
            className="text-sm font-medium text-text bg-transparent border-b border-accent outline-none w-full"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename(col)
              if (e.key === 'Escape') setRenamingId(null)
            }}
            onBlur={() => submitRename(col)}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-sm text-text truncate">{col.name}</span>
        )}
      </div>
      {col.album_count != null && !isRenaming && (
        <span className="text-xs text-text-dim flex-shrink-0">{col.album_count}</span>
      )}
      <div onClick={(e) => e.stopPropagation()} className="relative flex-shrink-0">
        {isRenaming ? null : isConfirming ? (
          <div className="flex items-center gap-0.5">
            <button
              className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
              aria-label="Confirm delete"
              onClick={(e) => handleConfirmDelete(e, col.id)}
            >
              Delete
            </button>
            <button
              className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-1.5 py-0.5 rounded whitespace-nowrap"
              aria-label="Cancel"
              onClick={handleCancelDelete}
            >
              Cancel
            </button>
          </div>
        ) : isMenuOpen ? (
          <div className="flex items-center gap-1">
            <button
              className="bg-transparent border border-border text-text text-xs px-2 py-0.5 rounded cursor-pointer hover:bg-bg-elevated"
              onClick={() => {
                setMenuOpenId(null)
                setRenamingId(col.id)
                setRenameValue(col.name)
              }}
            >
              Rename
            </button>
            <button
              className="bg-transparent border border-border text-text text-xs px-2 py-0.5 rounded cursor-pointer hover:bg-bg-elevated"
              onClick={() => {
                setMenuOpenId(null)
                onManageTags?.(col)
              }}
            >
              Manage tags
            </button>
            <button
              className="bg-transparent border border-border text-delete-red text-xs px-2 py-0.5 rounded cursor-pointer hover:bg-bg-elevated"
              onClick={(e) => {
                setMenuOpenId(null)
                handleDeleteClick(e, col.id)
              }}
            >
              Delete
            </button>
          </div>
        ) : (
          <button
            className="bg-transparent border-none text-text-dim cursor-pointer text-base p-1 rounded opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-text-hover transition-opacity duration-150"
            aria-label="More options"
            onClick={() => setMenuOpenId(col.id)}
          >
            ⋯
          </button>
        )}
      </div>
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

export default function CollectionList({
  collections,
  albumsByCollection,
  onOpen,
  onRename,
  onDelete,
  onReorder,
  onManageTags,
}) {
  const [confirmingId, setConfirmingId] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

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
    if (confirmingId !== colId) setConfirmingId(colId)
  }

  function handleConfirmDelete(e, colId) {
    e.stopPropagation()
    onDelete?.(colId)
    setConfirmingId(null)
  }

  function handleCancelDelete(e) {
    e.stopPropagation()
    setConfirmingId(null)
  }

  function submitRename(col) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== col.name) {
      onRename?.(col.id, trimmed)
    }
    setRenamingId(null)
  }

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))
  const sortableIds = useMemo(() => collections.map((c) => c.id), [collections])

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return
    const newOrder = __computeReorder(sortableIds, active.id, over.id)
    if (newOrder !== sortableIds) onReorder?.(newOrder)
  }

  if (!collections || collections.length === 0) {
    return <p className="p-4 text-sm text-text-dim italic">No collections yet.</p>
  }

  const rowProps = {
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
    onOpen,
    onManageTags,
  }

  function renderRow(col) {
    const artAlbums = (albumsByCollection && albumsByCollection[col.id]) || []
    if (onReorder) {
      return <SortableCollectionRow key={col.id} col={col} artAlbums={artAlbums} {...rowProps} />
    }
    return <CollectionRow key={col.id} col={col} artAlbums={artAlbums} {...rowProps} />
  }

  const list = <div className="flex flex-col">{collections.map(renderRow)}</div>

  if (onReorder) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {list}
        </SortableContext>
      </DndContext>
    )
  }
  return list
}
