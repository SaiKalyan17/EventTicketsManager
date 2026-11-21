import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, FileText, Share2, TicketX } from 'lucide-react'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { copyText } from '@/lib/utils'
import { downloadEpassPdf, downloadEpassPng, makeQrDataUrl } from '@/lib/epass'
import { ticketUrl } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ErrorState, PageLoader } from '@/components/ui/feedback'
import { EpassCard, epassFromEvent, type EpassData } from '@/components/epass/EpassCard'
import { FitWidth } from '@/components/epass/FitWidth'

type State = { kind: 'loading' } | { kind: 'invalid' } | { kind: 'error'; message: string } | { kind: 'ok'; d: EpassData }

export default function PublicTicket() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const t = await api.getPublicTicket(token)
      if (!t.found || !t.event) return setState({ kind: 'invalid' })
      const qrDataUrl = await makeQrDataUrl(token)
      setState({
        kind: 'ok',
        d: epassFromEvent({ ...t.event, ticket_settings: t.event.ticket_settings }, {
          customerName: t.customer_name ?? '', serial: t.serial_number ?? 0, passType: t.pass_type ?? 'online',
          amount: t.amount ?? null, cancelled: t.status === 'cancelled', qrDataUrl,
        }),
      })
      document.title = `${t.event.name} – E-Pass`
    } catch (e) {
      setState({ kind: 'error', message: friendlyError(e) })
    }
  }, [token])
  useEffect(() => { void load() }, [load])

  const run = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key)
    try { await fn() } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }

  if (state.kind === 'loading') return <PageLoader label="Loading your pass…" />
  if (state.kind === 'error') return <div className="mx-auto max-w-md p-6"><ErrorState message={state.message} onRetry={load} /></div>
  if (state.kind === 'invalid') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-sm space-y-3 rounded-2xl border bg-card p-8 text-center shadow-sm">
          <TicketX className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="text-xl font-bold">Invalid ticket link</h1>
          <p className="text-sm text-muted-foreground">We could not find a pass for this link. Please check the link you received or contact the event organisers.</p>
        </div>
      </div>
    )
  }

  const { d } = state
  const share = run('share', async () => {
    const url = ticketUrl(token)
    if (navigator.share) {
      try { await navigator.share({ title: `${d.eventName} – E-Pass`, text: `E-pass for ${d.eventName}`, url }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    if (await copyText(url)) toast.success('Link copied')
    else toast.error('Could not copy the link')
  })

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FFF3CF] to-[#FFFBF0] px-3 py-5">
      <div className="mx-auto max-w-[680px] space-y-4">
        {d.cancelled && (
          <div role="alert" className="rounded-2xl bg-red-600 p-4 text-center font-bold text-white">This ticket has been cancelled and is NOT valid for entry.</div>
        )}
        <FitWidth><EpassCard d={d} /></FitWidth>
        {!d.cancelled && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Button size="lg" onClick={run('png', async () => { await downloadEpassPng(d); toast.success('Image saved') })} loading={busy === 'png'}><Download className="h-5 w-5" /> Download PNG</Button>
            <Button size="lg" variant="gold" onClick={run('pdf', async () => { await downloadEpassPdf(d); toast.success('PDF saved') })} loading={busy === 'pdf'}><FileText className="h-5 w-5" /> Download PDF</Button>
            <Button size="lg" variant="outline" onClick={share} loading={busy === 'share'}><Share2 className="h-5 w-5" /> Share</Button>
          </div>
        )}
      </div>
    </div>
  )
}
