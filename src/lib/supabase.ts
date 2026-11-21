import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anon && !url.includes('YOUR-PROJECT'))

// The anon key is public by design; every table is protected by RLS and every
// privileged operation is a SECURITY DEFINER function that checks the caller's role.
export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Public origin used inside QR codes / shared links */
export function siteOrigin(): string {
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim()
  return (configured ? configured : window.location.origin).replace(/\/+$/, '')
}
export const ticketUrl = (token: string) => `${siteOrigin()}/ticket/${token}`

/** Pulls the ticket token out of a scanned QR payload (full URL or bare token). */
export function extractToken(raw: string): string | null {
  const text = (raw ?? '').trim()
  const m = text.match(/\/ticket\/([0-9a-f]{48})(?:[/?#]|$)/i) ?? text.match(/^([0-9a-f]{48})$/i)
  return m ? m[1].toLowerCase() : null
}
