-- Luster cloud schema, v1.
--
-- Rules this schema enforces, not just hopes for:
--   * Every row belongs to one business. Staff only ever see businesses they are members of (row-level security).
--   * A provider can never be double-booked. The database rejects overlapping appointments outright
--     (exclusion constraint), so two clients tapping "Book" in the same second cannot both win.
--   * The public booking page never touches tables directly. It can only call the booking_* functions below,
--     which expose a business's public menu and open times and nothing about its clients.
--   * Health details are readable only through read_client_health(), which records who opened which file.
--   * Changes to clients and appointments are written to audit_log by triggers.

create extension if not exists btree_gist with schema extensions;

-- ===================================================================== types
create type public.member_role as enum ('owner', 'manager', 'front_desk', 'provider');
create type public.appt_status as enum ('booked', 'confirmed', 'checkedin', 'inservice', 'completed', 'cancelled', 'noshow');
create type public.appt_source as enum ('desk', 'online', 'import');

-- ===================================================================== helpers
-- US numbers → +1XXXXXXXXXX; anything else with 8–15 digits → +digits; junk → null.
create or replace function public.norm_phone(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when d is null or length(d) < 8 or length(d) > 15 then null
    when length(d) = 10 then '+1' || d
    when length(d) = 11 and left(d, 1) = '1' then '+' || d
    else '+' || d
  end
  from (select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') as d) x
$$;

-- ===================================================================== tables
create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name        text not null check (length(name) between 1 and 80),
  template_id text not null default 'facial',
  timezone    text not null default 'America/Chicago',
  phone       text,
  email       text,
  address     text,
  -- online booking settings: lead_min, max_days, step_min, cancel_hours, policy, intro
  booking     jsonb not null default '{}'::jsonb,
  is_live     boolean not null default false,       -- false: the booking page says "coming soon"
  created_at  timestamptz not null default now()
);

create table public.members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null,
  staff_id    uuid,
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key         text,                                  -- the app's own id for template staff (s1, s2…)
  name        text not null,
  title       text,
  color       text,
  bio         text,
  bookable    boolean not null default true,         -- takes appointments at all
  online      boolean not null default true,         -- shown on the public booking page
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index staff_business_idx on public.staff (business_id);
create unique index staff_key_idx on public.staff (business_id, key) where key is not null;

-- Weekly hours in the business's local time. Several rows per day = split shifts.
create table public.staff_hours (
  staff_id    uuid not null references public.staff (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  dow         smallint not null check (dow between 0 and 6),          -- 0 = Sunday
  start_min   smallint not null check (start_min between 0 and 1439),
  end_min     smallint not null check (end_min between 1 and 1440),
  check (end_min > start_min),
  primary key (staff_id, dow, start_min)
);

create table public.time_off (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  staff_id    uuid not null references public.staff (id) on delete cascade,
  period      tstzrange not null,
  reason      text
);
create index time_off_staff_idx on public.time_off using gist (staff_id, period);

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  key          text,                                 -- the app's template id (sv_peel…), so safety rules keep working
  category     text not null,
  name         text not null,
  description  text,
  duration_min smallint not null check (duration_min between 5 and 720),
  buffer_min   smallint not null default 0 check (buffer_min between 0 and 120),   -- room turnover after
  price_cents  int not null check (price_cents >= 0),
  online       boolean not null default true,        -- bookable on the public page
  active       boolean not null default true,
  sort         int not null default 0
);
create index services_business_idx on public.services (business_id);
create unique index services_key_idx on public.services (business_id, key) where key is not null;

create table public.staff_services (
  staff_id    uuid not null references public.staff (id) on delete cascade,
  service_id  uuid not null references public.services (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  primary key (staff_id, service_id)
);

create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  first_name       text not null,
  last_name        text not null default '',
  phone            text,
  phone_e164       text generated always as (public.norm_phone(phone)) stored,
  email            text,
  email_lc         text generated always as (lower(email)) stored,
  birthday         date,
  flags            text[] not null default '{}',   -- caution flags (oncology, pregnant, …): every staff role sees these
  tags             text[] not null default '{}',
  notes            text,
  profile          jsonb not null default '{}'::jsonb,   -- non-medical profile: skin type, concerns, preferences
  source           text,
  sms_opt_in       boolean not null default false,
  marketing_opt_in boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz                           -- deleted in the app: hidden everywhere, kept for the record
);
create index clients_business_idx on public.clients (business_id);
create index clients_phone_idx on public.clients (business_id, phone_e164);
create index clients_email_idx on public.clients (business_id, email_lc);

-- Medical history, medications, oncology details, intake answers. No direct access: see read/save_client_health.
create table public.client_health (
  client_id   uuid primary key references public.clients (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  medical     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table public.appointments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  client_id    uuid references public.clients (id) on delete set null,
  staff_id     uuid not null references public.staff (id),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  buffer_min   smallint not null default 0 check (buffer_min between 0 and 120),
  block_end    timestamptz not null,                 -- ends_at + buffer, kept by trigger; what the provider is busy for
  status       public.appt_status not null default 'booked',
  source       public.appt_source not null default 'desk',
  services     jsonb not null default '[]'::jsonb,   -- [{service_id, name, duration_min, price_cents}] as booked
  note         text,
  manage_token uuid not null default gen_random_uuid(),   -- the client's self-service link
  cancelled_at timestamptz,
  cancel_reason text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint no_double_booking exclude using gist (
    staff_id with =,
    tstzrange(starts_at, block_end, '[)') with &&
  ) where (status not in ('cancelled', 'noshow'))
);
create index appointments_business_time_idx on public.appointments (business_id, starts_at);
create index appointments_client_idx on public.appointments (client_id);
create unique index appointments_token_idx on public.appointments (manage_token);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  business_id uuid not null,
  actor       uuid,                 -- the staff user, or null for a client booking online
  action      text not null,        -- insert | update | delete | view
  entity      text not null,
  entity_id   uuid,
  at          timestamptz not null default now(),
  detail      jsonb
);
create index audit_business_idx on public.audit_log (business_id, at desc);

create table public.rate_events (
  key text not null,
  at  timestamptz not null default now()
);
create index rate_events_idx on public.rate_events (key, at);

-- ===================================================================== access helpers
create or replace function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.business_id = b and m.user_id = auth.uid())
$$;

