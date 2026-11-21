import { useState } from 'react'
import { toast } from 'sonner'
import { Ban, Copy, Download, Eye, FileText, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/form'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { copyText, fmtDateTime, formatSerial } from '@/lib/utils'
import { ticketUrl } from '@/lib/supabase'
import { downloadBatchPdf, downloadEpassPdf, downloadEpassPng, makeQrDataUrl } from '@/lib/epass'
import { buildWhatsAppMessage, openWhatsApp } from '@/lib/whatsapp'
import { cancelSchema } from '@/lib/schemas'
import { EpassCard, epassFromEvent, type EpassData } from './EpassCard'
import { FitWidth } from './FitWidth'
import type { EventRow, Registration, Ticket } from '@/types'

export async function buildEpass(event: EventRow, reg: Pick<Registration, 'customer_name' | 'unit_price'>, t: Ticket): Promise<EpassData> {
  return epassFromEvent(event, {
    customerName: reg.customer_name,
    serial: t.serial_number,
    passType: t.pass_type,
    amount: Number(reg.unit_price),
    cancelled: t.status === 'cancelled',
    qrDataUrl: await makeQrDataUrl(t.qr_token),
  })
}

export function TicketStatusBadges({ t }: { t: Pick<Ticket, 'status' | 'entry_status'> }) {
  if (t.status === 'cancelled') return <Badge variant="danger">Cancelled</Badge>
  return t.entry_status === 'entered' ? <Badge variant="success">Entered</Badge> : <Badge variant="blue">Valid</Badge>
}

export function PassTypeBadge({ type }: { type: string }) {
  return <Badge variant={type === 'physical' ? 'gold' : 'default'}>{type === 'physical' ? 'Physical' : 'Online'}</Badge>
}

function CancelDialog({ ticket, onClose, onDone }: { ticket: Ticket | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const p = cancelSchema.safeParse({ reason })
    if (!p.success) return setErr(p.error.issues[0].message)
    setBusy(true)
    try {
      await api.cancelTicket(ticket!.id, p.data.reason)
      toast.success(`Ticket ${formatSerial(ticket!.serial_number)} cancelled`)
      setReason('')
      setErr(undefined)
      onDone()
      onClose()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Cancel ticket ${ticket ? formatSerial(ticket.serial_number) : ''}?`}
        description="The ticket becomes invalid immediately. Its serial number is never reused and the record is kept. Other tickets in this registration are not affected."
      >
        <Field label="Reason for cancelling" error={err}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer requested refund" maxLength={300} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Keep ticket</Button>
          <Button variant="destructive" onClick={submit} loading={busy}>Cancel ticket</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * All tickets of one registration with per-ticket and bulk actions
 * (preview, PNG, PDF, copy link, WhatsApp, cancel).
 */
export function TicketList({ event, reg, tickets, canManage, onChanged }: {
  event: EventRow; reg: Pick<Registration, 'customer_name' | 'mobile' | 'unit_price' | 'reg_code'>
  tickets: Ticket[]; canManage: boolean; onChanged: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<EpassData | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Ticket | null>(null)

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast.error(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }
  const track = async (ids: string[], kind: 'generated' | 'shared') => {
    try {
      await (kind === 'shared' ? api.markShared(ids) : api.markInvitationGenerated(ids))
      onChanged()
    } catch (e) {
      toast.warning(`Done, but the activity could not be recorded: ${friendlyError(e)}`)
    }
  }

  const onePng = (t: Ticket) => run(`png-${t.id}`, async () => {
    await downloadEpassPng(await buildEpass(event, reg, t))
    toast.success('PNG downloaded')
    if (canManage) await track([t.id], 'generated')
  })
  const onePdf = (t: Ticket) => run(`pdf-${t.id}`, async () => {
    await downloadEpassPdf(await buildEpass(event, reg, t))
    toast.success('PDF downloaded')
    if (canManage) await track([t.id], 'generated')
  })
  const view = (t: Ticket) => run(`view-${t.id}`, async () => setPreview(await buildEpass(event, reg, t)))
  const copy = (t: Ticket) => run(`copy-${t.id}`, async () => {
    if (!(await copyText(ticketUrl(t.qr_token)))) throw new Error('Could not copy. Long-press the link to copy it manually.')
    toast.success('Ticket link copied')
    if (canManage) await track([t.id], 'generated')
  })
  const whatsapp = (list: Ticket[]) => run('wa', async () => {
    const msg = buildWhatsAppMessage(reg.customer_name, event.name, list)
    openWhatsApp(reg.mobile, msg)
    toast.info('WhatsApp opened. Attach the PNG/PDF manually if you want to send the image — WhatsApp cannot attach it for you.', { duration: 7000 })
    await track(list.map((t) => t.id), 'shared')
  })
  const allOnlinePdf = () => run('batch', async () => {
    const valid = tickets.filter((t) => t.pass_type === 'online' && t.status === 'valid')
    const passes = await Promise.all(valid.map((t) => buildEpass(event, reg, t)))
    await downloadBatchPdf(
      { eventName: event.name, customerName: reg.customer_name, regCode: reg.reg_code, eventDate: event.event_date, location: event.location },
      passes,
    )
    toast.success(`Downloaded ${valid.length} online pass${valid.length === 1 ? '' : 'es'}`)
    if (canManage) await track(valid.map((t) => t.id), 'generated')
  })

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const shareable = tickets.filter((t) => t.pass_type === 'online' && t.status === 'valid')
  const selectedList = shareable.filter((t) => selected.has(t.id))
  const onlineValid = shareable.length

  return (
    <div>
      {canManage && (
        <div className="flex flex-wrap gap-2 border-b p-3">
          <Button size="sm" variant="outline" onClick={allOnlinePdf} loading={busy === 'batch'} disabled={onlineValid === 0}>
            <Download className="h-4 w-4" /> Download all online ({onlineValid})
          </Button>
          <Button size="sm" variant="success" onClick={() => whatsapp(selectedList.length ? selectedList : shareable)}
            loading={busy === 'wa'} disabled={onlineValid === 0}>
            <MessageCircle className="h-4 w-4" /> WhatsApp {selectedList.length ? `selected (${selectedList.length})` : `all online (${onlineValid})`}
          </Button>
        </div>
      )}
      <Table>
        <THead>
          <TR>
            {canManage && <TH className="w-8" />}
            <TH>Serial</TH><TH>Type</TH><TH>Status</TH><TH>Entry</TH><TH>Shared</TH><TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {tickets.map((t) => {
            const valid = t.status === 'valid'
            return (
              <TR key={t.id} className={valid ? '' : 'opacity-60'}>
                {canManage && (
                  <TD>
                    {t.pass_type === 'online' && valid && (
                      <input type="checkbox" className="h-4 w-4 accent-[#8B1A1A]" checked={selected.has(t.id)} onChange={() => toggle(t.id)}
                        aria-label={`Select ticket ${formatSerial(t.serial_number)}`} />
                    )}
                  </TD>
                )}
                <TD className="font-mono text-base font-bold tracking-wider">{formatSerial(t.serial_number)}</TD>
                <TD><PassTypeBadge type={t.pass_type} /></TD>
                <TD>
                  <TicketStatusBadges t={t} />
                  {t.cancel_reason && <p className="mt-1 max-w-[180px] text-xs text-muted-foreground">{t.cancel_reason}</p>}
                </TD>
                <TD className="text-xs text-muted-foreground">{t.entry_time ? fmtDateTime(t.entry_time) : '—'}</TD>
                <TD className="text-xs text-muted-foreground">{t.shared_at ? `Initiated ${fmtDateTime(t.shared_at)}` : '—'}</TD>
                <TD>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => view(t)} loading={busy === `view-${t.id}`} aria-label="Preview"><Eye className="h-4 w-4" /></Button>
                    {valid && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => onePng(t)} loading={busy === `png-${t.id}`} aria-label="Download PNG" title="Download PNG"><Download className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => onePdf(t)} loading={busy === `pdf-${t.id}`} aria-label="Download PDF" title="Download PDF"><FileText className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => copy(t)} loading={busy === `copy-${t.id}`} aria-label="Copy link" title="Copy ticket link"><Copy className="h-4 w-4" /></Button>
                        {canManage && t.pass_type === 'online' && (
                          <Button size="sm" variant="ghost" className="text-emerald-700" onClick={() => whatsapp([t])} aria-label="Share on WhatsApp" title="Share on WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                        )}
                        {canManage && t.entry_status === 'not_entered' && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelTarget(t)} aria-label="Cancel ticket" title="Cancel ticket"><Ban className="h-4 w-4" /></Button>
                        )}
                      </>
                    )}
                  </div>
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent title="E-pass preview" className="max-w-[700px]">
          {preview && <FitWidth><EpassCard d={preview} /></FitWidth>}
        </DialogContent>
      </Dialog>
      <CancelDialog ticket={cancelTarget} onClose={() => setCancelTarget(null)} onDone={onChanged} />
    </div>
  )
}
