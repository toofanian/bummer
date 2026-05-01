import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ArtistsView from './ArtistsView'

const ALBUMS = [
  { service_id: 'a1', name: 'OK Computer', artists: [{ name: 'Radiohead', id: 'rh1' }], image_url: '/rc1.jpg', release_date: '1997', added_at: '2024-01-01', total_tracks: 12 },
  { service_id: 'a2', name: 'Kid A', artists: [{ name: 'Radiohead', id: 'rh1' }], image_url: '/rc2.jpg', release_date: '2000', added_at: '2024-02-01', total_tracks: 10 },
  { service_id: 'a3', name: 'Blue Train', artists: [{ name: 'John Coltrane', id: 'jc1' }], image_url: '/jc1.jpg', release_date: '1958', added_at: '2024-03-01', total_tracks: 5 },
  { service_id: 'a4', name: 'Dummy', artists: [{ name: 'Portishead', id: 'ph1' }], image_url: '/ph1.jpg', release_date: '1994', added_at: '2024-04-01', total_tracks: 11 },
]

const defaultProps = {
  albums: ALBUMS,
  search: '',
  onFetchTracks: vi.fn().mockResolvedValue([]),
  onPlay: vi.fn(),
  onPlayTrack: vi.fn(),
  playingId: null,
  playingTrackName: null,
  collections: [],
  albumCollectionMap: {},
  onToggleCollection: vi.fn(),
  onCreateCollection: vi.fn(),
}

describe('ArtistsView — artist list', () => {
  it('groups albums by artist and shows sorted artist names', () => {
    render(<ArtistsView {...defaultProps} />)
    const artists = screen.getAllByTestId(/^artist-row-/)
    const names = artists.map(el => within(el).getByTestId('artist-name').textContent)
    expect(names).toEqual(['John Coltrane', 'Portishead', 'Radiohead'])
  })

  it('shows album count per artist', () => {
    render(<ArtistsView {...defaultProps} />)
    const radioheadRow = screen.getByTestId('artist-row-Radiohead')
    expect(radioheadRow).toHaveTextContent('2 albums')
  })

  it('shows AlbumArtStrip images for each artist row', () => {
    render(<ArtistsView {...defaultProps} />)
    const radioheadRow = screen.getByTestId('artist-row-Radiohead')
    const images = radioheadRow.querySelectorAll('img')
    expect(images.length).toBe(2) // Radiohead has 2 albums
    expect(images[0].src).toContain('/rc1.jpg')
    expect(images[1].src).toContain('/rc2.jpg')
  })

  it('renders AlbumArtStrip images at 62px size', () => {
    render(<ArtistsView {...defaultProps} />)
    const radioheadRow = screen.getByTestId('artist-row-Radiohead')
    const images = radioheadRow.querySelectorAll('img')
    expect(images[0].getAttribute('width')).toBe('62')
    expect(images[0].getAttribute('height')).toBe('62')
  })

  it('filters artists by artist name matching search', () => {
    render(<ArtistsView {...defaultProps} search="coltrane" />)
    const artists = screen.getAllByTestId(/^artist-row-/)
    expect(artists.length).toBe(1)
    expect(artists[0]).toHaveTextContent('John Coltrane')
  })

  it('filters artists by album name matching search (shows all artist albums)', () => {
    render(<ArtistsView {...defaultProps} search="kid a" />)
    const artists = screen.getAllByTestId(/^artist-row-/)
    expect(artists.length).toBe(1)
    expect(artists[0]).toHaveTextContent('Radiohead')
  })

  it('shows empty state when no artists match search', () => {
    render(<ArtistsView {...defaultProps} search="zzzzz" />)
    expect(screen.queryAllByTestId(/^artist-row-/)).toHaveLength(0)
    expect(screen.getByText(/no artists/i)).toBeInTheDocument()
  })
})

