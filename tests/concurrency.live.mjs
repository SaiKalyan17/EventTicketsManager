// Live concurrency test against a REAL Supabase project (not part of `npm test`).
//   Env: SUPABASE_URL, SUPABASE_ANON_KEY, EVENT_ID,
//        REG_ADMIN_1_EMAIL/_PASSWORD, REG_ADMIN_2_EMAIL/_PASSWORD, ENTRY_ADMIN_EMAIL/_PASSWORD
//   Run: node tests/concurrency.live.mjs
// It creates 20 test registrations named "CONCURRENCY TEST"; cancel their tickets afterwards.
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'

const env = (k) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env ${k}`)
  return v
}
const login = async (p) => {
  const c = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: env(`${p}_EMAIL`), password: env(`${p}_PASSWORD`) })
  if (error) throw error
  return c
}
const [a1, a2, entry] = await Promise.all([login('REG_ADMIN_1'), login('REG_ADMIN_2'), login('ENTRY_ADMIN')])
const eventId = env('EVENT_ID')

const jobs = Array.from({ length: 20 }, (_, i) =>
  (i % 2 ? a1 : a2).rpc('register_batch', {
    p_event_id: eventId,
    p_customer_name: 'CONCURRENCY TEST',
    p_mobile: '9876543210',
    p_email: null,
    p_notes: null,
    p_physical: 2,
    p_online: 1,
    p_payment_type: 'cash',
    p_amount_received: 0,
    p_payment_description: null,
    p_request_id: crypto.randomUUID(),
  }),
)
const results = await Promise.all(jobs)
results.forEach((r) => assert.equal(r.error, null, r.error?.message))
const serials = results.flatMap((r) => r.data.tickets.map((t) => t.serial_number)).sort((x, y) => x - y)
assert.equal(new Set(serials).size, serials.length, 'duplicate serial numbers!')
assert.equal(serials.at(-1) - serials[0] + 1, serials.length, 'gap inside the allocated range')
for (const r of results) {
  const s = r.data.tickets.map((t) => t.serial_number)
  assert.deepEqual(s, Array.from({ length: s.length }, (_, i) => s[0] + i), 'a batch is not contiguous')
}
console.log(`OK  20 parallel registrations -> ${serials.length} unique serials (${serials[0]}..${serials.at(-1)})`)

const token = results[0].data.tickets[0].qr_token
const scans = await Promise.all(Array.from({ length: 10 }, () => entry.rpc('confirm_entry', { p_token: token })))
const outcomes = scans.map((s) => s.data?.result)
assert.equal(outcomes.filter((o) => o === 'entered').length, 1, `expected exactly one entry, got ${outcomes}`)
assert.equal(outcomes.filter((o) => o === 'already_entered').length, 9)
console.log('OK  10 parallel scans of one ticket -> exactly 1 entered, 9 already_entered')
