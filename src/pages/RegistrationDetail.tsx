import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ArrowLeft, PenLine, Plus } from 'lucide-react'
import { useEvent } from '@/hooks/useEvent'
import { useAuth } from '@/hooks/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { paymentSchema } from '@/lib/schemas'
import { fmtDateTime, formatINR, formatSerial, serialRange } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { ErrorState, PageHeader, PageLoader } from '@/components/ui/feedback'
import { TicketList } from '@/components/epass/TicketList'
import type { PaymentType } from '@/types'

function AddPayment({ regId, balance, open, onClose, onDone }: { regId: string; balance: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<{ payment_type: PaymentType; amount: number; description: string }>({
    resolver: zodResolver(paymentSchema(balance)),
    defaultValues: { payment_type: 'cash', amount: balance, description: '' },
  })
  const submit = handleSubmit(async (v) => {
    try {
      await api.addPayment(regId, v.payment_type, v.amount, v.description)
      toast.success(`Payment of ${formatINR(v.amount)} recorded`)
      reset()
      onDone()
      onClose()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  })
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Record a payment" description={`Outstanding balance: ${formatINR(balance)}`}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Payment type"><Select {...register('payment_type')}><option value="cash">Cash</option><option value="upi">UPI</option><option value="other">Other</option></Select></Field>
          <Field label="Amount (₹)" error={errors.amount?.message}><Input type="number" step="0.01" inputMode="decimal" {...register('amount', { valueAsNumber: true })} /></Field>
          <Field label="Description (optional)" error={errors.description?.message}><Input {...register('description')} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" loading={isSubmitting}>Save payment</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function RegistrationDetail() {
  const { id = '' } = useParams()
  const { event } = useEvent()
  const { can } = useAuth()
  const { data: reg, loading, error, reload } = useAsync(() => api.getRegistration(id), [id])
  const [payOpen, setPayOpen] = useState(false)
  const canManage = can('super_admin', 'registration_admin')

  if (loading && !reg) return <PageLoader />
  if (error || !reg || !event) return <ErrorState message={error ?? 'Registration not found.'} onRetry={reload} />

  const physical = reg.tickets.filter((t) => t.pass_type === 'physical' && t.status === 'valid').map((t) => t.serial_number)

  return (
    <div className="space-y-4">
      <PageHeader title={`${reg.reg_code} · ${reg.customer_name}`} subtitle={`Registered ${fmtDateTime(reg.created_at)}`}
        actions={<>
          <Button asChild variant="outline" size="sm"><Link to="/admin/registrations"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
          {canManage && <Button asChild variant="secondary" size="sm"><Link to={`/admin/registrations/${reg.id}/confirmation`}><PenLine className="h-4 w-4" /> Serial list</Link></Button>}
        </>} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Name:</span> {reg.customer_name}</p>
            <p><span className="text-muted-foreground">Mobile:</span> {reg.mobile}</p>
            {reg.email && <p><span className="text-muted-foreground">Email:</span> {reg.email}</p>}
            {reg.notes && <p><span className="text-muted-foreground">Notes:</span> {reg.notes}</p>}
            <p><span className="text-muted-foreground">Passes:</span> {reg.physical_qty} physical + {reg.online_qty} online = <b>{reg.total_qty}</b></p>
            {physical.length > 0 && <p><span className="text-muted-foreground">Physical serials:</span> <b>{serialRange(physical)}</b></p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Payments</CardTitle>
            {canManage && reg.balance > 0 && <Button size="sm" onClick={() => setPayOpen(true)}><Plus className="h-4 w-4" /> Add payment</Button>}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">Due</p><b>{formatINR(reg.total_amount)}</b></div>
              <div className="rounded-lg bg-emerald-50 p-2"><p className="text-xs text-muted-foreground">Received</p><b>{formatINR(reg.amount_received)}</b></div>
              <div className={`rounded-lg p-2 ${reg.balance > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}><p className="text-xs text-muted-foreground">Balance</p><b>{formatINR(reg.balance)}</b></div>
            </div>
            {reg.payments.length === 0 ? <p className="text-muted-foreground">No payments recorded.</p> : (
              <ul className="divide-y">
                {reg.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span><Badge variant="muted" className="mr-2 uppercase">{p.payment_type}</Badge>{p.description}<span className="ml-2 text-xs text-muted-foreground">{fmtDateTime(p.created_at)}</span></span>
                    <b>{formatINR(p.amount)}</b>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Tickets ({reg.tickets.length})</CardTitle></CardHeader>
        <TicketList event={event} reg={reg} tickets={reg.tickets} canManage={canManage} onChanged={reload} />
      </Card>
      <p className="text-xs text-muted-foreground">Serial numbers range {formatSerial(Math.min(...reg.tickets.map((t) => t.serial_number)))} – {formatSerial(Math.max(...reg.tickets.map((t) => t.serial_number)))}. Issued tickets are never deleted; cancelled serials are not reused.</p>
      {canManage && <AddPayment regId={reg.id} balance={Number(reg.balance)} open={payOpen} onClose={() => setPayOpen(false)} onDone={reload} />}
    </div>
  )
}
