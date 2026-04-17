import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlbumTable from './AlbumTable'
import { useIsMobile } from '../hooks/useIsMobile'

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: vi.fn().mockReturnValue(false) }))

const ALBUMS = [
  {
    spotify_id: 'id1',
    service_id: 'id1',
    name: 'Love Deluxe',
    artists: ['Sade'],
    release_date: '1992-09-14',
    total_tracks: 8,
    image_url: 'https://example.com/cover1.jpg',
    added_at: '2021-03-15T00:00:00Z',
  },
  {
    spotify_id: 'id2',
    service_id: 'id2',
    name: 'Room On Fire',
    artists: ['The Strokes'],
    release_date: '2003-10-28',
    total_tracks: 11,
    image_url: 'https://example.com/cover2.jpg',
    added_at: '2020-07-04T00:00:00Z',
  },
]

const COLLECTIONS = [
  { id: 'col-1', name: 'Road trip' },
  { id: 'col-2', name: '90s classics' },
]

describe('AlbumTable', () => {
  it('renders column headers', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getByRole('columnheader', { name: /album/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /artist/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /year/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /date added/i })).toBeInTheDocument()
  })

  it('renders one row per album', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getAllByRole('row')).toHaveLength(ALBUMS.length + 1) // +1 for header row
  })

  it('renders album name and artist in each row', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getByText('Love Deluxe')).toBeInTheDocument()
    expect(screen.getByText('Sade')).toBeInTheDocument()
    expect(screen.getByText('Room On Fire')).toBeInTheDocument()
    expect(screen.getByText('The Strokes')).toBeInTheDocument()
  })

  it('shows release year not full date', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getByText('1992')).toBeInTheDocument()
    expect(screen.getByText('2003')).toBeInTheDocument()
    expect(screen.queryByText('1992-09-14')).not.toBeInTheDocument()
  })

  it('formats date added as a readable date', () => {
    render(<AlbumTable albums={ALBUMS} />)

    expect(screen.getByText('Mar 15, 2021')).toBeInTheDocument()
    expect(screen.getByText('Jul 4, 2020')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<AlbumTable albums={[]} loading={true} />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no albums', () => {
    render(<AlbumTable albums={[]} loading={false} />)

    expect(screen.getByText(/no albums/i)).toBeInTheDocument()
  })

  it('sorts by album name ascending when header is clicked', async () => {
    render(<AlbumTable albums={ALBUMS} />)

    await userEvent.click(screen.getByRole('columnheader', { name: /album/i }))

    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('Love Deluxe')
    expect(rows[1]).toHaveTextContent('Room On Fire')
  })

  it('sorts by album name descending on second click', async () => {
    render(<AlbumTable albums={ALBUMS} />)

    const header = screen.getByRole('columnheader', { name: /album/i })
    await userEvent.click(header)
    await userEvent.click(header)

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Room On Fire')
    expect(rows[1]).toHaveTextContent('Love Deluxe')
  })

  it('does not render a Tier column', () => {
    render(<AlbumTable albums={ALBUMS} />)
    expect(screen.queryByRole('columnheader', { name: /tier/i })).not.toBeInTheDocument()
  })

  it('renders album art image for each row', () => {
    render(<AlbumTable albums={ALBUMS} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(ALBUMS.length)
    expect(images[0]).toHaveAttribute('src', 'https://example.com/cover1.jpg')
  })

  it('renders a placeholder when image_url is null', () => {
    const albumsNoArt = [{ ...ALBUMS[0], image_url: null }]
    render(<AlbumTable albums={albumsNoArt} />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'No cover')
  })

  // --- Track expansion ---

  it('renders an expand button for each row', () => {
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} />)
    expect(screen.getAllByRole('button', { name: /expand/i })).toHaveLength(ALBUMS.length)
  })

  it('expand button has a font-size of at least 20px so the arrow is clearly visible', () => {
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} />)
    const btn = screen.getAllByRole('button', { name: /expand/i })[0]
    const fontSize = parseInt(btn.style.fontSize, 10)
    expect(fontSize).toBeGreaterThanOrEqual(20)
  })

  it('calls onFetchTracks with spotify_id when expand is clicked', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue([])
    render(<AlbumTable albums={ALBUMS} onFetchTracks={onFetchTracks} />)

    await userEvent.click(screen.getAllByRole('button', { name: /expand/i })[0])

    expect(onFetchTracks).toHaveBeenCalledWith('id1')
  })

  it('shows tracks after expansion', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
      { track_number: 2, name: 'Feel No Pain',     duration: '5:42', spotify_id: 'tid2', service_id: 'tid2' },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(<AlbumTable albums={ALBUMS} onFetchTracks={onFetchTracks} />)

    await userEvent.click(screen.getAllByRole('button', { name: /expand/i })[0])

    expect(await screen.findByText('No Ordinary Love')).toBeInTheDocument()
    expect(await screen.findByText('Feel No Pain')).toBeInTheDocument()
    expect(await screen.findByText('4:25')).toBeInTheDocument()
  })

  it('collapses tracks on second click', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue([
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ])
    render(<AlbumTable albums={ALBUMS} onFetchTracks={onFetchTracks} />)

    const btn = screen.getAllByRole('button', { name: /expand/i })[0]
    await userEvent.click(btn)
    await screen.findByText('No Ordinary Love')

    await userEvent.click(screen.getAllByRole('button', { name: /collapse/i })[0])

    expect(screen.queryByText('No Ordinary Love')).not.toBeInTheDocument()
  })

  // --- Expand icon visual fix: chevron, not triangle ---

  it('expand button does not use a solid triangle play-like character', () => {
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} />)
    const btn = screen.getAllByRole('button', { name: /expand/i })[0]
    // Must NOT use ▶ (solid right-pointing triangle = play icon)
    expect(btn.textContent).not.toBe('▶')
  })

  it('expanded row collapse button does not use a solid down-triangle', () => {
    // The expand-btn should contain a span with class expand-chevron for CSS rotation
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} />)
    const btn = screen.getAllByRole('button', { name: /expand/i })[0]
    expect(btn).toHaveClass('expand-btn')
    // The inner element (span) should have class expand-chevron for CSS rotation
    expect(btn.querySelector('.expand-chevron')).not.toBeNull()
  })

  it('expanded row has rotate class on expand-chevron when expanded', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue([
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ])
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} />)

    const btn = screen.getByRole('button', { name: /expand/i })
    const chevron = btn.querySelector('.expand-chevron')
    expect(chevron).not.toHaveClass('expanded')

    await userEvent.click(btn)
    await screen.findByText('No Ordinary Love')

    expect(btn.querySelector('.expand-chevron')).toHaveClass('expanded')
  })

  // --- Per-track play button ---

  it('does not render track play buttons when onPlayTrack is not provided', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} />)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    expect(screen.queryByRole('button', { name: /play track/i })).not.toBeInTheDocument()
  })

  // --- Play button column removed; single-click to play ---

  it('does not render a play button column in the album rows', () => {
    render(<AlbumTable albums={ALBUMS} onPlay={() => {}} />)
    // The old play column had buttons with aria-label "Play" or "Pause"
    // These should no longer exist as dedicated column buttons
    expect(screen.queryByRole('button', { name: /^play$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^pause$/i })).not.toBeInTheDocument()
  })

  it('clicking an album row calls onPlay with that album spotify_id', async () => {
    const onPlay = vi.fn().mockResolvedValue(null)
    render(<AlbumTable albums={ALBUMS} onPlay={onPlay} onFetchTracks={() => {}} />)

    const rows = screen.getAllByRole('row').slice(1) // skip header
    await userEvent.dblClick(rows[0])

    expect(onPlay).toHaveBeenCalledWith('id1')
  })

  it('clicking an album row does not call onPlay when onPlay is not provided', async () => {
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} />)
    const rows = screen.getAllByRole('row').slice(1)
    // Should not throw; onPlay is undefined
    await userEvent.click(rows[0])
    // No assertion needed — just verify no crash
  })

  it('clicking a track row calls onPlayTrack with track URI', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    const onPlayTrack = vi.fn()
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} onPlayTrack={onPlayTrack} />)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    const trackRow = screen.getAllByRole('row').find(r => r.classList.contains('track-row'))
    await userEvent.click(trackRow)

    expect(onPlayTrack).toHaveBeenCalledWith('spotify:track:tid1')
  })

  // --- Now playing row indicator ---

  it('shows a now-playing indicator on the album row when playingId matches', () => {
    render(<AlbumTable albums={ALBUMS} onPlay={() => {}} playingId="id1" />)
    const rows = screen.getAllByRole('row').slice(1)
    // The playing row has a 'now-playing' class on the <tr> for CSS waveform animation
    expect(rows[0].classList.contains('now-playing')).toBe(true)
  })

  it('does not show a now-playing indicator on non-playing rows', () => {
    render(<AlbumTable albums={ALBUMS} onPlay={() => {}} playingId="id1" />)
    const rows = screen.getAllByRole('row').slice(1)
    // rows[1] is "Room On Fire" — not playing
    expect(rows[1].querySelector('.now-playing-indicator')).toBeNull()
  })

  it('shows no now-playing indicator when playingId is null', () => {
    render(<AlbumTable albums={ALBUMS} onPlay={() => {}} playingId={null} />)
    const rows = screen.getAllByRole('row').slice(1)
    rows.forEach(row => {
      expect(row.querySelector('.now-playing-indicator')).toBeNull()
    })
  })

  it('shows now-playing indicator on track row when playingTrackId matches', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
      { track_number: 2, name: 'Feel No Pain',     duration: '5:42', spotify_id: 'tid2', service_id: 'tid2' },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(
      <AlbumTable
        albums={[ALBUMS[0]]}
        onFetchTracks={onFetchTracks}
        onPlayTrack={() => {}}
        playingTrackId="tid1"
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    const trackRows = screen.getAllByRole('row').filter(r => r.classList.contains('track-row'))
    expect(trackRows[0].querySelector('.now-playing-indicator')).not.toBeNull()
    expect(trackRows[1].querySelector('.now-playing-indicator')).toBeNull()
  })

  // --- Keyboard navigation ---

  it('album rows have tabIndex=0 so they are focusable', () => {
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} onPlay={() => {}} />)
    const rows = screen.getAllByRole('row').slice(1) // skip header
    rows.forEach(row => {
      expect(row).toHaveAttribute('tabindex', '0')
    })
  })

  it('focused album row has a visible focus style (focus-visible class or outline)', () => {
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} onPlay={() => {}} />)
    const row = screen.getAllByRole('row')[1]
    // The row should have the album-row class which carries CSS focus styling
    expect(row).toHaveClass('album-row')
  })

  it('pressing ArrowRight on a focused album row expands it', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue([
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ])
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} />)

    const row = screen.getAllByRole('row')[1] // first album row
    row.focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(await screen.findByText('No Ordinary Love')).toBeInTheDocument()
  })

  it('pressing ArrowLeft on a focused expanded album row collapses it', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue([
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ])
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} />)

    const row = screen.getAllByRole('row')[1]
    row.focus()
    await userEvent.keyboard('{ArrowRight}')
    await screen.findByText('No Ordinary Love')

    await userEvent.keyboard('{ArrowLeft}')

    expect(screen.queryByText('No Ordinary Love')).not.toBeInTheDocument()
  })

  it('pressing Enter on a focused album row calls onPlay', async () => {
    const onPlay = vi.fn().mockResolvedValue(null)
    render(<AlbumTable albums={[ALBUMS[0]]} onPlay={onPlay} onFetchTracks={() => {}} />)

    const row = screen.getAllByRole('row')[1]
    row.focus()
    await userEvent.keyboard('{Enter}')

    expect(onPlay).toHaveBeenCalledWith('id1')
  })

  it('pressing Escape on a focused album row blurs it', async () => {
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={() => {}} />)

    const row = screen.getAllByRole('row')[1]
    row.focus()
    expect(document.activeElement).toBe(row)

    await userEvent.keyboard('{Escape}')

    expect(document.activeElement).not.toBe(row)
  })

  it('track rows have tabIndex=0 so they are focusable', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
      { track_number: 2, name: 'Feel No Pain',     duration: '5:42', spotify_id: 'tid2', service_id: 'tid2' },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} onPlayTrack={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    const trackRows = screen.getAllByRole('row').filter(r => r.classList.contains('track-row'))
    trackRows.forEach(row => {
      expect(row).toHaveAttribute('tabindex', '0')
    })
  })

  it('pressing Enter on a focused track row calls onPlayTrack', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    const onPlayTrack = vi.fn()
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} onPlayTrack={onPlayTrack} />)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    const trackRow = screen.getAllByRole('row').find(r => r.classList.contains('track-row'))
    trackRow.focus()
    await userEvent.keyboard('{Enter}')

    expect(onPlayTrack).toHaveBeenCalledWith('spotify:track:tid1')
  })

  it('pressing Escape on a focused track row blurs it', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} onPlayTrack={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    const trackRow = screen.getAllByRole('row').find(r => r.classList.contains('track-row'))
    trackRow.focus()
    expect(document.activeElement).toBe(trackRow)

    await userEvent.keyboard('{Escape}')

    expect(document.activeElement).not.toBe(trackRow)
  })

  // --- Track list header and artists column ---

  it('renders a header row inside the expanded section with Name, Artists, Duration labels', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1', artists: ['Sade'] },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} />)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Artists')).toBeInTheDocument()
    expect(screen.getByText('Duration')).toBeInTheDocument()
  })

  it('renders artists cell with artist names in track rows', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1', artists: ['Sade', 'Extra Artist'] },
      { track_number: 2, name: 'Feel No Pain',     duration: '5:42', spotify_id: 'tid2', service_id: 'tid2', artists: ['Sade'] },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} />)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    expect(screen.getByText('Sade, Extra Artist')).toBeInTheDocument()
    expect(screen.getAllByText('Sade')).toHaveLength(2) // one in album row, one in track row
  })

  it('renders artists cell gracefully when artists is missing from track', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1' },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(<AlbumTable albums={[ALBUMS[0]]} onFetchTracks={onFetchTracks} />)

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    // Should not throw; artists cell renders empty string
    const trackRows = screen.getAllByRole('row').filter(r => r.classList.contains('track-row'))
    expect(trackRows).toHaveLength(1)
  })

  it('highlights the currently playing track row with now-playing background when expanded', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1', artists: ['Sade'] },
      { track_number: 2, name: 'Feel No Pain',     duration: '5:42', spotify_id: 'tid2', service_id: 'tid2', artists: ['Sade'] },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(
      <AlbumTable
        albums={[ALBUMS[0]]}
        onFetchTracks={onFetchTracks}
        onPlayTrack={() => {}}
        playingId="id1"
        playingTrackName="No Ordinary Love"
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    const trackRows = screen.getAllByRole('row').filter(r => r.classList.contains('track-row'))
    // The active track row should have the now-playing class
    expect(trackRows[0].classList.contains('now-playing')).toBe(true)
    // The non-active track row should not
    expect(trackRows[1].classList.contains('now-playing')).toBe(false)
  })

  // reset mobile mock to desktop after each test in this describe block
  afterEach(() => useIsMobile.mockReturnValue(false))

  // --- Playing album row equalizer indicator ---

  it('shows equalizer indicator replacing album art when album is playing (desktop)', () => {
    render(<AlbumTable albums={ALBUMS} onPlay={() => {}} playingId="id1" />)
    const rows = screen.getAllByRole('row').slice(1)
    // Playing row should have an equalizer indicator
    expect(rows[0].querySelector('.now-playing-indicator')).not.toBeNull()
    expect(rows[0].querySelector('.now-playing-indicator .eq-bar')).not.toBeNull()
    // Non-playing row should still show album art image
    expect(rows[1].querySelector('.now-playing-indicator')).toBeNull()
    expect(rows[1].querySelector('img')).not.toBeNull()
  })

  it('playing album row hides album art image and shows equalizer instead', () => {
    render(<AlbumTable albums={ALBUMS} onPlay={() => {}} playingId="id1" />)
    const rows = screen.getAllByRole('row').slice(1)
    // The playing row should NOT have an img in the art column
    // Find the td that would have the image (second td)
    const artCell = rows[0].querySelectorAll('td')[1]
    expect(artCell.querySelector('img')).toBeNull()
    expect(artCell.querySelector('.now-playing-indicator')).not.toBeNull()
  })

  // --- Expand icon uses chevron characters, not › ---

  it('expand button uses ▸ character instead of ›', () => {
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} />)
    const btn = screen.getAllByRole('button', { name: /expand/i })[0]
    const chevron = btn.querySelector('.expand-chevron')
    expect(chevron.textContent).toBe('▸')
    expect(chevron.textContent).not.toBe('›')
  })

  // --- Focus highlight is visible (not just outline:none) ---

  it('album-row class is present for CSS focus styling with visible indicator', () => {
    render(<AlbumTable albums={ALBUMS} onFetchTracks={() => {}} onPlay={() => {}} />)
    const row = screen.getAllByRole('row')[1]
    expect(row).toHaveClass('album-row')
    // Verify the row has tabIndex for keyboard focusability
    expect(row).toHaveAttribute('tabindex', '0')
  })

  it('now-playing indicator on an active track row contains .eq-bar elements and not a music note emoji', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1', artists: ['Sade'] },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    render(
      <AlbumTable
        albums={[ALBUMS[0]]}
        onFetchTracks={onFetchTracks}
        onPlayTrack={() => {}}
        playingTrackId="tid1"
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /expand/i }))
    await screen.findByText('No Ordinary Love')

    const trackRows = screen.getAllByRole('row').filter(r => r.classList.contains('track-row'))
    const indicator = trackRows[0].querySelector('.now-playing-indicator')
    expect(indicator).not.toBeNull()
    expect(indicator.querySelectorAll('.eq-bar')).toHaveLength(4)
    expect(indicator.textContent).not.toContain('♫')
  })
})

