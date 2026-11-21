const MESSAGES: Record<string, string> = {
  not_authorized: 'You do not have permission to do that.',
  invalid_name: 'Please enter the visitor name.',
  invalid_mobile: 'Enter a valid 10-digit mobile number.',
  invalid_email: 'The email address looks invalid.',
  invalid_quantity: 'Quantities must be zero or more.',
  zero_quantity: 'Add at least one physical or online pass.',
  quantity_too_large: 'A single registration can have at most 200 passes.',
  invalid_payment_type: 'Choose a payment type.',
  invalid_payment_amount: 'The payment amount is not valid.',
  overpayment: 'The amount is more than what is due.',
  event_not_found: 'No active event found. Ask a Super Admin to configure the event.',
  serial_generation_failed: 'Could not generate serial numbers. Nothing was saved — please retry.',
  reason_required: 'Please enter a reason (at least 3 characters).',
  ticket_not_found: 'Ticket not found.',
  already_cancelled: 'This ticket is already cancelled.',
  already_entered: 'This ticket has already been used for entry, so it cannot be cancelled.',
  registration_not_found: 'Registration not found.',
}

export class AppError extends Error {
  code: string
  constructor(message: string, code = 'error') {
    super(message)
    this.code = code
  }
}

/** Turns any thrown value (Postgrest error, network failure, Error) into a friendly message. */
export function friendlyError(e: unknown): string {
  const raw = typeof e === 'string' ? e : ((e as { message?: string })?.message ?? '')
  if (!raw) return 'Something went wrong. Please try again.'
  for (const key of Object.keys(MESSAGES)) {
    if (raw.includes(key)) return MESSAGES[key]
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(raw)) {
    return 'Network problem — check your internet connection and try again.'
  }
  if (/jwt|not authenticated|invalid refresh token/i.test(raw)) return 'Your session expired. Please sign in again.'
  if (/permission denied|row-level security/i.test(raw)) return 'You do not have permission to do that.'
  return raw
}
