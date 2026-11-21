import { Link } from 'react-router-dom'
import { LockKeyhole, SearchX, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

function Shell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
        <h1 className="text-xl font-bold">{title}</h1>
        {children}
      </div>
    </div>
  )
}

export function NotConfigured() {
  return (
    <Shell icon={<Settings2 className="h-7 w-7" />} title="Supabase is not configured">
      <p className="text-sm text-muted-foreground">
        Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env</code> and set{' '}
        <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-muted px-1">VITE_SUPABASE_ANON_KEY</code>,
        then restart the dev server. See the README for the full setup.
      </p>
    </Shell>
  )
}

export function NotAuthorized({ message, signOut }: { message?: string; signOut?: boolean }) {
  const { signOut: out } = useAuth()
  return (
    <Shell icon={<LockKeyhole className="h-7 w-7" />} title="Access denied">
      <p className="text-sm text-muted-foreground">{message ?? 'Your role does not have access to this page.'}</p>
      {signOut ? <Button onClick={() => void out()}>Sign out</Button> : <Button asChild variant="outline"><Link to="/admin">Back to home</Link></Button>}
    </Shell>
  )
}

export function NotFoundPage() {
  return (
    <Shell icon={<SearchX className="h-7 w-7" />} title="Page not found">
      <p className="text-sm text-muted-foreground">The page you are looking for does not exist.</p>
      <Button asChild variant="outline"><Link to="/admin">Go to dashboard</Link></Button>
    </Shell>
  )
}
