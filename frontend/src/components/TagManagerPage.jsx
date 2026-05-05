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
import { buildTagTree, findNode } from '@/lib/tagTree'

function TagRow({
  node,
  depth,
  renamingId,
  renameValue,
  setRenameValue,
  startRename,
  submitRename,
  cancelRename,
  confirmingId,
  setConfirmingId,
  onDeleteConfirm,
  addingChildId,
  addChildName,
  setAddChildName,
  startAddChild,
  submitAddChild,
  cancelAddChild,
  dragHandleProps,
  sortableRef,
  sortableStyle,
}) {
  const isRenaming = renamingId === node.id
  const isConfirming = confirmingId === node.id
  const isAddingChild = addingChildId === node.id

  return (
    <div
      ref={sortableRef}
      style={sortableStyle}
      data-testid={`tag-row-${node.id}`}
      className="border-b border-border"
    >
      <div
        className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-elevated group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {dragHandleProps && (
          <button
            aria-label="Drag to reorder"
            className="bg-transparent border-none text-text-dim cursor-grab p-0 text-base touch-none"
            onClick={(e) => e.stopPropagation()}
            {...dragHandleProps}
          >
            ⠿
          </button>
        )}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              className="text-sm text-text bg-transparent border-b border-accent outline-none w-full"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename(node)
                if (e.key === 'Escape') cancelRename()
              }}
              onBlur={() => submitRename(node)}
              autoFocus
            />
          ) : (
            <span
              className="text-sm text-text cursor-text"
              onClick={() => startRename(node)}
            >
              {node.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
          <button
            className="bg-transparent border border-border text-text-dim text-xs px-2 py-0.5 rounded cursor-pointer hover:bg-bg-elevated"
            onClick={() => startAddChild(node)}
            aria-label="Add child"
          >
            + Add child
          </button>
          {isConfirming ? (
            <>
              <button
                className="bg-delete-red border-none text-white cursor-pointer text-xs font-semibold px-2 py-0.5 rounded"
                aria-label="Confirm delete"
                onClick={() => onDeleteConfirm(node.id)}
              >
                Delete
              </button>
              <button
                className="bg-transparent border border-border text-text-dim cursor-pointer text-xs px-2 py-0.5 rounded"
                aria-label="Cancel"
                onClick={() => setConfirmingId(null)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="bg-transparent border border-border text-delete-red text-xs px-2 py-0.5 rounded cursor-pointer hover:bg-bg-elevated"
              aria-label="Delete"
              onClick={() => setConfirmingId(node.id)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {isAddingChild && (
        <div
          className="px-2 py-1.5 border-t border-border bg-bg-elevated"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          <input
            className="text-sm text-text bg-transparent border-b border-accent outline-none w-full"
            value={addChildName}
            onChange={(e) => setAddChildName(e.target.value)}
            placeholder="New child tag name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAddChild(node)
              if (e.key === 'Escape') cancelAddChild()
            }}
            onBlur={cancelAddChild}
            autoFocus
          />
        </div>
      )}
    </div>
  )
}

function SortableTagRow(props) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: props.node.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <TagRow
      {...props}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  )
}

function TagBranch({
  nodes,
  depth,
  parentId,
  rowProps,
  onReorderSiblings,
}) {
  const ids = useMemo(() => nodes.map((n) => n.id), [nodes])
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(active.id)
    const newIndex = ids.indexOf(over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(ids, oldIndex, newIndex)
    onReorderSiblings(parentId, next)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {nodes.map((node) => (
          <div key={node.id}>
            <SortableTagRow node={node} depth={depth} {...rowProps} />
            {node.children.length > 0 && (
              <TagBranch
                nodes={node.children}
                depth={depth + 1}
                parentId={node.id}
                rowProps={rowProps}
                onReorderSiblings={onReorderSiblings}
              />
            )}
          </div>
        ))}
      </SortableContext>
    </DndContext>
  )
}