describe('AlbumTable mobile card list', () => {
  beforeEach(() => useIsMobile.mockReturnValue(true))
  afterEach(() => useIsMobile.mockReturnValue(false))

  it('renders a card list instead of a table on mobile', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} />)
    expect(document.querySelector('.album-card-list')).toBeInTheDocument()
    expect(document.querySelector('table')).not.toBeInTheDocument()
  })

  it('renders one card per album', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} />)
    expect(document.querySelectorAll('.album-card')).toHaveLength(ALBUMS.length)
  })

  it('shows album name and artist in each card', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} />)
    expect(screen.getByText('Love Deluxe')).toBeInTheDocument()
    expect(screen.getByText('Sade')).toBeInTheDocument()
    expect(screen.getByText('Room On Fire')).toBeInTheDocument()
    expect(screen.getByText('The Strokes')).toBeInTheDocument()
  })

  it('tapping a card calls onPlay with the album spotify_id', () => {
    const onPlay = vi.fn()
    render(<AlbumTable albums={ALBUMS} loading={false} onPlay={onPlay} />)
    const card = document.querySelector('[data-testid="album-card-id1"]')
    fireEvent.click(card)
    expect(onPlay).toHaveBeenCalledWith('id1')
  })

  it('tapping the expand button does not trigger onPlay', () => {
    const onPlay = vi.fn()
    const onFetchTracks = vi.fn().mockResolvedValue([])
    render(<AlbumTable albums={ALBUMS} loading={false} onPlay={onPlay} onFetchTracks={onFetchTracks} />)
    const expandBtn = screen.getAllByRole('button', { name: /expand/i })[0]
    fireEvent.click(expandBtn)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('tapping a track row calls onPlayTrack', async () => {
    const tracks = [
      { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1', service_id: 'tid1', artists: ['Sade'] },
    ]
    const onFetchTracks = vi.fn().mockResolvedValue(tracks)
    const onPlayTrack = vi.fn()
    render(
      <AlbumTable
        albums={[ALBUMS[0]]}
        loading={false}
        onFetchTracks={onFetchTracks}
        onPlayTrack={onPlayTrack}
      />
    )
    const expandBtn = screen.getByRole('button', { name: /expand/i })
    fireEvent.click(expandBtn)
    await screen.findByText('No Ordinary Love')

    const trackRow = document.querySelector('.album-card-track-row')
    fireEvent.click(trackRow)
    expect(onPlayTrack).toHaveBeenCalledWith('spotify:track:tid1')
  })

  it('applies now-playing class to the card when playingId matches', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} playingId="id1" />)
    const card = document.querySelector('[data-testid="album-card-id1"]')
    expect(card).toHaveClass('now-playing')
  })

  it('renders + button for each card when onToggleSelect is provided', () => {
    const onToggleSelect = vi.fn()
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onToggleSelect={onToggleSelect}
        selectedIds={new Set()}
      />
    )
    const buttons = screen.getAllByRole('button', { name: /collection/i })
    expect(buttons).toHaveLength(ALBUMS.length)
  })

  it('+ button calls onToggleSelect with album id when tapped on mobile', () => {
    const onToggleSelect = vi.fn()
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onToggleSelect={onToggleSelect}
        selectedIds={new Set()}
      />
    )
    const buttons = screen.getAllByRole('button', { name: /collection/i })
    fireEvent.click(buttons[0])
    expect(onToggleSelect).toHaveBeenCalledWith('id1')
  })

  it('+ button shows checkmark when album is selected on mobile', () => {
    render(
      <AlbumTable
        albums={ALBUMS}
        loading={false}
        onToggleSelect={() => {}}
        selectedIds={new Set(['id1'])}
      />
    )
    const buttons = screen.getAllByRole('button', { name: /collection/i })
    expect(buttons[0].textContent).toBe('✓')
    expect(buttons[1].textContent).toBe('+')
  })

  it('shows equalizer overlay on album art when playing on mobile', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} playingId="id1" />)
    const card = document.querySelector('[data-testid="album-card-id1"]')
    expect(card.querySelector('.now-playing-indicator')).not.toBeNull()
    expect(card.querySelector('.now-playing-indicator .eq-bar')).not.toBeNull()
  })

  it('does not show equalizer on non-playing mobile cards', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} playingId="id1" />)
    const card = document.querySelector('[data-testid="album-card-id2"]')
    expect(card.querySelector('.now-playing-indicator')).toBeNull()
  })

  it('mobile expand button uses ▸ character instead of ›', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} onFetchTracks={() => {}} />)
    const btn = screen.getAllByRole('button', { name: /expand/i })[0]
    const chevron = btn.querySelector('.expand-chevron')
    expect(chevron.textContent).toBe('▸')
  })

  it('does not show the year on mobile cards', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} />)
    expect(document.querySelector('.album-card-year')).not.toBeInTheDocument()
  })
})

