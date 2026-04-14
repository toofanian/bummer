import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlaybackBar from './PlaybackBar'

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

describe('PlaybackBar', () => {
  // --- Rendering with no playback ---

  it('renders the bar even when nothing is playing', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('region', { name: /playback bar/i })).toBeInTheDocument()
  })

  it('shows "Nothing playing" when track is null', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByText(/nothing playing/i)).toBeInTheDocument()
  })

  // --- Rendering with active playback ---

  it('shows track name when playing', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByText('No Ordinary Love')).toBeInTheDocument()
  })

  it('shows artist name when playing', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByText('Sade')).toBeInTheDocument()
  })

  it('shows multiple artists joined by commas', () => {
    const stateMultiArtist = {
      ...PLAYING_STATE,
      track: { ...PLAYING_STATE.track, artists: ['Artist A', 'Artist B'] },
    }
    render(
      <PlaybackBar
        state={stateMultiArtist}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByText('Artist A, Artist B')).toBeInTheDocument()
  })

  // --- Album art placeholder ---

  it('renders an album art placeholder', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('img', { name: /album art/i })).toBeInTheDocument()
  })

  it('renders album art placeholder even when nothing is playing', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('img', { name: /album art/i })).toBeInTheDocument()
  })

  it('shows the album art image when albumImageUrl is provided', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        albumImageUrl="http://example.com/album.jpg"
      />
    )
    const img = screen.getByRole('img', { name: /album art/i })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', 'http://example.com/album.jpg')
  })

  // --- Play / Pause button ---

  it('shows a pause button when is_playing is true', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
  })

  it('shows a play button when is_playing is false', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument()
  })

  it('calls onPause when pause button is clicked', async () => {
    const onPause = vi.fn()
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={onPause}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /pause/i }))
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('calls onPlay when play button is clicked', async () => {
    const onPlay = vi.fn()
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={onPlay}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /^play$/i }))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  // --- Queue / pane toggle button ---

  it('renders a toggle-pane button', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /now playing/i })).toBeInTheDocument()
  })

  it('calls onTogglePane when the toggle button is clicked', async () => {
    const onTogglePane = vi.fn()
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={onTogglePane}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /now playing/i }))
    expect(onTogglePane).toHaveBeenCalledTimes(1)
  })

  it('marks the toggle button as active / pressed when paneOpen is true', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={true}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /now playing/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks the toggle button as not pressed when paneOpen is false', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /now playing/i })).toHaveAttribute('aria-pressed', 'false')
  })

  // --- Center message area ---

  it('does not show a message area when message prop is null', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        message={null}
      />
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows message text when message prop is provided', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        message={{ code: 'NO_DEVICE', text: 'No Spotify device found. Open Spotify on any device and try again.' }}
      />
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('No Spotify device found. Open Spotify on any device and try again.')).toBeInTheDocument()
  })

  it('does not show message when message prop is omitted', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // --- Device name ---

  it('shows device name when a device is active', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByText(/▸ My Mac/)).toBeInTheDocument()
  })

  it('does not show device name when device is null', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.queryByText(/▸/)).not.toBeInTheDocument()
  })

  it('does not show device name when nothing is playing and device is null', () => {
    render(
      <PlaybackBar
        state={{ is_playing: false, track: null, device: null }}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.queryByText(/▸/)).not.toBeInTheDocument()
  })

  // --- Three-zone layout ---

  it('renders a left zone containing track info', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    const leftZone = screen.getByTestId('playback-left')
    expect(leftZone).toBeInTheDocument()
    expect(leftZone).toHaveTextContent('No Ordinary Love')
  })

  it('renders a center zone containing transport controls', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    const center = screen.getByTestId('playback-center')
    expect(center).toBeInTheDocument()
    expect(center.querySelector('[aria-label="Pause"]')).toBeTruthy()
  })

  it('renders a right zone', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByTestId('playback-right')).toBeInTheDocument()
  })

  it('device name appears in the right zone, not in the left zone', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    const leftZone = screen.getByTestId('playback-left')
    const rightZone = screen.getByTestId('playback-right')
    expect(leftZone).not.toHaveTextContent('My Mac')
    expect(rightZone).toHaveTextContent('My Mac')
  })

  // --- Previous / Next buttons ---

  it('renders a Previous track button', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
  })

  it('renders a Next track button', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('calls onPrevious when Previous button is clicked', async () => {
    const onPrevious = vi.fn()
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onPrevious={onPrevious}
        onNext={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it('calls onNext when Next button is clicked', async () => {
    const onNext = vi.fn()
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onPrevious={vi.fn()}
        onNext={onNext}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('previous and next buttons appear in the center zone', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    const center = screen.getByTestId('playback-center')
    expect(center.querySelector('[aria-label="Previous track"]')).toBeTruthy()
    expect(center.querySelector('[aria-label="Next track"]')).toBeTruthy()
  })

  // --- Prominent play/pause button ---

  it('play/pause button has data-prominent attribute marking it as the visual centerpiece', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /pause/i })).toHaveAttribute('data-prominent', 'true')
  })

  // --- Spacebar global playback toggle ---

  it('pressing Space when is_playing is true calls onPause', () => {
    const onPause = vi.fn()
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={onPause}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('pressing Space when is_playing is false calls onPlay', () => {
    const onPlay = vi.fn()
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={onPlay}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('removes the Space keydown listener after unmount', () => {
    const onPause = vi.fn()
    const { unmount } = render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={onPause}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    unmount()
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    expect(onPause).not.toHaveBeenCalled()
  })

  it('pressing Space while an input is focused does NOT call onPause', () => {
    const onPause = vi.fn()
    render(
      <>
        <input data-testid="search" />
        <PlaybackBar
          state={PLAYING_STATE}
          onPlay={vi.fn()}
          onPause={onPause}
          paneOpen={false}
          onTogglePane={vi.fn()}
        />
      </>
    )
    const input = screen.getByTestId('search')
    input.focus()
    fireEvent.keyDown(input, { key: ' ', code: 'Space' })
    expect(onPause).not.toHaveBeenCalled()
  })

  it('pressing Space while a textarea is focused does NOT call onPlay', () => {
    const onPlay = vi.fn()
    render(
      <>
        <textarea data-testid="notes" />
        <PlaybackBar
          state={IDLE_STATE}
          onPlay={onPlay}
          onPause={vi.fn()}
          paneOpen={false}
          onTogglePane={vi.fn()}
        />
      </>
    )
    const textarea = screen.getByTestId('notes')
    textarea.focus()
    fireEvent.keyDown(textarea, { key: ' ', code: 'Space' })
    expect(onPlay).not.toHaveBeenCalled()
  })

  // --- Volume slider ---

  it('renders a volume slider in the right zone', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onSetVolume={vi.fn()}
      />
    )
    const rightZone = screen.getByTestId('playback-right')
    const slider = rightZone.querySelector('input[type="range"]')
    expect(slider).toBeTruthy()
    expect(slider).toHaveAttribute('aria-label', 'Volume')
  })

  it('volume slider has min=0, max=100', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onSetVolume={vi.fn()}
      />
    )
    const rightZone = screen.getByTestId('playback-right')
    const slider = rightZone.querySelector('input[type="range"]')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')
  })

  it('calls onSetVolume with numeric value when slider changes', async () => {
    const onSetVolume = vi.fn()
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onSetVolume={onSetVolume}
      />
    )
    const rightZone = screen.getByTestId('playback-right')
    const slider = rightZone.querySelector('input[type="range"]')
    await userEvent.type(slider, '{arrowup}')
    // onSetVolume may be debounced, but we just verify it was called
    // We fire change event directly for reliability
    fireEvent.change(slider, { target: { value: '60' } })
    // give debounce time to fire
    await new Promise(r => setTimeout(r, 400))
    expect(onSetVolume).toHaveBeenCalledWith(60)
  })
})
