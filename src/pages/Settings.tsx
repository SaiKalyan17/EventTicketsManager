import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ImagePlus, Save } from 'lucide-react'
import { useEvent } from '@/hooks/useEvent'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { eventSchema, type EventFormValues } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/form'
import { PageHeader } from '@/components/ui/feedback'
import type { EventRow } from '@/types'

/** <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm" */
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

type Kind = 'logo' | 'banner' | 'art'
const ASSETS: { kind: Kind; field: 'logo_url' | 'banner_url' | 'invitation_art_url'; label: string; hint: string }[] = [
  { kind: 'logo', field: 'logo_url', label: 'Event logo', hint: 'Square works best' },
  { kind: 'banner', field: 'banner_url', label: 'Event banner', hint: 'Wide image shown at the top of the pass' },
  { kind: 'art', field: 'invitation_art_url', label: 'Invitation artwork', hint: 'Shown on the e-pass without stretching' },
]

function AssetPicker({ event, spec, onChange }: { event: EventRow; spec: (typeof ASSETS)[number]; onChange: (e: EventRow) => void }) {
  const [busy, setBusy] = useState(false)
  const url = event[spec.field]
  const pick = async (file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return void toast.error('Use a PNG, JPG or WebP image.')
    if (file.size > 5 * 1024 * 1024) return void toast.error('Image must be 5 MB or smaller.')
    setBusy(true)
    try {
      const publicUrl = await api.uploadEventAsset(event.id, spec.kind, file)
      onChange(await api.updateEvent(event.id, { [spec.field]: publicUrl }))
      toast.success(`${spec.label} updated`)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { onChange(await api.updateEvent(event.id, { [spec.field]: null })); toast.success(`${spec.label} removed`) }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">{spec.label}</p>
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {url ? <img src={url} alt={spec.label} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-8 w-8 text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">{spec.hint}</p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" className="flex-1" aria-disabled={busy}>
          <label className="cursor-pointer">{busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </Button>
        {url && <Button variant="ghost" size="sm" onClick={remove} disabled={busy}>Remove</Button>}
      </div>
    </div>
  )
}

function CreateEvent({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('0')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (!name.trim()) return void toast.error('Enter an event name')
    setBusy(true)
    try { await api.createEvent(name.trim(), Number(price) || 0); toast.success('Event created'); onCreated() }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader><CardTitle>Create event</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Field label="Event name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Price per pass (₹)"><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <div className="flex items-end"><Button onClick={go} loading={busy} className="w-full">Create event</Button></div>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { event, setEvent, reload } = useEvent()
  const [confirmNew, setConfirmNew] = useState(false)

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    values: event ? {
      name: event.name, description: event.description ?? '', event_date: toLocalInput(event.event_date), location: event.location ?? '',
      price: Number(event.price), contact_details: event.contact_details ?? '', subtitle: event.ticket_settings?.subtitle ?? '', instructions: event.ticket_settings?.instructions ?? '',
    } : undefined,
  })
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = form

  if (!event) return <CreateEvent onCreated={reload} />

  const save = handleSubmit(async (v) => {
    try {
      const updated = await api.updateEvent(event.id, {
        name: v.name, description: v.description || null, event_date: v.event_date ? new Date(v.event_date).toISOString() : null,
        location: v.location || null, price: v.price, contact_details: v.contact_details || null,
        ticket_settings: { ...event.ticket_settings, subtitle: v.subtitle || undefined, instructions: v.instructions || undefined },
      })
      setEvent(updated)
      toast.success('Event settings saved')
    } catch (e) { toast.error(friendlyError(e)) }
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Event settings" subtitle="Everything on passes and the public page comes from here" />
      <form onSubmit={save} noValidate>
        <Card>
          <CardHeader><CardTitle>Event details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Event name *" error={errors.name?.message} className="sm:col-span-2"><Input {...register('name')} aria-invalid={!!errors.name} /></Field>
            <Field label="Second-language title (e.g. Telugu)" error={errors.subtitle?.message} className="sm:col-span-2"><Input {...register('subtitle')} /></Field>
            <Field label="Description" error={errors.description?.message} className="sm:col-span-2"><Textarea rows={3} {...register('description')} /></Field>
            <Field label="Event date & time" error={errors.event_date?.message}><Input type="datetime-local" {...register('event_date')} /></Field>
            <Field label="Price per pass (₹) *" error={errors.price?.message} hint="Applies to new registrations only">
              <Input type="number" inputMode="decimal" min={0} step="0.01" {...register('price', { valueAsNumber: true })} aria-invalid={!!errors.price} />
            </Field>
            <Field label="Location" error={errors.location?.message} className="sm:col-span-2"><Input {...register('location')} /></Field>
            <Field label="Contact details" error={errors.contact_details?.message} className="sm:col-span-2"><Textarea rows={2} {...register('contact_details')} placeholder="Phone / email shown on the pass" /></Field>
            <Field label="Verification instructions on pass" error={errors.instructions?.message} className="sm:col-span-2"><Textarea rows={2} {...register('instructions')} placeholder="Leave blank to use the default text" /></Field>
            <div className="sm:col-span-2"><Button type="submit" size="lg" loading={isSubmitting} disabled={!isDirty}><Save className="h-4 w-4" /> Save settings</Button></div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader><CardTitle>Branding images</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {ASSETS.map((a) => <AssetPicker key={a.kind} event={event} spec={a} onChange={setEvent} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Start a new event</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">A new event gets its own serial numbers starting from 00001 and becomes the active event. Existing events and tickets are kept, and old pass links keep working.</p>
          {confirmNew ? <CreateEvent onCreated={() => { setConfirmNew(false); void reload() }} /> : <Button variant="outline" onClick={() => setConfirmNew(true)}>Create a new event…</Button>}
        </CardContent>
      </Card>
    </div>
  )
}
