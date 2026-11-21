import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { AlertOctagon, Camera, CameraOff, CheckCircle2, ScanLine, ShieldAlert, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { extractToken } from '@/lib/supabase'
import { fmtDateTime, formatINR, formatSerial } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { PassTypeBadge } from '@/components/epass/TicketList'
import { cn } from '@/lib/utils'
import type { ScanResult } from '@/types'

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'checking' }
  | { kind: 'result'; token: string; res: ScanResult }
  | { kind: 'confirming'; token: string; res: ScanResult }
  | { kind: 'entered'; res: ScanResult }
  | { kind: 'error'; message: string }

const REGION_ID = 'qr-reader'

function cameraMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? ''
  const msg = String((e as { message?: string })?.message ?? e)
  if (name === 'NotAllowedError' || /permission|denied/i.test(msg)) return 'Camera permission was denied. Allow camera access for this site in your browser settings, then tap "Start camera".'
  if (name === 'NotFoundError' || /no camera|not found|requested device/i.test(msg)) return 'No camera was found on this device. Use manual entry below.'
  if (/secure|https/i.test(msg)) return 'The camera needs a secure (HTTPS) connection.'
  return `Could not start the camera: ${msg}`
}

export default function Scanner() {
  const { can } = useAuth()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [manual, setManual] = useState('')
  const scanner = useRef<Html5Qrcode | null>(null)
  const busy = useRef(false)

  const stop = useCallback(async () => {
    const s = scanner.current
    scanner.current = null
    if (s) {
      try { if (s.isScanning) await s.stop() } catch { /* already stopped */ }
      try { s.clear() } catch { /* ignore */ }
    }
  }, [])

  const verify = useCallback(async (raw: string) => {
    if (busy.current) return
    busy.current = true
    setPhase({ kind: 'checking' })
    await stop()
    try {
      const token = extractToken(raw)
      if (!token) {
        setPhase({ kind: 'result', token: '', res: { result: 'invalid' } })
        return
      }
      const res = await api.lookupTicket(token)
      setPhase({ kind: 'result', token, res })
    } catch (e) {
      setPhase({ kind: 'error', message: friendlyError(e) })
    } finally {
      busy.current = false
    }
  }, [stop])

  const start = useCallback(async () => {
    setPhase({ kind: 'starting' })
    await stop()
    try {
      if (!window.isSecureContext) throw new Error('secure context required (HTTPS)')
      // wait for the container to exist
      await new Promise((r) => setTimeout(r, 50))
      const s = new Html5Qrcode(REGION_ID, { verbose: false })
      scanner.current = s
      await s.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.8); return { width: m, height: m } } },
        (text) => { void verify(text) },
        () => undefined,
      )
      setPhase({ kind: 'scanning' })
    } catch (e) {
      await stop()
      setPhase({ kind: 'error', message: cameraMessage(e) })
    }
  }, [stop, verify])

  useEffect(() => () => { void stop() }, [stop])

  const confirm = async (token: string, res: ScanResult) => {
    setPhase({ kind: 'confirming', token, res })
    try {
      const out = await api.confirmEntry(token)
      if (out.result === 'entered') {
        setPhase({ kind: 'entered', res: out })
        navigator.vibrate?.(200)
      } else {
        // someone else got there first (or status changed): show the real outcome
        setPhase({ kind: 'result', token, res: out })
        toast.warning(out.result === 'already_entered' ? 'This ticket was just used for entry.' : 'This ticket can no longer be admitted.')
      }
    } catch (e) {
      setPhase({ kind: 'result', token, res })
      toast.error(friendlyError(e))
    }
  }

  const next = () => { setManual(''); void start() }
  const t = 'ticket' in (phase as object) ? (phase as { res: ScanResult }).res.ticket : undefined

  // ----- full-screen success -----
  if (phase.kind === 'entered' && phase.res.ticket) {
    const tk = phase.res.ticket
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-emerald-600 p-6 text-center text-white" role="status">
        <CheckCircle2 className="h-28 w-28" />
        <p className="text-4xl font-extrabold tracking-wide">ENTRY CONFIRMED</p>
        <p className="text-2xl font-semibold">{tk.customer_name}</p>
        <p className="font-mono text-5xl font-extrabold tracking-widest">{formatSerial(tk.serial_number)}</p>
        <p className="text-sm opacity-90">Recorded at {fmtDateTime(tk.entry_time)}</p>
        <Button size="lg" variant="outline" className="mt-4 border-white bg-white text-emerald-700 hover:bg-white/90" onClick={next}>
          <ScanLine className="h-5 w-5" /> Scan next
        </Button>
      </div>
    )
  }

  const res = phase.kind === 'result' || phase.kind === 'confirming' ? phase.res : null
  const tone = !res ? '' : res.result === 'valid' ? 'emerald' : res.result === 'already_entered' ? 'amber' : 'red'

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Scan entry pass</h1>

      <div className={cn('overflow-hidden rounded-2xl border-2 border-dashed bg-black/90', phase.kind === 'scanning' || phase.kind === 'starting' ? '' : 'hidden')}>
        <div id={REGION_ID} className="w-full" />
      </div>

      {(phase.kind === 'idle' || phase.kind === 'error') && (
        <div className="space-y-3 rounded-2xl border bg-card p-6 text-center">
          {phase.kind === 'error' ? <CameraOff className="mx-auto h-10 w-10 text-destructive" /> : <Camera className="mx-auto h-10 w-10 text-primary" />}
          {phase.kind === 'error' ? <p role="alert" className="text-sm font-medium text-red-800">{phase.message}</p>
            : <p className="text-sm text-muted-foreground">Your browser will ask for camera permission.</p>}
          <Button size="lg" onClick={start}><Camera className="h-5 w-5" /> {phase.kind === 'error' ? 'Try again' : 'Start camera'}</Button>
        </div>
      )}
      {phase.kind === 'starting' && <p className="text-center text-sm text-muted-foreground" role="status">Starting camera…</p>}
      {phase.kind === 'scanning' && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Point the camera at the visitor's QR code</p>
          <Button variant="outline" size="sm" onClick={async () => { await stop(); setPhase({ kind: 'idle' }) }}>Stop</Button>
        </div>
      )}
      {phase.kind === 'checking' && <p className="py-8 text-center text-sm text-muted-foreground" role="status">Checking ticket…</p>}

      {res && (
        <div className={cn('space-y-4 rounded-2xl border-4 p-5',
          tone === 'emerald' && 'border-emerald-500 bg-emerald-50', tone === 'amber' && 'border-amber-500 bg-amber-50', tone === 'red' && 'border-red-500 bg-red-50')} role="status">
          <div className="flex items-center gap-3">
            {res.result === 'valid' && <CheckCircle2 className="h-10 w-10 text-emerald-600" />}
            {res.result === 'already_entered' && <ShieldAlert className="h-10 w-10 text-amber-600" />}
            {res.result === 'cancelled' && <XCircle className="h-10 w-10 text-red-600" />}
            {res.result === 'invalid' && <AlertOctagon className="h-10 w-10 text-red-600" />}
            <p className="text-2xl font-extrabold">
              {res.result === 'valid' ? 'VALID TICKET' : res.result === 'already_entered' ? 'ALREADY ENTERED' : res.result === 'cancelled' ? 'CANCELLED — DO NOT ADMIT' : 'INVALID QR'}
            </p>
          </div>
          {res.result === 'invalid' && <p className="text-sm">This QR code is not a ticket for this event. Do not admit unless verified another way.</p>}
          {res.result === 'already_entered' && t && (
            <p className="rounded-lg bg-white/70 p-2 text-sm font-semibold">Previously entered at {fmtDateTime(t.entry_time)}{t.checked_in_by_name ? ` (checked in by ${t.checked_in_by_name})` : ''}</p>
          )}
          {res.result === 'cancelled' && t?.cancel_reason && <p className="rounded-lg bg-white/70 p-2 text-sm">Reason: {t.cancel_reason}</p>}
          {t && (
            <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Customer</dt><dd className="text-base font-bold">{t.customer_name}</dd>
              <dt className="text-muted-foreground">Serial number</dt><dd className="font-mono text-2xl font-extrabold tracking-widest">{formatSerial(t.serial_number)}</dd>
              <dt className="text-muted-foreground">Registration</dt><dd>{t.registration_code}</dd>
              <dt className="text-muted-foreground">Pass type</dt><dd><PassTypeBadge type={t.pass_type} /></dd>
              <dt className="text-muted-foreground">Ticket status</dt><dd className="font-semibold capitalize">{t.status}</dd>
              <dt className="text-muted-foreground">Entry status</dt><dd className="font-semibold">{t.entry_status === 'entered' ? 'Entered' : 'Not entered'}</dd>
              {t.payment_status && can('super_admin') && (<><dt className="text-muted-foreground">Payment</dt><dd className="font-semibold capitalize">{t.payment_status}{t.balance ? ` (balance ${formatINR(t.balance)})` : ''}</dd></>)}
            </dl>
          )}
          <div className="flex gap-2">
            {res.result === 'valid' && phase.kind !== 'checking' && 'token' in phase && (
              <Button size="lg" variant="success" className="h-16 flex-1 text-lg" loading={phase.kind === 'confirming'} onClick={() => confirm(phase.token, res)}>
                MARK AS ENTERED
              </Button>
            )}
            <Button size="lg" variant="outline" className={cn(res.result === 'valid' ? '' : 'flex-1')} onClick={next} disabled={phase.kind === 'confirming'}>
              {res.result === 'valid' ? 'Cancel' : 'Scan next'}
            </Button>
          </div>
        </div>
      )}

      {phase.kind !== 'scanning' && phase.kind !== 'result' && phase.kind !== 'confirming' && (
        <form className="space-y-2 rounded-2xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) void verify(manual) }}>
          <label className="text-sm font-medium" htmlFor="manual">No camera? Paste the ticket link</label>
          <div className="flex gap-2">
            <Input id="manual" placeholder="https://…/ticket/…" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />
            <Button type="submit" variant="secondary" disabled={!manual.trim()}>Check</Button>
          </div>
        </form>
      )}
    </div>
  )
}
