import { useState, useEffect, useRef, useCallback } from 'react'

export function useLazyRender(items, batchSize = 30) {
  const [visibleCount, setVisibleCount] = useState(batchSize)
  const sentinelRef = useRef(null)

  useEffect(() => {
    setVisibleCount(batchSize)
  }, [items, batchSize])

  const handleIntersect = useCallback((entries) => {
    if (entries[0].isIntersecting) {
      setVisibleCount(prev => Math.min(prev + batchSize, items.length))
    }
  }, [items.length, batchSize])

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, { threshold: 0 })
    const sentinel = sentinelRef.current
    if (sentinel) observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleIntersect])

  const visible = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length

  return { visible, hasMore, sentinelRef }
}
