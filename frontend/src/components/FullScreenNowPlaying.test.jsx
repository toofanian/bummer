// FullScreenNowPlaying.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FullScreenNowPlaying from './FullScreenNowPlaying'

describe('FullScreenNowPlaying', () => {
  const track = {
    name: 'Test Track',
    artists: ['Artist 1'],
    album: 'Test Album',
    progress_ms: 60000,
    duration_ms: 180000,
  }

  const defaultProps = {
    state: { is_playing: true, track, device: { name: 'iPhone' } },
    open: true,
    onClose: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onSetVolume: vi.fn(),
    onFetchTracks: vi.fn().mockResolvedValue([]),
    onPlayTrack: vi.fn(),
    albumSpotifyId: 'abc123',
    albumImageUrl: 'https://example.com/art.jpg',
    onFetchDevices: vi.fn().mockResolvedValue([]),
    onTransferPlayback: vi.fn(),
  }

  it('renders album art and track info when open', () => {
    render(<FullScreenNowPlaying {...defaultProps} />)
    expect(screen.getByText('Test Track')).toBeInTheDocument()
    expect(screen.getByText('Artist 1')).toBeInTheDocument()
    expect(screen.getByAltText('Album art')).toBeInTheDocument()
  })

  it('is hidden when not open', () => {
    render(<FullScreenNowPlaying {...defaultProps} open={false} />)
    const pane = screen.getByRole('dialog', { hidden: true })
    expect(pane).toHaveAttribute('aria-hidden', 'true')
  })

  it('calls onClose when dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<FullScreenNowPlaying {...defaultProps} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders playback controls', () => {
    render(<FullScreenNowPlaying {...defaultProps} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('calls onSeek when the progress bar is tapped', () => {
    const onSeek = vi.fn()
    render(<FullScreenNowPlaying {...defaultProps} onSeek={onSeek} />)
    const slider = screen.getByRole('slider', { name: /track progress/i })
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 342, top: 0, bottom: 10, right: 342 }),
    })
    fireEvent.pointerDown(slider, { clientX: 171, pointerId: 1 })
    // 171 / 342 = 50% of 180000ms = 90000
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(90000)
  })
})

describe('device indicator', () => {
  const track = {
    name: 'Test Track',
    artists: ['Artist 1'],
    album: 'Test Album',
    progress_ms: 60000,
    duration_ms: 180000,
  }

  const defaultProps = {
    state: { is_playing: true, track, device: { name: 'iPhone' } },
    open: true,
    onClose: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onSetVolume: vi.fn(),
    onFetchTracks: vi.fn().mockResolvedValue([]),
    onPlayTrack: vi.fn(),
    albumSpotifyId: 'abc123',
    albumImageUrl: 'https://example.com/art.jpg',
    onFetchDevices: vi.fn().mockResolvedValue([]),
    onTransferPlayback: vi.fn(),
  }

  it('shows "Listening on" banner when device is remote and onOpenDevicePicker provided', () => {
    render(
      <FullScreenNowPlaying
        {...defaultProps}
        state={{ ...defaultProps.state, device: { name: "Alex's iPhone", type: 'Smartphone' } }}
        onOpenDevicePicker={vi.fn()}
      />
    )
    expect(screen.getByText(/listening on/i)).toBeInTheDocument()
    expect(screen.getByText("Alex's iPhone")).toBeInTheDocument()
  })

  it('hides banner when device type is Computer', () => {
    render(
      <FullScreenNowPlaying
        {...defaultProps}
        state={{ ...defaultProps.state, device: { name: 'My Mac', type: 'Computer' } }}
        onOpenDevicePicker={vi.fn()}
      />
    )
    expect(screen.queryByText(/listening on/i)).not.toBeInTheDocument()
  })

  it('calls onOpenDevicePicker when banner tapped', async () => {
    const user = userEvent.setup()
    const onOpenDevicePicker = vi.fn()
    render(
      <FullScreenNowPlaying
        {...defaultProps}
        state={{ ...defaultProps.state, device: { name: "Alex's iPhone", type: 'Smartphone' } }}
        onOpenDevicePicker={onOpenDevicePicker}
      />
    )
    await user.click(screen.getByText(/listening on/i))
    expect(onOpenDevicePicker).toHaveBeenCalledTimes(1)
  })
})

describe('FullScreenNowPlaying - Up Next queue', () => {
  const track = {
    name: 'Test Track',
    artists: ['Artist 1'],
    album: 'Test Album',
    progress_ms: 60000,
    duration_ms: 180000,
  }

  const defaultProps = {
    state: { is_playing: true, track, device: { name: 'iPhone' } },
    open: true,
    onClose: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onSetVolume: vi.fn(),
    onFetchTracks: vi.fn().mockResolvedValue([]),
    onPlayTrack: vi.fn(),
    albumSpotifyId: 'abc123',
    albumImageUrl: 'https://example.com/art.jpg',
    onFetchDevices: vi.fn().mockResolvedValue([]),
    onTransferPlayback: vi.fn(),
  }

  it('renders "Up Next" section when queue has items', async () => {
    const queueData = {
      currently_playing: null,
      queue: [
        { name: 'Queued Song', artists: ['Queue Artist'], duration_ms: 240000 },
        { name: 'Next Up', artists: ['Another', 'Duo'], duration_ms: 185000 },
      ],
    }
    const onFetchQueue = vi.fn().mockResolvedValue(queueData)
    render(<FullScreenNowPlaying {...defaultProps} onFetchQueue={onFetchQueue} />)
    expect(await screen.findByText('Up Next')).toBeInTheDocument()
    expect(screen.getByText('Queued Song')).toBeInTheDocument()
    expect(screen.getByText('Queue Artist')).toBeInTheDocument()
    expect(screen.getByText('4:00')).toBeInTheDocument()
    expect(screen.getByText('Next Up')).toBeInTheDocument()
    expect(screen.getByText('Another, Duo')).toBeInTheDocument()
  })

  it('hides "Up Next" when queue is empty', async () => {
    const onFetchQueue = vi.fn().mockResolvedValue({ currently_playing: null, queue: [] })
    render(<FullScreenNowPlaying {...defaultProps} onFetchQueue={onFetchQueue} />)
    // Wait for component to settle
    await act(async () => {})
    expect(screen.queryByText('Up Next')).not.toBeInTheDocument()
  })
})
