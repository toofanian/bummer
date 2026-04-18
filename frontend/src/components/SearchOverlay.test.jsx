import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchOverlay from './SearchOverlay'

const ALBUMS = [
  {
    service_id: 'id1',
    name: 'Love Deluxe',
    artists: ['Sade'],
    image_url: 'https://example.com/cover1.jpg',
  },
  {
    service_id: 'id2',
    name: 'Room On Fire',
    artists: ['The Strokes'],
    image_url: 'https://example.com/cover2.jpg',
  },
  {
    service_id: 'id3',
    name: 'Sahara',
    artists: ['Sade'],
    image_url: 'https://example.com/cover3.jpg',
  },
]

describe('SearchOverlay', () => {
  const defaultProps = {
    albums: ALBUMS,
    onClose: vi.fn(),
    onPlay: vi.fn(),
    onPlayTrack: vi.fn(),
    onFetchTracks: vi.fn(),
    playback: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders search input that is autofocused', () => {
    render(<SearchOverlay {...defaultProps} />)
    const input = screen.getByPlaceholderText(/search/i)
    expect(input).toBeInTheDocument()
    expect(document.activeElement).toBe(input)
  })

  it('shows empty state when query is blank', () => {
    render(<SearchOverlay {...defaultProps} />)
    expect(screen.queryByTestId(/album-card-/)).not.toBeInTheDocument()
    expect(screen.getByText(/search your library/i)).toBeInTheDocument()
  })

  it('filters albums by name when typing', async () => {
    const user = userEvent.setup()
    render(<SearchOverlay {...defaultProps} />)
    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'Room')
    expect(screen.getByTestId('album-card-id2')).toBeInTheDocument()
    expect(screen.queryByTestId('album-card-id1')).not.toBeInTheDocument()
  })

  it('filters albums by artist when typing', async () => {
    const user = userEvent.setup()
    render(<SearchOverlay {...defaultProps} />)
    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'Sade')
    expect(screen.getByTestId('album-card-id1')).toBeInTheDocument()
    expect(screen.getByTestId('album-card-id3')).toBeInTheDocument()
    expect(screen.queryByTestId('album-card-id2')).not.toBeInTheDocument()
  })

  it('shows no results message when query has no matches', async () => {
    const user = userEvent.setup()
    render(<SearchOverlay {...defaultProps} />)
    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'zzzznonexistent')
    expect(screen.getByText(/no results/i)).toBeInTheDocument()
  })

  it('cancel button calls onClose', async () => {
    const user = userEvent.setup()
    render(<SearchOverlay {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('escape key calls onClose', () => {
    render(<SearchOverlay {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})
