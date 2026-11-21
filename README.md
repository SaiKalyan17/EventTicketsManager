# Event Pass Management System

Admin dashboard + public e-pass pages for a religious/cultural event. Admins register visitors, the **database** issues sequential serial numbers and unique QR tokens, online passes are shared over WhatsApp Click-to-Chat, and entry is verified with an atomic, audited QR scan.

**Stack:** React 19 · Vite · TypeScript · Tailwind CSS 3 · shadcn/ui-style components (Radix) · React Router · Supabase (Postgres, Auth, Storage, RLS, SQL functions, one Edge Function) · Cloudflare Pages.

---

## 1. How it works (security model)

| Concern | How it is enforced |
|---|---|
| Who can do what | `admin_profiles.role` + **RLS** on every table + role checks inside every `SECURITY DEFINER` function. The React route guards are only for UX. |
| Serial numbers | `register_batch()` locks the per-event `event_counters` row (`FOR UPDATE`) and allocates a consecutive range inside one transaction. Never in JavaScript. Counter only moves forward, so cancelled serials are never reused. |
| Atomic batches | Registration + N tickets + payment are one transaction; any failure rolls back everything, including the counter. |
| Double submit | The form sends a `client_request_id`; a repeat returns the existing registration (checked after taking the counter lock, so even parallel duplicates are safe). |
| Check-in | `confirm_entry()` does `SELECT … FOR UPDATE` on the ticket, flips `entry_status` once, and writes an **immutable** `entry_logs` row (update/delete blocked by trigger). Only one admin can win. |
| Public ticket page | `get_public_ticket(token)` is the *only* thing `anon` can call. It returns name, serial, event info and validity — never mobile, payments, registration id or admin info. Tokens are 192-bit random (`gen_random_bytes(24)`), not derived from serials. |
| QR content | Only `https://<site>/ticket/<token>`. No personal data. |
| No hard deletes | Triggers block `DELETE` on tickets, registrations and payments. Cancelling keeps the row. |
| Secrets | Only the **anon** key is in the frontend. The service-role key is used only inside the `create-admin` Edge Function (server side). |

Roles: **Super Admin** (everything) · **Registration Admin** (register, tickets, share, payments) · **Entry Admin** (scanner, entry history) · **Report Viewer** (dashboard, reports, read-only lists).
Entry admins cannot read registrations or payments; the scanner shows payment status only to Super Admins.

---

## 2. Local development

```powershell
npm install
copy .env.example .env      # then fill in the two Supabase values
npm run dev                 # http://localhost:5173
npm run typecheck
npm test                    # database tests (no Supabase needed)
npm run build               # production build in dist/
```

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` come from Supabase → *Project Settings → API*. **Never** put the `service_role` key in a `VITE_` variable.
Optionally set `VITE_PUBLIC_SITE_URL` (e.g. `https://passes.example.org`) so QR codes always use your production domain, even when an admin works from a preview URL.

---

## 3. Supabase setup

### 3.1 Create the project
1. https://supabase.com → *New project*. Choose a region close to your visitors (e.g. Mumbai) and save the database password.

### 3.2 Run the SQL migrations
Open *SQL Editor* and run, in order:
1. `supabase/migrations/0001_schema.sql` – tables, constraints, indexes, RLS policies, all functions.
2. `supabase/migrations/0002_storage.sql` – the public `event-assets` bucket (logo / banner / artwork) with Super-Admin-only write policies.

(Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.)

### 3.3 Configure authentication
*Authentication → Providers → Email*: keep **Email** enabled and **turn OFF "Allow new users to sign up"** (*Authentication → Sign In / Providers → "Allow new users to sign up"*). Admins are created by a Super Admin, never by self sign-up. Set a strong minimum password length. Add your site URL under *Authentication → URL Configuration*.

### 3.4 RLS
RLS is enabled and policies are created by migration `0001`. Verify in *Authentication → Policies* that all 7 tables show RLS enabled. `event_counters` intentionally has **no** policy (no direct access; functions only).

### 3.5 Create the first Super Admin (securely)
1. *Authentication → Users → Add user → Create new user*: enter email + strong password, tick **Auto Confirm User**.
2. Copy the new user's **UID**, then in the SQL Editor run:
   ```sql
   insert into public.admin_profiles (id, full_name, role)
   values ('<PASTE-UID-HERE>', 'Your Name', 'super_admin');

   insert into public.admin_profiles (id, full_name, role)
   values ('4567af6a-db15-4aa7-9ea6-08bdd333bdc0', 'Kalyan', 'super_admin');
   ```
No password is ever stored in the repo and there is no default account.

### 3.6 Storage
Migration `0002` creates the bucket. Upload logo, banner and artwork from **Event settings** in the app (PNG/JPG/WebP, ≤5 MB). The bucket is public-read because these images appear on public e-pass pages.

### 3.7 Deploy the `create-admin` Edge Function (lets Super Admins add more admins from the app)
```powershell
supabase login
supabase link --project-ref <ref>
supabase functions deploy create-admin
```
Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into functions automatically — do not copy them anywhere. If you skip this step, create additional admins manually (3.5) and manage role/active state in the **Admins** page.

### 3.8 First event
Sign in → **Event settings**: create the event (name, price, date, location, branding). Then **Register** a test pass.

---

## 4. Deploy to Cloudflare Pages

