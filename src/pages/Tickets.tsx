import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, ExternalLink, Search } from 'lucide-react'
import { useEvent } from '@/hooks/useEvent'
import { useAsync, useDebounced } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { exportCsv, fetchAll } from '@/lib/export'
import { friendlyError } from '@/lib/errors'
import { endOfDayIso, fmtDate, fmtDateTime, formatSerial, startOfDayIso } from '@/lib/utils'
import { ticketUrl } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/form'
import { EmptyState, ErrorState, PageHeader, Pagination } from '@/components/ui/feedback'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { PassTypeBadge, TicketStatusBadges } from '@/components/epass/TicketList'
import type { TicketRow } from '@/types'

const PAGE = 25

export default function TicketsPage() {
  const { event } = useEvent()
  const [q, setQ] = useState('')
  const [pass, setPass] = useState('')
  const [filter, setFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<TicketRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const dq = useDebounced(q)

  const f = { eventId: event!.id, q: dq, passType: pass, filter, from: startOfDayIso(from), to: endOfDayIso(to) }
  const { data, loading, error, reload } = useAsync(() => api.searchTickets({ ...f, limit: PAGE, offset: page * PAGE }), [dq, pass, filter, from, to, page, event?.id])
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0) }
  const total = Number(data?.[0]?.total_count ?? 0)

  const doExport = async () => {
    setExporting(true)
    try {
      const rows = await fetchAll((offset, limit) => api.searchTickets({ ...f, limit, offset }))
      exportCsv(`tickets-${fmtDate(new Date().toISOString(), 'yyyyMMdd-HHmm')}.csv`, rows.map((t) => ({
        Serial: formatSerial(t.serial_number), Customer: t.customer_name, 'Registration ID': t.reg_code, 'Pass type': t.pass_type,
        Status: t.status, 'Entry status': t.entry_status, 'Entry time': t.entry_time ?? '', 'Sharing initiated': t.shared_at ? 'Yes' : 'No', Created: t.created_at,
      })))
      toast.success(`Exported ${rows.length} tickets`)
    } catch (e) { toast.error(friendlyError(e)) } finally { setExporting(false) }
  }

  return (
    <div>
      <PageHeader title="Tickets" subtitle="Every individual pass issued for this event"
        actions={<Button variant="outline" size="sm" onClick={doExport} loading={exporting}><Download className="h-4 w-4" /> Export CSV</Button>} />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Serial number, name, mobile…" inputMode="search" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Search tickets" />
        </div>
        <Select value={pass} onChange={(e) => reset(setPass)(e.target.value)} aria-label="Pass type"><option value="">All pass types</option><option value="physical">Physical</option><option value="online">Online</option></Select>
        <Select value={filter} onChange={(e) => reset(setFilter)(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option><option value="entered">Entered</option><option value="not_entered">Not entered</option>
          <option value="cancelled">Cancelled</option><option value="shared">Shared</option><option value="not_shared">Not shared</option>
        </Select>
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To date" />
        </div>
      </Card>

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <Card className="overflow-hidden">
          {!loading && data?.length === 0 ? <EmptyState title="No tickets found" hint="Try a different search or clear the filters." /> : (
            <>
              <Table>
                <THead><TR><TH>Serial</TH><TH>Customer</TH><TH>Type</TH><TH>Status</TH><TH>Sharing</TH><TH>Entry</TH><TH>Created</TH></TR></THead>
                <TBody>
                  {(data ?? []).map((t) => (
                    <TR key={t.id} className="cursor-pointer" onClick={() => setOpen(t)}>
                      <TD className="font-mono text-base font-bold tracking-wider">{formatSerial(t.serial_number)}</TD>
                      <TD className="font-medium">{t.customer_name}</TD>
                      <TD><PassTypeBadge type={t.pass_type} /></TD>
                      <TD><TicketStatusBadges t={{ status: t.status, entry_status: 'not_entered' }} /></TD>
                      <TD>{t.pass_type === 'physical' ? <span className="text-muted-foreground">—</span> : t.shared_at ? <Badge variant="success">Shared ×{t.share_count}</Badge> : <Badge variant="muted">Not shared</Badge>}</TD>
                      <TD>{t.entry_status === 'entered' ? <Badge variant="success">Entered</Badge> : <Badge variant="muted">Not entered</Badge>}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{fmtDate(t.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={page} pageSize={PAGE} total={total} onPage={setPage} loading={loading} />
            </>
          )}
        </Card>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={open ? `Ticket ${formatSerial(open.serial_number)}` : 'Ticket'}>
          {open && (
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Customer</dt><dd className="font-medium">{open.customer_name}</dd>
              <dt className="text-muted-foreground">Registration</dt><dd>{open.reg_code}</dd>
              <dt className="text-muted-foreground">Pass type</dt><dd><PassTypeBadge type={open.pass_type} /></dd>
              <dt className="text-muted-foreground">Status</dt><dd><TicketStatusBadges t={{ status: open.status, entry_status: 'not_entered' }} /></dd>
              <dt className="text-muted-foreground">Entry</dt><dd>{open.entry_status === 'entered' ? `Entered ${fmtDateTime(open.entry_time)}` : 'Not entered'}</dd>
              <dt className="text-muted-foreground">Sharing</dt><dd>{open.shared_at ? `Initiated ${fmtDateTime(open.shared_at)} (×${open.share_count})` : 'Not shared'}</dd>
              <dt className="text-muted-foreground">Created</dt><dd>{fmtDateTime(open.created_at)}</dd>
              <dt className="text-muted-foreground">Public link</dt>
              <dd><a className="inline-flex items-center gap-1 text-primary underline" href={ticketUrl(open.qr_token)} target="_blank" rel="noreferrer">Open e-pass <ExternalLink className="h-3 w-3" /></a></dd>
            </dl>
          )}
          {open && <Button asChild className="mt-5 w-full"><Link to={`/admin/registrations/${open.registration_id}`}>Open registration &amp; manage ticket</Link></Button>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
