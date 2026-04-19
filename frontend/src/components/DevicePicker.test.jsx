import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DevicePicker, { SpeakerIndicatorIcon } from './DevicePicker'

const DEVICES = [
  { id: 'mac-id', name: 'My Mac', type: 'Computer', is_active: true },
  { id: 'phone-id', name: "Alex's iPhone", type: 'Smartphone', is_active: false },
  { id: 'speaker-id', name: 'Kitchen Speaker', type: 'Speaker', is_active: false },
]

describe('SpeakerIndicatorIcon', () => {
  it('renders a monitor/devices icon, not a speaker/volume icon', () => {
    const { container } = render(<SpeakerIndicatorIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    // The old speaker icon had a path with "M11 5L6 9H2v6h4l5 4V5z" (speaker cone)
    // The new icon should NOT contain that speaker path
    const paths = svg.innerHTML
    expect(paths).not.toContain('M11 5L6 9H2v6h4l5 4V5z')
    // Should contain a rect (monitor screen) element
    expect(svg.querySelector('rect')).toBeTruthy()
  })
})

describe('DevicePicker — main view', () => {
  it('shows loading state initially', () => {
    let resolve
    const onFetchDevices = vi.fn().mockReturnValue(new Promise(r => { resolve = r }))
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    expect(screen.getByText('Connect to a device')).toBeInTheDocument()
    expect(screen.getByTestId('device-picker-loading')).toBeInTheDocument()
  })

  it('renders device list after fetch', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    expect(await screen.findByText('My Mac')).toBeInTheDocument()
    expect(screen.getByText("Alex's iPhone")).toBeInTheDocument()
    expect(screen.getByText('Kitchen Speaker')).toBeInTheDocument()
  })

  it('shows green dot on active device', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await screen.findByText('My Mac')
    const activeRow = screen.getByTestId('device-row-mac-id')
    expect(within(activeRow).getByTestId('active-dot')).toBeInTheDocument()
  })

  it('calls onDeviceSelected with device id when clicking inactive device', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    const onDeviceSelected = vi.fn()
    const onClose = vi.fn()
    render(
      <DevicePicker
        onClose={onClose}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={onDeviceSelected}
      />
    )
    await screen.findByText("Alex's iPhone")
    await user.click(screen.getByText("Alex's iPhone"))
    expect(onDeviceSelected).toHaveBeenCalledWith('phone-id')
  })

  it('does not call onClose when clicking a device (parent manages close)', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    const onClose = vi.fn()
    render(
      <DevicePicker
        onClose={onClose}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await screen.findByText("Alex's iPhone")
    await user.click(screen.getByText("Alex's iPhone"))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onDeviceSelected when clicking active device (re-transfer)', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    const onDeviceSelected = vi.fn()
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={onDeviceSelected}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByTestId('device-row-mac-id'))
    expect(onDeviceSelected).toHaveBeenCalledWith('mac-id')
  })

  it('closes on Escape key', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={onClose}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await screen.findByText('My Mac')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty state when no devices found', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue([])
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    expect(await screen.findByText(/no devices found/i)).toBeInTheDocument()
    expect(screen.getByText(/open spotify on any device/i)).toBeInTheDocument()
  })

  it('shows retry button when fetch fails', async () => {
    const user = userEvent.setup()
    const onFetchDevices = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    expect(await screen.findByText(/couldn't load devices/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('My Mac')).toBeInTheDocument()
  })

  it('does not render gear/settings button', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await screen.findByText('My Mac')
    expect(screen.queryByTestId('device-settings-btn')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Device settings')).not.toBeInTheDocument()
  })

  it('does not render hide-device buttons', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await screen.findByText("Alex's iPhone")
    expect(screen.queryByTestId('hide-device-btn')).not.toBeInTheDocument()
  })

  it('shows restrictedDevice error message when restrictedDevice=true', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
        restrictedDevice={true}
      />
    )
    await screen.findByText('My Mac')
    expect(screen.getByText(/this device restricts remote playback/i)).toBeInTheDocument()
    expect(screen.getByText(/try another/i)).toBeInTheDocument()
  })

  it('does not show restrictedDevice error when restrictedDevice=false', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
        restrictedDevice={false}
      />
    )
    await screen.findByText('My Mac')
    expect(screen.queryByText(/this device restricts remote playback/i)).not.toBeInTheDocument()
  })

  it('does not show restrictedDevice error when restrictedDevice prop is omitted', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await screen.findByText('My Mac')
    expect(screen.queryByText(/this device restricts remote playback/i)).not.toBeInTheDocument()
  })
})

describe('DevicePicker — close button', () => {
  it('renders a close button in the header', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await screen.findByText('My Mac')
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onFetchDevices = vi.fn().mockResolvedValue(DEVICES)
    render(
      <DevicePicker
        onClose={onClose}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )
    await screen.findByText('My Mac')
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('DevicePicker — no auto-polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onFetchDevices once on mount (no repeat polling)', async () => {
    const onFetchDevices = vi.fn().mockResolvedValue([])

    render(
      <DevicePicker
        onClose={vi.fn()}
        onFetchDevices={onFetchDevices}
        onDeviceSelected={vi.fn()}
      />
    )

    // Flush initial fetch promise
    await act(async () => {
      await Promise.resolve()
    })
    expect(onFetchDevices).toHaveBeenCalledTimes(1)

    // Advance well past any former polling interval
    await act(async () => {
      vi.advanceTimersByTime(9000)
      await Promise.resolve()
    })

    // Should still be 1 — no polling interval
    expect(onFetchDevices).toHaveBeenCalledTimes(1)
  })
})
