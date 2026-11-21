import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import type { EventRow } from '@/types'

interface EventState {
  event: EventRow | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  setEvent: (e: EventRow) => void
}
const Ctx = createContext<EventState | null>(null)

export function EventProvider({ children }: { children: ReactNode }) {
  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEvent(await api.getActiveEvent())
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const value = useMemo(() => ({ event, loading, error, reload, setEvent }), [event, loading, error, reload])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEvent() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEvent outside EventProvider')
  return v
}