1. Push this folder to a GitHub repository (`.env` / `.env.local` are git-ignored).
2. Cloudflare dashboard → *Workers & Pages → Create → Pages → Connect to Git* → pick the repo.
3. Build settings: **Framework preset:** Vite · **Build command:** `npm run build` · **Build output directory:** `dist` · Node 20+.
4. *Environment variables* (Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally `VITE_PUBLIC_SITE_URL`.
5. Deploy. Add your custom domain under *Custom domains* and put the same URL in Supabase *Authentication → URL Configuration*.

**SPA routing:** the repo has no `404.html`, so Cloudflare Pages automatically serves `index.html` for unknown paths — `/ticket/<token>`, `/admin/...` and refreshes all work. (Do not add a `404.html` or a `_redirects` catch-all.)

Optional CLI deploy: `npm run build && npx wrangler pages deploy dist` (see `wrangler.toml`).

---

## 5. Test the production app (do this before the event day)

Use two phones/laptops, signed in as different admins.
1. Sign in as Super Admin → Event settings saved, images uploaded.
2. Register `Test Visitor` with 3 physical + 2 online → serials continue from the previous number; the "WRITE THESE SERIAL NUMBERS" box lists the 3 physical ones.
3. Download an online pass as PNG and PDF; check Telugu text and that the QR scans with a phone camera (it should open `/ticket/<token>`).
4. Click the WhatsApp button → WhatsApp opens with the prefilled message (attach the PNG/PDF by hand).
5. Open the ticket URL in a private window (not signed in) → pass is shown; no mobile/payment data anywhere.
6. Scanner as an Entry Admin: scan → *Valid* → **Mark as entered** → green screen. Scan again → *Already entered* with the time.
7. Cancel a ticket (with a reason) → public page shows *Cancelled*; scanner rejects it.
8. Two admins register at the same moment → no duplicate or overlapping serials. (Automated: `tests/concurrency.live.mjs`, below.)
9. Reports → export all four CSVs and open them in Excel. **Keep a CSV backup before and after the event.**
10. Check the scanner on the real event phones, on the venue's mobile data. Camera access requires HTTPS.

### Automated tests
```powershell
npm test
```
Runs the **real migration** in an in-process Postgres (PGlite) and checks: sequential serials, rollback of the whole batch (incl. counter) on failure, idempotent double submit, validation errors, authorization per role, RLS (no direct writes, anon reads nothing), cancellation rules, atomic check-in and the immutable entry log, public ticket data minimisation, search, and dashboard numbers.

Real parallelism (many admins at once) cannot be exercised in PGlite's single connection, so run this against your Supabase project (creates 20 `CONCURRENCY TEST` registrations — cancel them afterwards):
```powershell
$env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_ANON_KEY="<anon>"; $env:EVENT_ID="<event uuid>"
$env:REG_ADMIN_1_EMAIL="..."; $env:REG_ADMIN_1_PASSWORD="..."   # two registration admins
$env:REG_ADMIN_2_EMAIL="..."; $env:REG_ADMIN_2_PASSWORD="..."
$env:ENTRY_ADMIN_EMAIL="..."; $env:ENTRY_ADMIN_PASSWORD="..."
node tests/concurrency.live.mjs
```

---

## 6. Project layout

```
supabase/migrations/0001_schema.sql   tables, RLS, functions (register_batch, confirm_entry, cancel_ticket, …)
supabase/migrations/0002_storage.sql  event-assets bucket + policies
supabase/functions/create-admin/      Edge Function (service role, server side)
src/lib/                              api (RPC wrappers), schemas (zod), epass (PNG/PDF/QR), whatsapp, export (CSV)
src/components/epass/                 EpassCard (online/physical/batch templates), TicketList (share/download/cancel)
src/pages/                            Dashboard, Register, Registrations, Tickets, Scanner, Entries, Reports, Settings, Admins, PublicTicket
tests/                                db.test.ts (PGlite), concurrency.live.mjs (real Supabase)
```

---

## 7. Known limitations

- **WhatsApp:** Click-to-Chat only pre-fills text. It cannot attach the PNG/PDF; admins download and attach manually. The app records that sharing was *initiated* — it can never confirm delivery (no WhatsApp API in V1).
- **Not verified against a live Supabase project:** the SQL is tested in PGlite (real Postgres engine, with a small shim for `auth.uid()`/roles), and the frontend type-checks and builds, but the full browser ⇄ Supabase workflow, camera scanning on real phones, and the deployed Cloudflare build could not be exercised in the development environment. Follow section 5 before the event.
- **Concurrency** is guaranteed by row locks in the database design; the parallel test must be run against a real project (section 5).
- **Public page abuse:** tokens are 192-bit so guessing is infeasible, but Supabase RPC has no per-IP rate limit by default; add Cloudflare rate limiting rules on the Supabase URL if you expect scraping.
- **PDF serial list** uses a built-in Latin font, so non-Latin customer names print as `?` in that list PDF only (the on-screen list and e-pass images render Telugu correctly via Noto Sans Telugu).
- **Time zone:** the dashboard's per-day chart groups days in `Asia/Kolkata`.
- **Last Super Admin:** nothing prevents deactivating other Super Admins; the UI blocks changing your own role/status.
- Event artwork on passes loads cross-origin from Supabase Storage (CORS is open on public buckets). If an image fails to load, PNG/PDF export shows a clear error instead of producing a broken pass.
- No online payment gateway (by design for V1); payments are recorded manually (cash / UPI / other).
- Bundle: the dashboard chunk includes Recharts (~420 kB, ~120 kB gzipped) and is only loaded on that page.
