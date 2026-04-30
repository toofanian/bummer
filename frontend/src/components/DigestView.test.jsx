import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DigestView from './DigestView'
import { useIsMobile } from '../hooks/useIsMobile'

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false)
}))

const changelogData = {
  days: [
    {
      date: '2026-04-29',
      events: [
        { type: 'added', album: { service_id: 'a1', name: 'New Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' }, changed_at: '2026-04-29T10:00:00Z' },
      ],
    },
    {
      date: '2026-04-28',
      events: [
        { type: 'removed', album: { service_id: 'a2', name: 'Old Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' }, changed_at: '2026-04-28T10:00:00Z' },
      ],
    },
    {
      date: '2026-04-27',
      events: [
        { type: 'bounced', album: { service_id: 'a3', name: 'Tried Album', artists: ['Artist C'], image_url: 'https://img/3.jpg' }, changed_at: '2026-04-27T10:00:00Z' },
      ],
    },
  ],
}

const historyData = {
  days: [
    {
      date: '2026-04-16',
      plays: [
        { album: { service_id: 'h1', name: 'Played Album', artists: ['History Artist'], image_url: 'https://img/h1.jpg' }, played_at: '2026-04-16T15:30:00Z' },
        { album: { service_id: 'h2', name: 'Another Play', artists: ['Other Artist'], image_url: 'https://img/h2.jpg' }, played_at: '2026-04-16T10:00:00Z' },
      ],
    },
  ],
  has_more: false,
  next_cursor: null,
}

const statsData = {
  period_days: 30,
  top_albums: [
    { album: { service_id: 's1', name: 'Top Album One', artists: ['Stats Artist'], image_url: 'https://img/s1.jpg' }, play_count: 42 },
    { album: { service_id: 's2', name: 'Top Album Two', artists: ['Another Stats Artist'], image_url: 'https://img/s2.jpg' }, play_count: 30 },
  ],
  top_artists: [
    { artist: 'Popular Artist', play_count: 55, image_url: 'https://img/popular.jpg' },
    { artist: 'Second Artist', play_count: 33, image_url: null },
  ],
}

function mockFetchForAllEndpoints() {
  global.fetch = vi.fn((url) => {
    if (url.includes('/digest/changelog')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(changelogData) })
    }
    if (url.includes('/digest/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(historyData) })
    }
    if (url.includes('/digest/stats')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(statsData) })
    }
    return Promise.resolve({ ok: false, status: 404 })
  })
}

describe('DigestView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useIsMobile.mockReturnValue(false)
    mockFetchForAllEndpoints()
  })

  afterEach(() => {
    delete global.fetch
  })

  it('renders all three columns on wide viewport', async () => {
    useIsMobile.mockReturnValue(false)
    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Library Changes')).toBeInTheDocument()
      expect(screen.getByText('Listening History')).toBeInTheDocument()
      expect(screen.getByText('Monthly Stats')).toBeInTheDocument()
    })
  })

  it('renders tab switcher on narrow viewport', async () => {
    useIsMobile.mockReturnValue(true)
    const user = userEvent.setup()
    render(<DigestView onPlay={() => {}} />)

    // Tab buttons should be visible
    expect(screen.getByRole('tab', { name: /changes/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /stats/i })).toBeInTheDocument()

    // Default tab is changes
    await waitFor(() => {
      expect(screen.getByText('Library Changes')).toBeInTheDocument()
    })

    // Switch to history tab
    await user.click(screen.getByRole('tab', { name: /history/i }))
    await waitFor(() => {
      expect(screen.getByText('Listening History')).toBeInTheDocument()
    })

    // Switch to stats tab
    await user.click(screen.getByRole('tab', { name: /stats/i }))
    await waitFor(() => {
      expect(screen.getByText('Monthly Stats')).toBeInTheDocument()
    })
  })

  it('renders change events grouped by date with type badges', async () => {
    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('2026-04-29')).toBeInTheDocument()
      expect(screen.getByText('2026-04-28')).toBeInTheDocument()
      expect(screen.getByText('2026-04-27')).toBeInTheDocument()
      expect(screen.getByText('New Album')).toBeInTheDocument()
      expect(screen.getByText('Old Album')).toBeInTheDocument()
      expect(screen.getByText('Tried Album')).toBeInTheDocument()
      expect(screen.getByText('+')).toBeInTheDocument()
      expect(screen.getByText('\u2212')).toBeInTheDocument()
      expect(screen.getByText('\u2195')).toBeInTheDocument()
    })
  })

  it('renders listening history grouped by day', async () => {
    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('2026-04-16')).toBeInTheDocument()
      expect(screen.getByText('Played Album')).toBeInTheDocument()
      expect(screen.getByText('Another Play')).toBeInTheDocument()
    })
  })

  it('renders artist profile images in top artists', async () => {
    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      const img = screen.getByAltText('Popular Artist')
      expect(img).toBeInTheDocument()
      expect(img.src).toContain('https://img/popular.jpg')
      expect(img.className).toContain('rounded-full')
    })
  })

  it('renders letter fallback when artist has no image', async () => {
    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.queryByAltText('Second Artist')).not.toBeInTheDocument()
    })
  })

  it('desktop columns have bottom padding and hidden scrollbars', async () => {
    useIsMobile.mockReturnValue(false)
    const { container } = render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Library Changes')).toBeInTheDocument()
    })
    const columns = container.querySelectorAll('.overflow-y-auto')
    expect(columns.length).toBe(3)
    columns.forEach(col => {
      expect(col.className).toContain('pb-20')
      expect(col.className).toContain('prompt-row-scroll')
    })
  })

  it('renders stats with top albums and artists', async () => {
    render(<DigestView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Top Albums')).toBeInTheDocument()
      expect(screen.getByText('Top Artists')).toBeInTheDocument()
      expect(screen.getByText('Top Album One')).toBeInTheDocument()
      expect(screen.getByText('Top Album Two')).toBeInTheDocument()
      expect(screen.getByText('Popular Artist')).toBeInTheDocument()
      expect(screen.getByText('Second Artist')).toBeInTheDocument()
      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('55')).toBeInTheDocument()
    })
  })
})
