-- =====================================================================
-- Event Pass Management System - core schema, RLS and functions
-- Run in the Supabase SQL editor (or `supabase db push`).
-- All writes to registrations / tickets / payments / entry_logs happen
-- through SECURITY DEFINER functions that check the caller's role.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.admin_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) > 0),
  role        text not null check (role in ('super_admin','registration_admin','entry_admin','report_viewer')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_admin_profiles_updated before update on public.admin_profiles
  for each row execute function public.set_updated_at();

create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) > 0),
  description        text,
  event_date         timestamptz,
  location           text,
  price              numeric(10,2) not null default 0 check (price >= 0),
  logo_url           text,
  banner_url         text,
  invitation_art_url text,
  contact_details    text,
  ticket_settings    jsonb not null default '{}'::jsonb,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- only one "current" event at a time
create unique index events_single_active on public.events ((true)) where is_active;
create trigger trg_events_updated before update on public.events
  for each row execute function public.set_updated_at();

-- Counter row per event. Locked FOR UPDATE inside register_batch, which is
-- what makes serial numbers gap-free per batch and race-free across admins.
-- Cancelled serials are never reused because the counter only moves forward.
create table public.event_counters (
  event_id          uuid primary key references public.events(id) on delete cascade,
  last_serial       integer not null default 0 check (last_serial >= 0),
  last_registration integer not null default 0 check (last_registration >= 0)
);

create table public.registrations (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id),
  reg_number        integer not null check (reg_number > 0),
  reg_code          text generated always as ('REG-' || lpad(reg_number::text, 4, '0')) stored,
  customer_name     text not null check (length(trim(customer_name)) > 0),
  mobile            text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  email             text,
  notes             text,
  physical_qty      integer not null default 0 check (physical_qty >= 0),
  online_qty        integer not null default 0 check (online_qty >= 0),
  total_qty         integer generated always as (physical_qty + online_qty) stored,
  unit_price        numeric(10,2) not null check (unit_price >= 0),
  total_amount      numeric(12,2) not null check (total_amount >= 0),
  amount_received   numeric(12,2) not null default 0 check (amount_received >= 0),
  balance           numeric(12,2) generated always as (total_amount - amount_received) stored,
  payment_type      text not null check (payment_type in ('cash','upi','other')),
  client_request_id uuid,
  created_by        uuid not null references public.admin_profiles(id),
  created_at        timestamptz not null default now(),
  constraint registrations_qty_positive check (physical_qty + online_qty > 0),
  constraint registrations_qty_max check (physical_qty + online_qty <= 200),
  constraint registrations_not_overpaid check (amount_received <= total_amount),
  constraint registrations_event_number_uq unique (event_id, reg_number),
  constraint registrations_request_uq unique (client_request_id)
);
create index registrations_event_created_idx on public.registrations (event_id, created_at desc);
create index registrations_mobile_trgm on public.registrations using gin (mobile extensions.gin_trgm_ops);
create index registrations_name_trgm on public.registrations using gin (customer_name extensions.gin_trgm_ops);

create table public.tickets (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references public.events(id),
  registration_id         uuid not null references public.registrations(id),
  serial_number           integer not null check (serial_number > 0),
  pass_type               text not null check (pass_type in ('physical','online')),
  qr_token                text not null,
  status                  text not null default 'valid' check (status in ('valid','cancelled')),
  cancel_reason           text,
  cancelled_at            timestamptz,
  cancelled_by            uuid references public.admin_profiles(id),
  entry_status            text not null default 'not_entered' check (entry_status in ('not_entered','entered')),
  entry_time              timestamptz,
  checked_in_by           uuid references public.admin_profiles(id),
  invitation_generated_at timestamptz,
  shared_at               timestamptz,
  last_shared_at          timestamptz,
  share_count             integer not null default 0 check (share_count >= 0),
  created_at              timestamptz not null default now(),
  constraint tickets_event_serial_uq unique (event_id, serial_number),
  constraint tickets_qr_token_uq unique (qr_token),
  constraint tickets_cancel_consistent check (
    (status = 'cancelled' and cancelled_at is not null and cancel_reason is not null)
    or (status = 'valid' and cancelled_at is null)),
  constraint tickets_entry_consistent check (
    (entry_status = 'entered' and entry_time is not null and checked_in_by is not null)
    or (entry_status = 'not_entered' and entry_time is null)),
  constraint tickets_not_both check (not (status = 'cancelled' and entry_status = 'entered'))
);
create index tickets_registration_idx on public.tickets (registration_id);
create index tickets_event_status_idx on public.tickets (event_id, status, entry_status);
create index tickets_event_pass_idx on public.tickets (event_id, pass_type);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id),
  event_id        uuid not null references public.events(id),
  payment_type    text not null check (payment_type in ('cash','upi','other')),
  amount          numeric(12,2) not null check (amount > 0),
  description     text,
  created_by      uuid not null references public.admin_profiles(id),
  created_at      timestamptz not null default now()
);
create index payments_registration_idx on public.payments (registration_id);
create index payments_event_type_idx on public.payments (event_id, payment_type);

