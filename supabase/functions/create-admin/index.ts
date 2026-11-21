// Supabase Edge Function: create-admin
// Runs server-side so the service-role key never reaches the browser.
// Deploy:  supabase functions deploy create-admin
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase automatically.)
// The caller must be a signed-in, active Super Admin - verified here from their JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const ROLES = ['super_admin', 'registration_admin', 'entry_admin', 'report_viewer']
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401)

  // 1. Who is calling? (uses the caller's own JWT, subject to RLS)
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await asCaller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not signed in' }, 401)
  const { data: role } = await asCaller.rpc('current_admin_role')
  if (role !== 'super_admin') return json({ error: 'Only a Super Admin can create administrators' }, 403)

  // 2. Validate input
  let body: { email?: string; password?: string; full_name?: string; role?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid request body' }, 400) }
  const email = String(body.email ?? '').trim().toLowerCase()
  const fullName = String(body.full_name ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email' }, 400)
  if (fullName.length < 2) return json({ error: 'Enter the full name' }, 400)
  if (String(body.password ?? '').length < 10) return json({ error: 'Password must be at least 10 characters' }, 400)
  if (!ROLES.includes(String(body.role))) return json({ error: 'Invalid role' }, 400)

  // 3. Privileged work with the service-role key (server side only)
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: body.password, email_confirm: true,
  })
  if (createErr || !created.user) return json({ error: createErr?.message ?? 'Could not create the user' }, 400)

  const { error: profileErr } = await admin.from('admin_profiles').insert({
    id: created.user.id, full_name: fullName, role: body.role, is_active: true,
  })
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id) // don't leave an orphan login
    return json({ error: profileErr.message }, 400)
  }
  return json({ id: created.user.id })
})
