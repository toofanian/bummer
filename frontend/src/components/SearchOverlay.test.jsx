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

const COLLECTIONS = [
  { id: 'col-1', name: 'Road Trip', album_count: 5 },
  { id: 'col-2', name: '90s Classics', album_count: 12 },
  { id: 'col-3', name: 'Chill Vibes', album_count: 3 },
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

  // --- Common ---

  it('renders search input that is autofocused', () => {
    render(<SearchOverlay {...defaultProps} />)
    const input = screen.getByPlaceholderText(/search/i)
    expect(input).toBeInTheDocument()
    expect(document.activeElement).toBe(input)
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

  // --- Albums mode ---

  describe('albums mode', () => {
    it('shows empty hint when query is blank', () => {
      render(<SearchOverlay {...defaultProps} mode="albums" />)
      expect(screen.queryByTestId(/album-card-/)).not.toBeInTheDocument()
      expect(screen.getByText(/search your library/i)).toBeInTheDocument()
    })

    it('filters albums by name', async () => {
      const user = userEvent.setup()
      render(<SearchOverlay {...defaultProps} mode="albums" />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Room')
      expect(screen.getByTestId('album-card-id2')).toBeInTheDocument()
      expect(screen.queryByTestId('album-card-id1')).not.toBeInTheDocument()
    })

    it('filters albums by artist', async () => {
      const user = userEvent.setup()
      render(<SearchOverlay {...defaultProps} mode="albums" />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Sade')
      expect(screen.getByTestId('album-card-id1')).toBeInTheDocument()
      expect(screen.getByTestId('album-card-id3')).toBeInTheDocument()
      expect(screen.queryByTestId('album-card-id2')).not.toBeInTheDocument()
    })

    it('shows no results when nothing matches', async () => {
      const user = userEvent.setup()
      render(<SearchOverlay {...defaultProps} mode="albums" />)
      await user.type(screen.getByPlaceholderText(/search/i), 'zzzzz')
      expect(screen.getByText(/no results/i)).toBeInTheDocument()
    })

    it('shows collection add button when onToggleSelect provided', async () => {
      const user = userEvent.setup()
      const onToggleSelect = vi.fn()
      render(<SearchOverlay {...defaultProps} mode="albums" onToggleSelect={onToggleSelect} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Love')
      expect(screen.getByLabelText(/add to collection/i)).toBeInTheDocument()
    })
  })

  // --- Artists mode ---

  describe('artists mode', () => {
    const artistProps = { ...defaultProps, mode: 'artists' }

    it('shows empty hint when query is blank', () => {
      render(<SearchOverlay {...artistProps} />)
      expect(screen.getByText(/search by artist name/i)).toBeInTheDocument()
    })

    it('filters by artist name', async () => {
      const user = userEvent.setup()
      render(<SearchOverlay {...artistProps} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Sade')
      expect(screen.getByTestId('artist-row-Sade')).toBeInTheDocument()
      expect(screen.queryByTestId('artist-row-The Strokes')).not.toBeInTheDocument()
    })

    it('clicking artist row calls onSelectArtist and onClose', async () => {
      const user = userEvent.setup()
      const onSelectArtist = vi.fn()
      render(<SearchOverlay {...artistProps} onSelectArtist={onSelectArtist} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Sade')
      await user.click(screen.getByTestId('artist-row-Sade'))
      expect(onSelectArtist).toHaveBeenCalledWith('Sade')
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('shows no results when nothing matches', async () => {
      const user = userEvent.setup()
      render(<SearchOverlay {...artistProps} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'zzzzz')
      expect(screen.getByText(/no results/i)).toBeInTheDocument()
    })

    it('renders AlbumArtStrip instead of ArtistThumbnail', async () => {
      const user = userEvent.setup()
      render(<SearchOverlay {...artistProps} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Sade')
      const row = screen.getByTestId('artist-row-Sade')
      // AlbumArtStrip renders album cover images directly
      const images = row.querySelectorAll('img')
      expect(images.length).toBe(2) // Sade has 2 albums
      expect(images[0]).toHaveAttribute('alt', 'Love Deluxe')
      expect(images[1]).toHaveAttribute('alt', 'Sahara')
      // Should NOT have the old 2x2 thumbnail grid
      expect(row.querySelector('.grid-cols-2')).not.toBeInTheDocument()
    })
  })

  // --- Collections mode ---

  describe('collections mode', () => {
    const collectionProps = { ...defaultProps, mode: 'collections', collections: COLLECTIONS }

    it('shows empty hint when query is blank', () => {
      render(<SearchOverlay {...collectionProps} />)
      expect(screen.getByText(/search your collections/i)).toBeInTheDocument()
    })

    it('filters collections by name', async () => {
      const user = userEvent.setup()
      render(<SearchOverlay {...collectionProps} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Road')
      expect(screen.getByTestId('collection-row-col-1')).toBeInTheDocument()
      expect(screen.queryByTestId('collection-row-col-2')).not.toBeInTheDocument()
    })

    it('clicking collection row calls onEnterCollection and onClose', async () => {
      const user = userEvent.setup()
      const onEnterCollection = vi.fn()
      render(<SearchOverlay {...collectionProps} onEnterCollection={onEnterCollection} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'Road')
      await user.click(screen.getByTestId('collection-row-col-1'))
      expect(onEnterCollection).toHaveBeenCalledWith(COLLECTIONS[0])
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('shows no results when nothing matches', async () => {
      const user = userEvent.setup()
      render(<SearchOverlay {...collectionProps} />)
      await user.type(screen.getByPlaceholderText(/search/i), 'zzzzz')
      expect(screen.getByText(/no results/i)).toBeInTheDocument()
    })
  })
})
