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

  // --- Device indicator ---

  it('does not show device indicator when device is null', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.queryByTestId('device-indicator')).not.toBeInTheDocument()
  })

  // --- Now-playing card overflow containment ---

  it('playback bar has overflow hidden to prevent now-playing card from overflowing', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    const bar = screen.getByRole('region', { name: /playback bar/i })
    expect(bar.className).toContain('overflow-hidden')
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

  it('device indicator appears in the right zone', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    const rightZone = screen.getByTestId('playback-right')
    expect(rightZone.querySelector('[data-testid="device-indicator"]')).toBeTruthy()
  })

  // --- Connect a device state ---

  it('shows "Connect a device" when no track, no device, and not playing', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    expect(screen.getByText(/connect a device/i)).toBeInTheDocument()
  })

  it('calls onOpenDevicePicker when "Connect a device" text is clicked', async () => {
    const onOpenDevicePicker = vi.fn()
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={onOpenDevicePicker}
      />
    )
    await userEvent.click(screen.getByText(/connect a device/i))
    expect(onOpenDevicePicker).toHaveBeenCalledTimes(1)
  })

  it('does not show "Connect a device" when track is present', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    expect(screen.queryByText(/connect a device/i)).not.toBeInTheDocument()
  })

  it('does not show "Nothing playing" when onOpenDevicePicker is provided and state is idle', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    expect(screen.queryByText(/nothing playing/i)).not.toBeInTheDocument()
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

  // --- Progress bar ---

  it('renders a progress bar with current and total time when track has progress_ms and duration_ms', () => {
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
    // Should show formatted times: 0:45 and 4:00
    expect(center).toHaveTextContent('0:45')
    expect(center).toHaveTextContent('4:00')
  })

  it('renders a progress slider element', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.getByRole('slider', { name: /track progress/i })).toBeInTheDocument()
  })

  it('calls onSeek when the progress bar is clicked', () => {
    const onSeek = vi.fn()
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onSeek={onSeek}
      />
    )
    const slider = screen.getByRole('slider', { name: /track progress/i })
    // Simulate a pointerDown at midpoint of a 200px-wide bar
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 100, width: 200, top: 0, bottom: 10, right: 300 }),
    })
    fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1 })
    // 200 - 100 = 100 out of 200 = 50% of 240000ms = 120000
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(120000)
  })

  it('does not render progress bar when no track is playing', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.queryByRole('slider', { name: /track progress/i })).not.toBeInTheDocument()
  })

  // --- SVG icons ---

  it('transport buttons use SVG icons, not Unicode emoji', () => {
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
    const prevBtn = screen.getByRole('button', { name: /previous/i })
    const nextBtn = screen.getByRole('button', { name: /next/i })
    const pauseBtn = screen.getByRole('button', { name: /pause/i })
    // Each button should contain an SVG element
    expect(prevBtn.querySelector('svg')).toBeTruthy()
    expect(nextBtn.querySelector('svg')).toBeTruthy()
    expect(pauseBtn.querySelector('svg')).toBeTruthy()
  })

  // --- Circular play/pause button ---

  it('play/pause button is circular (border-radius 50%)', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    const btn = screen.getByRole('button', { name: /pause/i })
    expect(btn.className).toContain('rounded-full')
  })

  // --- Theme-aware slider colors ---

  it('progress bar track uses theme CSS variable, not hardcoded white', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    const slider = screen.getByRole('slider', { name: /track progress/i })
    expect(slider.style.background).not.toContain('rgba(255')
    expect(slider.style.background).toContain('var(--color-text-dim)')
  })

  it('progress bar filled track uses theme CSS variable, not hardcoded white', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    const slider = screen.getByRole('slider', { name: /track progress/i })
    const fill = slider.firstElementChild
    expect(fill.style.background).not.toContain('rgba(255')
    expect(fill.style.background).toContain('var(--color-accent)')
  })

  it('volume slider elements use theme CSS variables, not hardcoded white', () => {
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
    const slider = screen.getByRole('slider', { name: 'Volume' })
    const children = slider.children
    // track background (first child)
    expect(children[0].style.background).not.toContain('rgba(255')
    // filled track (second child)
    expect(children[1].style.background).not.toContain('rgba(255')
    // thumb (third child)
    expect(children[2].style.background).not.toBe('#ffffff')
    expect(children[2].style.background).toContain('var(--color-accent)')
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
    const slider = screen.getByRole('slider', { name: 'Volume' })
    expect(slider).toBeTruthy()
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
  })

  it('volume slider has aria-valuemin=0, aria-valuemax=100', () => {
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
    const slider = screen.getByRole('slider', { name: 'Volume' })
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
  })

  it('calls onSetVolume with numeric value when slider changes via keyboard', async () => {
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
    const slider = screen.getByRole('slider', { name: 'Volume' })
    slider.focus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    // give debounce time to fire
    await new Promise(r => setTimeout(r, 400))
    expect(onSetVolume).toHaveBeenCalled()
    const lastCall = onSetVolume.mock.calls.at(-1)[0]
    expect(lastCall).toBeGreaterThan(50) // started at 50, went up
  })
})

// --- Speaker icon + DevicePicker ---

describe('device indicator', () => {
  it('renders speaker icon when onOpenDevicePicker is provided', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    expect(screen.getByTestId('device-indicator')).toBeInTheDocument()
  })

  it('speaker icon is green when device type is not Computer', () => {
    const remoteState = {
      ...PLAYING_STATE,
      device: { name: "Alex's iPhone", type: 'Smartphone' },
    }
    render(
      <PlaybackBar
        state={remoteState}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    const indicator = screen.getByTestId('device-indicator')
    expect(indicator).toHaveStyle({ color: 'var(--accent)' })
  })

  it('speaker icon is dim when device type is Computer', () => {
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    const indicator = screen.getByTestId('device-indicator')
    expect(indicator).toHaveStyle({ color: 'var(--text-dim)' })
  })

  it('calls onOpenDevicePicker on speaker icon click', async () => {
    const user = userEvent.setup()
    const onOpenDevicePicker = vi.fn()
    render(
      <PlaybackBar
        state={PLAYING_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={onOpenDevicePicker}
      />
    )
    await user.click(screen.getByTestId('device-indicator'))
    expect(onOpenDevicePicker).toHaveBeenCalledTimes(1)
  })

  it('shows device indicator when onOpenDevicePicker provided but device is null', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    expect(screen.getByTestId('device-indicator')).toBeInTheDocument()
  })

  it('does not render speaker icon when onOpenDevicePicker is not provided', () => {
    render(
      <PlaybackBar
        state={IDLE_STATE}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        paneOpen={false}
        onTogglePane={vi.fn()}
      />
    )
    expect(screen.queryByTestId('device-indicator')).not.toBeInTheDocument()
  })
})
