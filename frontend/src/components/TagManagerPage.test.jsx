import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagManagerPage from './TagManagerPage'

// Tags forming a small tree:
// - Genre (root)
//   - Rock (child)
// - Mood (root)
const TAGS = [
  { id: 'genre', name: 'Genre', parent_tag_id: null, position: 0 },
  { id: 'rock', name: 'Rock', parent_tag_id: 'genre', position: 0 },
  { id: 'mood', name: 'Mood', parent_tag_id: null, position: 1 },
]

function renderManager(overrides = {}) {
  const props = {
    tags: TAGS,
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onCreate: vi.fn().mockResolvedValue({ id: 'new-tag' }),
    onMove: vi.fn().mockResolvedValue(undefined),
    onReorder: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  }
  const utils = render(<TagManagerPage {...props} />)
  return { ...utils, props }
}

describe('TagManagerPage', () => {
  it('renders nested tags as a tree', () => {
    renderManager()
    expect(screen.getByText('Genre')).toBeInTheDocument()
    expect(screen.getByText('Rock')).toBeInTheDocument()
    expect(screen.getByText('Mood')).toBeInTheDocument()
  })

  it('renders header with title, back button, and new tag button', () => {
    const { props } = renderManager()
    expect(screen.getByRole('heading', { name: /tag manager/i })).toBeInTheDocument()
    const back = screen.getByRole('button', { name: /back/i })
    expect(back).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new tag/i })).toBeInTheDocument()
  })

  it('back button calls onClose', async () => {
    const user = userEvent.setup()
    const { props } = renderManager()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('renders empty state when no tags', () => {
    renderManager({ tags: [] })
    expect(screen.getByText(/no tags yet/i)).toBeInTheDocument()
  })

  it('rename calls onRename(tagId, newName)', async () => {
    const user = userEvent.setup()
    const { props } = renderManager()

    // Click the tag name to start renaming
    await user.click(screen.getByText('Mood'))
    const input = screen.getByDisplayValue('Mood')
    await user.clear(input)
    await user.type(input, 'Vibes')
    await user.keyboard('{Enter}')

    expect(props.onRename).toHaveBeenCalledWith('mood', 'Vibes')
  })

  it('delete shows confirmation, then calls onDelete on confirm', async () => {
    const user = userEvent.setup()
    const { props } = renderManager()

    // Find delete buttons; pick the one for Mood
    const moodRow = screen.getByTestId('tag-row-mood')
    const deleteBtn = within(moodRow).getByRole('button', { name: /delete/i })
    await user.click(deleteBtn)

    // Confirmation appears
    const confirmBtn = within(moodRow).getByRole('button', { name: /confirm delete/i })
    await user.click(confirmBtn)

    expect(props.onDelete).toHaveBeenCalledWith('mood')
  })

  it('add child calls onCreate with parent_tag_id', async () => {
    const user = userEvent.setup()
    const { props } = renderManager()

    const genreRow = screen.getByTestId('tag-row-genre')
    const addChildBtn = within(genreRow).getByRole('button', { name: /add child/i })
    await user.click(addChildBtn)

    const input = screen.getByPlaceholderText(/new child tag/i)
    await user.type(input, 'Jazz')
    await user.keyboard('{Enter}')

    expect(props.onCreate).toHaveBeenCalledWith({ name: 'Jazz', parent_tag_id: 'genre' })
  })

  it('new tag button creates a root-level tag', async () => {
    const user = userEvent.setup()
    const { props } = renderManager()

    await user.click(screen.getByRole('button', { name: /new tag/i }))
    const input = screen.getByPlaceholderText(/new tag/i)
    await user.type(input, 'Decade')
    await user.keyboard('{Enter}')

    expect(props.onCreate).toHaveBeenCalledWith({ name: 'Decade', parent_tag_id: null })
  })

  it('reorder under same parent calls onReorder(parentId, [...tagIds])', async () => {
    const { props } = renderManager()
    // Programmatically invoke the reorder handler exposed for tests via window.
    // Since dnd-kit drag is hard to simulate in jsdom, we use the test-only hook
    // exposed by the component.
    const handler = window.__tagManagerTestHandlers
    expect(handler).toBeDefined()

    handler.handleReorder(null, ['mood', 'genre'])
    expect(props.onReorder).toHaveBeenCalledWith(null, ['mood', 'genre'])
  })

  it('reparent calls onMove(tagId, { parent_tag_id, position })', async () => {
    const { props } = renderManager()
    const handler = window.__tagManagerTestHandlers
    expect(handler).toBeDefined()

    handler.handleMove('rock', { parent_tag_id: 'mood', position: 0 })
    expect(props.onMove).toHaveBeenCalledWith('rock', { parent_tag_id: 'mood', position: 0 })
  })
})
