import { useState, useEffect, useRef, useCallback } from 'react'

export function useLazyRender(items, batchSize = 30) {
  const [visibleCount, setVisibleCount] = useState(batchSize)
  const observerRef = useRef(null)

  useEffect(() => {
    setVisibleCount(batchSize)
  }, [items, batchSize])

  const handleIntersect = useCallback((entries) => {
    if (entries[0].isIntersecting) {
      setVisibleCount(prev => Math.min(prev + batchSize, items.length))
    }
  }, [items.length, batchSize])

  // Callback ref: observer connects when sentinel mounts, disconnects when
  // it unmounts. Fixes race condition where tab switches cause visibleCount
  // reset (useEffect) to run after the observer effect, leaving the observer
  // disconnected when the sentinel reappears.
  const sentinelRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (node) {
      const observer = new IntersectionObserver(handleIntersect, { threshold: 0 })
      observer.observe(node)
      observerRef.current = observer
    }
  }, [handleIntersect])

  const visible = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

  return { visible, hasMore, sentinelRef }
}
