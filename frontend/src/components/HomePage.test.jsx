import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import HomePage from './HomePage'
import { useIsMobile } from '../hooks/useIsMobile'

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false)
}))

let intersectionCallback = null
const mockObserverInstance = {
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}
global.IntersectionObserver = vi.fn(function (callback) {
  intersectionCallback = callback
  return mockObserverInstance
})

const HOME_DATA = {
  recently_played: [
    { service_id: 'a1', name: 'Today Album', artists: ['Artist A'], image_url: 'https://img/1.jpg' },
    { service_id: 'a2', name: 'Week Album', artists: ['Artist B'], image_url: 'https://img/2.jpg' },
  ],
  recently_added: [
    { service_id: 'a5', name: 'New Album', artists: ['Artist D'], image_url: 'https://img/5.jpg' },
  ],
  rediscover: [
    { service_id: 'a3', name: 'Old Gem', artists: ['Artist C'], image_url: 'https://img/3.jpg' },
  ],
  recommended: [
    { service_id: 'a4', name: 'Try This', artists: ['Artist A'], image_url: 'https://img/4.jpg' },
  ],
}

const LARGE_SECTION = Array.from({ length: 45 }, (_, i) => ({
  service_id: `lg${i}`,
  name: `Large Album ${i}`,
  artists: ['Artist X'],
  image_url: `https://img/lg${i}.jpg`,
}))

beforeEach(() => {
  vi.restoreAllMocks()
  useIsMobile.mockReturnValue(false)
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(HOME_DATA) })
  )
})

describe('HomePage', () => {
  it('renders all four columns on desktop', async () => {
    useIsMobile.mockReturnValue(false)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
      expect(screen.getByText('Recently Added')).toBeInTheDocument()
      expect(screen.getByText('Related')).toBeInTheDocument()
      expect(screen.getByText('Lost')).toBeInTheDocument()
    })
  })

  it('renders album art in desktop columns', async () => {
    useIsMobile.mockReturnValue(false)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
      expect(screen.getByAltText('New Album')).toBeInTheDocument()
      expect(screen.getByAltText('Try This')).toBeInTheDocument()
      expect(screen.getByAltText('Old Gem')).toBeInTheDocument()
    })
  })

  it('renders tab switcher on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /played/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /added/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /related/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /lost/i })).toBeInTheDocument()
    })
  })

  it('defaults to Recently Played tab on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
      expect(screen.queryByAltText('Old Gem')).not.toBeInTheDocument()
    })
  })

  it('switches tabs on mobile', async () => {
    useIsMobile.mockReturnValue(true)
    const user = userEvent.setup()
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: /lost/i }))
    await waitFor(() => {
      expect(screen.getByAltText('Old Gem')).toBeInTheDocument()
      expect(screen.queryByAltText('Today Album')).not.toBeInTheDocument()
    })
  })

  it('calls onPlay when an album is clicked', async () => {
    const onPlay = vi.fn()
    render(<HomePage onPlay={onPlay} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
    })
    screen.getByAltText('Today Album').closest('[data-testid]').click()
    expect(onPlay).toHaveBeenCalledWith('a1')
  })

  it('shows per-section empty state when a section has no albums', async () => {
    const sparse = {
      recently_played: [], recently_added: [],
      rediscover: HOME_DATA.rediscover, recommended: [],
    }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(sparse) })
    )
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
    })
  })

  it('shows global empty state when all sections are empty', async () => {
    const empty = { recently_played: [], recently_added: [], rediscover: [], recommended: [] }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(empty) })
    )
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/start playing albums/i)).toBeInTheDocument()
    })
  })

  it('renders only first 30 albums initially when section has more', async () => {
    const largeData = {
      ...HOME_DATA,
      recently_played: LARGE_SECTION,
    }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(largeData) })
    )
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('album-item-lg0')).toBeInTheDocument()
    })
    expect(screen.getByTestId('album-item-lg29')).toBeInTheDocument()
    expect(screen.queryByTestId('album-item-lg30')).not.toBeInTheDocument()
  })

  it('renders remaining albums when sentinel becomes visible', async () => {
    const largeData = {
      ...HOME_DATA,
      recently_played: LARGE_SECTION,
    }
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(largeData) })
    )
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('album-item-lg0')).toBeInTheDocument()
    })

    act(() => {
      intersectionCallback([{ isIntersecting: true }])
    })

    await waitFor(() => {
      expect(screen.getByTestId('album-item-lg44')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('load-more-sentinel')).not.toBeInTheDocument()
  })

  it('renders all items without sentinel when section has 30 or fewer', async () => {
    useIsMobile.mockReturnValue(true)
    render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('album-item-a1')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('load-more-sentinel')).not.toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}))
    render(<HomePage onPlay={() => {}} />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('desktop column scroll containers have prompt-row-scroll class', async () => {
    useIsMobile.mockReturnValue(false)
    const { container } = render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Recently Played')).toBeInTheDocument()
    })
    const scrollContainers = container.querySelectorAll('.overflow-y-auto')
    expect(scrollContainers).toHaveLength(4)
    scrollContainers.forEach(el => {
      expect(el.classList.contains('prompt-row-scroll')).toBe(true)
    })
  })

  it('mobile scroll container has prompt-row-scroll class', async () => {
    useIsMobile.mockReturnValue(true)
    const { container } = render(<HomePage onPlay={() => {}} />)
    await waitFor(() => {
      expect(screen.getByAltText('Today Album')).toBeInTheDocument()
    })
    const scrollContainers = container.querySelectorAll('.overflow-y-auto')
    expect(scrollContainers).toHaveLength(1)
    expect(scrollContainers[0].classList.contains('prompt-row-scroll')).toBe(true)
  })
})