create or replace function public.has_role(b uuid, roles public.member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.business_id = b and m.user_id = auth.uid() and m.role = any (roles))
$$;

-- ===================================================================== triggers
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();

create or replace function public.appointments_block_end() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.block_end := new.ends_at + make_interval(mins => coalesce(new.buffer_min, 0));
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  return new;
end $$;
create trigger appointments_block before insert or update on public.appointments
  for each row execute function public.appointments_block_end();

-- Rows must point at staff / services / clients of the same business (ids alone are not trusted).
create or replace function public.same_business_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'appointments' then
    if not exists (select 1 from staff s where s.id = new.staff_id and s.business_id = new.business_id) then
      raise exception 'staff does not belong to this business' using errcode = '42501';
    end if;
    if new.client_id is not null and not exists (select 1 from clients c where c.id = new.client_id and c.business_id = new.business_id) then
      raise exception 'client does not belong to this business' using errcode = '42501';
    end if;
  elsif tg_table_name in ('staff_hours', 'time_off') then
    if not exists (select 1 from staff s where s.id = new.staff_id and s.business_id = new.business_id) then
      raise exception 'staff does not belong to this business' using errcode = '42501';
    end if;
  elsif tg_table_name = 'staff_services' then
    if not exists (select 1 from staff s where s.id = new.staff_id and s.business_id = new.business_id)
       or not exists (select 1 from services v where v.id = new.service_id and v.business_id = new.business_id) then
      raise exception 'staff or service does not belong to this business' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger appointments_guard before insert or update on public.appointments for each row execute function public.same_business_guard();
create trigger staff_hours_guard before insert or update on public.staff_hours for each row execute function public.same_business_guard();
create trigger time_off_guard before insert or update on public.time_off for each row execute function public.same_business_guard();
create trigger staff_services_guard before insert or update on public.staff_services for each row execute function public.same_business_guard();

-- Audit: who changed what. Updates store only the changed columns.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, n.value) into d
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at', 'block_end') and (to_jsonb(old) -> n.key) is distinct from n.value;
    if d is null then return new; end if;
  elsif tg_op = 'INSERT' then d := to_jsonb(new) - 'definition';
  else d := to_jsonb(old) - 'definition';
  end if;
  insert into audit_log (business_id, actor, action, entity, entity_id, detail)
  values (coalesce(new.business_id, old.business_id), auth.uid(), lower(tg_op), tg_table_name, coalesce(new.id, old.id), d);
  return coalesce(new, old);
