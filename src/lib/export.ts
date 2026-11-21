import Papa from 'papaparse'
import { downloadBlob } from './utils'

/** Neutralise spreadsheet formula injection (=, +, -, @, tab, CR at the start of a cell). */
function safeCell(v: unknown): string | number {
  if (typeof v === 'number') return v
  const s = v == null ? '' : String(v)
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

/** CSV with a UTF-8 BOM so Excel opens Telugu/other scripts correctly. */
export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  const clean = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])))
  const csv = Papa.unparse(clean)
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename)
}

/** Fetches every page (1000 rows per request) of a paginated source. */
export async function fetchAll<T>(page: (offset: number, limit: number) => Promise<T[]>, max = 50000): Promise<T[]> {
  const out: T[] = []
  const limit = 1000
  for (let offset = 0; offset < max; offset += limit) {
    const rows = await page(offset, limit)
    out.push(...rows)
    if (rows.length < limit) break
  }
  return out
}
