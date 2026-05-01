import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLazyRender } from './useLazyRender'

let intersectionCallback = null
const mockObserverInstance = {
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}

beforeEach(() => {
  vi.restoreAllMocks()
  intersectionCallback = null
  mockObserverInstance.observe.mockClear()
  mockObserverInstance.disconnect.mockClear()
  global.IntersectionObserver = vi.fn(function (callback) {
    intersectionCallback = callback
    return mockObserverInstance
  })
})

// Simulate mounting the sentinel DOM node via the callback ref
function mountSentinel(result) {
  act(() => {
    result.current.sentinelRef(document.createElement('div'))
  })
}

describe('useLazyRender', () => {
  it('returns first batchSize items as visible', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 30))
    expect(result.current.visible).toHaveLength(30)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.sentinelRef).toBeDefined()
  })

  it('returns all items when list is smaller than batchSize', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 30))
    expect(result.current.visible).toHaveLength(10)
    expect(result.current.hasMore).toBe(false)
  })

  it('loads next batch when intersection fires', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 20))
    expect(result.current.visible).toHaveLength(20)

    mountSentinel(result)

    act(() => {
      intersectionCallback([{ isIntersecting: true }])
    })

    expect(result.current.visible).toHaveLength(40)
    expect(result.current.hasMore).toBe(true)
  })

  it('does not exceed items length', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 20))

    mountSentinel(result)

    act(() => {
      intersectionCallback([{ isIntersecting: true }])
    })

    expect(result.current.visible).toHaveLength(25)
    expect(result.current.hasMore).toBe(false)
  })

  it('resets visibleCount when items identity changes', () => {
    const items1 = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { result, rerender } = renderHook(
      ({ items }) => useLazyRender(items, 20),
      { initialProps: { items: items1 } }
    )

    mountSentinel(result)

    act(() => {
      intersectionCallback([{ isIntersecting: true }])
    })
    expect(result.current.visible).toHaveLength(40)

    const items2 = Array.from({ length: 50 }, (_, i) => ({ id: i + 100 }))
    rerender({ items: items2 })

    expect(result.current.visible).toHaveLength(20)
  })

  it('ignores intersection when not isIntersecting', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const { result } = renderHook(() => useLazyRender(items, 20))

    mountSentinel(result)

    act(() => {
      intersectionCallback([{ isIntersecting: false }])
    })

    expect(result.current.visible).toHaveLength(20)
  })

  it('returns empty visible for empty items', () => {
    const { result } = renderHook(() => useLazyRender([], 30))
    expect(result.current.visible).toHaveLength(0)
    expect(result.current.hasMore).toBe(false)
  })
})