end $$;
create trigger clients_audit after insert or update or delete on public.clients for each row execute function public.audit_row();
create trigger appointments_audit after insert or update or delete on public.appointments for each row execute function public.audit_row();

-- ===================================================================== row-level security
alter table public.businesses     enable row level security;
alter table public.members        enable row level security;
alter table public.staff          enable row level security;
alter table public.staff_hours    enable row level security;
alter table public.time_off       enable row level security;
alter table public.services       enable row level security;
alter table public.staff_services enable row level security;
alter table public.clients        enable row level security;
alter table public.client_health  enable row level security;   -- no policies: functions only
alter table public.appointments   enable row level security;
alter table public.audit_log      enable row level security;
alter table public.rate_events    enable row level security;   -- no policies: functions only

create policy businesses_read  on public.businesses for select to authenticated using (public.is_member(id));
create policy businesses_write on public.businesses for update to authenticated
  using (public.has_role(id, '{owner,manager}')) with check (public.has_role(id, '{owner,manager}'));

create policy members_read on public.members for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role(business_id, '{owner}'));

-- catalog: every member reads; owners and managers change it
create policy staff_read  on public.staff for select to authenticated using (public.is_member(business_id));
create policy staff_write on public.staff for all to authenticated
  using (public.has_role(business_id, '{owner,manager}')) with check (public.has_role(business_id, '{owner,manager}'));
create policy hours_read  on public.staff_hours for select to authenticated using (public.is_member(business_id));
create policy hours_write on public.staff_hours for all to authenticated
  using (public.has_role(business_id, '{owner,manager}')) with check (public.has_role(business_id, '{owner,manager}'));
create policy timeoff_read  on public.time_off for select to authenticated using (public.is_member(business_id));
create policy timeoff_write on public.time_off for all to authenticated
  using (public.has_role(business_id, '{owner,manager}')) with check (public.has_role(business_id, '{owner,manager}'));
create policy services_read  on public.services for select to authenticated using (public.is_member(business_id));
create policy services_write on public.services for all to authenticated
  using (public.has_role(business_id, '{owner,manager}')) with check (public.has_role(business_id, '{owner,manager}'));
create policy ss_read  on public.staff_services for select to authenticated using (public.is_member(business_id));
create policy ss_write on public.staff_services for all to authenticated
  using (public.has_role(business_id, '{owner,manager}')) with check (public.has_role(business_id, '{owner,manager}'));

-- clients and appointments: every member works with them; only owners delete clients; nobody deletes appointments (cancel instead)
create policy clients_read   on public.clients for select to authenticated using (public.is_member(business_id));
create policy clients_insert on public.clients for insert to authenticated with check (public.is_member(business_id));
create policy clients_update on public.clients for update to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy clients_delete on public.clients for delete to authenticated using (public.has_role(business_id, '{owner}'));

create policy appts_read   on public.appointments for select to authenticated using (public.is_member(business_id));
create policy appts_insert on public.appointments for insert to authenticated with check (public.is_member(business_id));
create policy appts_update on public.appointments for update to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));

create policy audit_read on public.audit_log for select to authenticated using (public.has_role(business_id, '{owner}'));

-- the public (anon) role gets no table access at all
revoke all on all tables in schema public from anon;

