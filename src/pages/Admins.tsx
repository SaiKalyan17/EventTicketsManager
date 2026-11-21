import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form'
import { ErrorState, PageHeader, PageLoader } from '@/components/ui/feedback'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { ROLE_LABELS, type Role } from '@/types'

const schema = z.object({
  full_name: z.string().trim().min(2, 'Enter the full name'),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(10, 'Use at least 10 characters'),
  role: z.enum(['super_admin', 'registration_admin', 'entry_admin', 'report_viewer']),
})
type Values = z.infer<typeof schema>

function NewAdmin({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { role: 'registration_admin' } })
  const submit = handleSubmit(async (v) => {
    try {
      await api.createAdminUser(v)
      toast.success(`${v.full_name} can now sign in`)
      reset(); onDone(); onClose()
    } catch (e) { toast.error(friendlyError(e)) }
  })
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Add an administrator" description="Share the password with them privately. They can change it after signing in.">
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Full name" error={errors.full_name?.message}><Input {...register('full_name')} /></Field>
          <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="off" {...register('email')} /></Field>
          <Field label="Temporary password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
          <Field label="Role"><Select {...register('role')}>{(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select></Field>
          <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={isSubmitting}>Create admin</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Admins() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useAsync(() => api.listAdmins(), [])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const update = async (id: string, patch: Parameters<typeof api.updateAdmin>[1]) => {
    setBusy(id)
    try { await api.updateAdmin(id, patch); toast.success('Updated'); await reload() } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(null) }
  }

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div>
      <PageHeader title="Administrators" subtitle="Roles are enforced by the database, not just by the screens"
        actions={<Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" /> Add admin</Button>} />
      <Card className="overflow-hidden">
        <Table>
          <THead><TR><TH>Name</TH><TH>Role</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>
            {(data ?? []).map((a) => {
              const me = a.id === profile?.id
              return (
                <TR key={a.id}>
                  <TD className="font-medium">{a.full_name}{me && <Badge variant="gold" className="ml-2">You</Badge>}</TD>
                  <TD>
                    <Select className="h-9 w-48" value={a.role} disabled={me || busy === a.id} aria-label={`Role for ${a.full_name}`}
                      onChange={(e) => update(a.id, { role: e.target.value as Role })}>
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                  </TD>
                  <TD>{a.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Deactivated</Badge>}</TD>
                  <TD className="text-right">{!me && <Button size="sm" variant={a.is_active ? 'outline' : 'secondary'} loading={busy === a.id} onClick={() => update(a.id, { is_active: !a.is_active })}>{a.is_active ? 'Deactivate' : 'Reactivate'}</Button>}</TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </Card>
      <NewAdmin open={open} onClose={() => setOpen(false)} onDone={reload} />
    </div>
  )
}