describe('AlbumTable reorderable drag handles (desktop)', () => {
  afterEach(() => useIsMobile.mockReturnValue(false))

  it('does not render drag handles when reorderable is false (default)', () => {
    render(<AlbumTable albums={ALBUMS} />)
    expect(screen.queryByLabelText('Drag to reorder')).not.toBeInTheDocument()
  })

  it('renders a drag handle on each row when reorderable is true', () => {
    render(<AlbumTable albums={ALBUMS} reorderable onReorder={() => {}} />)
    const handles = screen.getAllByLabelText('Drag to reorder')
    expect(handles).toHaveLength(ALBUMS.length)
  })

  it('drag handle displays the braille character ⠿', () => {
    render(<AlbumTable albums={ALBUMS} reorderable onReorder={() => {}} />)
    const handle = screen.getAllByLabelText('Drag to reorder')[0]
    expect(handle.textContent).toContain('⠿')
  })

  it('skips sorting when reorderable is true (preserves array order)', () => {
    // ALBUMS[0] = Love Deluxe (added 2021), ALBUMS[1] = Room On Fire (added 2020)
    // Default sort is added_at desc, which would put Love Deluxe first.
    // But with different sort, order would change. Let's verify array order is preserved
    // by checking albums appear in the same order as the array regardless of sort.
    const albumsReversed = [ALBUMS[1], ALBUMS[0]]
    render(<AlbumTable albums={albumsReversed} reorderable onReorder={() => {}} />)
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('Room On Fire')
    expect(rows[1]).toHaveTextContent('Love Deluxe')
  })

  it('does not render sort arrows in column headers when reorderable is true', () => {
    render(<AlbumTable albums={ALBUMS} reorderable onReorder={() => {}} />)
    const headers = screen.getAllByRole('columnheader')
    headers.forEach(h => {
      expect(h.textContent).not.toMatch(/[↑↓]/)
    })
  })
})