-- ===================================================================== staff functions
create or replace function public.create_business(
  p_name text, p_slug text, p_template text default 'facial', p_timezone text default 'America/Chicago',
  p_phone text default null, p_email text default null, p_address text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  perform now() at time zone p_timezone;   -- rejects an unknown time zone
  insert into businesses (name, slug, template_id, timezone, phone, email, address, booking)
  values (btrim(p_name), lower(btrim(p_slug)), coalesce(p_template, 'facial'), p_timezone, p_phone, p_email, p_address,
          jsonb_build_object('lead_min', 120, 'max_days', 60, 'step_min', 15, 'cancel_hours', 24,
                             'policy', 'Please give us 24 hours'' notice to cancel or reschedule.'))
  returning id into v_id;
  insert into members (business_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
exception when unique_violation then
  raise exception 'That booking link is taken. Try another name.' using errcode = '23505';
end $$;

-- Replaces the business's menu, team and hours with what the app sends. Staff and services that disappear are
-- deactivated, never deleted, so past appointments keep pointing at them.
-- p_catalog: { staff: [{id, key, name, title, color, bio, bookable, online, sort, hours: [{dow, start_min, end_min}], services: [service ids]}],
--              services: [{id, key, category, name, description, duration_min, buffer_min, price_cents, online, sort}] }
create or replace function public.sync_catalog(p_business uuid, p_catalog jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_staff jsonb; v_svc jsonb; n_staff int := 0; n_svc int := 0;
begin
  if not public.has_role(p_business, '{owner,manager}') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- an id that already belongs to another business is refused outright
  if exists (select 1 from jsonb_array_elements(coalesce(p_catalog -> 'services', '[]')) e join services v on v.id = (e ->> 'id')::uuid where v.business_id <> p_business)
     or exists (select 1 from jsonb_array_elements(coalesce(p_catalog -> 'staff', '[]')) e join staff s on s.id = (e ->> 'id')::uuid where s.business_id <> p_business) then
    raise exception 'id belongs to another business' using errcode = '42501';
  end if;

  for v_svc in select * from jsonb_array_elements(coalesce(p_catalog -> 'services', '[]')) loop
    insert into services (id, business_id, key, category, name, description, duration_min, buffer_min, price_cents, online, active, sort)
    values ((v_svc ->> 'id')::uuid, p_business, v_svc ->> 'key', v_svc ->> 'category', v_svc ->> 'name', v_svc ->> 'description',
            (v_svc ->> 'duration_min')::int, coalesce((v_svc ->> 'buffer_min')::int, 0), (v_svc ->> 'price_cents')::int,
            coalesce((v_svc ->> 'online')::boolean, true), true, coalesce((v_svc ->> 'sort')::int, 0))
    on conflict (id) do update set key = excluded.key, category = excluded.category, name = excluded.name, description = excluded.description,
      duration_min = excluded.duration_min, buffer_min = excluded.buffer_min, price_cents = excluded.price_cents,
      online = excluded.online, active = true, sort = excluded.sort;
    n_svc := n_svc + 1;
  end loop;
  update services set active = false
   where business_id = p_business
     and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(p_catalog -> 'services', '[]')) e);

  for v_staff in select * from jsonb_array_elements(coalesce(p_catalog -> 'staff', '[]')) loop
    insert into staff (id, business_id, key, name, title, color, bio, bookable, online, active, sort)
    values ((v_staff ->> 'id')::uuid, p_business, v_staff ->> 'key', v_staff ->> 'name', v_staff ->> 'title', v_staff ->> 'color', v_staff ->> 'bio',
            coalesce((v_staff ->> 'bookable')::boolean, true), coalesce((v_staff ->> 'online')::boolean, true), true,
            coalesce((v_staff ->> 'sort')::int, 0))
    on conflict (id) do update set key = excluded.key, name = excluded.name, title = excluded.title, color = excluded.color, bio = excluded.bio,
      bookable = excluded.bookable, online = excluded.online, active = true, sort = excluded.sort;
    delete from staff_hours where staff_id = (v_staff ->> 'id')::uuid;
    insert into staff_hours (staff_id, business_id, dow, start_min, end_min)
    select (v_staff ->> 'id')::uuid, p_business, (h ->> 'dow')::int, (h ->> 'start_min')::int, (h ->> 'end_min')::int
    from jsonb_array_elements(coalesce(v_staff -> 'hours', '[]')) h;
    delete from staff_services where staff_id = (v_staff ->> 'id')::uuid;
    insert into staff_services (staff_id, service_id, business_id)
    select (v_staff ->> 'id')::uuid, (sid #>> '{}')::uuid, p_business
    from jsonb_array_elements(coalesce(v_staff -> 'services', '[]')) sid
    where exists (select 1 from services v where v.id = (sid #>> '{}')::uuid and v.business_id = p_business);
    n_staff := n_staff + 1;
  end loop;
  update staff set active = false
   where business_id = p_business
     and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(coalesce(p_catalog -> 'staff', '[]')) e);

  -- menu section names and order for the public page, e.g. [{key: 'facial', label: 'Facials'}]
  if jsonb_typeof(p_catalog -> 'categories') = 'array' then
    update businesses set booking = booking || jsonb_build_object('categories', p_catalog -> 'categories') where id = p_business;
  end if;
  return jsonb_build_object('ok', true, 'staff', n_staff, 'services', n_svc);
end $$;

create or replace function public.read_client_health(p_client uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_b uuid; v_med jsonb;
begin
  select business_id into v_b from clients where id = p_client;
  if v_b is null or not public.has_role(v_b, '{owner,manager,provider}') then raise exception 'not allowed' using errcode = '42501'; end if;
  select medical into v_med from client_health where client_id = p_client;
  insert into audit_log (business_id, actor, action, entity, entity_id) values (v_b, auth.uid(), 'view', 'client_health', p_client);
  return coalesce(v_med, '{}'::jsonb);
end $$;

create or replace function public.save_client_health(p_client uuid, p_medical jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_b uuid; v_keys text[];
begin
  select business_id into v_b from clients where id = p_client;
  if v_b is null or not public.has_role(v_b, '{owner,manager,provider}') then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into client_health (client_id, business_id, medical, updated_at, updated_by)
  values (p_client, v_b, coalesce(p_medical, '{}'), now(), auth.uid())
  on conflict (client_id) do update set medical = excluded.medical, updated_at = now(), updated_by = auth.uid();
  select array_agg(k) into v_keys from jsonb_object_keys(coalesce(p_medical, '{}')) k;
  -- the log records which sections changed, never the medical content itself
  insert into audit_log (business_id, actor, action, entity, entity_id, detail)
  values (v_b, auth.uid(), 'update', 'client_health', p_client, jsonb_build_object('sections', coalesce(to_jsonb(v_keys), '[]')));
end $$;

-- ===================================================================== public booking functions (anon)
-- The studio's public page: name, contact, policy, menu, team. Nothing about clients.
create or replace function public.booking_profile(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b businesses;
begin
  select * into b from businesses where slug = lower(p_slug);
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object(
    'ok', true, 'live', b.is_live, 'slug', b.slug, 'name', b.name, 'template_id', b.template_id, 'timezone', b.timezone,
    'phone', b.phone, 'email', b.email, 'address', b.address,
    'policy', b.booking ->> 'policy', 'intro', b.booking ->> 'intro', 'accent', b.booking ->> 'accent',
    'categories', coalesce(b.booking -> 'categories', '[]'::jsonb),
    'cancel_hours', coalesce((b.booking ->> 'cancel_hours')::int, 24),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'category', v.category, 'name', v.name, 'description', v.description,
                                                               'duration_min', v.duration_min, 'price_cents', v.price_cents) order by v.sort, v.name)
                          from services v where v.business_id = b.id and v.active and v.online
                            and exists (select 1 from staff_services ss join staff s on s.id = ss.staff_id
                                        where ss.service_id = v.id and s.active and s.bookable and s.online)), '[]'),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'title', s.title, 'bio', s.bio, 'color', s.color,
                                                            'services', (select coalesce(jsonb_agg(ss.service_id), '[]') from staff_services ss where ss.staff_id = s.id)) order by s.sort, s.name)
                       from staff s where s.business_id = b.id and s.active and s.bookable and s.online), '[]')
  );
