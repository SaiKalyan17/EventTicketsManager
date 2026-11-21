import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import { ACCESS, homeFor, useAuth } from '@/hooks/useAuth'
import { loginSchema } from '@/lib/schemas'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { PageLoader } from '@/components/ui/feedback'
import { isConfigured } from '@/lib/supabase'
import { NotConfigured } from '@/components/Screens'
import type { z } from 'zod'

type Values = z.infer<typeof loginSchema>
void ACCESS

export default function LoginPage() {
  const { session, profile, loading, profileError, signIn, signOut } = useAuth()
  const nav = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  useEffect(() => {
    if (profile) nav(homeFor(profile.role), { replace: true })
  }, [profile, nav])

  if (!isConfigured) return <NotConfigured />
  if (loading) return <PageLoader />

  const submit = handleSubmit(async (v) => {
    setError(await signIn(v.email, v.password))
  })

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-[#8B1A1A] to-[#5E0F0F] p-4">
      <div className="w-full max-w-sm rounded-3xl border-4 border-gold bg-card p-7 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-gold"><Ticket className="h-7 w-7" /></div>
          <h1 className="text-xl font-bold">Event Pass Admin</h1>
          <p className="text-sm text-muted-foreground">Sign in to manage passes</p>
        </div>
        {session && !profile ? (
          <div className="space-y-3 text-center">
            <p role="alert" className="text-sm font-medium text-destructive">{profileError ?? 'This account is not an administrator.'}</p>
            <Button variant="outline" className="w-full" onClick={() => void signOut()}>Sign out</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email" error={formState.errors.email?.message}>
              <Input type="email" autoComplete="username" inputMode="email" {...register('email')} aria-invalid={!!formState.errors.email} />
            </Field>
            <Field label="Password" error={formState.errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...register('password')} aria-invalid={!!formState.errors.password} />
            </Field>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-center text-sm font-medium text-red-800">{error}</p>}
            <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>Sign in</Button>
          </form>
        )}
      </div>
    </div>
  )
}