describe('AlbumTable reorderable drag handles (mobile)', () => {
  beforeEach(() => useIsMobile.mockReturnValue(true))
  afterEach(() => useIsMobile.mockReturnValue(false))

  it('does not render drag handles on mobile when reorderable is false', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} />)
    expect(screen.queryByLabelText('Drag to reorder')).not.toBeInTheDocument()
  })

  it('renders a drag handle on each card when reorderable is true', () => {
    render(<AlbumTable albums={ALBUMS} loading={false} reorderable onReorder={() => {}} />)
    const handles = screen.getAllByLabelText('Drag to reorder')
    expect(handles).toHaveLength(ALBUMS.length)
  })
})

describe('AlbumTable selection via + button (desktop)', () => {
  afterEach(() => useIsMobile.mockReturnValue(false))

  it('renders + button for each album when onToggleSelect is provided', () => {
    render(
      <AlbumTable
        albums={ALBUMS}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
      />
    )
    const buttons = screen.getAllByRole('button', { name: /collection/i })
    expect(buttons).toHaveLength(ALBUMS.length)
  })

  it('+ button calls onToggleSelect with album id', async () => {
    const onToggleSelect = vi.fn()
    render(
      <AlbumTable
        albums={ALBUMS}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
      />
    )
    const buttons = screen.getAllByRole('button', { name: /collection/i })
    await userEvent.click(buttons[0])
    expect(onToggleSelect).toHaveBeenCalledWith('id1')
  })

  it('+ button shows checkmark when album is selected', () => {
    render(
      <AlbumTable
        albums={ALBUMS}
        selectedIds={new Set(['id1'])}
        onToggleSelect={() => {}}
      />
    )
    const buttons = screen.getAllByRole('button', { name: /collection/i })
    expect(buttons[0].textContent).toBe('✓')
    expect(buttons[1].textContent).toBe('+')
  })

  it('does not render + button when onToggleSelect is not provided', () => {
    render(
      <AlbumTable
        albums={ALBUMS}
        selectedIds={new Set()}
      />
    )
    expect(screen.queryByRole('button', { name: /collection/i })).not.toBeInTheDocument()
  })
})

