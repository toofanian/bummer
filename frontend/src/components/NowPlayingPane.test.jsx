import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NowPlayingPane from './NowPlayingPane'

const PLAYING_STATE = {
  is_playing: true,
  track: {
    name: 'No Ordinary Love',
    album: 'Love Deluxe',
    artists: ['Sade'],
    progress_ms: 45000,
    duration_ms: 240000,
  },
  device: { name: 'My Mac', type: 'Computer' },
}

const IDLE_STATE = {
  is_playing: false,
  track: null,
  device: null,
}

const TRACKS = [
  { track_number: 1, name: 'No Ordinary Love', duration: '4:25', spotify_id: 'tid1' },
  { track_number: 2, name: 'Feel No Pain',     duration: '5:42', spotify_id: 'tid2' },
  { track_number: 3, name: 'Like a Tattoo',    duration: '4:02', spotify_id: 'tid3' },
]

describe('NowPlayingPane', () => {
  // --- Visibility ---

  it('is not visible in the DOM when open is false', () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={false}
        onClose={vi.fn()}
        onFetchTracks={vi.fn()}
        albumSpotifyId="abc123"
      />
    )
    // The pane should exist in the DOM but be hidden (aria-hidden or off-screen)
    const pane = screen.getByRole('complementary', { hidden: true })
    expect(pane).toHaveAttribute('aria-hidden', 'true')
  })

  it('is visible when open is true', () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
      />
    )
    const pane = screen.getByRole('complementary')
    expect(pane).not.toHaveAttribute('aria-hidden', 'true')
  })

  // --- Close button ---

  it('renders a close button', () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
      />
    )
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={onClose}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // --- Album / artist info ---

  it('shows the album name when playing', () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue([])}
        albumSpotifyId="abc123"
      />
    )
    expect(screen.getByText('Love Deluxe')).toBeInTheDocument()
  })

  it('shows the artist name when playing', () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue([])}
        albumSpotifyId="abc123"
      />
    )
    expect(screen.getByText('Sade')).toBeInTheDocument()
  })

  it('shows idle message when nothing is playing', () => {
    render(
      <NowPlayingPane
        state={IDLE_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn()}
        albumSpotifyId={null}
      />
    )
    expect(screen.getByText(/nothing playing/i)).toBeInTheDocument()
  })

  // --- Track list ---

  it('fetches and shows tracks when albumSpotifyId is provided and pane opens', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue(TRACKS)
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={onFetchTracks}
        albumSpotifyId="abc123"
      />
    )
    expect(onFetchTracks).toHaveBeenCalledWith('abc123')
    expect(await screen.findByText('No Ordinary Love')).toBeInTheDocument()
    expect(await screen.findByText('Feel No Pain')).toBeInTheDocument()
  })

  it('shows unavailable message when albumSpotifyId is null', () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn()}
        albumSpotifyId={null}
      />
    )
    expect(screen.getByText(/track list unavailable/i)).toBeInTheDocument()
  })

  it('highlights the currently playing track by name', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue(TRACKS)
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={onFetchTracks}
        albumSpotifyId="abc123"
      />
    )
    const activeTrack = await screen.findByText('No Ordinary Love')
    // The element or its parent should indicate it's active
    expect(activeTrack.closest('[data-active="true"]')).not.toBeNull()
  })

  it('does not mark other tracks as active', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue(TRACKS)
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={onFetchTracks}
        albumSpotifyId="abc123"
      />
    )
    const inactiveTrack = await screen.findByText('Feel No Pain')
    expect(inactiveTrack.closest('[data-active="true"]')).toBeNull()
  })

  it('shows a loading indicator while tracks are being fetched', async () => {
    let resolve
    const onFetchTracks = vi.fn().mockReturnValue(new Promise(r => { resolve = r }))
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={onFetchTracks}
        albumSpotifyId="abc123"
      />
    )
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    resolve(TRACKS)
    expect(await screen.findByText('No Ordinary Love')).toBeInTheDocument()
  })

  // --- Re-fetch when albumSpotifyId changes ---

  it('re-fetches tracks when albumSpotifyId changes', async () => {
    const onFetchTracks = vi.fn().mockResolvedValue(TRACKS)
    const { rerender } = render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={onFetchTracks}
        albumSpotifyId="abc123"
      />
    )
    await screen.findByText('No Ordinary Love')
    expect(onFetchTracks).toHaveBeenCalledTimes(1)

    rerender(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={onFetchTracks}
        albumSpotifyId="xyz789"
      />
    )
    await waitFor(() => expect(onFetchTracks).toHaveBeenCalledTimes(2))
    expect(onFetchTracks).toHaveBeenCalledWith('xyz789')
  })

  // --- Vinyl record ---

  it('shows a vinyl record when a track is playing', () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue([])}
        albumSpotifyId="abc123"
      />
    )
    expect(screen.getByRole('img', { name: /vinyl record/i })).toBeInTheDocument()
  })

  it('shows album art on the vinyl record label when albumImageUrl is provided', () => {
    const { container } = render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue([])}
        albumSpotifyId="abc123"
        albumImageUrl="http://example.com/album.jpg"
      />
    )
    const svgImage = container.querySelector('image[href="http://example.com/album.jpg"]')
    expect(svgImage).not.toBeNull()
  })

  it('does not show a vinyl record when nothing is playing', () => {
    render(
      <NowPlayingPane
        state={IDLE_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn()}
        albumSpotifyId={null}
      />
    )
    expect(screen.queryByRole('img', { name: /vinyl record/i })).not.toBeInTheDocument()
  })

  // --- Device info ---

  it('shows device name when available', () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue([])}
        albumSpotifyId="abc123"
      />
    )
    expect(screen.getByText(/My Mac/i)).toBeInTheDocument()
  })

  // --- Click-to-play track rows ---

  it('clicking a track row calls onPlayTrack with the track URI', async () => {
    const onPlayTrack = vi.fn()
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
        onPlayTrack={onPlayTrack}
      />
    )
    const trackName = await screen.findByText('Feel No Pain')
    await userEvent.click(trackName.closest('.now-playing-track-row'))
    expect(onPlayTrack).toHaveBeenCalledWith('spotify:track:tid2')
  })

  it('clicking the active track row also calls onPlayTrack', async () => {
    const onPlayTrack = vi.fn()
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
        onPlayTrack={onPlayTrack}
      />
    )
    const trackName = await screen.findByText('No Ordinary Love')
    await userEvent.click(trackName.closest('.now-playing-track-row'))
    expect(onPlayTrack).toHaveBeenCalledWith('spotify:track:tid1')
  })

  it('track rows have pointer cursor when onPlayTrack is provided', async () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
        onPlayTrack={vi.fn()}
      />
    )
    await screen.findByText('Feel No Pain')
    const rows = document.querySelectorAll('.now-playing-track-row')
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach(row => {
      expect(row).toHaveStyle({ cursor: 'pointer' })
    })
  })

  it('track rows are not clickable when onPlayTrack is not provided', async () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
      />
    )
    await screen.findByText('Feel No Pain')
    const rows = document.querySelectorAll('.now-playing-track-row')
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach(row => {
      expect(row).toHaveStyle({ cursor: 'default' })
    })
  })

  // --- Up Next queue ---

  it('renders "Up Next" section when queue has items', async () => {
    const queueData = {
      currently_playing: null,
      queue: [
        { name: 'Future Track', artists: ['Band A', 'Band B'], duration_ms: 200000 },
        { name: 'Another Song', artists: ['Solo'], duration_ms: 150000 },
      ],
    }
    const onFetchQueue = vi.fn().mockResolvedValue(queueData)
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
        onFetchQueue={onFetchQueue}
      />
    )
    expect(await screen.findByText('Up Next')).toBeInTheDocument()
    expect(await screen.findByText('Future Track')).toBeInTheDocument()
    expect(screen.getByText('Band A, Band B')).toBeInTheDocument()
    expect(screen.getByText('3:20')).toBeInTheDocument()
    expect(screen.getByText('Another Song')).toBeInTheDocument()
  })

  it('hides "Up Next" when queue is empty', async () => {
    const onFetchQueue = vi.fn().mockResolvedValue({ currently_playing: null, queue: [] })
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
        onFetchQueue={onFetchQueue}
      />
    )
    // Wait for tracks to load first
    await screen.findByText('No Ordinary Love')
    // Give queue fetch time to resolve
    await act(async () => {})
    expect(screen.queryByText('Up Next')).not.toBeInTheDocument()
  })

  it('does not render "Up Next" when onFetchQueue is not provided', async () => {
    render(
      <NowPlayingPane
        state={PLAYING_STATE}
        open={true}
        onClose={vi.fn()}
        onFetchTracks={vi.fn().mockResolvedValue(TRACKS)}
        albumSpotifyId="abc123"
      />
    )
    await screen.findByText('No Ordinary Love')
    expect(screen.queryByText('Up Next')).not.toBeInTheDocument()
  })
})
