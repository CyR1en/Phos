import { useState, useEffect, useCallback } from 'preact/hooks'

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return defaultValue
    }
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (e) {
      return defaultValue
    }
  })

  const setLocalStorageState = useCallback((value: T | ((prev: T) => T)) => {
    try {
      setState(prevState => {
        const nextValue = typeof value === 'function' ? (value as Function)(prevState) : value
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(nextValue))
        }
        return nextValue
      })
    } catch (e) {
      console.warn(`Failed to set localStorage key "${key}":`, e)
    }
  }, [key])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setState(JSON.parse(e.newValue))
        } catch (err) {
          // ignore
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [key])

  return [state, setLocalStorageState]
}