describe('AlbumTable selection via + button (mobile)', () => {
  beforeEach(() => useIsMobile.mockReturnValue(true))
  afterEach(() => useIsMobile.mockReturnValue(false))

  it('album art click does not trigger selection', () => {
    const onToggleSelect = vi.fn()
    render(
      <AlbumTable
        albums={ALBUMS}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
      />
    )
    const card = document.querySelector('[data-testid="album-card-id1"]')
    const artWrapper = card.querySelector('img').parentElement
    fireEvent.click(artWrapper)
    // onToggleSelect should NOT be called from art click (only from + button)
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('does not render + button when onToggleSelect is not provided', () => {
    render(
      <AlbumTable
        albums={ALBUMS}
        selectedIds={new Set()}
      />
    )
    expect(screen.queryByRole('button', { name: /collection/i })).not.toBeInTheDocument()
  })
})

describe('Equalizer animation GPU compositing', () => {
  let css

  beforeAll(async () => {
    const fs = await import('fs')
    const path = await import('path')
    css = fs.readFileSync(
      path.resolve(__dirname, '../tailwind.css'),
      'utf-8',
    )
  })

  it('eq-bar rule uses static transforms instead of animation', () => {
    const eqBarBlock = css.match(/\.eq-bar\s*\{[^}]+\}/)?.[0]
    expect(eqBarBlock).toBeDefined()
    // Should NOT have infinite animation or will-change (causes scroll jank)
    expect(eqBarBlock).not.toMatch(/animation/)
    expect(eqBarBlock).not.toMatch(/will-change/)
  })

  it('now-playing-indicator rule includes contain property for layout isolation', () => {
    const indicatorBlock = css.match(/\.now-playing-indicator\s*\{[^}]+\}/)?.[0]
    expect(indicatorBlock).toBeDefined()
    expect(indicatorBlock).toMatch(/contain\s*:/)
  })
})

