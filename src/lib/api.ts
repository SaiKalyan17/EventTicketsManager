import { supabase } from './supabase'
import { AppError } from './errors'
import type {
  AdminProfile, DashboardStats, EntryLogRow, EventRow, Payment, PaymentType, PublicTicket,
  Registration, RegistrationRow, ScanResult, TicketRow, Ticket,
} from '@/types'

type PgError = { message: string; code?: string } | null

function unwrap<T>(data: T | null, error: PgError): T {
  if (error) throw new AppError(error.message, error.code)
  return data as T
}

/** supabase-js rejects with a TypeError on network failure; normalise it. */
async function call<T>(p: PromiseLike<{ data: T | null; error: PgError }>): Promise<T> {
  try {
    const { data, error } = await p
    return unwrap(data, error)
  } catch (e) {
    if (e instanceof AppError) throw e
    throw new AppError((e as Error)?.message ?? 'Network error')
  }
}

export interface RegisterInput {
  event_id: string
  customer_name: string
  mobile: string
  email: string
  notes: string
  physical_qty: number
  online_qty: number
  payment_type: PaymentType
  amount_received: number
  payment_description: string
  request_id: string
}

export const api = {
  // ---- events ----
  getActiveEvent: () =>
    call<EventRow | null>(supabase.from('events').select('*').eq('is_active', true).maybeSingle() as never),

  updateEvent: (id: string, patch: Partial<EventRow>) =>
    call<EventRow>(supabase.from('events').update(patch).eq('id', id).select().single() as never),

  createEvent: (name: string, price: number) =>
    call<string>(supabase.rpc('create_event', { p_name: name, p_price: price }) as never),

  uploadEventAsset: async (eventId: string, kind: 'logo' | 'banner' | 'art', file: File): Promise<string> => {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${eventId}/${kind}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('event-assets').upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw new AppError(error.message)
    return supabase.storage.from('event-assets').getPublicUrl(path).data.publicUrl
  },

  // ---- registration ----
  registerBatch: (i: RegisterInput) =>
    call<Registration>(
      supabase.rpc('register_batch', {
        p_event_id: i.event_id,
        p_customer_name: i.customer_name,
        p_mobile: i.mobile,
        p_email: i.email,
        p_notes: i.notes,
        p_physical: i.physical_qty,
        p_online: i.online_qty,
        p_payment_type: i.payment_type,
        p_amount_received: i.amount_received,
        p_payment_description: i.payment_description,
        p_request_id: i.request_id,
      }) as never,
    ),

  getRegistration: (id: string) =>
    call<Registration & { tickets: Ticket[]; payments: Payment[] }>(
      supabase
        .from('registrations')
        .select('*, tickets(*), payments(id,payment_type,amount,description,created_at)')
        .eq('id', id)
        .order('serial_number', { referencedTable: 'tickets', ascending: true })
        .order('created_at', { referencedTable: 'payments', ascending: true })
        .single() as never,
    ),

  addPayment: (registrationId: string, type: PaymentType, amount: number, description: string) =>
    call<Registration>(
      supabase.rpc('add_payment', {
        p_registration_id: registrationId, p_payment_type: type, p_amount: amount, p_description: description,
      }) as never,
    ),

  searchRegistrations: (a: {
    eventId: string; q?: string; paymentType?: string; passType?: string
    from?: string | null; to?: string | null; limit: number; offset: number
  }) =>
    call<RegistrationRow[]>(
      supabase.rpc('search_registrations', {
        p_event_id: a.eventId, p_q: a.q || null, p_payment_type: a.paymentType || null,
        p_pass_type: a.passType || null, p_from: a.from ?? null, p_to: a.to ?? null,
        p_limit: a.limit, p_offset: a.offset,
      }) as never,
    ),

  // ---- tickets ----
  searchTickets: (a: {
    eventId: string; q?: string; passType?: string; filter?: string
    from?: string | null; to?: string | null; limit: number; offset: number
  }) =>
    call<TicketRow[]>(
      supabase.rpc('search_tickets', {
        p_event_id: a.eventId, p_q: a.q || null, p_pass_type: a.passType || null, p_filter: a.filter || null,
        p_from: a.from ?? null, p_to: a.to ?? null, p_limit: a.limit, p_offset: a.offset,
      }) as never,
    ),

  cancelTicket: (ticketId: string, reason: string) =>
    call<Ticket>(supabase.rpc('cancel_ticket', { p_ticket_id: ticketId, p_reason: reason }) as never),

  markInvitationGenerated: (ids: string[]) =>
    call<null>(supabase.rpc('mark_invitation_generated', { p_ticket_ids: ids }) as never),

  markShared: (ids: string[]) => call<null>(supabase.rpc('mark_shared', { p_ticket_ids: ids }) as never),

  // ---- scanner ----
  lookupTicket: (token: string) => call<ScanResult>(supabase.rpc('lookup_ticket', { p_token: token }) as never),
  confirmEntry: (token: string) => call<ScanResult>(supabase.rpc('confirm_entry', { p_token: token }) as never),
  listEntryLogs: (eventId: string, limit: number, offset: number) =>
    call<EntryLogRow[]>(supabase.rpc('list_entry_logs', { p_event_id: eventId, p_limit: limit, p_offset: offset }) as never),

  // ---- public ----
  getPublicTicket: (token: string) =>
    call<PublicTicket>(supabase.rpc('get_public_ticket', { p_token: token }) as never),

  // ---- reports ----
  dashboardStats: (eventId: string, from?: string | null, to?: string | null) =>
    call<DashboardStats>(supabase.rpc('dashboard_stats', { p_event_id: eventId, p_from: from ?? null, p_to: to ?? null }) as never),

  recentRegistrations: (eventId: string, limit = 8) => api.searchRegistrations({ eventId, limit, offset: 0 }),

  // ---- admins ----
  listAdmins: () =>
    call<AdminProfile[]>(supabase.from('admin_profiles').select('*').order('created_at', { ascending: true }) as never),

  updateAdmin: (id: string, patch: Partial<Pick<AdminProfile, 'full_name' | 'role' | 'is_active'>>) =>
    call<AdminProfile>(supabase.from('admin_profiles').update(patch).eq('id', id).select().single() as never),

  /** Creating a login needs the service-role key, so it lives in an Edge Function (server side). */
  createAdminUser: async (input: { email: string; password: string; full_name: string; role: string }) => {
    const { data, error } = await supabase.functions.invoke('create-admin', { body: input })
    if (error) {
      let msg = error.message
      try {
        const body = await (error as unknown as { context?: Response }).context?.json()
        if (body?.error) msg = body.error
      } catch { /* keep default message */ }
      throw new AppError(msg)
    }
    return data as { id: string }
  },
}

export async function getMyProfile(userId: string): Promise<AdminProfile | null> {
  return call<AdminProfile | null>(
    supabase.from('admin_profiles').select('id, full_name, role, is_active').eq('id', userId).maybeSingle() as never,
  )
}