create table public.entry_logs (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id),
  event_id   uuid not null references public.events(id),
  admin_id   uuid not null references public.admin_profiles(id),
  result     text not null check (result in ('entered','already_entered','cancelled')),
  created_at timestamptz not null default now()
);
create index entry_logs_ticket_idx on public.entry_logs (ticket_id);
create index entry_logs_event_created_idx on public.entry_logs (event_id, created_at desc);

-- entry_logs are an immutable audit trail
create or replace function public.entry_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'entry_logs are immutable';
end $$;
create trigger trg_entry_logs_no_update before update or delete on public.entry_logs
  for each row execute function public.entry_logs_immutable();

-- issued tickets and registrations can never be deleted
create or replace function public.forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception '% records cannot be deleted', tg_table_name;
end $$;
create trigger trg_tickets_no_delete before delete on public.tickets
  for each row execute function public.forbid_delete();
create trigger trg_registrations_no_delete before delete on public.registrations
  for each row execute function public.forbid_delete();
create trigger trg_payments_no_delete before delete on public.payments
  for each row execute function public.forbid_delete();

-- ---------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they can read admin_profiles under RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_admin_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.admin_profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_admin_role() = any(roles), false)
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.admin_profiles enable row level security;
alter table public.events         enable row level security;
alter table public.event_counters enable row level security;
alter table public.registrations  enable row level security;
alter table public.tickets        enable row level security;
alter table public.payments       enable row level security;
alter table public.entry_logs     enable row level security;

-- admin_profiles
create policy admin_profiles_select on public.admin_profiles for select to authenticated
  using (id = auth.uid() or public.has_role('super_admin'));
create policy admin_profiles_update on public.admin_profiles for update to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

-- events: every active admin can read, only super admin can write
create policy events_select on public.events for select to authenticated
  using (public.current_admin_role() is not null);
create policy events_insert on public.events for insert to authenticated
  with check (public.has_role('super_admin'));
create policy events_update on public.events for update to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

-- event_counters: no policies => no direct access at all (functions only)

-- registrations / payments: read by roles that handle money or reports
create policy registrations_select on public.registrations for select to authenticated
  using (public.has_role('super_admin','registration_admin','report_viewer'));
create policy payments_select on public.payments for select to authenticated
  using (public.has_role('super_admin','registration_admin','report_viewer'));

-- tickets: entry admins also need to read tickets
create policy tickets_select on public.tickets for select to authenticated
  using (public.has_role('super_admin','registration_admin','entry_admin','report_viewer'));

-- entry_logs: read only
create policy entry_logs_select on public.entry_logs for select to authenticated
  using (public.has_role('super_admin','entry_admin','report_viewer'));

-- Table privileges: nothing for anon; read-only for authenticated except
-- the two tables super admins edit directly.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.admin_profiles, public.events, public.registrations,
  public.tickets, public.payments, public.entry_logs to authenticated;
grant insert, update on public.events to authenticated;
grant update (full_name, role, is_active) on public.admin_profiles to authenticated;

-- ---------------------------------------------------------------------
-- Internal functions (not callable through the API)
-- ---------------------------------------------------------------------
create or replace function public.generate_qr_token() returns text
language sql volatile set search_path = public, extensions as $$
  select encode(extensions.gen_random_bytes(24), 'hex')
$$;

