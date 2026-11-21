import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getMyProfile } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import type { AdminProfile, Role } from '@/types'

interface AuthState {
  session: Session | null
  profile: AdminProfile | null
  loading: boolean
  profileError: string | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  can: (...roles: Role[]) => boolean
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setProfileError(null)
      return
    }
    try {
      const p = await getMyProfile(s.user.id)
      setProfile(p && p.is_active ? p : null)
      setProfileError(p ? (p.is_active ? null : 'This admin account has been deactivated.') : 'This account is not registered as an administrator.')
    } catch (e) {
      setProfile(null)
      setProfileError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadProfile(data.session)
      if (alive) setLoading(false)
    }).catch(() => alive && setLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s)
      // never await supabase calls inside this callback (deadlock risk) - defer
      setTimeout(() => { void loadProfile(s) }, 0)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? (error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : friendlyError(error)) : null
    } catch {
      return 'Network problem — check your internet connection and try again.'
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session, profile, loading, profileError, signIn, signOut,
      can: (...roles) => !!profile && roles.includes(profile.role),
    }),
    [session, profile, loading, profileError, signIn, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

/** Which roles may open which areas. The database enforces the same rules independently. */
export const ACCESS = {
  dashboard: ['super_admin', 'registration_admin', 'report_viewer'] as Role[],
  register: ['super_admin', 'registration_admin'] as Role[],
  registrations: ['super_admin', 'registration_admin', 'report_viewer'] as Role[],
  tickets: ['super_admin', 'registration_admin', 'report_viewer'] as Role[],
  scanner: ['super_admin', 'entry_admin'] as Role[],
  entries: ['super_admin', 'entry_admin', 'report_viewer'] as Role[],
  reports: ['super_admin', 'report_viewer'] as Role[],
  settings: ['super_admin'] as Role[],
  admins: ['super_admin'] as Role[],
}

export function homeFor(role: Role): string {
  return role === 'entry_admin' ? '/admin/scanner' : '/admin'
}
