import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DigestPanel from './DigestPanel'

const API = 'http://127.0.0.1:8000'

const mockDigestData = {
  period: { start: '2026-03-05', end: '2026-03-12' },
  added: [
    { service_id: 'a1', name: 'New Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
  ],
  removed: [
    { service_id: 'a2', name: 'Old Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
  ],
  listened: [
    { service_id: 'a3', name: 'Played Album', artists: ['Artist C'], image_url: 'https://img/3.jpg', play_count: 5 },
  ],
}

describe('DigestPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete global.fetch
  })

  it('renders loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) // never resolves
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders digest sections after successful fetch', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockDigestData) })
    )
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument()
      expect(screen.getByText('Old Album')).toBeInTheDocument()
      expect(screen.getByText('Played Album')).toBeInTheDocument()
    })
  })

  it('renders error state on fetch failure', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument()
    })
  })

  it('renders no-snapshots state on 404', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }))
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/tracked/i)).toBeInTheDocument()
    })
  })

  it('renders empty sections when no changes', async () => {
    const emptyData = {
      period: { start: '2026-03-05', end: '2026-03-12' },
      added: [],
      removed: [],
      listened: [],
    }
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(emptyData) })
    )
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/no albums added/i)).toBeInTheDocument()
    })
  })

  it('calls onClose when close button clicked', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockDigestData) })
    )
    const onClose = vi.fn()
    render(<DigestPanel open={true} onClose={onClose} onPlay={() => {}} />)
    await waitFor(() => screen.getByText('New Album'))
    await userEvent.click(screen.getByLabelText(/close/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows play count badge for listened albums', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockDigestData) })
    )
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('re-fetches when date range changes', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockDigestData) })
    )
    render(<DigestPanel open={true} onClose={() => {}} onPlay={() => {}} />)
    await waitFor(() => screen.getByText('New Album'))
    const callsBefore = global.fetch.mock.calls.length

    const startInput = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/)[0]
    await userEvent.clear(startInput)
    await userEvent.type(startInput, '2026-01-01')

    await waitFor(() => {
      expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })
})
