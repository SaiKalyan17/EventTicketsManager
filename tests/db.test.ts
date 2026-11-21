/**
 * Database tests. They run the REAL migration (supabase/migrations/0001_schema.sql)
 * inside PGlite (an in-process WASM Postgres), with a tiny shim for the Supabase-only
 * pieces (auth.users, auth.uid(), anon/authenticated roles, extensions schema).
 * PGlite is single-connection, so true parallel races are covered separately by
 * tests/concurrency.live.mjs against a real Supabase project.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFileSync } from 'node:fs'

const SUPER = '00000000-0000-0000-0000-000000000001'
const REG1 = '00000000-0000-0000-0000-000000000002'
const REG2 = '00000000-0000-0000-0000-000000000003'
const ENTRY = '00000000-0000-0000-0000-000000000004'
const VIEWER = '00000000-0000-0000-0000-000000000005'
const INACTIVE = '00000000-0000-0000-0000-000000000006'

let db: PGlite
let eventId: string
let seq = 0
const uuid = () => `10000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`

async function as(uid: string | null) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
  await db.exec(uid ? 'set role authenticated' : 'set role anon')
}
async function asOwner() {
  await db.exec('reset role')
}

async function register(over: Record<string, unknown> = {}) {
  const a = { name: 'Ramesh Kumar', mobile: '9876543210', physical: 3, online: 2, type: 'cash', paid: 0, req: uuid(), ...over }
  const r = await db.query<{ r: any }>(
    `select public.register_batch($1,$2,$3,null,null,$4,$5,$6,$7,null,$8) as r`,
    [eventId, a.name, a.mobile, a.physical, a.online, a.type, a.paid, a.req],
  )
  return r.rows[0].r
}
const reject = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e: any) {
    return String(e.message)
  }
  throw new Error('expected rejection')
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm } })
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, extensions to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `)
  await db.exec(readFileSync('supabase/migrations/0001_schema.sql', 'utf8'))
})

beforeEach(async () => {
  await asOwner()
  await db.exec(`truncate public.entry_logs, public.payments, public.tickets, public.registrations,
    public.event_counters, public.events, public.admin_profiles restart identity cascade;
    delete from auth.users;`)
  for (const [id, role, active] of [
    [SUPER, 'super_admin', true],
    [REG1, 'registration_admin', true],
    [REG2, 'registration_admin', true],
    [ENTRY, 'entry_admin', true],
    [VIEWER, 'report_viewer', true],
    [INACTIVE, 'registration_admin', false],
  ] as const) {
    await db.query('insert into auth.users(id, email) values ($1, $2)', [id, `${id}@x.test`])
    await db.query('insert into public.admin_profiles(id, full_name, role, is_active) values ($1,$2,$3,$4)', [
      id,
      `Admin ${role}`,
      role,
      active,
    ])
  }
  const ev = await db.query<{ id: string }>(
    `insert into public.events(name, price, event_date, location) values ('Test Utsav', 100, now(), 'Hyderabad') returning id`,
  )
  eventId = ev.rows[0].id
  await as(REG1)
})

describe('batch registration & serials', () => {
  it('creates one registration and N tickets with consecutive serials (physical first)', async () => {
    const r = await register()
    expect(r.reg_code).toBe('REG-0001')
    expect(r.total_qty).toBe(5)
    expect(Number(r.total_amount)).toBe(500)
    const t = r.tickets
    expect(t.map((x: any) => x.serial_number)).toEqual([1, 2, 3, 4, 5])
    expect(t.map((x: any) => x.pass_type)).toEqual(['physical', 'physical', 'physical', 'online', 'online'])
    expect(new Set(t.map((x: any) => x.qr_token)).size).toBe(5)
    for (const x of t) expect(x.qr_token).toMatch(/^[0-9a-f]{48}$/)
  })

  it('continues numbering across registrations and by different admins', async () => {
    await register({ physical: 2, online: 0 })
    await as(REG2)
    const r2 = await register({ name: 'Sita', physical: 0, online: 3 })
    expect(r2.reg_code).toBe('REG-0002')
    expect(r2.tickets.map((x: any) => x.serial_number)).toEqual([3, 4, 5])
  })

  it('never reuses a cancelled serial', async () => {
    const r = await register({ physical: 0, online: 2 })
    await db.query('select public.cancel_ticket($1, $2)', [r.tickets[1].id, 'wrong person'])
    const r2 = await register({ physical: 1, online: 0 })
    expect(r2.tickets[0].serial_number).toBe(3)
  })

  it('rolls back everything (counter, registration, tickets) if any step fails', async () => {
    await asOwner()
    await db.exec(`create function boom() returns trigger language plpgsql as $$ begin raise exception 'payment boom'; end $$;
      create trigger boom_t before insert on public.payments for each row execute function boom();`)
    await as(REG1)
    const msg = await reject(register({ paid: 100 }))
    expect(msg).toContain('payment boom')
    await asOwner()
    await db.exec('drop trigger boom_t on public.payments')
    expect((await db.query<any>('select count(*)::int c from public.registrations')).rows[0].c).toBe(0)
    expect((await db.query<any>('select count(*)::int c from public.tickets')).rows[0].c).toBe(0)
    await as(REG1)
    const ok = await register()
    expect(ok.tickets[0].serial_number).toBe(1) // counter was rolled back too
    expect(ok.reg_code).toBe('REG-0001')
  })

  it('is idempotent for a repeated request id (double submit)', async () => {
    const req = uuid()
    const a = await register({ req })
    const b = await register({ req })
    expect(b.duplicate).toBe(true)
    expect(b.id).toBe(a.id)
    await asOwner()
    expect((await db.query<any>('select count(*)::int c from public.tickets')).rows[0].c).toBe(5)
  })

  it('normalises mobile numbers (+91, spaces, dashes)', async () => {
    const r = await register({ mobile: '+91 98765-43210', physical: 1, online: 0 })
    expect(r.mobile).toBe('9876543210')
  })

  it('computes balance and records payment rows', async () => {
    const r = await register({ paid: 200, type: 'upi' })
    expect(Number(r.balance)).toBe(300)
    await asOwner()
    const p = await db.query<any>('select payment_type, amount from public.payments')
    expect(p.rows).toEqual([{ payment_type: 'upi', amount: '200.00' }])
    await as(REG1)
    const after = await db.query<any>(`select public.add_payment($1,'cash',300,'rest') as r`, [r.id])
    expect(Number(after.rows[0].r.balance)).toBe(0)
    expect(await reject(db.query(`select public.add_payment($1,'cash',1,null)`, [r.id]))).toContain('overpayment')
  })
})

describe('validation', () => {
  it.each([
    [{ mobile: '12345' }, 'invalid_mobile'],
    [{ mobile: '5876543210' }, 'invalid_mobile'],
    [{ name: '   ' }, 'invalid_name'],
    [{ physical: 0, online: 0 }, 'zero_quantity'],
    [{ physical: -1, online: 2 }, 'invalid_quantity'],
    [{ physical: 300, online: 0 }, 'quantity_too_large'],
    [{ paid: -5 }, 'invalid_payment_amount'],
    [{ paid: 501 }, 'overpayment'],
    [{ type: 'bitcoin' }, 'invalid_payment_type'],
  ])('rejects %j with %s', async (over, code) => {
    expect(await reject(register(over))).toContain(code)
    await asOwner()
    expect((await db.query<any>('select * from public.event_counters')).rows).toEqual([])
  })
})

describe('authorization & RLS', () => {
  it('blocks non-registration roles and inactive admins from registering', async () => {
    for (const uid of [ENTRY, VIEWER, INACTIVE]) {
      await as(uid)
      expect(await reject(register())).toContain('not_authorized')
    }
    await as(null)
    expect(await reject(register())).toMatch(/not_authorized|permission denied/)
  })

  it('does not allow direct writes to tickets/registrations/payments/entry_logs', async () => {
    const r = await register()
    for (const sql of [
      `update public.tickets set entry_status='entered'`,
      `delete from public.tickets`,
      `insert into public.payments(registration_id,event_id,payment_type,amount,created_by) values ('${r.id}','${eventId}','cash',1,'${REG1}')`,
      `update public.registrations set amount_received = 0`,
      `insert into public.entry_logs(ticket_id,event_id,admin_id,result) values ('${r.tickets[0].id}','${eventId}','${REG1}','entered')`,
    ]) {
      expect(await reject(db.exec(sql))).toContain('permission denied')
    }
    await as(SUPER)
    expect(await reject(db.exec(`update public.tickets set entry_status='entered'`))).toContain('permission denied')
  })

  it('hides registrations from entry admins but shows them to report viewers', async () => {
    await register()
    await as(ENTRY)
    expect((await db.query<any>('select * from public.registrations')).rows).toHaveLength(0)
    expect((await db.query<any>('select * from public.payments')).rows).toHaveLength(0)
    await as(VIEWER)
    expect((await db.query<any>('select * from public.registrations')).rows).toHaveLength(1)
    expect(await reject(db.query(`select public.cancel_ticket(gen_random_uuid(),'because')`))).toContain('not_authorized')
  })

  it('anon cannot read any table', async () => {
    await as(null)
    for (const t of ['tickets', 'registrations', 'events', 'payments', 'admin_profiles', 'entry_logs', 'event_counters']) {
      expect(await reject(db.query(`select * from public.${t}`))).toContain('permission denied')
    }
  })

  it('only super admins can edit events', async () => {
    await as(REG1)
    const upd = await db.query(`update public.events set name='Hacked' returning id`)
    expect(upd.rows).toHaveLength(0)
    await as(SUPER)
    const ok = await db.query(`update public.events set name='Renamed' returning id`)
    expect(ok.rows).toHaveLength(1)
  })

  it('internal functions are not callable via the API roles', async () => {
    expect(await reject(db.query('select public.allocate_serials($1, 5)', [eventId]))).toContain('permission denied')
  })
})

describe('cancel ticket', () => {
  it('requires a reason, keeps the row, and cannot cancel an entered ticket', async () => {
    const r = await register({ physical: 0, online: 2 })
    expect(await reject(db.query('select public.cancel_ticket($1, $2)', [r.tickets[0].id, ' ']))).toContain('reason_required')
    const c = await db.query<any>('select public.cancel_ticket($1, $2) as t', [r.tickets[0].id, 'customer request'])
    expect(c.rows[0].t.status).toBe('cancelled')
    expect(await reject(db.query('select public.cancel_ticket($1, $2)', [r.tickets[0].id, 'again please']))).toContain('already_cancelled')
    await as(ENTRY)
    await db.query('select public.confirm_entry($1)', [r.tickets[1].qr_token])
    await as(REG1)
    expect(await reject(db.query('select public.cancel_ticket($1, $2)', [r.tickets[1].id, 'too late']))).toContain('already_entered')
    await asOwner()
    expect((await db.query<any>(`select count(*)::int c from public.tickets where status='valid'`)).rows[0].c).toBe(1)
  })
})

describe('entry verification', () => {
  it('checks in once, then reports already entered, and logs every attempt immutably', async () => {
    const r = await register({ physical: 1, online: 1 })
    const token = r.tickets[1].qr_token
    await as(ENTRY)
    const look = (await db.query<any>('select public.lookup_ticket($1) as r', [token])).rows[0].r
    expect(look.result).toBe('valid')
    expect(look.ticket.customer_name).toBe('Ramesh Kumar')
    expect(look.ticket.payment_status).toBeUndefined() // entry admin can't see payment info

    const first = (await db.query<any>('select public.confirm_entry($1) as r', [token])).rows[0].r
    expect(first.result).toBe('entered')
    expect(first.ticket.entry_status).toBe('entered')
    const second = (await db.query<any>('select public.confirm_entry($1) as r', [token])).rows[0].r
    expect(second.result).toBe('already_entered')
    expect(second.ticket.entry_time).toBe(first.ticket.entry_time)

    await asOwner()
    const t = (await db.query<any>('select entry_status, checked_in_by from public.tickets where qr_token=$1', [token])).rows[0]
    expect(t.entry_status).toBe('entered')
    expect(t.checked_in_by).toBe(ENTRY)
    const logs = (await db.query<any>('select result from public.entry_logs order by created_at, id')).rows.map((x) => x.result)
    expect(logs).toEqual(['entered', 'already_entered'])
    expect(await reject(db.exec(`update public.entry_logs set result='entered'`))).toContain('immutable')
    expect(await reject(db.exec(`delete from public.entry_logs`))).toContain('immutable')
  })

  it('rejects cancelled and unknown tokens; super admin sees payment status', async () => {
    const r = await register({ physical: 0, online: 1, paid: 50 })
    await db.query('select public.cancel_ticket($1,$2)', [r.tickets[0].id, 'duplicate'])
    await as(ENTRY)
    expect((await db.query<any>('select public.confirm_entry($1) as r', [r.tickets[0].qr_token])).rows[0].r.result).toBe('cancelled')
    expect((await db.query<any>('select public.confirm_entry($1) as r', ['f'.repeat(48)])).rows[0].r.result).toBe('invalid')
    expect((await db.query<any>(`select public.confirm_entry('garbage') as r`)).rows[0].r.result).toBe('invalid')
    await as(SUPER)
    const s = (await db.query<any>('select public.lookup_ticket($1) as r', [r.tickets[0].qr_token])).rows[0].r
    expect(s.result).toBe('cancelled')
    expect(s.ticket.payment_status).toBe('partial')
    await as(REG1)
    expect(await reject(db.query('select public.confirm_entry($1)', [r.tickets[0].qr_token]))).toContain('not_authorized')
  })
})

describe('public ticket lookup', () => {
  it('exposes only safe fields and works for anon', async () => {
    const r = await register({ paid: 100 })
    await as(null)
    const out = (await db.query<any>('select public.get_public_ticket($1) as r', [r.tickets[0].qr_token])).rows[0].r
    expect(out.found).toBe(true)
    expect(out.serial_number).toBe(1)
    expect(out.customer_name).toBe('Ramesh Kumar')
    const json = JSON.stringify(out)
    expect(json).not.toContain('9876543210')
    for (const k of ['mobile', 'payment', 'balance', 'reg_code', 'registration_id', 'created_by', 'notes']) expect(json).not.toContain(k)
    expect((await db.query<any>(`select public.get_public_ticket('nope') as r`)).rows[0].r.found).toBe(false)
    expect((await db.query<any>(`select public.get_public_ticket('${'a'.repeat(48)}') as r`)).rows[0].r.found).toBe(false)
  })
})

describe('search, dashboard, sharing', () => {
  it('finds registrations by name, mobile, reg code and serial; filters pass type', async () => {
    await register({ name: 'Ramesh Kumar', physical: 2, online: 0 })
    await register({ name: 'Lakshmi Devi', mobile: '9123456780', physical: 0, online: 2 })
    const q = async (p: string | null, pass: string | null = null) =>
      (await db.query<any>('select * from public.search_registrations($1,$2,null,$3)', [eventId, p, pass])).rows
    expect((await q('ramesh')).map((x) => x.customer_name)).toEqual(['Ramesh Kumar'])
    expect((await q('91234')).map((x) => x.customer_name)).toEqual(['Lakshmi Devi'])
    expect((await q('REG-0002')).map((x) => x.customer_name)).toEqual(['Lakshmi Devi'])
    expect((await q('4')).map((x) => x.customer_name)).toContain('Lakshmi Devi') // serial 4
    expect(await q(null, 'online')).toHaveLength(1)
    expect(Number((await q(null))[0].total_count)).toBe(2)
  })

  it('paginates tickets and filters', async () => {
    await register({ physical: 2, online: 2 })
    const t = (
      await db.query<any>(`select * from public.search_tickets($1, null, 'online', null, null, null, 1, 0)`, [eventId])
    ).rows
    expect(t).toHaveLength(1)
    expect(Number(t[0].total_count)).toBe(2)
  })

  it('dashboard numbers come from the data', async () => {
    const a = await register({ physical: 2, online: 1, paid: 150, type: 'cash' }) // 300 due
    await register({ physical: 0, online: 2, paid: 200, type: 'upi', mobile: '9123456780' }) // 200 due
    await db.query('select public.cancel_ticket($1,$2)', [a.tickets[2].id, 'oops'])
    await db.query('select public.mark_shared($1)', [[a.tickets[0].id, a.tickets[1].id]])
    await as(ENTRY)
    await db.query('select public.confirm_entry($1)', [a.tickets[0].qr_token])
    await as(VIEWER)
    const s = (await db.query<any>('select public.dashboard_stats($1) as s', [eventId])).rows[0].s
    expect(s).toMatchObject({
      registrations: 2,
      tickets_total: 5,
      tickets_physical: 2,
      tickets_online: 3,
      tickets_cancelled: 1,
      entered: 1,
      remaining_valid: 3,
      invitations_shared: 2,
    })
    expect(Number(s.expected_amount)).toBe(500)
    expect(Number(s.collected_amount)).toBe(350)
    expect(Number(s.outstanding_amount)).toBe(150)
    expect(Number(s.cash_amount)).toBe(150)
    expect(Number(s.upi_amount)).toBe(200)
    expect(Number(s.other_amount)).toBe(0)
    await as(ENTRY)
    expect(await reject(db.query('select public.dashboard_stats($1)', [eventId]))).toContain('not_authorized')
  })
})
