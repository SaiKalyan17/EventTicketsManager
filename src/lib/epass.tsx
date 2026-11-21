import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import QRCode from 'qrcode'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { BatchCoverCard, EpassCard, EPASS_WIDTH, type EpassData } from '@/components/epass/EpassCard'
import { AppError } from './errors'
import { ticketUrl } from './supabase'
import { downloadBlob, formatSerial } from './utils'
import type { PassType } from '@/types'

/** QR payload is ONLY the public ticket URL - no personal data. */
export async function makeQrDataUrl(token: string): Promise<string> {
  try {
    return await QRCode.toDataURL(ticketUrl(token), { errorCorrectionLevel: 'M', margin: 1, width: 720, color: { dark: '#000000', light: '#ffffff' } })
  } catch {
    throw new AppError('Could not generate the QR code. Please retry.')
  }
}

async function waitForAssets(root: HTMLElement) {
  await document.fonts?.ready
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve, reject) => {
          if (img.complete && img.naturalWidth > 0) return resolve()
          img.onload = () => resolve()
          img.onerror = () => reject(new AppError('An image on the pass failed to load (check the artwork URL / CORS).'))
        }),
    ),
  )
}

/** Renders any element off-screen at natural size and returns a PNG data URL. */
async function renderToPng(element: React.ReactElement): Promise<{ dataUrl: string; width: number; height: number }> {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${EPASS_WIDTH}px;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(element))
    const node = host.firstElementChild as HTMLElement
    await waitForAssets(node)
    const width = node.offsetWidth
    const height = node.offsetHeight
    const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff', width, height })
    return { dataUrl, width, height }
  } catch (e) {
    if (e instanceof AppError) throw e
    throw new AppError('Failed to generate the invitation image. Please retry.')
  } finally {
    root.unmount()
    host.remove()
  }
}

export const renderEpassPng = (d: EpassData) => renderToPng(<EpassCard d={d} />)

function pdfFromImages(pages: { dataUrl: string; width: number; height: number }[]): Blob {
  const pageW = 148 // mm (A5 width); height follows the image ratio so artwork is never distorted
  let pdf: jsPDF | null = null
  for (const p of pages) {
    const h = (pageW * p.height) / p.width
    if (!pdf) pdf = new jsPDF({ unit: 'mm', format: [pageW, h], orientation: h > pageW ? 'portrait' : 'landscape' })
    else pdf.addPage([pageW, h], h > pageW ? 'portrait' : 'landscape')
    pdf.addImage(p.dataUrl, 'PNG', 0, 0, pageW, h)
  }
  if (!pdf) throw new AppError('Nothing to export.')
  return pdf.output('blob')
}

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob()

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'pass'

export async function downloadEpassPng(d: EpassData) {
  const png = await renderEpassPng(d)
  downloadBlob(await dataUrlToBlob(png.dataUrl), `epass-${formatSerial(d.serial)}-${safeName(d.customerName)}.png`)
}

export async function downloadEpassPdf(d: EpassData) {
  const png = await renderEpassPng(d)
  downloadBlob(pdfFromImages([png]), `epass-${formatSerial(d.serial)}-${safeName(d.customerName)}.pdf`)
}

/** Batch template: a summary page followed by one page per pass. */
export async function downloadBatchPdf(
  cover: { eventName: string; customerName: string; regCode: string; eventDate: string | null; location: string | null },
  passes: EpassData[],
) {
  if (passes.length === 0) throw new AppError('There are no valid online passes to download.')
  const pages = [
    await renderToPng(
      <BatchCoverCard {...cover} serials={passes.map((p) => ({ serial: p.serial, type: p.passType as PassType }))} />,
    ),
  ]
  for (const p of passes) pages.push(await renderEpassPng(p))
  downloadBlob(pdfFromImages(pages), `epasses-${cover.regCode}-${safeName(cover.customerName)}.pdf`)
}

/** Printable / downloadable list of serial numbers the admin writes on physical passes. */
export function serialListPdf(opts: {
  eventName: string; regCode: string; customerName: string; serials: number[]
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('WRITE THESE SERIAL NUMBERS ON THE PHYSICAL PASSES', 105, 20, { align: 'center' })
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  // jsPDF's built-in fonts are Latin-only; keep the PDF ASCII-safe for names in other scripts
  const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, '?')
  pdf.text(`${ascii(opts.eventName)}  |  ${opts.regCode}`, 105, 28, { align: 'center' })
  pdf.text(`Customer: ${ascii(opts.customerName)}`, 105, 34, { align: 'center' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(40)
  let y = 60
  for (const s of opts.serials) {
    pdf.text(formatSerial(s), 105, y, { align: 'center' })
    y += 22
    if (y > 270) {
      pdf.addPage()
      y = 30
    }
  }
  downloadBlob(pdf.output('blob'), `serials-${opts.regCode}.pdf`)
}
