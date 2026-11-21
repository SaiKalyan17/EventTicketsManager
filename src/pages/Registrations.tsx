import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Download, Search } from 'lucide-react'
import { useEvent } from '@/hooks/useEvent'
import { useAsync, useDebounced } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { exportCsv, fetchAll } from '@/lib/export'
import { friendlyError } from '@/lib/errors'
import { endOfDayIso, fmtDate, formatINR, startOfDayIso } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form'
import { EmptyState, ErrorState, PageHeader, Pagination } from '@/components/ui/feedback'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'

const PAGE = 25

export default function Registrations() {
  const { event } = useEvent()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [pay, setPay] = useState('')
  const [pass, setPass] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)
  const dq = useDebounced(q)

  const filters = { eventId: event!.id, q: dq, paymentType: pay, passType: pass, from: startOfDayIso(from), to: endOfDayIso(to) }
  const { data, loading, error, reload } = useAsync(
    () => api.searchRegistrations({ ...filters, limit: PAGE, offset: page * PAGE }),
    [dq, pay, pass, from, to, page, event?.id],
  )
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0) }
  const total = data?.[0]?.total_count ?? 0

  const doExport = async () => {
    setExporting(true)
    try {
      const rows = await fetchAll((offset, limit) => api.searchRegistrations({ ...filters, limit, offset }))
      exportCsv(`registrations-${fmtDate(new Date().toISOString(), 'yyyyMMdd-HHmm')}.csv`, rows.map((r) => ({
        'Registration ID': r.reg_code, Customer: r.customer_name, Mobile: r.mobile, Physical: r.physical_qty, Online: r.online_qty,
        Total: r.total_qty, 'Amount due': Number(r.total_amount), 'Amount received': Number(r.amount_received), Balance: Number(r.balance),
        'Payment type': r.payment_type, 'Registered at': r.created_at,
      })))
      toast.success(`Exported ${rows.length} registrations`)
    } catch (e) { toast.error(friendlyError(e)) } finally { setExporting(false) }
  }

  return (
    <div>
      <PageHeader title="Registrations" subtitle="Search by name, mobile, registration ID or serial number"
        actions={<Button variant="outline" size="sm" onClick={doExport} loading={exporting}><Download className="h-4 w-4" /> Export CSV</Button>} />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, mobile, REG-0001, serial…" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Search registrations" />
        </div>
        <Select value={pay} onChange={(e) => reset(setPay)(e.target.value)} aria-label="Payment type"><option value="">All payment types</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="other">Other</option></Select>
        <Select value={pass} onChange={(e) => reset(setPass)(e.target.value)} aria-label="Pass type"><option value="">Physical &amp; online</option><option value="physical">Has physical</option><option value="online">Has online</option></Select>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To date" />
        </div>
      </Card>

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <Card className="overflow-hidden">
          {!loading && data?.length === 0 ? <EmptyState title="No registrations found" hint="Try a different search or clear the filters." /> : (
            <>
              <Table>
                <THead><TR><TH>Reg ID</TH><TH>Customer</TH><TH>Mobile</TH><TH>Phys</TH><TH>Online</TH><TH>Total</TH><TH>Received</TH><TH>Balance</TH><TH>Type</TH><TH>Date</TH></TR></THead>
                <TBody>
                  {(data ?? []).map((r) => (
                    <TR key={r.id} className="cursor-pointer" onClick={() => nav(`/admin/registrations/${r.id}`)}>
                      <TD className="font-semibold text-primary">{r.reg_code}</TD>
                      <TD className="font-medium">{r.customer_name}</TD>
                      <TD>{r.mobile}</TD><TD>{r.physical_qty}</TD><TD>{r.online_qty}</TD><TD className="font-bold">{r.total_qty}</TD>
                      <TD>{formatINR(r.amount_received)}</TD>
                      <TD>{Number(r.balance) > 0 ? <Badge variant="warning">{formatINR(r.balance)}</Badge> : <Badge variant="success">Paid</Badge>}</TD>
                      <TD className="uppercase">{r.payment_type}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{fmtDate(r.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={page} pageSize={PAGE} total={Number(total)} onPage={setPage} loading={loading} />
            </>
          )}
        </Card>
      )}
    </div>
  )
}