-- Allocates p_count consecutive serial numbers for an event and returns the
-- first one. Takes a row lock on event_counters, so concurrent transactions
-- queue up and each receives a disjoint, gap-free range. Must run inside the
-- caller's transaction: if that transaction rolls back, the counter does too.
create or replace function public.allocate_serials(p_event_id uuid, p_count integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_first integer;
begin
  if p_count is null or p_count < 1 then
    raise exception 'invalid_quantity';
  end if;
  insert into public.event_counters(event_id) values (p_event_id) on conflict do nothing;
  update public.event_counters
     set last_serial = last_serial + p_count
   where event_id = p_event_id
  returning last_serial - p_count + 1 into v_first;
  if v_first is null then
    raise exception 'serial_generation_failed';
  end if;
  return v_first;
end $$;

create or replace function public.registration_json(p_registration_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(r) - 'client_request_id' || jsonb_build_object(
    'tickets', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.serial_number)
      from public.tickets t where t.registration_id = r.id), '[]'::jsonb))
  from public.registrations r where r.id = p_registration_id
$$;

revoke execute on function public.allocate_serials(uuid, integer) from public, anon, authenticated;
revoke execute on function public.registration_json(uuid) from public, anon, authenticated;
revoke execute on function public.generate_qr_token() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- register_batch: one registration + N ticket rows, all-or-nothing
-- ---------------------------------------------------------------------
create or replace function public.register_batch(
  p_event_id            uuid,
  p_customer_name       text,
  p_mobile              text,
  p_email               text,
  p_notes               text,
  p_physical            integer,
  p_online              integer,
  p_payment_type        text,
  p_amount_received     numeric,
  p_payment_description text,
  p_request_id          uuid
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid       uuid := auth.uid();
  v_event     public.events%rowtype;
  v_mobile    text;
  v_total     integer;
  v_due       numeric(12,2);
  v_received  numeric(12,2) := coalesce(p_amount_received, 0);
  v_reg_no    integer;
  v_first     integer;
  v_reg_id    uuid;
  v_existing  public.registrations%rowtype;
begin
  if not public.has_role('super_admin','registration_admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- validation
  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'invalid_name';
  end if;
  v_mobile := regexp_replace(coalesce(p_mobile, ''), '[^0-9]', '', 'g');
  if length(v_mobile) = 12 and left(v_mobile, 2) = '91' then v_mobile := substr(v_mobile, 3); end if;
  if length(v_mobile) = 11 and left(v_mobile, 1) = '0' then v_mobile := substr(v_mobile, 2); end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    raise exception 'invalid_mobile';
  end if;
  if p_email is not null and length(trim(p_email)) > 0 and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if coalesce(p_physical, -1) < 0 or coalesce(p_online, -1) < 0 then
    raise exception 'invalid_quantity';
  end if;
  v_total := p_physical + p_online;
  if v_total < 1 then raise exception 'zero_quantity'; end if;
  if v_total > 200 then raise exception 'quantity_too_large'; end if;
  if p_payment_type is null or p_payment_type not in ('cash','upi','other') then
    raise exception 'invalid_payment_type';
  end if;
  if v_received < 0 then raise exception 'invalid_payment_amount'; end if;

  select * into v_event from public.events where id = p_event_id and is_active;
  if not found then raise exception 'event_not_found'; end if;

  v_due := v_total * v_event.price;
  if v_received > v_due then raise exception 'overpayment'; end if;

  -- Serialise on the per-event counter row. Everything below happens under
  -- this lock, so two admins can never receive overlapping serial ranges and
  -- a retried request id is re-checked only after the first one committed.
  insert into public.event_counters(event_id) values (p_event_id) on conflict do nothing;
  perform 1 from public.event_counters where event_id = p_event_id for update;

  if p_request_id is not null then
    select * into v_existing from public.registrations where client_request_id = p_request_id;
    if found then
      if v_existing.created_by <> v_uid then raise exception 'not_authorized' using errcode = '42501'; end if;
      return public.registration_json(v_existing.id) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  update public.event_counters
     set last_registration = last_registration + 1
   where event_id = p_event_id
  returning last_registration into v_reg_no;

  v_first := public.allocate_serials(p_event_id, v_total);

  insert into public.registrations(
    event_id, reg_number, customer_name, mobile, email, notes, physical_qty, online_qty,
    unit_price, total_amount, amount_received, payment_type, client_request_id, created_by)
  values (
    p_event_id, v_reg_no, trim(p_customer_name), v_mobile, nullif(trim(coalesce(p_email,'')), ''),
    nullif(trim(coalesce(p_notes,'')), ''), p_physical, p_online,
    v_event.price, v_due, v_received, p_payment_type, p_request_id, v_uid)
  returning id into v_reg_id;

  insert into public.tickets(event_id, registration_id, serial_number, pass_type, qr_token)
  select p_event_id, v_reg_id, v_first + (n - 1),
         case when n <= p_physical then 'physical' else 'online' end,
         public.generate_qr_token()
  from generate_series(1, v_total) as n;

  if v_received > 0 then
    insert into public.payments(registration_id, event_id, payment_type, amount, description, created_by)
    values (v_reg_id, p_event_id, p_payment_type, v_received, nullif(trim(coalesce(p_payment_description,'')), ''), v_uid);
  end if;

  return public.registration_json(v_reg_id) || jsonb_build_object('duplicate', false);
end $$;

-- ---------------------------------------------------------------------
-- add_payment: record a further payment against a registration
-- ---------------------------------------------------------------------
create or replace function public.add_payment(
  p_registration_id uuid, p_payment_type text, p_amount numeric, p_description text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reg public.registrations%rowtype;
begin
  if not public.has_role('super_admin','registration_admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_payment_type is null or p_payment_type not in ('cash','upi','other') then
    raise exception 'invalid_payment_type';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_payment_amount'; end if;

  select * into v_reg from public.registrations where id = p_registration_id for update;
  if not found then raise exception 'registration_not_found'; end if;
  if p_amount > v_reg.balance then raise exception 'overpayment'; end if;

  insert into public.payments(registration_id, event_id, payment_type, amount, description, created_by)
  values (v_reg.id, v_reg.event_id, p_payment_type, p_amount, nullif(trim(coalesce(p_description,'')), ''), auth.uid());

  update public.registrations set amount_received = amount_received + p_amount where id = v_reg.id;
  return public.registration_json(v_reg.id);
end $$;

-- ---------------------------------------------------------------------
-- cancel_ticket: cancels one ticket; the serial is never reused
-- ---------------------------------------------------------------------
create or replace function public.cancel_ticket(p_ticket_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if not public.has_role('super_admin','registration_admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'reason_required';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then raise exception 'ticket_not_found'; end if;
  if v_ticket.status = 'cancelled' then raise exception 'already_cancelled'; end if;
  if v_ticket.entry_status = 'entered' then raise exception 'already_entered'; end if;

  update public.tickets
     set status = 'cancelled', cancel_reason = trim(p_reason),
         cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_ticket_id;
  return to_jsonb((select t from public.tickets t where t.id = p_ticket_id));
end $$;

-- ---------------------------------------------------------------------
-- Scanner: read-only lookup, then atomic check-in
-- ---------------------------------------------------------------------
create or replace function public.scan_payload(p_ticket public.tickets) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_reg public.registrations%rowtype;
  v_ev  public.events%rowtype;
  v_by  text;
  v_out jsonb;
begin
  select * into v_reg from public.registrations where id = p_ticket.registration_id;
  select * into v_ev from public.events where id = p_ticket.event_id;
  select full_name into v_by from public.admin_profiles where id = p_ticket.checked_in_by;
  v_out := jsonb_build_object(
    'ticket_id', p_ticket.id,
    'serial_number', p_ticket.serial_number,
    'pass_type', p_ticket.pass_type,
    'status', p_ticket.status,
    'cancel_reason', p_ticket.cancel_reason,
    'entry_status', p_ticket.entry_status,
    'entry_time', p_ticket.entry_time,
    'checked_in_by_name', v_by,
    'customer_name', v_reg.customer_name,
    'registration_code', v_reg.reg_code,
    'event_name', v_ev.name);
  -- payment details only for roles that are allowed to see money
  if public.has_role('super_admin') then
    v_out := v_out || jsonb_build_object(
      'payment_status', case when v_reg.balance = 0 then 'paid'
                             when v_reg.amount_received = 0 then 'unpaid' else 'partial' end,
      'balance', v_reg.balance);
  end if;
  return v_out;
end $$;
revoke execute on function public.scan_payload(public.tickets) from public, anon, authenticated;

create or replace function public.lookup_ticket(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.tickets%rowtype;
  v_result text;
begin
  if not public.has_role('super_admin','entry_admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_ticket from public.tickets where qr_token = trim(coalesce(p_token, ''));
  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;
  v_result := case when v_ticket.status = 'cancelled' then 'cancelled'
                   when v_ticket.entry_status = 'entered' then 'already_entered'
                   else 'valid' end;
  return jsonb_build_object('result', v_result, 'ticket', public.scan_payload(v_ticket));
end $$;

create or replace function public.confirm_entry(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ticket public.tickets%rowtype;
  v_uid uuid := auth.uid();
  v_result text;
begin
  if not public.has_role('super_admin','entry_admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- row lock: concurrent scans of the same ticket queue here, the first one
  -- flips entry_status, every later one sees 'entered' and is rejected
  select * into v_ticket from public.tickets
   where qr_token = trim(coalesce(p_token, '')) for update;
  if not found then
    return jsonb_build_object('result', 'invalid');
  end if;

  if v_ticket.status = 'cancelled' then
    v_result := 'cancelled';
  elsif v_ticket.entry_status = 'entered' then
    v_result := 'already_entered';
  else
    update public.tickets
       set entry_status = 'entered', entry_time = now(), checked_in_by = v_uid
     where id = v_ticket.id
    returning * into v_ticket;
    v_result := 'entered';
  end if;

  insert into public.entry_logs(ticket_id, event_id, admin_id, result)
  values (v_ticket.id, v_ticket.event_id, v_uid, v_result);

  return jsonb_build_object('result', v_result, 'ticket', public.scan_payload(v_ticket));
end $$;

-- ---------------------------------------------------------------------
-- Public ticket page: exposes ONLY non-sensitive fields, by token
-- ---------------------------------------------------------------------
create or replace function public.get_public_ticket(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ticket public.tickets%rowtype;
  v_reg    public.registrations%rowtype;
  v_ev     public.events%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return jsonb_build_object('found', false);
  end if;
  select * into v_ticket from public.tickets where qr_token = p_token;
  if not found then return jsonb_build_object('found', false); end if;
  select * into v_reg from public.registrations where id = v_ticket.registration_id;
  select * into v_ev from public.events where id = v_ticket.event_id;
  return jsonb_build_object(
    'found', true,
    'serial_number', v_ticket.serial_number,
    'pass_type', v_ticket.pass_type,
    'status', v_ticket.status,
    'customer_name', v_reg.customer_name,
    'amount', v_reg.unit_price,
    'event', jsonb_build_object(
      'name', v_ev.name, 'description', v_ev.description, 'event_date', v_ev.event_date,
      'location', v_ev.location, 'logo_url', v_ev.logo_url, 'banner_url', v_ev.banner_url,
      'invitation_art_url', v_ev.invitation_art_url, 'contact_details', v_ev.contact_details,
      'ticket_settings', v_ev.ticket_settings));
end $$;
grant execute on function public.get_public_ticket(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Sharing / invitation tracking (we only know sharing was INITIATED)
-- ---------------------------------------------------------------------
create or replace function public.mark_invitation_generated(p_ticket_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('super_admin','registration_admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.tickets set invitation_generated_at = coalesce(invitation_generated_at, now())
   where id = any(p_ticket_ids) and status = 'valid';
end $$;

create or replace function public.mark_shared(p_ticket_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('super_admin','registration_admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.tickets
     set shared_at = coalesce(shared_at, now()), last_shared_at = now(),
         share_count = share_count + 1,
         invitation_generated_at = coalesce(invitation_generated_at, now())
   where id = any(p_ticket_ids) and status = 'valid';
end $$;

-- ---------------------------------------------------------------------
-- create_event: new event becomes the active one
-- ---------------------------------------------------------------------
create or replace function public.create_event(p_name text, p_price numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_role('super_admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.events set is_active = false where is_active;
  insert into public.events(name, price, is_active) values (trim(p_name), coalesce(p_price, 0), true)
  returning id into v_id;
  insert into public.event_counters(event_id) values (v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Search / list functions (SECURITY INVOKER: RLS decides who sees what)
-- ---------------------------------------------------------------------
create or replace function public.search_registrations(
  p_event_id uuid, p_q text default null, p_payment_type text default null,
  p_pass_type text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, reg_code text, customer_name text, mobile text, physical_qty integer, online_qty integer,
  total_qty integer, total_amount numeric, amount_received numeric, balance numeric,
  payment_type text, created_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as term)
  select r.id, r.reg_code, r.customer_name, r.mobile, r.physical_qty, r.online_qty, r.total_qty,
         r.total_amount, r.amount_received, r.balance, r.payment_type, r.created_at,
         count(*) over () as total_count
  from public.registrations r, q
  where r.event_id = p_event_id
    and (q.term is null
         or r.customer_name ilike '%' || q.term || '%'
         or r.mobile like '%' || regexp_replace(q.term, '[^0-9]', '', 'g') || '%' and regexp_replace(q.term, '[^0-9]', '', 'g') <> ''
         or r.reg_code ilike '%' || q.term || '%'
         or (q.term ~ '^[0-9]{1,9}$' and exists (
              select 1 from public.tickets t
               where t.registration_id = r.id and t.serial_number = q.term::integer)))
    and (p_payment_type is null or exists (
          select 1 from public.payments p where p.registration_id = r.id and p.payment_type = p_payment_type)
         or (p_payment_type is not null and r.payment_type = p_payment_type and r.amount_received = 0))
    and (p_pass_type is null
         or (p_pass_type = 'physical' and r.physical_qty > 0)
         or (p_pass_type = 'online' and r.online_qty > 0))
    and (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at < p_to)
  order by r.created_at desc, r.reg_number desc
  limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0)
$$;

create or replace function public.search_tickets(
  p_event_id uuid, p_q text default null, p_pass_type text default null,
  p_filter text default null,  -- entered | not_entered | cancelled | shared | not_shared
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, registration_id uuid, serial_number integer, customer_name text, reg_code text,
  pass_type text, status text, entry_status text, entry_time timestamptz,
  shared_at timestamptz, share_count integer, qr_token text, created_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as term)
  select t.id, t.registration_id, t.serial_number, r.customer_name, r.reg_code,
         t.pass_type, t.status, t.entry_status, t.entry_time, t.shared_at, t.share_count,
         t.qr_token, t.created_at, count(*) over () as total_count
  from public.tickets t
  join public.registrations r on r.id = t.registration_id, q
  where t.event_id = p_event_id
    and (q.term is null
         or (q.term ~ '^[0-9]{1,9}$' and t.serial_number = q.term::integer)
         or r.customer_name ilike '%' || q.term || '%'
         or r.reg_code ilike '%' || q.term || '%'
         or (regexp_replace(q.term, '[^0-9]', '', 'g') <> '' and r.mobile like '%' || regexp_replace(q.term, '[^0-9]', '', 'g') || '%'))
    and (p_pass_type is null or t.pass_type = p_pass_type)
    and (p_filter is null
         or (p_filter = 'entered' and t.entry_status = 'entered')
         or (p_filter = 'not_entered' and t.entry_status = 'not_entered' and t.status = 'valid')
         or (p_filter = 'cancelled' and t.status = 'cancelled')
         or (p_filter = 'shared' and t.shared_at is not null)
         or (p_filter = 'not_shared' and t.shared_at is null and t.status = 'valid'))
    and (p_from is null or t.created_at >= p_from)
    and (p_to is null or t.created_at < p_to)
  order by t.serial_number desc
  limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0)
$$;

create or replace function public.list_entry_logs(
  p_event_id uuid, p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, created_at timestamptz, result text, serial_number integer, pass_type text,
  customer_name text, admin_name text, total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('super_admin','entry_admin','report_viewer') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
  select l.id, l.created_at, l.result, t.serial_number, t.pass_type, r.customer_name,
         a.full_name, count(*) over ()
  from public.entry_logs l
  join public.tickets t on t.id = l.ticket_id
  join public.registrations r on r.id = t.registration_id
  join public.admin_profiles a on a.id = l.admin_id
  where l.event_id = p_event_id
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------
-- Dashboard / report statistics (all numbers computed in the database)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats(
  p_event_id uuid, p_from timestamptz default null, p_to timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.has_role('super_admin','registration_admin','report_viewer') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'registrations', (select count(*) from public.registrations r
                       where r.event_id = p_event_id and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < p_to)),
    'tickets_total', (select count(*) from public.tickets t
                       where t.event_id = p_event_id and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)),
    'tickets_physical', (select count(*) from public.tickets t
                       where t.event_id = p_event_id and t.pass_type = 'physical' and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)),
    'tickets_online', (select count(*) from public.tickets t
                       where t.event_id = p_event_id and t.pass_type = 'online' and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)),
    'tickets_cancelled', (select count(*) from public.tickets t
                       where t.event_id = p_event_id and t.status = 'cancelled' and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)),
    'entered', (select count(*) from public.tickets t
                       where t.event_id = p_event_id and t.entry_status = 'entered' and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)),
    'remaining_valid', (select count(*) from public.tickets t
                       where t.event_id = p_event_id and t.status = 'valid' and t.entry_status = 'not_entered' and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)),
    'invitations_generated', (select count(*) from public.tickets t
                       where t.event_id = p_event_id and t.invitation_generated_at is not null and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)),
    'invitations_shared', (select count(*) from public.tickets t
                       where t.event_id = p_event_id and t.shared_at is not null and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)),
    'expected_amount', (select coalesce(sum(r.total_amount), 0) from public.registrations r
                       where r.event_id = p_event_id and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < p_to)),
    'collected_amount', (select coalesce(sum(p.amount), 0) from public.payments p
                       where p.event_id = p_event_id and (p_from is null or p.created_at >= p_from) and (p_to is null or p.created_at < p_to)),
    'outstanding_amount', (select coalesce(sum(r.balance), 0) from public.registrations r
                       where r.event_id = p_event_id and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < p_to)),
    'cash_amount', (select coalesce(sum(p.amount), 0) from public.payments p
                       where p.event_id = p_event_id and p.payment_type = 'cash' and (p_from is null or p.created_at >= p_from) and (p_to is null or p.created_at < p_to)),
    'upi_amount', (select coalesce(sum(p.amount), 0) from public.payments p
                       where p.event_id = p_event_id and p.payment_type = 'upi' and (p_from is null or p.created_at >= p_from) and (p_to is null or p.created_at < p_to)),
    'other_amount', (select coalesce(sum(p.amount), 0) from public.payments p
                       where p.event_id = p_event_id and p.payment_type = 'other' and (p_from is null or p.created_at >= p_from) and (p_to is null or p.created_at < p_to)),
    'daily', coalesce((
      select jsonb_agg(d order by d.day) from (
        select (r.created_at at time zone 'Asia/Kolkata')::date as day,
               count(*) as registrations, sum(r.total_qty) as tickets
          from public.registrations r
         where r.event_id = p_event_id and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < p_to)
         group by 1 order by 1 desc limit 30) d), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Function privileges: callable by signed-in users only (each function
-- re-checks the caller's role); anon only gets get_public_ticket.
-- ---------------------------------------------------------------------
revoke execute on function
  public.register_batch(uuid,text,text,text,text,integer,integer,text,numeric,text,uuid),
  public.add_payment(uuid,text,numeric,text),
  public.cancel_ticket(uuid,text),
  public.lookup_ticket(text),
  public.confirm_entry(text),
  public.mark_invitation_generated(uuid[]),
  public.mark_shared(uuid[]),
  public.create_event(text,numeric),
  public.search_registrations(uuid,text,text,text,timestamptz,timestamptz,integer,integer),
  public.search_tickets(uuid,text,text,text,timestamptz,timestamptz,integer,integer),
  public.list_entry_logs(uuid,integer,integer),
  public.dashboard_stats(uuid,timestamptz,timestamptz),
  public.current_admin_role(),
  public.has_role(text[])
from public, anon;
grant execute on function
  public.register_batch(uuid,text,text,text,text,integer,integer,text,numeric,text,uuid),
  public.add_payment(uuid,text,numeric,text),
  public.cancel_ticket(uuid,text),
  public.lookup_ticket(text),
  public.confirm_entry(text),
  public.mark_invitation_generated(uuid[]),
  public.mark_shared(uuid[]),
  public.create_event(text,numeric),
  public.search_registrations(uuid,text,text,text,timestamptz,timestamptz,integer,integer),
  public.search_tickets(uuid,text,text,text,timestamptz,timestamptz,integer,integer),
  public.list_entry_logs(uuid,integer,integer),
  public.dashboard_stats(uuid,timestamptz,timestamptz),
  public.current_admin_role(),
  public.has_role(text[])
to authenticated;
