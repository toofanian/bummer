import { renderHook, act } from '@testing-library/react'
import { useCollectionsViewMode } from './useCollectionsViewMode'

const STORAGE_KEY = 'bummer.collectionsView'

describe('useCollectionsViewMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("returns default 'list' when localStorage is empty", () => {
    const { result } = renderHook(() => useCollectionsViewMode())
    expect(result.current[0]).toBe('list')
  })

  it('returns persisted value when localStorage has a valid value', () => {
    localStorage.setItem(STORAGE_KEY, 'grid')
    const { result } = renderHook(() => useCollectionsViewMode())
    expect(result.current[0]).toBe('grid')
  })

  it('setter updates state and writes to localStorage', () => {
    const { result } = renderHook(() => useCollectionsViewMode())
    act(() => result.current[1]('grid'))
    expect(result.current[0]).toBe('grid')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('grid')
  })

  it("falls back to default when persisted value is invalid", () => {
    localStorage.setItem(STORAGE_KEY, 'something-bogus')
    const { result } = renderHook(() => useCollectionsViewMode())
    expect(result.current[0]).toBe('list')
  })
})