describe('ArtistsView — artist detail', () => {
  it('navigates to artist detail when an artist row is clicked', async () => {
    render(<ArtistsView {...defaultProps} />)
    await userEvent.click(screen.getByTestId('artist-row-Radiohead'))
    expect(screen.getByText('← Back')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Radiohead' })).toBeInTheDocument()
    expect(screen.getByText('2 albums')).toBeInTheDocument()
  })

  it('shows all albums by the selected artist in an AlbumTable', async () => {
    render(<ArtistsView {...defaultProps} />)
    await userEvent.click(screen.getByTestId('artist-row-Radiohead'))
    expect(screen.getByText('OK Computer')).toBeInTheDocument()
    expect(screen.getByText('Kid A')).toBeInTheDocument()
    expect(screen.queryByText('Blue Train')).not.toBeInTheDocument()
  })

  it('returns to artist list when Back is clicked', async () => {
    render(<ArtistsView {...defaultProps} />)
    await userEvent.click(screen.getByTestId('artist-row-Radiohead'))
    await userEvent.click(screen.getByText('← Back'))
    expect(screen.getByTestId('artist-row-Radiohead')).toBeInTheDocument()
  })
})

describe('ArtistsView — targetArtist navigation', () => {
  it('auto-selects artist detail when targetArtist is provided', () => {
    render(<ArtistsView {...defaultProps} targetArtist="Radiohead" />)
    expect(screen.getByRole('heading', { name: 'Radiohead' })).toBeInTheDocument()
    expect(screen.getByText('← Back')).toBeInTheDocument()
  })

  it('calls onClearTargetArtist after navigating to the target artist', () => {
    const onClearTargetArtist = vi.fn()
    render(<ArtistsView {...defaultProps} targetArtist="Radiohead" onClearTargetArtist={onClearTargetArtist} />)
    expect(onClearTargetArtist).toHaveBeenCalled()
  })

  it('shows the artist list normally when targetArtist is null', () => {
    render(<ArtistsView {...defaultProps} targetArtist={null} />)
    expect(screen.getByTestId('artist-row-Radiohead')).toBeInTheDocument()
    expect(screen.getByTestId('artist-row-John Coltrane')).toBeInTheDocument()
  })
})

describe('ArtistsView — artist profile images', () => {
  it('renders artist profile image when artistImages prop provides URL', () => {
    const artistImages = { 'John Coltrane': 'https://img/jc.jpg' }
    render(<ArtistsView {...defaultProps} artistImages={artistImages} />)
    const row = screen.getByTestId('artist-row-John Coltrane')
    const img = within(row).getByAltText('John Coltrane')
    expect(img).toBeInTheDocument()
    expect(img.src).toContain('https://img/jc.jpg')
    expect(img.className).toContain('rounded-full')
  })

  it('renders letter fallback when artistImages has no URL for artist', () => {
    render(<ArtistsView {...defaultProps} artistImages={{}} />)
    const row = screen.getByTestId('artist-row-John Coltrane')
    expect(within(row).queryByAltText('John Coltrane')).not.toBeInTheDocument()
  })
})

describe('ArtistsView — lazy rendering', () => {
  let intersectionCallback = null
  const mockObserverInstance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
  }

  beforeEach(() => {
    intersectionCallback = null
    global.IntersectionObserver = vi.fn(function (callback) {
      intersectionCallback = callback
      return mockObserverInstance
    })
  })

  it('renders only first 30 artist rows when list exceeds batch size', () => {
    const manyAlbums = Array.from({ length: 35 }, (_, i) => ({
      service_id: `a${i}`,
      name: `Album ${i}`,
      artists: [{ name: `Artist ${i}`, id: `ar${i}` }],
      image_url: `/img${i}.jpg`,
      release_date: '2024',
      added_at: '2024-01-01',
      total_tracks: 10,
    }))
    render(<ArtistsView {...defaultProps} albums={manyAlbums} />)
    const rows = screen.getAllByTestId(/^artist-row-/)
    expect(rows).toHaveLength(30)
    expect(document.querySelector('[data-testid="load-more-sentinel"]')).toBeInTheDocument()
  })

  it('renders all artist rows when list is 30 or fewer', () => {
    render(<ArtistsView {...defaultProps} />)
    expect(document.querySelector('[data-testid="load-more-sentinel"]')).not.toBeInTheDocument()
  })
})
