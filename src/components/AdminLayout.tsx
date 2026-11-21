import { useState, type ReactNode } from 'react'
import { NavLink, useLocation, Link } from 'react-router-dom'
import {
  BarChart3, ClipboardList, LayoutDashboard, LogOut, Menu, PlusCircle, ScanLine, Settings, Ticket, UserCog, Users, X, History,
} from 'lucide-react'
import { ACCESS, useAuth } from '@/hooks/useAuth'
import { useEvent } from '@/hooks/useEvent'
import { ROLE_LABELS, type Role } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ErrorState, PageLoader } from '@/components/ui/feedback'

const NAV: { to: string; label: string; icon: typeof Ticket; roles: Role[]; end?: boolean; primary?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ACCESS.dashboard, end: true, primary: true },
  { to: '/admin/register', label: 'Register', icon: PlusCircle, roles: ACCESS.register, primary: true },
  { to: '/admin/registrations', label: 'Registrations', icon: ClipboardList, roles: ACCESS.registrations, primary: true },
  { to: '/admin/tickets', label: 'Tickets', icon: Ticket, roles: ACCESS.tickets },
  { to: '/admin/scanner', label: 'Scanner', icon: ScanLine, roles: ACCESS.scanner, primary: true },
  { to: '/admin/entries', label: 'Entry history', icon: History, roles: ACCESS.entries },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3, roles: ACCESS.reports, primary: true },
  { to: '/admin/settings', label: 'Event settings', icon: Settings, roles: ACCESS.settings },
  { to: '/admin/admins', label: 'Admins', icon: UserCog, roles: ACCESS.admins },
]

export function AdminLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { event, loading, error, reload } = useEvent()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const items = NAV.filter((n) => profile && n.roles.includes(profile.role))
  const bottom = items.filter((n) => n.primary).slice(0, 4)

  const link = (n: (typeof NAV)[number], onClick?: () => void) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={onClick}
      className={({ isActive }) =>
        cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-accent')
      }
    >
      <n.icon className="h-4 w-4" /> {n.label}
    </NavLink>
  )

  const sidebar = (onClick?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-2 px-2">
        {event?.logo_url ? (
          <img src={event.logo_url} alt="" className="h-9 w-9 rounded-full border border-gold object-contain" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-gold"><Ticket className="h-5 w-5" /></div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{event?.name ?? 'Event Pass'}</p>
          <p className="text-xs text-muted-foreground">Pass management</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1">{items.map((n) => link(n, onClick))}</nav>
      <div className="mt-4 border-t pt-3">
        <div className="mb-2 flex items-center gap-2 px-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">{profile && ROLE_LABELS[profile.role]}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-card p-4 lg:block">{sidebar()}</aside>

      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground lg:hidden">
        <Link to="/admin" className="truncate font-bold">{event?.name ?? 'Event Pass'}</Link>
        <button className="rounded-md p-1.5 hover:bg-white/10" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-6 w-6" /></button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-72 max-w-[85%] bg-card p-4 shadow-xl">
            <button className="absolute right-3 top-3 rounded-md p-1.5 hover:bg-muted" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar(() => setOpen(false))}
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 lg:pb-8" key={loc.pathname.split('/')[2] ?? 'home'}>
        <div className="mx-auto max-w-6xl">
          {loading ? <PageLoader /> : error ? <ErrorState message={error} onRetry={reload} /> : !event ? (
            <div className="rounded-2xl border bg-card p-8 text-center">
              <h2 className="text-lg font-bold">No event configured yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {profile?.role === 'super_admin' ? 'Create the event to get started.' : 'Ask a Super Admin to configure the event.'}
              </p>
              {profile?.role === 'super_admin' && <Button asChild className="mt-4"><Link to="/admin/settings">Open event settings</Link></Button>}
            </div>
          ) : children}
          {!loading && !event && profile?.role === 'super_admin' && loc.pathname.startsWith('/admin/settings') && children}
        </div>
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${Math.max(bottom.length, 1)}, minmax(0, 1fr))` }}>
        {bottom.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
            <n.icon className="h-5 w-5" /> {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
