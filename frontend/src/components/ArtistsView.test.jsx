import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ArtistsView from './ArtistsView'

const ALBUMS = [
  { service_id: 'a1', name: 'OK Computer', artists: ['Radiohead'], image_url: '/rc1.jpg', release_date: '1997', added_at: '2024-01-01', total_tracks: 12 },
  { service_id: 'a2', name: 'Kid A', artists: ['Radiohead'], image_url: '/rc2.jpg', release_date: '2000', added_at: '2024-02-01', total_tracks: 10 },
  { service_id: 'a3', name: 'Blue Train', artists: ['John Coltrane'], image_url: '/jc1.jpg', release_date: '1958', added_at: '2024-03-01', total_tracks: 5 },
  { service_id: 'a4', name: 'Dummy', artists: ['Portishead'], image_url: '/ph1.jpg', release_date: '1994', added_at: '2024-04-01', total_tracks: 11 },
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

  it('shows composite thumbnail from up to 4 album covers', () => {
    render(<ArtistsView {...defaultProps} />)
    const radioheadRow = screen.getByTestId('artist-row-Radiohead')
    const images = radioheadRow.querySelectorAll('img')
    expect(images.length).toBe(2) // Radiohead has 2 albums
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
