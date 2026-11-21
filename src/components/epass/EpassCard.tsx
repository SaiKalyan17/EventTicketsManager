import { CalendarDays, MapPin, ShieldCheck } from 'lucide-react'
import { fmtDate, formatINR, formatSerial } from '@/lib/utils'
import type { PassType, TicketSettings } from '@/types'

export const EPASS_WIDTH = 640

export interface EpassData {
  eventName: string
  eventSubtitle?: string | null
  eventDate: string | null
  location: string | null
  logoUrl: string | null
  bannerUrl: string | null
  artUrl: string | null
  contact?: string | null
  instructions?: string | null
  customerName: string
  serial: number
  passType: PassType
  amount: number | null
  cancelled: boolean
  qrDataUrl: string
}

export function epassFromEvent(
  ev: {
    name: string; event_date: string | null; location: string | null; logo_url: string | null
    banner_url: string | null; invitation_art_url: string | null; contact_details: string | null
    ticket_settings?: TicketSettings | null
  },
  t: { customerName: string; serial: number; passType: PassType; amount: number | null; cancelled: boolean; qrDataUrl: string },
): EpassData {
  return {
    eventName: ev.name,
    eventSubtitle: ev.ticket_settings?.subtitle ?? null,
    eventDate: ev.event_date,
    location: ev.location,
    logoUrl: ev.logo_url,
    bannerUrl: ev.banner_url,
    artUrl: ev.invitation_art_url,
    contact: ev.contact_details,
    instructions: ev.ticket_settings?.instructions ?? null,
    ...t,
  }
}

const DEFAULT_INSTRUCTIONS =
  'Show this QR code at the entry gate. Each pass admits one person and can be used only once. Do not share this pass publicly.'

/**
 * Fixed-width (640px) e-pass. It is rendered at its natural size and scaled with CSS on
 * small screens, so the exported PNG/PDF is always identical. Artwork uses
 * object-fit: contain, so uploaded images are never stretched or cropped.
 */
