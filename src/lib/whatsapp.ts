import { formatSerial } from './utils'
import { ticketUrl } from './supabase'

export interface ShareTicket {
  serial_number: number
  qr_token: string
}

/**
 * WhatsApp Click-to-Chat only pre-fills TEXT. It cannot attach the PNG/PDF -
 * admins download the file and attach it manually. We can only record that
 * sharing was *initiated*, never that it was delivered.
 */
export function buildWhatsAppMessage(customerName: string, eventName: string, tickets: ShareTicket[]): string {
  if (tickets.length === 1) {
    const t = tickets[0]
    return [
      `Dear ${customerName},`,
      `Thank you for registering for ${eventName}.`,
      `Your digital event pass is ready.`,
      `Ticket Number: ${formatSerial(t.serial_number)}`,
      `View your invitation: ${ticketUrl(t.qr_token)}`,
      `We look forward to welcoming you.`,
    ].join('\n')
  }
  return [
    `Dear ${customerName},`,
    `Thank you for registering for ${eventName}.`,
    `Your digital event passes are ready (${tickets.length} tickets).`,
    ``,
    ...tickets.map((t) => `Ticket ${formatSerial(t.serial_number)}: ${ticketUrl(t.qr_token)}`),
    ``,
    `We look forward to welcoming you.`,
  ].join('\n')
}

export function whatsappUrl(mobile10: string, message: string): string {
  return `https://wa.me/91${mobile10}?text=${encodeURIComponent(message)}`
}

export function openWhatsApp(mobile10: string, message: string) {
  window.open(whatsappUrl(mobile10, message), '_blank', 'noopener,noreferrer')
}
