import type { ReactNode } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-primary', className)} aria-label="Loading" />
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
      <Spinner /> {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-red-50 p-6 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="max-w-md text-sm font-medium text-red-900">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  loading,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  loading?: boolean
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return (
    <div className="flex items-center justify-between gap-2 border-t p-3 text-sm">
      <span className="text-muted-foreground">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">
          {page + 1} / {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page + 1 >= pages || loading} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function Stat({
  label,
  value,
  icon,
  tone = 'default',
  hint,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: string
  tone?: 'default' | 'gold' | 'green' | 'red'
}) {
  const tones = {
    default: 'bg-primary/10 text-primary',
    gold: 'bg-gold-light text-gold-dark',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      {icon && <div className={cn('rounded-xl p-2.5', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-bold tabular-nums">{value}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}
