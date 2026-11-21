import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from '@/lib/errors'

/** Loads data with loading / error / retry state. Ignores out-of-date responses. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const run = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFn = useCallback(fn, deps)

  const load = useCallback(async () => {
    const id = ++run.current
    setLoading(true)
    setError(null)
    try {
      const r = await stableFn()
      if (id === run.current) setData(r)
    } catch (e) {
      if (id === run.current) setError(friendlyError(e))
    } finally {
      if (id === run.current) setLoading(false)
    }
  }, [stableFn])

  useEffect(() => { void load() }, [load])
  return { data, loading, error, reload: load, setData }
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
