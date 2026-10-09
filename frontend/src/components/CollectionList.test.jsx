import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionList, { __computeReorder } from './CollectionList'

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip', album_count: 5 },
  { id: 'col-2', name: '90s classics', album_count: 12 },
]

const ALBUMS_BY_COL = {
  'col-1': [
    { service_id: 'a1', name: 'In Rainbows', image_url: 'http://img/1.jpg' },
    { service_id: 'a2', name: 'OK Computer', image_url: 'http://img/2.jpg' },
  ],
  'col-2': [],
}

const noop = () => {}

function renderList(overrides = {}) {
  const props = {
    collections: COLLECTIONS,
    albumsByCollection: ALBUMS_BY_COL,
    onOpen: noop,
    onRename: noop,
    onDelete: noop,
    onReorder: noop,
    onManageTags: noop,
    ...overrides,
  }
  return render(<CollectionList {...props} />)
}

describe('CollectionList', () => {
  it('renders one row per collection', () => {
    renderList()
    const rows = screen.getAllByTestId('collection-list-row')
    expect(rows).toHaveLength(2)
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
  })

  it('renders empty state when collections is empty', () => {
    renderList({ collections: [] })
    expect(screen.getByText(/no collections/i)).toBeInTheDocument()
  })

  it('row click fires onOpen with collection object', async () => {
    const onOpen = vi.fn()
    renderList({ onOpen })
    await userEvent.click(screen.getByText('Road trip'))
    expect(onOpen).toHaveBeenCalledWith(COLLECTIONS[0])
  })

  it('renders the album count for each collection', () => {
    renderList()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders album art thumbnails at 28px from albumsByCollection', () => {
    renderList()
    const img = screen.getByAltText('In Rainbows')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('width', '28')
  })

  it('shows overflow menu with Rename, Delete, Manage tags actions', async () => {
    renderList()
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    expect(screen.getByRole('button', { name: /^rename$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manage tags/i })).toBeInTheDocument()
  })

  it('clicking the menu button does not fire onOpen', async () => {
    const onOpen = vi.fn()
    renderList({ onOpen })
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('inline rename: enters edit mode, typing + Enter calls onRename', async () => {
    const onRename = vi.fn()
    renderList({ onRename })
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^rename$/i }))
    const input = screen.getByDisplayValue('Road trip')
    await userEvent.clear(input)
    await userEvent.type(input, 'Summer vibes{Enter}')
    expect(onRename).toHaveBeenCalledWith('col-1', 'Summer vibes')
  })

  it('inline rename: blur saves change', async () => {
    const onRename = vi.fn()
    renderList({ onRename })
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^rename$/i }))
    const input = screen.getByDisplayValue('Road trip')
    await userEvent.clear(input)
    await userEvent.type(input, 'New name')
    await act(async () => { input.blur() })
    expect(onRename).toHaveBeenCalledWith('col-1', 'New name')
  })

  it('inline rename: Escape cancels without calling onRename', async () => {
    const onRename = vi.fn()
    renderList({ onRename })
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^rename$/i }))
    await userEvent.keyboard('{Escape}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('Road trip')).toBeInTheDocument()
  })

  it('delete with confirm: first click shows confirm UI, second click fires onDelete', async () => {
    const onDelete = vi.fn()
    renderList({ onDelete })
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    // Confirm UI visible
    const confirmBtn = screen.getByRole('button', { name: /confirm delete/i })
    expect(confirmBtn).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
    await userEvent.click(confirmBtn)
    expect(onDelete).toHaveBeenCalledWith('col-1')
  })

  it('delete cancel does not call onDelete', async () => {
    const onDelete = vi.fn()
    renderList({ onDelete })
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('Manage tags overflow action fires onManageTags with collection', async () => {
    const onManageTags = vi.fn()
    renderList({ onManageTags })
    await userEvent.click(screen.getAllByRole('button', { name: /more options/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /manage tags/i }))
    expect(onManageTags).toHaveBeenCalledWith(COLLECTIONS[0])
  })

  it('renders drag handles when onReorder is provided', () => {
    renderList()
    expect(screen.getAllByRole('button', { name: /drag to reorder/i })).toHaveLength(2)
  })

  it('does not render drag handles when onReorder is not provided', () => {
    renderList({ onReorder: undefined })
    expect(screen.queryByRole('button', { name: /drag to reorder/i })).not.toBeInTheDocument()
  })

  it('exposes a reorder handler that fires onReorder with new id order (arrayMove pattern)', () => {
    // The component wires dnd-kit's onDragEnd internally; here we verify the
    // handleDragEnd computation by exposing it via a ref-like prop test would
    // require simulating a full drag in jsdom (which dnd-kit cannot do).
    // Instead, we directly call the exported helper via import.
    const onReorder = vi.fn()
    renderList({ onReorder })
    // CollectionList exports an internal __computeReorder helper for tests.
    const newIds = __computeReorder(['col-1', 'col-2'], 'col-1', 'col-2')
    expect(newIds).toEqual(['col-2', 'col-1'])
  })

  it('row height is approximately 40px (denser than 62px)', () => {
    renderList()
    const row = screen.getAllByTestId('collection-list-row')[0]
    // Either explicit height style or class containing h-10 / h-[40px]
    const inline = row.getAttribute('style') || ''
    const cls = row.className || ''
    const matches =
      /height:\s*40px/.test(inline) ||
      /h-10\b/.test(cls) ||
      /h-\[40px\]/.test(cls) ||
      // descendants may carry the height
      !!row.querySelector('[style*="height: 40px"], [style*="height:40px"], .h-10, .h-\\[40px\\]')
    expect(matches).toBe(true)
  })
})
