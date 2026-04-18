import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangelogView from './ChangelogView'

describe('ChangelogView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete global.fetch
  })

  it('renders loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) // never resolves
    render(<ChangelogView onPlay={() => {}} />)
    expect(screen.getByText(/loading changelog/i)).toBeInTheDocument()
  })

  it('fetches and renders changelog entries with dates and indicators', async () => {
    const mockData = {
      entries: [
        {
          date: '2026-04-15',
          added: [{ service_id: 'a1', name: 'New Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' }],
          removed: [{ service_id: 'a2', name: 'Old Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' }],
        },
      ],
      has_more: false,
      next_cursor: null,
    }
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockData) })
    )
    render(<ChangelogView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('2026-04-15')).toBeInTheDocument()
      expect(screen.getByText('New Album')).toBeInTheDocument()
      expect(screen.getByText('Old Album')).toBeInTheDocument()
      expect(screen.getByText('+')).toBeInTheDocument()
    })
  })

  it('shows empty message when no entries', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [], has_more: false, next_cursor: null }) })
    )
    render(<ChangelogView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/no changes recorded/i)).toBeInTheDocument()
    })
  })

  it('shows Load more button when has_more is true', async () => {
    const mockData = {
      entries: [
        { date: '2026-04-15', added: [{ service_id: 'a1', name: 'Album X', artists: ['X'], image_url: null }], removed: [] },
      ],
      has_more: true,
      next_cursor: '2026-04-14',
    }
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockData) })
    )
    render(<ChangelogView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/load more/i)).toBeInTheDocument()
    })
  })

  it('shows error state on fetch failure', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    render(<ChangelogView onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })
})
