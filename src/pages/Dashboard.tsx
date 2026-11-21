import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  BarChart3, Banknote, CheckCircle2, ClipboardList, Hourglass, Landmark, Mail, PlusCircle, ScanLine, Send, Smartphone, Ticket, Users, Wallet, FileCheck2, Printer,
} from 'lucide-react'
import { useEvent } from '@/hooks/useEvent'
import { useAuth } from '@/hooks/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { fmtDate, fmtDateTime, formatINR } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, PageHeader, PageLoader, Stat } from '@/components/ui/feedback'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export default function Dashboard() {
  const { event } = useEvent()
  const { can } = useAuth()
  const nav = useNavigate()
  const stats = useAsync(() => api.dashboardStats(event!.id), [event?.id])
  const recent = useAsync(() => api.recentRegistrations(event!.id, 8), [event?.id])

  if (stats.loading && !stats.data) return <PageLoader />
  if (stats.error || !stats.data) return <ErrorState message={stats.error ?? 'No data'} onRetry={stats.reload} />
  const s = stats.data
  const daily = (s.daily ?? []).map((d) => ({ ...d, label: fmtDate(d.day, 'dd MMM') }))

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle={`${event?.name}${event?.event_date ? ' · ' + fmtDate(event.event_date, 'dd MMM yyyy') : ''}`}
        actions={<Button variant="outline" size="sm" onClick={() => { void stats.reload(); void recent.reload() }}>Refresh</Button>} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {can('super_admin', 'registration_admin') && <Button asChild size="lg"><Link to="/admin/register"><PlusCircle className="h-5 w-5" /> Register New Pass</Link></Button>}
        <Button asChild variant="outline" size="lg"><Link to="/admin/registrations"><ClipboardList className="h-5 w-5" /> Registrations</Link></Button>
        <Button asChild variant="outline" size="lg"><Link to="/admin/tickets"><Ticket className="h-5 w-5" /> Tickets</Link></Button>
        {can('super_admin', 'entry_admin') && <Button asChild variant="gold" size="lg"><Link to="/admin/scanner"><ScanLine className="h-5 w-5" /> Scan QR</Link></Button>}
        {can('super_admin', 'report_viewer') && <Button asChild variant="outline" size="lg"><Link to="/admin/reports"><BarChart3 className="h-5 w-5" /> Reports</Link></Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total registrations" value={s.registrations} icon={<Users className="h-5 w-5" />} />
        <Stat label="Tickets issued" value={s.tickets_total} icon={<Ticket className="h-5 w-5" />} hint={s.tickets_cancelled ? `${s.tickets_cancelled} cancelled` : undefined} />
        <Stat label="Physical tickets" value={s.tickets_physical} icon={<Printer className="h-5 w-5" />} tone="gold" />
        <Stat label="Online tickets" value={s.tickets_online} icon={<Smartphone className="h-5 w-5" />} tone="gold" />
        <Stat label="Total collection" value={formatINR(s.collected_amount)} icon={<Wallet className="h-5 w-5" />} tone="green" hint={`Outstanding ${formatINR(s.outstanding_amount)}`} />
        <Stat label="Cash" value={formatINR(s.cash_amount)} icon={<Banknote className="h-5 w-5" />} tone="green" />
        <Stat label="UPI" value={formatINR(s.upi_amount)} icon={<Landmark className="h-5 w-5" />} tone="green" />
        <Stat label="Other payments" value={formatINR(s.other_amount)} icon={<Mail className="h-5 w-5" />} tone="green" />
        <Stat label="Visitors entered" value={s.entered} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <Stat label="Remaining valid" value={s.remaining_valid} icon={<Hourglass className="h-5 w-5" />} />
        <Stat label="Invitations generated" value={s.invitations_generated} icon={<FileCheck2 className="h-5 w-5" />} tone="gold" />
        <Stat label="Invitations shared" value={s.invitations_shared} icon={<Send className="h-5 w-5" />} tone="gold" hint="Sharing initiated" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Registrations per day</CardTitle></CardHeader>
          <CardContent>
            {daily.length === 0 ? <EmptyState title="No registrations yet" hint="Registrations will appear here once passes are issued." /> : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="registrations" name="Registrations" fill="#8B1A1A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="tickets" name="Tickets" fill="#C9A227" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Entry progress</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const valid = s.entered + s.remaining_valid
              const pct = valid ? Math.round((s.entered / valid) * 100) : 0
              return (
                <>
                  <div className="flex items-end justify-between"><span className="text-3xl font-extrabold text-primary">{pct}%</span><span className="text-sm text-muted-foreground">{s.entered} of {valid} valid tickets</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} /></div>
                  <p className="text-xs text-muted-foreground">Expected collection {formatINR(s.expected_amount)} · collected {formatINR(s.collected_amount)}</p>
                </>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Recent registrations</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/admin/registrations">View all</Link></Button></CardHeader>
        {recent.error ? <div className="p-4"><ErrorState message={recent.error} onRetry={recent.reload} /></div>
          : recent.loading && !recent.data ? <PageLoader />
          : (recent.data?.length ?? 0) === 0 ? <EmptyState title="Nothing here yet" /> : (
            <Table>
              <THead><TR><TH>ID</TH><TH>Customer</TH><TH>Passes</TH><TH>Received</TH><TH>When</TH></TR></THead>
              <TBody>
                {recent.data!.map((r) => (
                  <TR key={r.id} className="cursor-pointer" onClick={() => nav(`/admin/registrations/${r.id}`)}>
                    <TD className="font-semibold text-primary">{r.reg_code}</TD><TD>{r.customer_name}</TD>
                    <TD>{r.physical_qty}P + {r.online_qty}O</TD><TD>{formatINR(r.amount_received)}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{fmtDateTime(r.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
      </Card>
    </div>
  )
}
