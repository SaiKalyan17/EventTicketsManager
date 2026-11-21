import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, Minus, Plus } from 'lucide-react'
import { useEvent } from '@/hooks/useEvent'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { registrationSchema, type RegistrationFormValues } from '@/lib/schemas'
import { formatINR, newRequestId, normalizeMobile } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { PageHeader } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

function Qty({ label, value, onChange, error }: { label: string; value: number; onChange: (n: number) => void; error?: string }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(200, Number.isFinite(n) ? Math.trunc(n) : 0)))
  return (
    <Field label={label} error={error}>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => set(value - 1)} aria-label={`Decrease ${label}`}><Minus className="h-4 w-4" /></Button>
        <Input inputMode="numeric" className="text-center text-lg font-bold" value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')))} aria-invalid={!!error} />
        <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => set(value + 1)} aria-label={`Increase ${label}`}><Plus className="h-4 w-4" /></Button>
      </div>
    </Field>
  )
}

export default function RegisterPage() {
  const { event } = useEvent()
  const nav = useNavigate()
  const price = Number(event?.price ?? 0)
  // One request id per form "session": a double-click or retry after a network error re-sends the SAME id,
  // so the database returns the already-created registration instead of creating a second one.
  const requestId = useRef(newRequestId())
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema(price)),
    defaultValues: { customer_name: '', mobile: '', email: '', notes: '', physical_qty: 0, online_qty: 0, payment_type: 'cash', amount_received: 0, payment_description: '' },
    mode: 'onTouched',
  })
  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting } } = form
  const v = useWatch({ control })
  const physical = Number(v.physical_qty) || 0
  const online = Number(v.online_qty) || 0
  const total = physical + online
  const due = total * price
  const received = Number(v.amount_received) || 0
  const balance = due - received

  const onSubmit = handleSubmit(async (values) => {
    if (!event) return
    setServerError(null)
    try {
      const res = await api.registerBatch({
        event_id: event.id,
        customer_name: values.customer_name,
        mobile: normalizeMobile(values.mobile) ?? values.mobile,
        email: values.email,
        notes: values.notes,
        physical_qty: values.physical_qty,
        online_qty: values.online_qty,
        payment_type: values.payment_type,
        amount_received: values.amount_received,
        payment_description: values.payment_description,
        request_id: requestId.current,
      })
      if (res.duplicate) toast.info('This registration was already saved — showing the existing one.')
      else toast.success(`${res.reg_code} created with ${res.total_qty} pass${res.total_qty === 1 ? '' : 'es'}`)
      requestId.current = newRequestId()
      nav(`/admin/registrations/${res.id}/confirmation`, { replace: true })
    } catch (e) {
      const msg = friendlyError(e)
      setServerError(msg)
      toast.error(msg)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl">
      <PageHeader title="Register new pass" subtitle={`${event?.name} · ${formatINR(price)} per pass`} />

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name *" error={errors.customer_name?.message} className="sm:col-span-2">
              <Input autoComplete="off" placeholder="Full name" {...register('customer_name')} aria-invalid={!!errors.customer_name} />
            </Field>
            <Field label="Mobile number *" error={errors.mobile?.message} hint="10-digit Indian mobile (used for WhatsApp)">
              <Input type="tel" inputMode="tel" autoComplete="off" placeholder="98765 43210" {...register('mobile')} aria-invalid={!!errors.mobile} />
            </Field>
            <Field label="Email (optional)" error={errors.email?.message}>
              <Input type="email" inputMode="email" autoComplete="off" {...register('email')} aria-invalid={!!errors.email} />
            </Field>
            <Field label="Notes (optional)" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea rows={2} {...register('notes')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Passes</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Qty label="Physical passes" value={physical} onChange={(n) => setValue('physical_qty', n, { shouldValidate: true, shouldDirty: true })} error={errors.physical_qty?.message} />
            <Qty label="Online passes" value={online} onChange={(n) => setValue('online_qty', n, { shouldValidate: true, shouldDirty: true })} error={errors.online_qty?.message} />
            <div className="rounded-xl bg-secondary p-3 sm:col-span-2">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>Total passes: <b className="text-base">{total}</b></span>
                <span>Total amount due: <b className="text-base">{formatINR(due)}</b></span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment type" error={errors.payment_type?.message}>
              <Select {...register('payment_type')}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Amount received (₹)" error={errors.amount_received?.message}>
              <Input type="number" inputMode="decimal" min={0} step="0.01"
                {...register('amount_received', { setValueAs: (x) => (x === '' || x == null ? 0 : Number(x)) })} aria-invalid={!!errors.amount_received} />
            </Field>
            <Field label="Payment description (optional)" error={errors.payment_description?.message} className="sm:col-span-2">
              <Input placeholder="e.g. UPI ref 4231…, paid by cousin" {...register('payment_description')} />
            </Field>
            <div className={cn('flex items-center justify-between rounded-xl p-3 text-sm sm:col-span-2', balance > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900')}>
              <span className="flex items-center gap-2 font-medium">
                {balance > 0 && <AlertTriangle className="h-4 w-4" />}
                {total === 0 ? 'Add passes to see the balance' : balance > 0 ? (received === 0 ? 'No payment received yet — balance will be recorded' : 'Partial payment — balance will be recorded') : balance === 0 ? 'Fully paid' : 'Amount exceeds total'}
              </span>
              <b>Balance: {formatINR(Math.max(balance, 0))}</b>
            </div>
          </CardContent>
        </Card>

        {serverError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">{serverError}</p>}
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!event}>
          Generate {total || ''} pass{total === 1 ? '' : 'es'} &amp; serial numbers
        </Button>
        <p className="text-center text-xs text-muted-foreground">Serial numbers are assigned by the database when you submit. Submitting twice will not create duplicates.</p>
      </div>
    </form>
  )
}