end $$;

-- Open start times for a set of services, per day, in the studio's own time zone.
-- Result: {ok, timezone, duration_min, days: [{date: 'YYYY-MM-DD', slots: [{time: 'HH:MM', at: timestamptz, staff: [ids]}]}]}
create or replace function public.booking_slots(p_slug text, p_service_ids uuid[], p_staff_id uuid default null, p_from date default null, p_days int default 14)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b businesses; v_dur int; v_buf int; v_n int; v_step int; v_lead int; v_max int;
  v_today date; v_from date; v_to date; v_days jsonb;
begin
  select * into b from businesses where slug = lower(p_slug);
  if not found or not b.is_live then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if p_service_ids is null or cardinality(p_service_ids) = 0 or cardinality(p_service_ids) > 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_service');
  end if;
  select sum(duration_min), coalesce(max(buffer_min), 0), count(*) into v_dur, v_buf, v_n
  from services where id = any (p_service_ids) and business_id = b.id and active and online;
  if v_n <> cardinality(p_service_ids) then return jsonb_build_object('ok', false, 'reason', 'bad_service'); end if;

  v_step  := greatest(5, coalesce((b.booking ->> 'step_min')::int, 15));
  v_lead  := coalesce((b.booking ->> 'lead_min')::int, 120);
  v_max   := coalesce((b.booking ->> 'max_days')::int, 60);
  v_today := (now() at time zone b.timezone)::date;
  v_from  := greatest(coalesce(p_from, v_today), v_today);
  v_to    := least(v_from + least(greatest(coalesce(p_days, 14), 1), 31), v_today + v_max + 1);   -- exclusive

  with eligible as (
    select s.id from staff s
    where s.business_id = b.id and s.active and s.bookable and s.online
      and (p_staff_id is null or s.id = p_staff_id)
      and not exists (select 1 from unnest(p_service_ids) want(sid)
                      where not exists (select 1 from staff_services ss where ss.staff_id = s.id and ss.service_id = want.sid))
  ),
  cand as (
    select e.id as staff_id, d::date as day, m as start_min,
           ((d::date + make_interval(mins => m))::timestamp at time zone b.timezone) as at
    from eligible e
    cross join generate_series(v_from::timestamp, (v_to - 1)::timestamp, interval '1 day') d
    join staff_hours h on h.staff_id = e.id and h.dow = extract(dow from d)::int
    cross join lateral generate_series(h.start_min::int, h.end_min::int - v_dur, v_step) m
  ),
  open as (
    select c.* from cand c
    where c.at >= now() + make_interval(mins => v_lead)
      and not exists (select 1 from appointments a
                      where a.staff_id = c.staff_id and a.status not in ('cancelled', 'noshow')
                        and tstzrange(a.starts_at, a.block_end, '[)') && tstzrange(c.at, c.at + make_interval(mins => v_dur + v_buf), '[)'))
      and not exists (select 1 from time_off t
                      where t.staff_id = c.staff_id and t.period && tstzrange(c.at, c.at + make_interval(mins => v_dur), '[)'))
  ),
  per_time as (
    select day, start_min, min(at) as at, jsonb_agg(staff_id order by staff_id) as staff
    from open group by day, start_min
  ),
  per_day as (
    select day, jsonb_agg(jsonb_build_object('time', to_char(make_time(start_min / 60, start_min % 60, 0), 'HH24:MI'), 'at', at, 'staff', staff)
                          order by start_min) as slots
    from per_time group by day
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'slots', slots) order by day), '[]') into v_days from per_day;

  return jsonb_build_object('ok', true, 'timezone', b.timezone, 'duration_min', v_dur, 'from', v_from, 'to', v_to - 1, 'days', v_days);
