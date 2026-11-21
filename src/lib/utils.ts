import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Serial numbers are stored as integers and shown as 00001 */
export function formatSerial(n: number | null | undefined): string {
  return String(n ?? 0).padStart(5, '0')
}

export function serialRange(serials: number[]): string {
  if (serials.length === 0) return ''
  const s = [...serials].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = s[0]
  let prev = s[0]
  for (let i = 1; i <= s.length; i++) {
    if (s[i] === prev + 1) {
      prev = s[i]
      continue
    }
    ranges.push(start === prev ? formatSerial(start) : `${formatSerial(start)} – ${formatSerial(prev)}`)
    start = s[i]
    prev = s[i]
  }
  return ranges.join(', ')
}

export function formatINR(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v)
}

export function fmtDate(iso: string | null | undefined, pattern = 'dd MMM yyyy'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : format(d, pattern)
}
export const fmtDateTime = (iso: string | null | undefined) => fmtDate(iso, 'dd MMM yyyy, hh:mm a')

/** Same normalisation the database applies. Returns the 10-digit number or null. */
export function normalizeMobile(input: string): string | null {
  let d = (input ?? '').replace(/[^0-9]/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9][0-9]{9}$/.test(d) ? d : null
}

export function newRequestId(): string {
  return crypto.randomUUID()
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function startOfDayIso(date: string): string | null {
  if (!date) return null
  return new Date(`${date}T00:00:00`).toISOString()
}
/** exclusive upper bound: the start of the next day */
export function endOfDayIso(date: string): string | null {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}
