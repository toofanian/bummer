import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionPicker from './CollectionPicker'
import { useIsMobile } from '../hooks/useIsMobile'

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: vi.fn().mockReturnValue(false) }))

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip' },
  { id: 'col-2', name: '90s classics' },
  { id: 'col-3', name: 'Workout' },
]

const defaultProps = {
  albumIds: ['album-1'],
  collections: COLLECTIONS,
  albumCollectionMap: { 'album-1': ['col-1'] },
  onBulkAdd: vi.fn(),
  onCreate: vi.fn(),
  onClose: vi.fn(),
}

function renderPicker(overrides = {}) {
  const props = { ...defaultProps, ...overrides }
  // Reset mocks
  props.onBulkAdd = overrides.onBulkAdd || vi.fn()
  props.onCreate = overrides.onCreate || vi.fn()
  props.onClose = overrides.onClose || vi.fn()
  return { ...render(<CollectionPicker {...props} />), props }
}

afterEach(() => useIsMobile.mockReturnValue(false))

describe('CollectionPicker', () => {
  // --- Rendering ---

  it('renders a backdrop overlay', () => {
    renderPicker()
    expect(screen.getByTestId('picker-backdrop')).toBeInTheDocument()
  })

  it('renders a search input with autofocus', () => {
    renderPicker()
    const input = screen.getByPlaceholderText(/search or create/i)
    expect(input).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('renders all collections as rows', () => {
    renderPicker()
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.getByText('90s classics')).toBeInTheDocument()
    expect(screen.getByText('Workout')).toBeInTheDocument()
  })

  it('shows checkmark for collections the album belongs to', () => {
    renderPicker()
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('aria-selected', 'true')
    expect(rows[1]).toHaveAttribute('aria-selected', 'false')
  })

  // --- Close behavior ---

  it('calls onClose when backdrop is clicked', async () => {
    const { props } = renderPicker()
    await userEvent.click(screen.getByTestId('picker-backdrop'))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', async () => {
    const { props } = renderPicker()
    await userEvent.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalled()
  })

  // --- Search/filter ---

  it('filters collections by search text', async () => {
    renderPicker()
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'road')
    expect(screen.getByText('Road trip')).toBeInTheDocument()
    expect(screen.queryByText('90s classics')).not.toBeInTheDocument()
  })

  it('shows "Create [name]" row when search does not match any collection', async () => {
    renderPicker()
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'Chill vibes')
    expect(screen.getByText(/create "chill vibes"/i)).toBeInTheDocument()
  })

  it('does not show "Create" row when search matches an existing collection', async () => {
    renderPicker()
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'Road trip')
    expect(screen.queryByText(/create "road trip"/i)).not.toBeInTheDocument()
  })

  // --- Bulk add (always) ---

  it('calls onBulkAdd when a collection row is clicked (single album)', async () => {
    const { props } = renderPicker()
    const rows = screen.getAllByRole('option')
    await userEvent.click(rows[1]) // "90s classics"
    expect(props.onBulkAdd).toHaveBeenCalledWith('col-2')
  })

  it('calls onBulkAdd when a collection row is clicked (multiple albums)', async () => {
    const { props } = renderPicker({ albumIds: ['album-1', 'album-2'] })
    const rows = screen.getAllByRole('option')
    await userEvent.click(rows[1])
    expect(props.onBulkAdd).toHaveBeenCalledWith('col-2')
  })

  // --- Create ---

  it('calls onCreate when "Create" row is clicked', async () => {
    const { props } = renderPicker()
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'Chill vibes')
    await userEvent.click(screen.getByText(/create "chill vibes"/i))
    expect(props.onCreate).toHaveBeenCalledWith('Chill vibes')
  })

  it('clears search after creating a collection', async () => {
    renderPicker()
    const input = screen.getByPlaceholderText(/search or create/i)
    await userEvent.type(input, 'Chill vibes')
    await userEvent.click(screen.getByText(/create "chill vibes"/i))
    expect(input).toHaveValue('')
  })

  // --- Keyboard navigation ---

  it('arrow down moves highlight to first collection', async () => {
    renderPicker()
    await userEvent.keyboard('{ArrowDown}')
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('data-highlighted', 'true')
  })

  it('arrow down then Enter calls onBulkAdd for the highlighted collection', async () => {
    const { props } = renderPicker()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    // First row is "Road trip"
    expect(props.onBulkAdd).toHaveBeenCalledWith('col-1')
  })

  it('arrow down wraps to first item after last', async () => {
    renderPicker()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('data-highlighted', 'true')
  })

  it('arrow up from first item wraps to last', async () => {
    renderPicker()
    await userEvent.keyboard('{ArrowDown}{ArrowUp}')
    const rows = screen.getAllByRole('option')
    expect(rows[rows.length - 1]).toHaveAttribute('data-highlighted', 'true')
  })

  it('typing resets highlight to first item', async () => {
    renderPicker()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), 'w')
    const rows = screen.getAllByRole('option')
    expect(rows[0]).toHaveAttribute('data-highlighted', 'true')
  })

  // --- Mobile ---

  it('renders with bottom-sheet positioning on mobile', () => {
    useIsMobile.mockReturnValue(true)
    renderPicker()
    expect(screen.getByTestId('picker-container')).toHaveClass('bottom-0')
  })

  it('search input has font-size 16px on mobile to prevent iOS zoom', () => {
    useIsMobile.mockReturnValue(true)
    renderPicker()
    const input = screen.getByPlaceholderText(/search or create/i)
    expect(input).toHaveClass('text-base')
  })

  // --- Empty state ---

  it('shows create prompt when no collections exist', () => {
    renderPicker({ collections: [] })
    expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
  })
})