end $$;

-- Books it. Picks the least-busy provider when the client chose "anyone"; the exclusion constraint settles races.
-- p_client: {first_name, last_name, phone, email, note, sms_opt_in, website (honeypot: must be empty)}
create or replace function public.booking_create(p_slug text, p_service_ids uuid[], p_start timestamptz, p_client jsonb, p_staff_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  b businesses; v_dur int; v_buf int; v_n int; v_items jsonb; v_lead int; v_max int;
  v_local timestamp; v_min int; v_dow int; v_ip text; v_first text; v_last text; v_phone text; v_email text;
  v_client uuid; v_staff uuid; v_appt appointments; v_intake uuid;
begin
  if coalesce(p_client ->> 'website', '') <> '' then return jsonb_build_object('ok', false, 'reason', 'rejected'); end if;
  select * into b from businesses where slug = lower(p_slug);
  if not found or not b.is_live then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  -- per-visitor rate limit (the IP comes from the API gateway; without one, skip rather than lump everyone together)
  begin v_ip := btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)); exception when others then v_ip := null; end;
  if nullif(v_ip, '') is not null then
    if (select count(*) from rate_events where key = 'book:' || v_ip and at > now() - interval '10 minutes') >= 8 then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;
    insert into rate_events (key) values ('book:' || v_ip);
    delete from rate_events where at < now() - interval '1 day';
  end if;

  v_first := left(btrim(coalesce(p_client ->> 'first_name', '')), 60);
  v_last  := left(btrim(coalesce(p_client ->> 'last_name', '')), 60);
  v_phone := public.norm_phone(p_client ->> 'phone');
  v_email := nullif(lower(left(btrim(coalesce(p_client ->> 'email', '')), 120)), '');
  if v_first = '' or v_phone is null then return jsonb_build_object('ok', false, 'reason', 'missing_contact'); end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'reason', 'bad_email'); end if;

  if p_service_ids is null or cardinality(p_service_ids) = 0 or cardinality(p_service_ids) > 6 then return jsonb_build_object('ok', false, 'reason', 'bad_service'); end if;
  select sum(duration_min), coalesce(max(buffer_min), 0), count(*),
         jsonb_agg(jsonb_build_object('service_id', id, 'name', name, 'duration_min', duration_min, 'price_cents', price_cents)
                   order by array_position(p_service_ids, id))
    into v_dur, v_buf, v_n, v_items
  from services where id = any (p_service_ids) and business_id = b.id and active and online;
  if v_n <> cardinality(p_service_ids) then return jsonb_build_object('ok', false, 'reason', 'bad_service'); end if;

  v_lead := coalesce((b.booking ->> 'lead_min')::int, 120);
  v_max  := coalesce((b.booking ->> 'max_days')::int, 60);
  if p_start < now() + make_interval(mins => v_lead) then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  if p_start > now() + make_interval(days => v_max + 1) then return jsonb_build_object('ok', false, 'reason', 'too_far'); end if;
  v_local := p_start at time zone b.timezone;
  v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_dow := extract(dow from v_local)::int;

  -- one phone number can hold at most 3 upcoming online bookings, whoever's name is on them
  if (select count(*) from appointments a join clients c on c.id = a.client_id
      where a.business_id = b.id and c.phone_e164 = v_phone and a.source = 'online'
        and a.starts_at > now() and a.status not in ('cancelled', 'noshow')) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  -- The client file. Families share phones and emails, and a booking attached to the wrong person puts the wrong
  -- health flags in front of the provider, so a match needs the same first name AND the same phone or email.
  -- Anything looser becomes a new file tagged for the front desk to review.
  select id into v_client from clients
   where business_id = b.id and deleted_at is null and lower(first_name) = lower(v_first)
     and (phone_e164 = v_phone or (v_email is not null and email_lc = v_email))
   order by (phone_e164 = v_phone) desc, created_at
   limit 1;
  if v_client is null then
    insert into clients (business_id, first_name, last_name, phone, email, source, sms_opt_in, tags)
    values (b.id, v_first, v_last, v_phone, v_email, 'online', coalesce((p_client ->> 'sms_opt_in')::boolean, false),
            case when exists (select 1 from clients where business_id = b.id and deleted_at is null and (phone_e164 = v_phone or (v_email is not null and email_lc = v_email)))
                 then array['possible_duplicate'] else '{}'::text[] end)
    returning id into v_client;
  end if;

  -- try each eligible provider, least busy that day first
  for v_staff in
    select s.id from staff s
    where s.business_id = b.id and s.active and s.bookable and s.online
      and (p_staff_id is null or s.id = p_staff_id)
      and not exists (select 1 from unnest(p_service_ids) want(sid)
                      where not exists (select 1 from staff_services ss where ss.staff_id = s.id and ss.service_id = want.sid))
      and exists (select 1 from staff_hours h where h.staff_id = s.id and h.dow = v_dow and v_min >= h.start_min and v_min + v_dur <= h.end_min)
      and not exists (select 1 from time_off t where t.staff_id = s.id and t.period && tstzrange(p_start, p_start + make_interval(mins => v_dur), '[)'))
    order by (select count(*) from appointments a where a.staff_id = s.id and a.status not in ('cancelled', 'noshow')
                and (a.starts_at at time zone b.timezone)::date = v_local::date), s.sort, s.id
  loop
    begin
      insert into appointments (business_id, client_id, staff_id, starts_at, ends_at, buffer_min, status, source, services, note)
      values (b.id, v_client, v_staff, p_start, p_start + make_interval(mins => v_dur), v_buf, 'booked', 'online', v_items,
              nullif(left(btrim(coalesce(p_client ->> 'note', '')), 500), ''))
      returning * into v_appt;
      v_intake := public.intake_link_for(b.id, v_client, v_appt.id);   -- 20261026000003_records.sql
      return jsonb_build_object('ok', true, 'appointment', jsonb_build_object(
        'id', v_appt.id, 'token', v_appt.manage_token, 'starts_at', v_appt.starts_at, 'ends_at', v_appt.ends_at,
        'staff', (select name from staff where id = v_staff), 'services', v_items,
        'business', b.name, 'timezone', b.timezone, 'address', b.address, 'phone', b.phone, 'intake_token', v_intake));
    exception when exclusion_violation then
      continue;   -- someone took this provider's slot a moment ago; try the next one
    end;
  end loop;
  return jsonb_build_object('ok', false, 'reason', 'taken');