describe('AlbumTable — artist click navigation', () => {
  it('calls onArtistClick with artist name when artist text is clicked (desktop)', async () => {
    const onArtistClick = vi.fn()
    render(<AlbumTable albums={ALBUMS} onArtistClick={onArtistClick} />)
    const artistLink = screen.getByTestId('artist-link-Sade')
    await userEvent.click(artistLink)
    expect(onArtistClick).toHaveBeenCalledWith('Sade')
  })

  it('does not trigger onPlay when artist link is clicked', async () => {
    const onArtistClick = vi.fn()
    const onPlay = vi.fn()
    render(<AlbumTable albums={ALBUMS} onArtistClick={onArtistClick} onPlay={onPlay} />)
    const artistLink = screen.getByTestId('artist-link-Sade')
    await userEvent.click(artistLink)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('calls onArtistClick with artist name when artist text is clicked (mobile)', async () => {
    useIsMobile.mockReturnValue(true)
    const onArtistClick = vi.fn()
    render(<AlbumTable albums={ALBUMS} onArtistClick={onArtistClick} />)
    const artistLink = screen.getByTestId('artist-link-Sade')
    await userEvent.click(artistLink)
    expect(onArtistClick).toHaveBeenCalledWith('Sade')
    useIsMobile.mockReturnValue(false)
  })
})