export function EpassCard({ d }: { d: EpassData }) {
  const isOnline = d.passType === 'online'
  const img = { crossOrigin: 'anonymous' as const, alt: '' }
  return (
    <div
      style={{ width: EPASS_WIDTH, fontFamily: "'Noto Sans Telugu', system-ui, sans-serif" }}
      className="relative overflow-hidden rounded-[28px] border-[6px] border-gold bg-[#FFFBF0] text-[#3b0d0d]"
    >
      {/* header */}
      <div className="bg-gradient-to-b from-[#8B1A1A] to-[#6e1212] px-8 pb-5 pt-7 text-center text-[#FBE9A6]">
        <div className="flex items-center justify-center gap-4">
          {d.logoUrl && <img src={d.logoUrl} {...img} className="h-20 w-20 rounded-full border-2 border-gold bg-white object-contain p-1" />}
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.3em] text-gold">{isOnline ? 'Online E-Pass' : 'Physical Pass · Digital Record'}</p>
            <h1 className="mt-1 text-[30px] font-bold leading-tight text-white">{d.eventName}</h1>
            {d.eventSubtitle && <p className="text-[18px] font-semibold text-[#FBE9A6]">{d.eventSubtitle}</p>}
          </div>
        </div>
      </div>
      <div className="h-1.5 bg-gold" />

      {/* artwork - never stretched */}
      {(d.bannerUrl || d.artUrl) && (
        <div className="flex flex-col items-center gap-3 bg-[#FFF3CF] px-6 py-4">
          {d.bannerUrl && <img src={d.bannerUrl} {...img} className="max-h-[200px] w-full rounded-xl object-contain" />}
          {d.artUrl && <img src={d.artUrl} {...img} className="max-h-[260px] w-full rounded-xl object-contain" />}
        </div>
      )}

      {/* body */}
      <div className="px-8 py-6 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.25em] text-[#8B1A1A]/70">Invited guest</p>
        <p className="mt-1 break-words text-[32px] font-bold leading-tight">{d.customerName}</p>

        <div className="mx-auto mt-5 inline-block rounded-2xl border-2 border-gold bg-white px-10 py-3 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.3em] text-[#8B1A1A]/70">Serial number</p>
          <p className="text-[76px] font-extrabold leading-none tracking-widest text-[#8B1A1A]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatSerial(d.serial)}
          </p>
        </div>

        <div className="mx-auto mt-5 grid max-w-[520px] gap-2 text-left text-[17px]">
          <div className="flex items-start gap-3"><CalendarDays className="mt-1 h-5 w-5 shrink-0 text-[#8B1A1A]" /><span className="font-semibold">{d.eventDate ? fmtDate(d.eventDate, 'EEEE, dd MMMM yyyy, hh:mm a') : 'Date to be announced'}</span></div>
          <div className="flex items-start gap-3"><MapPin className="mt-1 h-5 w-5 shrink-0 text-[#8B1A1A]" /><span className="font-semibold">{d.location || 'Venue to be announced'}</span></div>
          {d.amount !== null && d.amount > 0 && (
            <div className="flex items-start gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[18px] font-bold text-[#8B1A1A]">₹</span><span className="font-semibold">Pass amount: {formatINR(d.amount)}</span></div>
          )}
        </div>

        <div className="mx-auto mt-6 w-fit rounded-3xl border-2 border-dashed border-gold bg-white p-4">
          <img src={d.qrDataUrl} alt="Entry QR code" className="block h-[300px] w-[300px]" />
        </div>
        <p className="mt-2 text-[14px] font-semibold uppercase tracking-widest text-[#8B1A1A]">Scan at entry gate</p>

        <div className="mx-auto mt-5 flex max-w-[520px] items-start gap-3 rounded-xl bg-[#FFF3CF] p-3 text-left text-[14px] leading-snug">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#8B1A1A]" />
          <span>{d.instructions || DEFAULT_INSTRUCTIONS}</span>
        </div>
        {d.contact && <p className="mt-3 whitespace-pre-line text-[13px] text-[#3b0d0d]/70">{d.contact}</p>}
      </div>

      {d.cancelled && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
          <span className="-rotate-12 rounded-2xl border-[6px] border-red-600 px-8 py-2 text-[64px] font-extrabold tracking-widest text-red-600">
            CANCELLED
          </span>
        </div>
      )}
    </div>
  )
}

/** First page of a batch download: a summary of every pass in the registration. */
export function BatchCoverCard({ eventName, customerName, regCode, serials, eventDate, location }: {
  eventName: string; customerName: string; regCode: string; serials: { serial: number; type: PassType }[]
  eventDate: string | null; location: string | null
}) {
  return (
    <div style={{ width: EPASS_WIDTH, fontFamily: "'Noto Sans Telugu', system-ui, sans-serif" }}
      className="overflow-hidden rounded-[28px] border-[6px] border-gold bg-[#FFFBF0] text-[#3b0d0d]">
      <div className="bg-[#8B1A1A] px-8 py-6 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.3em] text-gold">Batch of e-passes</p>
        <h1 className="mt-1 text-[30px] font-bold text-white">{eventName}</h1>
      </div>
      <div className="h-1.5 bg-gold" />
      <div className="px-8 py-6">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-[#8B1A1A]/70">Registered for</p>
        <p className="text-[30px] font-bold">{customerName}</p>
        <p className="mt-1 text-[15px]">{regCode} · {serials.length} pass{serials.length === 1 ? '' : 'es'}</p>
        <p className="mt-1 text-[15px]">{eventDate ? fmtDate(eventDate, 'dd MMM yyyy, hh:mm a') : ''} {location ? `· ${location}` : ''}</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {serials.map((s) => (
            <div key={s.serial} className="rounded-xl border-2 border-gold bg-white px-3 py-2 text-center">
              <p className="text-[26px] font-extrabold tracking-widest text-[#8B1A1A]">{formatSerial(s.serial)}</p>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#3b0d0d]/60">{s.type}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[13px] text-[#3b0d0d]/70">Each following page is one individual pass with its own QR code.</p>
      </div>
    </div>
  )
}
