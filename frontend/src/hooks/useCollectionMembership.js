import { useCallback, useState } from 'react'

/**
 * Centralized state + actions for the album -> collection-ids map.
 *
 * Shape: { [albumServiceId: string]: string[] /* collectionIds *\/ }
 */
export function useCollectionMembership(initial = {}) {
  const [map, setMap] = useState(initial)

  const addAlbumsToCollection = useCallback((collectionId, albumIds) => {
    setMap(prev => {
      const next = { ...prev }
      for (const id of albumIds) {
        const list = next[id] ?? []
        if (!list.includes(collectionId)) next[id] = [...list, collectionId]
      }
      return next
    })
  }, [])

  const removeAlbumFromCollection = useCallback((collectionId, albumId) => {
    setMap(prev => {
      const list = prev[albumId]
      if (!list) return prev
      const filtered = list.filter(id => id !== collectionId)
      return { ...prev, [albumId]: filtered }
    })
  }, [])

  const setCollectionMembership = useCallback((collectionId, albumIds) => {
    setMap(prev => {
      const next = {}
      // Strip collectionId from all entries
      for (const [aid, list] of Object.entries(prev)) {
        const stripped = list.filter(id => id !== collectionId)
        if (stripped.length) next[aid] = stripped
      }
      // Add collectionId to each new album
      for (const aid of albumIds) {
        next[aid] = [...(next[aid] ?? []), collectionId]
      }
      return next
    })
  }, [])

  const deleteCollection = useCallback(collectionId => {
    setMap(prev => {
      const next = {}
      for (const [aid, list] of Object.entries(prev)) {
        const stripped = list.filter(id => id !== collectionId)
        if (stripped.length) next[aid] = stripped
      }
      return next
    })
  }, [])

  return {
    albumCollectionMap: map,
    setAlbumCollectionMap: setMap,
    addAlbumsToCollection,
    removeAlbumFromCollection,
    setCollectionMembership,
    deleteCollection,
  }
}