end $$;

-- The client's manage link: what they booked and whether they can still change it themselves.
create or replace function public.booking_get(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a appointments; b businesses; v_hours int;
begin
  select * into a from appointments where manage_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into b from businesses where id = a.business_id;
  v_hours := coalesce((b.booking ->> 'cancel_hours')::int, 24);
  return jsonb_build_object('ok', true, 'appointment', jsonb_build_object(
    'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status, 'services', a.services,
    'staff', (select name from staff where id = a.staff_id), 'staff_id', a.staff_id,
    'service_ids', (select coalesce(jsonb_agg(x ->> 'service_id'), '[]') from jsonb_array_elements(a.services) x),
    'can_change', a.status in ('booked', 'confirmed') and a.starts_at - now() >= make_interval(hours => v_hours),
    'intake_token', (select f.public_token from forms f where f.client_id = a.client_id and f.template_id = 'intake' and f.status = 'sent'
                      order by f.created_at desc limit 1)),
    'business', jsonb_build_object('name', b.name, 'slug', b.slug, 'timezone', b.timezone, 'phone', b.phone, 'address', b.address,
                                   'cancel_hours', v_hours, 'policy', b.booking ->> 'policy'));
end $$;

create or replace function public.booking_cancel(p_token uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare a appointments; b businesses; v_hours int;
begin
  select * into a from appointments where manage_token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into b from businesses where id = a.business_id;
  v_hours := coalesce((b.booking ->> 'cancel_hours')::int, 24);
  if a.status not in ('booked', 'confirmed') then return jsonb_build_object('ok', false, 'reason', 'not_changeable'); end if;
  if a.starts_at - now() < make_interval(hours => v_hours) then return jsonb_build_object('ok', false, 'reason', 'too_late'); end if;
  update appointments set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Cancelled by client online' where id = a.id;
  return jsonb_build_object('ok', true);
end $$;

-- Moves the booking to a new start with the same provider and services.
create or replace function public.booking_reschedule(p_token uuid, p_start timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare a appointments; b businesses; v_hours int; v_lead int; v_max int; v_dur int; v_local timestamp; v_min int;
begin
  select * into a from appointments where manage_token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into b from businesses where id = a.business_id;
  v_hours := coalesce((b.booking ->> 'cancel_hours')::int, 24);
  v_lead  := coalesce((b.booking ->> 'lead_min')::int, 120);
  v_max   := coalesce((b.booking ->> 'max_days')::int, 60);
  if a.status not in ('booked', 'confirmed') then return jsonb_build_object('ok', false, 'reason', 'not_changeable'); end if;
  if a.starts_at - now() < make_interval(hours => v_hours) then return jsonb_build_object('ok', false, 'reason', 'too_late'); end if;
  if p_start < now() + make_interval(mins => v_lead) then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  if p_start > now() + make_interval(days => v_max + 1) then return jsonb_build_object('ok', false, 'reason', 'too_far'); end if;
  v_dur := extract(epoch from (a.ends_at - a.starts_at))::int / 60;
  v_local := p_start at time zone b.timezone;
  v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  if not exists (select 1 from staff_hours h where h.staff_id = a.staff_id and h.dow = extract(dow from v_local)::int
                 and v_min >= h.start_min and v_min + v_dur <= h.end_min)
     or exists (select 1 from time_off t where t.staff_id = a.staff_id and t.period && tstzrange(p_start, p_start + make_interval(mins => v_dur), '[)')) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  begin
    update appointments set starts_at = p_start, ends_at = p_start + make_interval(mins => v_dur) where id = a.id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;
  return jsonb_build_object('ok', true, 'starts_at', p_start, 'ends_at', p_start + make_interval(mins => v_dur));
end $$;

-- ===================================================================== function privileges
-- Postgres lets everyone execute functions by default; take that away, then hand out exactly what each role needs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.norm_phone(text) to anon, authenticated;
grant execute on function public.booking_profile(text) to anon, authenticated;
grant execute on function public.booking_slots(text, uuid[], uuid, date, int) to anon, authenticated;
grant execute on function public.booking_create(text, uuid[], timestamptz, jsonb, uuid) to anon, authenticated;
grant execute on function public.booking_get(uuid) to anon, authenticated;
grant execute on function public.booking_cancel(uuid) to anon, authenticated;
grant execute on function public.booking_reschedule(uuid, timestamptz) to anon, authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, public.member_role[]) to authenticated;
grant execute on function public.create_business(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.sync_catalog(uuid, jsonb) to authenticated;
grant execute on function public.read_client_health(uuid) to authenticated;
grant execute on function public.save_client_health(uuid, jsonb) to authenticated;

-- ===================================================================== realtime
-- The front desk hears about new online bookings the moment they happen.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments, public.clients;
  end if;
end $$;
