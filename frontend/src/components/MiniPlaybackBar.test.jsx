import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MiniPlaybackBar from './MiniPlaybackBar'

describe('MiniPlaybackBar', () => {
  const track = { name: 'Test Track', artists: ['Artist 1'], album: 'Test Album' }

  // --- No track, no device: "Connect a device" state ---

  it('renders nothing when no track and no device and no onOpenDevicePicker', () => {
    const { container } = render(
      <MiniPlaybackBar state={{ is_playing: false, track: null, device: null }} onPlayPause={vi.fn()} onExpand={vi.fn()} />
    )
    expect(container.querySelector('[data-testid="mini-playback-bar"]')).toBeNull()
  })

  it('renders the bar with "Connect a device" when no track, no device, not playing, and onOpenDevicePicker provided', () => {
    render(
      <MiniPlaybackBar
        state={{ is_playing: false, track: null, device: null }}
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onOpenDevicePicker={vi.fn()}
      />
    )
    expect(screen.getByTestId('mini-playback-bar')).toBeInTheDocument()
    expect(screen.getByText(/connect a device/i)).toBeInTheDocument()
  })

  it('calls onOpenDevicePicker when "Connect a device" bar is clicked', async () => {
    const user = userEvent.setup()
    const onOpenDevicePicker = vi.fn()
    render(
      <MiniPlaybackBar
        state={{ is_playing: false, track: null, device: null }}
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onOpenDevicePicker={onOpenDevicePicker}
      />
    )
    await user.click(screen.getByTestId('mini-playback-bar'))
    expect(onOpenDevicePicker).toHaveBeenCalledTimes(1)
  })

  it('does not call onExpand when "Connect a device" bar is clicked', async () => {
    const user = userEvent.setup()
    const onExpand = vi.fn()
    render(
      <MiniPlaybackBar
        state={{ is_playing: false, track: null, device: null }}
        onPlayPause={vi.fn()}
        onExpand={onExpand}
        onOpenDevicePicker={vi.fn()}
      />
    )
    await user.click(screen.getByTestId('mini-playback-bar'))
    expect(onExpand).not.toHaveBeenCalled()
  })

  // --- Track present: normal playback state ---

  it('renders track name and artist when playing', () => {
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track }}
        albumImageUrl="https://example.com/art.jpg"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
      />
    )
    expect(screen.getByText('Test Track')).toBeInTheDocument()
    expect(screen.getByText('Artist 1')).toBeInTheDocument()
  })

  it('calls onPlayPause when play/pause button is clicked', async () => {
    const user = userEvent.setup()
    const onPlayPause = vi.fn()
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track }}
        onPlayPause={onPlayPause}
        onExpand={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: /pause/i }))
    expect(onPlayPause).toHaveBeenCalled()
  })

  it('calls onExpand when bar area is clicked', async () => {
    const user = userEvent.setup()
    const onExpand = vi.fn()
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track }}
        onPlayPause={vi.fn()}
        onExpand={onExpand}
      />
    )
    await user.click(screen.getByTestId('mini-playback-bar'))
    expect(onExpand).toHaveBeenCalled()
  })

  it('shows device indicator icon when device and onFetchDevices are provided', () => {
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track, device: { name: 'My Mac', type: 'Computer' } }}
        albumImageUrl="https://example.com/art.jpg"
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onFetchDevices={vi.fn()}
        onDeviceSelected={vi.fn()}
      />
    )
    expect(screen.getByTestId('mini-device-indicator')).toBeInTheDocument()
  })

  it('does not show device indicator when onFetchDevices is not provided', () => {
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track, device: { name: 'My Mac', type: 'Computer' } }}
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
      />
    )
    expect(screen.queryByTestId('mini-device-indicator')).toBeNull()
  })

  it('opens device picker when device indicator is clicked', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue([
      { id: 'mac-id', name: 'My Mac', type: 'Computer', is_active: true },
    ])
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track, device: { name: 'My Mac', type: 'Computer' } }}
        onPlayPause={vi.fn()}
        onExpand={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await user.click(screen.getByTestId('mini-device-indicator'))
    expect(await screen.findByText('Connect to a device')).toBeInTheDocument()
  })

  it('clicking device indicator does not trigger onExpand', async () => {
    const user = userEvent.setup()
    const onExpand = vi.fn()
    const onFetchDevices = vi.fn().mockResolvedValue([])
    render(
      <MiniPlaybackBar
        state={{ is_playing: true, track, device: { name: 'My Mac', type: 'Computer' } }}
        onPlayPause={vi.fn()}
        onExpand={onExpand}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await user.click(screen.getByTestId('mini-device-indicator'))
    expect(onExpand).not.toHaveBeenCalled()
  })
})