export default function TagManagerPage({
  tags,
  onRename,
  onDelete,
  onCreate,
  onMove,
  onReorder,
  onClose,
}) {
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingId, setConfirmingId] = useState(null)
  const [addingChildId, setAddingChildId] = useState(null)
  const [addChildName, setAddChildName] = useState('')
  const [showRootCreate, setShowRootCreate] = useState(false)
  const [rootCreateName, setRootCreateName] = useState('')

  const tree = useMemo(() => buildTagTree(tags), [tags])

  function startRename(node) {
    setRenamingId(node.id)
    setRenameValue(node.name)
  }

  function submitRename(node) {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      onRename(node.id, trimmed)
    }
    setRenamingId(null)
  }

  function cancelRename() {
    setRenamingId(null)
  }

  function handleDeleteConfirm(tagId) {
    onDelete(tagId)
    setConfirmingId(null)
  }

  function startAddChild(node) {
    setAddingChildId(node.id)
    setAddChildName('')
  }

  function submitAddChild(node) {
    const trimmed = addChildName.trim()
    if (trimmed) {
      onCreate({ name: trimmed, parent_tag_id: node.id })
    }
    setAddingChildId(null)
    setAddChildName('')
  }

  function cancelAddChild() {
    setAddingChildId(null)
    setAddChildName('')
  }

  function submitRootCreate() {
    const trimmed = rootCreateName.trim()
    if (trimmed) {
      onCreate({ name: trimmed, parent_tag_id: null })
    }
    setShowRootCreate(false)
    setRootCreateName('')
  }

  function handleReorder(parentId, tagIds) {
    onReorder?.(parentId, tagIds)
  }

  function handleMove(tagId, payload) {
    onMove?.(tagId, payload)
  }

  // Expose handlers for tests since simulating dnd-kit drag in jsdom is unreliable.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__tagManagerTestHandlers = { handleReorder, handleMove }
      return () => {
        if (window.__tagManagerTestHandlers) {
          delete window.__tagManagerTestHandlers
        }
      }
    }
  })

  const rowProps = {
    renamingId,
    renameValue,
    setRenameValue,
    startRename,
    submitRename,
    cancelRename,
    confirmingId,
    setConfirmingId,
    onDeleteConfirm: handleDeleteConfirm,
    addingChildId,
    addChildName,
    setAddChildName,
    startAddChild,
    submitAddChild,
    cancelAddChild,
  }

  return (
    <div className="w-full h-full flex flex-col bg-bg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            className="bg-transparent border border-border text-text-dim text-sm px-2 py-1 rounded cursor-pointer hover:bg-bg-elevated"
            onClick={onClose}
            aria-label="Back"
          >
            ← Back
          </button>
          <h1 className="text-base font-medium text-text">Tag Manager</h1>
        </div>
        <button
          className="bg-transparent border border-border text-text text-sm px-2 py-1 rounded cursor-pointer hover:bg-bg-elevated"
          onClick={() => {
            setShowRootCreate(true)
            setRootCreateName('')
          }}
        >
          + New Tag
        </button>
      </div>
      {showRootCreate && (
        <div className="px-3 py-2 border-b border-border bg-bg-elevated flex-shrink-0">
          <input
            className="text-sm text-text bg-transparent border-b border-accent outline-none w-full"
            value={rootCreateName}
            onChange={(e) => setRootCreateName(e.target.value)}
            placeholder="New tag name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRootCreate()
              if (e.key === 'Escape') {
                setShowRootCreate(false)
                setRootCreateName('')
              }
            }}
            onBlur={() => {
              setShowRootCreate(false)
              setRootCreateName('')
            }}
            autoFocus
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {tags.length === 0 ? (
          <p className="p-4 text-sm text-text-dim italic">
            No tags yet — create one to organize collections.
          </p>
        ) : (
          <TagBranch
            nodes={tree}
            depth={0}
            parentId={null}
            rowProps={rowProps}
            onReorderSiblings={handleReorder}
          />
        )}
      </div>
    </div>
  )
}
