import { useState } from 'react'
import { toast } from 'sonner'
import { Download, FileSpreadsheet } from 'lucide-react'
import { useEvent } from '@/hooks/useEvent'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { exportCsv, fetchAll } from '@/lib/export'
import { friendlyError } from '@/lib/errors'
import { endOfDayIso, fmtDate, formatINR, formatSerial, startOfDayIso } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { ErrorState, PageHeader, PageLoader } from '@/components/ui/feedback'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b py-2.5 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><b className="tabular-nums">{value}</b></div>
}

export default function Reports() {
  const { event } = useEvent()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const fromIso = startOfDayIso(from)
  const toIso = endOfDayIso(to)
  const { data: s, loading, error, reload } = useAsync(() => api.dashboardStats(event!.id, fromIso, toIso), [event?.id, from, to])
  const stamp = () => fmtDate(new Date().toISOString(), 'yyyyMMdd-HHmm')

  // Exports go through the same RLS-protected reads as the screens: a role that can't see a table gets an error, not data.
  const run = (key: string, fn: () => Promise<number>) => async () => {
    setBusy(key)
    try { toast.success(`Exported ${await fn()} rows`) } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }

  const exportRegistrations = run('reg', async () => {
    const rows = await fetchAll((o, l) => api.searchRegistrations({ eventId: event!.id, from: fromIso, to: toIso, limit: l, offset: o }))
    exportCsv(`registrations-${stamp()}.csv`, rows.map((r) => ({
      'Registration ID': r.reg_code, Customer: r.customer_name, Mobile: r.mobile, Physical: r.physical_qty, Online: r.online_qty, Total: r.total_qty,
      'Amount due': Number(r.total_amount), 'Amount received': Number(r.amount_received), Balance: Number(r.balance), 'Payment type': r.payment_type, 'Registered at': r.created_at,
    })))
    return rows.length
  })
  const exportTickets = run('tix', async () => {
    const rows = await fetchAll((o, l) => api.searchTickets({ eventId: event!.id, from: fromIso, to: toIso, limit: l, offset: o }))
    exportCsv(`tickets-${stamp()}.csv`, rows.map((t) => ({
      Serial: formatSerial(t.serial_number), Customer: t.customer_name, 'Registration ID': t.reg_code, 'Pass type': t.pass_type, Status: t.status,
      'Entry status': t.entry_status, 'Entry time': t.entry_time ?? '', 'Sharing initiated': t.shared_at ? 'Yes' : 'No', Created: t.created_at,
    })))
    return rows.length
  })
  const exportPayments = run('pay', async () => {
    const rows = await fetchAll(async (o, l) => {
      let q = supabase.from('payments').select('amount, payment_type, description, created_at, registrations(reg_code, customer_name)')
        .eq('event_id', event!.id).order('created_at', { ascending: true }).range(o, o + l - 1)
      if (fromIso) q = q.gte('created_at', fromIso)
      if (toIso) q = q.lt('created_at', toIso)
      const { data, error: e } = await q
      if (e) throw e
      return (data ?? []) as unknown as { amount: number; payment_type: string; description: string | null; created_at: string; registrations: { reg_code: string; customer_name: string } | null }[]
    })
    exportCsv(`payments-${stamp()}.csv`, rows.map((p) => ({
      'Registration ID': p.registrations?.reg_code ?? '', Customer: p.registrations?.customer_name ?? '', Type: p.payment_type, Amount: Number(p.amount), Description: p.description ?? '', 'Paid at': p.created_at,
    })))
    return rows.length
  })
  const exportEntries = run('ent', async () => {
    const rows = await fetchAll((o, l) => api.listEntryLogs(event!.id, l, o))
    exportCsv(`entries-${stamp()}.csv`, rows.map((r) => ({
      Time: r.created_at, Serial: formatSerial(r.serial_number), Customer: r.customer_name, 'Pass type': r.pass_type, Result: r.result, 'Checked by': r.admin_name,
    })))
    return rows.length
  })

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Filter by registration date; exports open in Excel (UTF-8 CSV)" />
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div><label className="text-xs font-medium text-muted-foreground">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="text-xs font-medium text-muted-foreground">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {(from || to) && <Button variant="ghost" onClick={() => { setFrom(''); setTo('') }}>Clear</Button>}
      </Card>

      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !s ? <PageLoader /> : s && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader><CardTitle>Registrations &amp; tickets</CardTitle></CardHeader><CardContent>
            <Row label="Total registrations" value={s.registrations} />
            <Row label="Total tickets" value={s.tickets_total} />
            <Row label="Physical tickets" value={s.tickets_physical} />
            <Row label="Online tickets" value={s.tickets_online} />
            <Row label="Cancelled tickets" value={s.tickets_cancelled} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Entry</CardTitle></CardHeader><CardContent>
            <Row label="Visitors entered" value={s.entered} />
            <Row label="Visitors not entered (valid tickets)" value={s.remaining_valid} />
            <Row label="Invitations generated" value={s.invitations_generated} />
            <Row label="Invitations shared (initiated)" value={s.invitations_shared} />
          </CardContent></Card>
          <Card className="md:col-span-2"><CardHeader><CardTitle>Collection</CardTitle></CardHeader><CardContent className="grid gap-x-8 md:grid-cols-2">
            <div>
              <Row label="Total expected" value={formatINR(s.expected_amount)} />
              <Row label="Total collected" value={formatINR(s.collected_amount)} />
              <Row label="Outstanding balance" value={formatINR(s.outstanding_amount)} />
            </div>
            <div>
              <Row label="Cash" value={formatINR(s.cash_amount)} />
              <Row label="UPI" value={formatINR(s.upi_amount)} />
              <Row label="Other" value={formatINR(s.other_amount)} />
            </div>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Export data (backup CSV)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportRegistrations} loading={busy === 'reg'}><Download className="h-4 w-4" /> Registrations</Button>
          <Button variant="outline" onClick={exportTickets} loading={busy === 'tix'}><Download className="h-4 w-4" /> Tickets</Button>
          <Button variant="outline" onClick={exportPayments} loading={busy === 'pay'}><FileSpreadsheet className="h-4 w-4" /> Payments</Button>
          <Button variant="outline" onClick={exportEntries} loading={busy === 'ent'}><Download className="h-4 w-4" /> Entry log</Button>
        </CardContent>
      </Card>
    </div>
  )
}
