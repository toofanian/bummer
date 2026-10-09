import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useCollectionMembership } from './useCollectionMembership'

describe('useCollectionMembership', () => {
  it('initializes with empty map by default', () => {
    const { result } = renderHook(() => useCollectionMembership())
    expect(result.current.albumCollectionMap).toEqual({})
  })

  it('initializes with the provided initial map', () => {
    const initial = { a1: ['c1'] }
    const { result } = renderHook(() => useCollectionMembership(initial))
    expect(result.current.albumCollectionMap).toEqual({ a1: ['c1'] })
  })

  it('addAlbumsToCollection adds collectionId to each album', () => {
    const { result } = renderHook(() => useCollectionMembership())
    act(() => {
      result.current.addAlbumsToCollection('c1', ['a1', 'a2'])
    })
    expect(result.current.albumCollectionMap).toEqual({
      a1: ['c1'],
      a2: ['c1'],
    })
  })

  it('addAlbumsToCollection does not duplicate when already present', () => {
    const { result } = renderHook(() => useCollectionMembership({ a1: ['c1'] }))
    act(() => {
      result.current.addAlbumsToCollection('c1', ['a1', 'a2'])
    })
    expect(result.current.albumCollectionMap).toEqual({
      a1: ['c1'],
      a2: ['c1'],
    })
  })

  it('addAlbumsToCollection appends to existing collection list for an album', () => {
    const { result } = renderHook(() => useCollectionMembership({ a1: ['c1'] }))
    act(() => {
      result.current.addAlbumsToCollection('c2', ['a1'])
    })
    expect(result.current.albumCollectionMap).toEqual({ a1: ['c1', 'c2'] })
  })

  it('removeAlbumFromCollection removes the collectionId from that album', () => {
    const { result } = renderHook(() =>
      useCollectionMembership({ a1: ['c1', 'c2'], a2: ['c1'] }),
    )
    act(() => {
      result.current.removeAlbumFromCollection('c1', 'a1')
    })
    expect(result.current.albumCollectionMap).toEqual({
      a1: ['c2'],
      a2: ['c1'],
    })
  })

  it('removeAlbumFromCollection is a no-op when album is not present', () => {
    const initial = { a1: ['c1'] }
    const { result } = renderHook(() => useCollectionMembership(initial))
    act(() => {
      result.current.removeAlbumFromCollection('c1', 'unknown')
    })
    expect(result.current.albumCollectionMap).toEqual({ a1: ['c1'] })
  })

  it('setCollectionMembership replaces the full set of albums for a collection', () => {
    const { result } = renderHook(() =>
      useCollectionMembership({
        a1: ['c1', 'c2'],
        a2: ['c1'],
        a3: ['c2'],
      }),
    )
    act(() => {
      result.current.setCollectionMembership('c1', ['a3', 'a4'])
    })
    expect(result.current.albumCollectionMap).toEqual({
      a1: ['c2'],
      a3: ['c2', 'c1'],
      a4: ['c1'],
    })
  })

  it('setCollectionMembership with empty list removes collection from all albums', () => {
    const { result } = renderHook(() =>
      useCollectionMembership({ a1: ['c1'], a2: ['c1', 'c2'] }),
    )
    act(() => {
      result.current.setCollectionMembership('c1', [])
    })
    expect(result.current.albumCollectionMap).toEqual({ a2: ['c2'] })
  })

  it('deleteCollection removes collectionId from every album list', () => {
    const { result } = renderHook(() =>
      useCollectionMembership({
        a1: ['c1', 'c2'],
        a2: ['c1'],
        a3: ['c2'],
      }),
    )
    act(() => {
      result.current.deleteCollection('c1')
    })
    expect(result.current.albumCollectionMap).toEqual({
      a1: ['c2'],
      a3: ['c2'],
    })
  })

  it('action functions are stable across renders', () => {
    const { result, rerender } = renderHook(() => useCollectionMembership())
    const first = {
      addAlbumsToCollection: result.current.addAlbumsToCollection,
      removeAlbumFromCollection: result.current.removeAlbumFromCollection,
      setCollectionMembership: result.current.setCollectionMembership,
      deleteCollection: result.current.deleteCollection,
      setAlbumCollectionMap: result.current.setAlbumCollectionMap,
    }
    rerender()
    expect(result.current.addAlbumsToCollection).toBe(first.addAlbumsToCollection)
    expect(result.current.removeAlbumFromCollection).toBe(first.removeAlbumFromCollection)
    expect(result.current.setCollectionMembership).toBe(first.setCollectionMembership)
    expect(result.current.deleteCollection).toBe(first.deleteCollection)
    expect(result.current.setAlbumCollectionMap).toBe(first.setAlbumCollectionMap)
  })

  it('exposes setAlbumCollectionMap escape hatch for direct overrides', () => {
    const { result } = renderHook(() => useCollectionMembership())
    act(() => {
      result.current.setAlbumCollectionMap({ a1: ['c1'] })
    })
    expect(result.current.albumCollectionMap).toEqual({ a1: ['c1'] })
  })
})
