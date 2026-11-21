import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, ACCESS, homeFor, useAuth } from '@/hooks/useAuth'
import { EventProvider } from '@/hooks/useEvent'
import { isConfigured } from '@/lib/supabase'
import { AdminLayout } from '@/components/AdminLayout'
import { PageLoader } from '@/components/ui/feedback'
import { NotAuthorized, NotConfigured, NotFoundPage } from '@/components/Screens'
import type { Role } from '@/types'
import LoginPage from '@/pages/Login'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const RegisterPage = lazy(() => import('@/pages/Register'))
const Confirmation = lazy(() => import('@/pages/RegistrationConfirmation'))
const RegistrationDetail = lazy(() => import('@/pages/RegistrationDetail'))
const Registrations = lazy(() => import('@/pages/Registrations'))
const TicketsPage = lazy(() => import('@/pages/Tickets'))
const Scanner = lazy(() => import('@/pages/Scanner'))
const Entries = lazy(() => import('@/pages/Entries'))
const Reports = lazy(() => import('@/pages/Reports'))
const SettingsPage = lazy(() => import('@/pages/Settings'))
const Admins = lazy(() => import('@/pages/Admins'))
const PublicTicket = lazy(() => import('@/pages/PublicTicket'))

function RequireRole({ roles }: { roles: Role[] }) {
  const { can } = useAuth()
  return can(...roles) ? <Outlet /> : <NotAuthorized />
}

function AdminShell() {
  const { session, profile, loading, profileError } = useAuth()
  if (loading) return <PageLoader label="Checking your session…" />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <NotAuthorized message={profileError ?? undefined} signOut />
  return (
    <EventProvider>
      <AdminLayout>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </AdminLayout>
    </EventProvider>
  )
}

function AdminIndex() {
  const { profile } = useAuth()
  if (profile && !ACCESS.dashboard.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />
  return <Dashboard />
}

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/ticket/:token" element={<PublicTicket />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminIndex />} />
            <Route element={<RequireRole roles={ACCESS.register} />}>
              <Route path="register" element={<RegisterPage />} />
            </Route>
            <Route element={<RequireRole roles={ACCESS.registrations} />}>
              <Route path="registrations" element={<Registrations />} />
              <Route path="registrations/:id" element={<RegistrationDetail />} />
              <Route path="registrations/:id/confirmation" element={<Confirmation />} />
            </Route>
            <Route element={<RequireRole roles={ACCESS.tickets} />}>
              <Route path="tickets" element={<TicketsPage />} />
            </Route>
            <Route element={<RequireRole roles={ACCESS.scanner} />}>
              <Route path="scanner" element={<Scanner />} />
            </Route>
            <Route element={<RequireRole roles={ACCESS.entries} />}>
              <Route path="entries" element={<Entries />} />
            </Route>
            <Route element={<RequireRole roles={ACCESS.reports} />}>
              <Route path="reports" element={<Reports />} />
            </Route>
            <Route element={<RequireRole roles={ACCESS.settings} />}>
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route element={<RequireRole roles={ACCESS.admins} />}>
              <Route path="admins" element={<Admins />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
