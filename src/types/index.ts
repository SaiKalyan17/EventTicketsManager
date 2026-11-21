export type Role = 'super_admin' | 'registration_admin' | 'entry_admin' | 'report_viewer'
export type PaymentType = 'cash' | 'upi' | 'other'
export type PassType = 'physical' | 'online'

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  registration_admin: 'Registration Admin',
  entry_admin: 'Entry Admin',
  report_viewer: 'Report Viewer',
}

export interface AdminProfile {
  id: string
  full_name: string
  role: Role
  is_active: boolean
  created_at?: string
}

export interface EventRow {
  id: string
  name: string
  description: string | null
  event_date: string | null
  location: string | null
  price: number
  logo_url: string | null
  banner_url: string | null
  invitation_art_url: string | null
  contact_details: string | null
  ticket_settings: TicketSettings
  is_active: boolean
}

export interface TicketSettings {
  /** Optional second-language title (e.g. Telugu) shown under the event name on passes */
  subtitle?: string
  /** Custom verification instructions shown on the e-pass */
  instructions?: string
}

export interface Ticket {
  id: string
  event_id: string
  registration_id: string
  serial_number: number
  pass_type: PassType
  qr_token: string
  status: 'valid' | 'cancelled'
  cancel_reason: string | null
  cancelled_at: string | null
  entry_status: 'not_entered' | 'entered'
  entry_time: string | null
  invitation_generated_at: string | null
  shared_at: string | null
  last_shared_at: string | null
  share_count: number
  created_at: string
}

export interface Registration {
  id: string
  event_id: string
  reg_code: string
  customer_name: string
  mobile: string
  email: string | null
  notes: string | null
  physical_qty: number
  online_qty: number
  total_qty: number
  unit_price: number
  total_amount: number
  amount_received: number
  balance: number
  payment_type: PaymentType
  created_at: string
  tickets?: Ticket[]
  duplicate?: boolean
}

export interface Payment {
  id: string
  payment_type: PaymentType
  amount: number
  description: string | null
  created_at: string
}

export interface RegistrationRow {
  id: string
  reg_code: string
  customer_name: string
  mobile: string
  physical_qty: number
  online_qty: number
  total_qty: number
  total_amount: number
  amount_received: number
  balance: number
  payment_type: PaymentType
  created_at: string
  total_count: number
}

export interface TicketRow {
  id: string
  registration_id: string
  serial_number: number
  customer_name: string
  reg_code: string
  pass_type: PassType
  status: 'valid' | 'cancelled'
  entry_status: 'not_entered' | 'entered'
  entry_time: string | null
  shared_at: string | null
  share_count: number
  qr_token: string
  created_at: string
  total_count: number
}

export interface EntryLogRow {
  id: string
  created_at: string
  result: 'entered' | 'already_entered' | 'cancelled'
  serial_number: number
  pass_type: PassType
  customer_name: string
  admin_name: string
  total_count: number
}

export interface DashboardStats {
  registrations: number
  tickets_total: number
  tickets_physical: number
  tickets_online: number
  tickets_cancelled: number
  entered: number
  remaining_valid: number
  invitations_generated: number
  invitations_shared: number
  expected_amount: number
  collected_amount: number
  outstanding_amount: number
  cash_amount: number
  upi_amount: number
  other_amount: number
  daily: { day: string; registrations: number; tickets: number }[]
}

export interface ScanTicket {
  ticket_id: string
  serial_number: number
  pass_type: PassType
  status: 'valid' | 'cancelled'
  cancel_reason: string | null
  entry_status: 'not_entered' | 'entered'
  entry_time: string | null
  checked_in_by_name: string | null
  customer_name: string
  registration_code: string
  event_name: string
  payment_status?: 'paid' | 'partial' | 'unpaid'
  balance?: number
}

export interface ScanResult {
  result: 'valid' | 'already_entered' | 'cancelled' | 'invalid' | 'entered'
  ticket?: ScanTicket
}

export interface PublicTicket {
  found: boolean
  serial_number?: number
  pass_type?: PassType
  status?: 'valid' | 'cancelled'
  customer_name?: string
  amount?: number
  event?: {
    name: string
    description: string | null
    event_date: string | null
    location: string | null
    logo_url: string | null
    banner_url: string | null
    invitation_art_url: string | null
    contact_details: string | null
    ticket_settings: TicketSettings | null
  }
}
