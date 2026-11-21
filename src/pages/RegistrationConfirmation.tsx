import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, ClipboardCopy, Eye, FileDown, PenLine, Printer, PlusCircle } from 'lucide-react'
import { useEvent } from '@/hooks/useEvent'
import { useAuth } from '@/hooks/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { copyText, formatINR, formatSerial, serialRange } from '@/lib/utils'
import { serialListPdf } from '@/lib/epass'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, PageLoader } from '@/components/ui/feedback'
import { TicketList } from '@/components/epass/TicketList'

export default function Confirmation() {
  const { id = '' } = useParams()
  const { event } = useEvent()
  const { can } = useAuth()
  const { data: reg, loading, error, reload } = useAsync(() => api.getRegistration(id), [id])

  if (loading && !reg) return <PageLoader />
  if (error || !reg || !event) return <ErrorState message={error ?? 'Registration not found.'} onRetry={reload} />

  const physical = reg.tickets.filter((t) => t.pass_type === 'physical')
  const online = reg.tickets.filter((t) => t.pass_type === 'online')
  const physicalSerials = physical.map((t) => t.serial_number)
  const allSerials = reg.tickets.map((t) => t.serial_number)

  const copyAll = async () => {
    const text = reg.tickets.map((t) => `${formatSerial(t.serial_number)} - ${t.pass_type}`).join('\n')
    if (await copyText(text)) toast.success('Serial numbers copied')
    else toast.error('Could not copy to the clipboard')
  }
  const print = () => {
    document.body.classList.add('print-serials')
    const done = () => { document.body.classList.remove('print-serials'); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    window.print()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
        <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
        <div>
          <p className="text-lg font-bold">Registration {reg.reg_code} saved</p>
          <p className="text-sm">{reg.customer_name} · {reg.total_qty} pass{reg.total_qty === 1 ? '' : 'es'} · {formatINR(reg.total_amount)} due, {formatINR(reg.amount_received)} received{reg.balance > 0 ? `, balance ${formatINR(reg.balance)}` : ''}</p>
        </div>
      </div>

      <div className="print-area space-y-4">
        {physical.length > 0 && (
          <Card className="border-2 border-gold">
            <CardHeader className="rounded-t-2xl bg-primary text-primary-foreground">
              <CardTitle className="flex items-center gap-2 text-base uppercase tracking-wide sm:text-lg">
                <PenLine className="h-5 w-5 text-gold" /> Write these serial numbers on the physical passes
              </CardTitle>
              <p className="text-sm text-primary-foreground/80">{reg.customer_name} · {reg.reg_code}</p>
            </CardHeader>
            <CardContent className="pt-5">
              <p className="mb-3 text-center text-sm font-semibold text-muted-foreground">
                Range: <span className="text-lg font-extrabold text-primary">{serialRange(physicalSerials)}</span> ({physical.length} physical pass{physical.length === 1 ? '' : 'es'})
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {physical.map((t) => (
                  <div key={t.id} className="rounded-2xl border-2 border-gold bg-secondary py-4 text-center">
                    <p className="font-mono text-4xl font-extrabold tracking-widest text-primary sm:text-5xl">{formatSerial(t.serial_number)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {online.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Online pass serial numbers</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {online.map((t) => <span key={t.id} className="rounded-lg bg-secondary px-3 py-1.5 font-mono text-lg font-bold tracking-widest">{formatSerial(t.serial_number)}</span>)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="no-print flex flex-wrap gap-2">
        <Button variant="outline" onClick={copyAll}><ClipboardCopy className="h-4 w-4" /> Copy all serials</Button>
        <Button variant="outline" onClick={print}><Printer className="h-4 w-4" /> Print list</Button>
        <Button variant="outline" onClick={() => serialListPdf({ eventName: event.name, regCode: reg.reg_code, customerName: reg.customer_name, serials: allSerials })}>
          <FileDown className="h-4 w-4" /> Download PDF
        </Button>
        <Button asChild variant="secondary"><Link to={`/admin/registrations/${reg.id}`}><Eye className="h-4 w-4" /> View registration</Link></Button>
        <Button asChild><Link to="/admin/register"><PlusCircle className="h-4 w-4" /> Register another</Link></Button>
      </div>

      {online.length > 0 && (
        <Card className="no-print">
          <CardHeader><CardTitle>Share online passes</CardTitle>
            <p className="text-sm text-muted-foreground">WhatsApp opens with a pre-filled message and the pass link. To send the image or PDF, download it and attach it manually in WhatsApp.</p>
          </CardHeader>
          <TicketList event={event} reg={reg} tickets={online} canManage={can('super_admin', 'registration_admin')} onChanged={reload} />
        </Card>
      )}
    </div>
  )
}
