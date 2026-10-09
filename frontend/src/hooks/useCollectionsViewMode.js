import { useState, useCallback } from 'react'

const STORAGE_KEY = 'bummer.collectionsView'
const DEFAULT_VALUE = 'list'
const VALID_VALUES = ['list', 'grid']

function readInitial() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && VALID_VALUES.includes(stored)) return stored
  } catch {
    // ignore
  }
  return DEFAULT_VALUE
}

export function useCollectionsViewMode() {
  const [value, setValueState] = useState(readInitial)

  const setValue = useCallback((next) => {
    if (!VALID_VALUES.includes(next)) return
    setValueState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  return [value, setValue]
}
