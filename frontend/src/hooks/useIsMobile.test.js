import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from './useIsMobile'

function mockMatchMedia(matches) {
  const listeners = []
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn((_, cb) => listeners.push(cb)),
    removeEventListener: vi.fn(),
  })
  return listeners
}

describe('useIsMobile', () => {
  it('returns true when matchMedia matches (mobile width)', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when matchMedia does not match (desktop width)', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates when viewport changes from desktop to mobile', () => {
    const listeners = mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => listeners[0]({ matches: true }))
    expect(result.current).toBe(true)
  })

  it('queries (max-width: 768px) by default', () => {
    mockMatchMedia(false)
    renderHook(() => useIsMobile())
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 768px)')
  })
})
