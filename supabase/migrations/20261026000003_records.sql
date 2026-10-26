-- The rest of a studio's records move to the cloud, so a lost or broken iPad loses nothing:
-- notes, forms (with answers and signatures kept apart), checkout tickets and refunds.
-- Health details (client_health, form_answers) follow one rule: anyone on the team can WRITE them (intake is often
-- filled in on the front-desk iPad), only owners, managers and providers can READ them, and every read is logged.

-- ===================================================================== notes
create table public.notes (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  staff_id       uuid references public.staff (id),
  kind           text not null default 'treatment',   -- treatment | plan | caution | …
  body           text not null,
  noted_on       date not null default current_date,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz                          -- notes are never erased, only hidden
);
create index notes_client_idx on public.notes (business_id, client_id);
create index notes_updated_idx on public.notes (business_id, updated_at);

-- ===================================================================== forms
create table public.forms (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  template_id    text not null,                       -- intake, consent_peel, …
  status         text not null default 'sent' check (status in ('sent', 'completed')),
  sent_on        date,
  completed_on   date,
  definition     jsonb,                               -- frozen copy of the questions and consent wording this client was asked
  public_token   uuid not null default gen_random_uuid(),   -- the client's own link to fill it in on their phone
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index forms_client_idx on public.forms (business_id, client_id);
create index forms_updated_idx on public.forms (business_id, updated_at);
create unique index forms_token_idx on public.forms (public_token);

-- The studio's form templates (questions, consent wording), synced from the app by owners and managers.
create table public.form_templates (
  business_id uuid not null references public.businesses (id) on delete cascade,
  template_id text not null,
  kind        text not null default 'consent',
  name        text not null,
  definition  jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (business_id, template_id)
);

-- answers and signatures: no direct access at all (see save_form_answers / read_form_answers)
create table public.form_answers (
  form_id     uuid primary key references public.forms (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  signature   text,                                   -- PNG data URL of the client's signature
  signed_at   timestamptz,
  signed_meta jsonb not null default '{}'::jsonb,     -- device, consent wording fingerprint: what makes a signature hold up
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ===================================================================== checkout
create table public.tickets (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  client_id      uuid references public.clients (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  staff_id       uuid references public.staff (id),
  sold_on        date not null,
  closed_at      timestamptz not null default now(),
  total_cents    int not null,
  refunded_cents int not null default 0 check (refunded_cents >= 0),
  data           jsonb not null,                      -- lines, discount, tip, tax, payments, as rung up
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tickets_business_idx on public.tickets (business_id, sold_on);
create index tickets_updated_idx on public.tickets (business_id, updated_at);

create table public.refunds (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  ticket_id    uuid not null references public.tickets (id) on delete cascade,
  client_id    uuid references public.clients (id) on delete set null,
  staff_id     uuid references public.staff (id),
  refunded_on  date not null,
  amount_cents int not null check (amount_cents > 0),
  method       text,
  reason       text,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index refunds_updated_idx on public.refunds (business_id, updated_at);

-- ===================================================================== integrity, timestamps, audit
create or replace function public.records_guard() returns trigger
language plpgsql security definer set search_path = public as $$
-- each table checked in its own branch: plpgsql resolves new.<field> even inside a false condition
declare r jsonb := to_jsonb(new); v_staff uuid := (r ->> 'staff_id')::uuid; v_appt uuid := (r ->> 'appointment_id')::uuid; v_ticket uuid := (r ->> 'ticket_id')::uuid;
begin
  if new.client_id is not null and not exists (select 1 from clients c where c.id = new.client_id and c.business_id = new.business_id) then
    raise exception 'client does not belong to this business' using errcode = '42501';
  end if;
  if v_staff is not null and not exists (select 1 from staff s where s.id = v_staff and s.business_id = new.business_id) then
    raise exception 'staff does not belong to this business' using errcode = '42501';
  end if;
  if v_appt is not null and not exists (select 1 from appointments a where a.id = v_appt and a.business_id = new.business_id) then
    raise exception 'appointment does not belong to this business' using errcode = '42501';
  end if;
  if tg_table_name = 'refunds' and not exists (select 1 from tickets t where t.id = v_ticket and t.business_id = new.business_id) then
    raise exception 'ticket does not belong to this business' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger notes_guard   before insert or update on public.notes   for each row execute function public.records_guard();
create trigger forms_guard   before insert or update on public.forms   for each row execute function public.records_guard();
create trigger tickets_guard before insert or update on public.tickets for each row execute function public.records_guard();
create trigger refunds_guard before insert or update on public.refunds for each row execute function public.records_guard();

-- A form keeps the exact questions it was sent with (what the client saw is what they signed), and its link never changes.
create or replace function public.forms_freeze() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.public_token := old.public_token;
    if old.definition is not null then new.definition := old.definition; end if;
  end if;
  if new.definition is null then
    select t.definition into new.definition from form_templates t where t.business_id = new.business_id and t.template_id = new.template_id;
  end if;
  return new;
end $$;
create trigger forms_freeze before insert or update on public.forms for each row execute function public.forms_freeze();
create trigger form_templates_touch before update on public.form_templates for each row execute function public.touch_updated_at();

create trigger notes_touch   before update on public.notes   for each row execute function public.touch_updated_at();
create trigger forms_touch   before update on public.forms   for each row execute function public.touch_updated_at();
create trigger tickets_touch before update on public.tickets for each row execute function public.touch_updated_at();
create trigger refunds_touch before update on public.refunds for each row execute function public.touch_updated_at();

create trigger notes_audit   after insert or update or delete on public.notes   for each row execute function public.audit_row();
create trigger forms_audit   after insert or update or delete on public.forms   for each row execute function public.audit_row();
create trigger tickets_audit after insert or update or delete on public.tickets for each row execute function public.audit_row();
create trigger refunds_audit after insert or update or delete on public.refunds for each row execute function public.audit_row();

-- ===================================================================== row-level security
alter table public.notes        enable row level security;
alter table public.forms        enable row level security;
alter table public.form_answers enable row level security;   -- no policies: functions only
alter table public.tickets      enable row level security;
alter table public.refunds      enable row level security;
alter table public.form_templates enable row level security;

create policy notes_read   on public.notes for select to authenticated using (public.is_member(business_id));
create policy notes_insert on public.notes for insert to authenticated with check (public.is_member(business_id));
create policy notes_update on public.notes for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy forms_read   on public.forms for select to authenticated using (public.is_member(business_id));
create policy forms_insert on public.forms for insert to authenticated with check (public.is_member(business_id));
create policy forms_update on public.forms for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy tickets_read   on public.tickets for select to authenticated using (public.is_member(business_id));
create policy tickets_insert on public.tickets for insert to authenticated with check (public.is_member(business_id));
create policy tickets_update on public.tickets for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy refunds_read   on public.refunds for select to authenticated using (public.is_member(business_id));
create policy refunds_insert on public.refunds for insert to authenticated with check (public.is_member(business_id));
create policy refunds_update on public.refunds for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy ftpl_read  on public.form_templates for select to authenticated using (public.is_member(business_id));
create policy ftpl_write on public.form_templates for all to authenticated
  using (public.has_role(business_id, '{owner,manager}')) with check (public.has_role(business_id, '{owner,manager}'));
revoke all on public.notes, public.forms, public.form_answers, public.tickets, public.refunds, public.form_templates from anon;

-- ===================================================================== health details: write by anyone on the team, read by clinical roles, every read logged
create or replace function public.save_client_health(p_client uuid, p_medical jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_b uuid; v_keys text[];
begin
  select business_id into v_b from clients where id = p_client;
  if v_b is null or not public.is_member(v_b) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into client_health (client_id, business_id, medical, updated_at, updated_by)
  values (p_client, v_b, coalesce(p_medical, '{}'), now(), auth.uid())
  on conflict (client_id) do update set medical = excluded.medical, updated_at = now(), updated_by = auth.uid();
  select array_agg(k) into v_keys from jsonb_object_keys(coalesce(p_medical, '{}')) k;
  insert into audit_log (business_id, actor, action, entity, entity_id, detail)
  values (v_b, auth.uid(), 'update', 'client_health', p_client, jsonb_build_object('sections', coalesce(to_jsonb(v_keys), '[]')));
end $$;

-- a provider opening a health file the iPad already has: still logged
create or replace function public.log_health_view(p_client uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_b uuid;
begin
  select business_id into v_b from clients where id = p_client;
  if v_b is null or not public.has_role(v_b, '{owner,manager,provider}') then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into audit_log (business_id, actor, action, entity, entity_id) values (v_b, auth.uid(), 'view', 'client_health', p_client);
end $$;

-- which clients have a health file in the cloud, and when it last changed (no contents): lets a device know what to fetch
create or replace function public.health_index(p_business uuid, p_since timestamptz default null) returns table (client_id uuid, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select h.client_id, h.updated_at from client_health h
  where h.business_id = p_business and public.is_member(p_business) and (p_since is null or h.updated_at >= p_since)
$$;

create or replace function public.save_form_answers(p_form uuid, p_answers jsonb, p_signature text default null, p_meta jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_b uuid;
begin
  select business_id into v_b from forms where id = p_form;
  if v_b is null or not public.is_member(v_b) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_signature is not null and (length(p_signature) > 400000 or p_signature !~ '^data:image/(png|jpeg);base64,') then
    raise exception 'signature must be a PNG or JPEG data URL under 400 KB' using errcode = '22023';
  end if;
  insert into form_answers (form_id, business_id, answers, signature, signed_at, signed_meta, updated_at, updated_by)
  values (p_form, v_b, coalesce(p_answers, '{}'), p_signature, case when p_signature is not null then now() end, coalesce(p_meta, '{}'), now(), auth.uid())
  on conflict (form_id) do update set answers = excluded.answers, signature = coalesce(excluded.signature, form_answers.signature),
    signed_at = coalesce(form_answers.signed_at, excluded.signed_at), signed_meta = form_answers.signed_meta || excluded.signed_meta,
    updated_at = now(), updated_by = auth.uid();
  insert into audit_log (business_id, actor, action, entity, entity_id, detail)
  values (v_b, auth.uid(), 'update', 'form_answers', p_form, jsonb_build_object('signed', p_signature is not null));
end $$;

create or replace function public.read_form_answers(p_form uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_b uuid; r form_answers;
begin
  select business_id into v_b from forms where id = p_form;
  if v_b is null or not public.has_role(v_b, '{owner,manager,provider}') then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into audit_log (business_id, actor, action, entity, entity_id) values (v_b, auth.uid(), 'view', 'form_answers', p_form);
  select * into r from form_answers where form_id = p_form;
  if not found then return null; end if;
  return jsonb_build_object('answers', r.answers, 'signature', r.signature, 'signed_at', r.signed_at);
end $$;

-- ===================================================================== forms on the client's phone
-- The client's link to the intake form: their pending one, or a new one if they've never been asked. Null when they
-- already filled one in, or the studio hasn't set up its intake form in Luster. Called by booking_create.
create or replace function public.intake_link_for(p_business uuid, p_client uuid, p_appt uuid default null) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_token uuid; v_tz text;
begin
  if exists (select 1 from forms where business_id = p_business and client_id = p_client and template_id = 'intake' and status = 'completed') then return null; end if;
  select public_token into v_token from forms where business_id = p_business and client_id = p_client and template_id = 'intake' and status = 'sent'
   order by created_at desc limit 1;
  if v_token is not null then return v_token; end if;
  if not exists (select 1 from form_templates where business_id = p_business and template_id = 'intake') then return null; end if;
  select timezone into v_tz from businesses where id = p_business;
  insert into forms (business_id, client_id, appointment_id, template_id, status, sent_on)
  values (p_business, p_client, p_appt, 'intake', 'sent', (now() at time zone coalesce(v_tz, 'UTC'))::date)
  returning public_token into v_token;
  return v_token;
end $$;

-- What the client's phone needs to show the form: the questions, their first name, the studio. Nothing else.
create or replace function public.form_public_get(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f forms; b businesses; v_first text; v_def jsonb; v_biz jsonb;
begin
  select * into f from forms where public_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into b from businesses where id = f.business_id;
  v_biz := jsonb_build_object('name', b.name, 'slug', b.slug, 'timezone', b.timezone, 'phone', b.phone, 'address', b.address,
                              'cancel_hours', coalesce((b.booking ->> 'cancel_hours')::int, 24), 'live', b.is_live);
  select first_name into v_first from clients where id = f.client_id and deleted_at is null;
  if v_first is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if f.status = 'completed' then return jsonb_build_object('ok', false, 'reason', 'done', 'business', v_biz); end if;
  v_def := coalesce(f.definition, (select t.definition from form_templates t where t.business_id = f.business_id and t.template_id = f.template_id));
  if v_def is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'form', jsonb_build_object('template_id', f.template_id, 'definition', v_def),
                            'client', jsonb_build_object('first_name', v_first), 'business', v_biz);
end $$;

-- The client signs on their phone. Answers and signature go where the iPad's go; an intake also updates the client's
-- file, but only ever ADDS to it: caution flags and allergies are unioned, and anything already in the health file wins
-- (a provider removes or corrects things after talking to the client). Whoever holds a link can't erase a caution.
create or replace function public.form_public_submit(p_token uuid, p_answers jsonb, p_signature text, p_derived jsonb default null, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare f forms; v_tz text; v_ip text; v_flags text[]; v_meta jsonb;
begin
  select * into f from forms where public_token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if f.status = 'completed' then return jsonb_build_object('ok', false, 'reason', 'done'); end if;
  if not exists (select 1 from clients where id = f.client_id and deleted_at is null) then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 100000 then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if p_signature is null or length(p_signature) > 400000 or p_signature !~ '^data:image/(png|jpeg);base64,' then return jsonb_build_object('ok', false, 'reason', 'signature'); end if;
  begin v_ip := btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)); exception when others then v_ip := null; end;
  if nullif(v_ip, '') is not null then
    if (select count(*) from rate_events where key = 'form:' || v_ip and at > now() - interval '10 minutes') >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;
    insert into rate_events (key) values ('form:' || v_ip);
  end if;
  select timezone into v_tz from businesses where id = f.business_id;
  v_meta := jsonb_build_object('via', 'link', 'ip', nullif(v_ip, ''), 'device', left(coalesce(p_meta ->> 'device', ''), 160),
                               'template', f.template_id, 'wording', md5(coalesce(f.definition, '{}'::jsonb)::text));
  insert into form_answers (form_id, business_id, answers, signature, signed_at, signed_meta, updated_at, updated_by)
  values (f.id, f.business_id, p_answers, p_signature, now(), v_meta, now(), null)
  on conflict (form_id) do update set answers = excluded.answers, signature = excluded.signature, signed_at = excluded.signed_at,
    signed_meta = excluded.signed_meta, updated_at = now(), updated_by = null;
  update forms set status = 'completed', completed_on = (now() at time zone coalesce(v_tz, 'UTC'))::date where id = f.id;
  if f.template_id = 'intake' and jsonb_typeof(p_derived) = 'object' and octet_length(p_derived::text) <= 100000 then
    select coalesce(array_agg(distinct x), '{}') into v_flags
      from (select x from jsonb_array_elements_text(case when jsonb_typeof(p_derived -> 'flags') = 'array' then p_derived -> 'flags' else '[]'::jsonb end) x
            where x ~ '^[a-z][a-z0-9_]{1,23}$' limit 30) q;
    update clients c set
      flags = (select coalesce(array_agg(distinct e), '{}') from unnest(c.flags || v_flags) e),
      profile = c.profile || jsonb_strip_nulls(jsonb_build_object(
        'allergies', case when jsonb_typeof(p_derived -> 'allergies') = 'array' then
          (select coalesce(jsonb_agg(distinct a), '[]'::jsonb) from (
             select jsonb_array_elements_text(case when jsonb_typeof(c.profile -> 'allergies') = 'array' then c.profile -> 'allergies' else '[]'::jsonb end) a
             union select left(jsonb_array_elements_text(p_derived -> 'allergies'), 120)) u) end,
        'skin', nullif(p_derived ->> 'skin', ''),
        'concerns', case when jsonb_typeof(p_derived -> 'concerns') = 'array' and jsonb_array_length(p_derived -> 'concerns') > 0 then p_derived -> 'concerns' end,
        'prefs', case when coalesce(c.profile ->> 'prefs', '') = '' then nullif(p_derived ->> 'prefs', '') end))
    where c.id = f.client_id;
    if jsonb_typeof(p_derived -> 'medical') = 'object' then
      insert into client_health (client_id, business_id, medical, updated_at, updated_by)
      values (f.client_id, f.business_id, p_derived -> 'medical', now(), null)
      on conflict (client_id) do update set medical = excluded.medical || client_health.medical, updated_at = now(), updated_by = null;
    end if;
  end if;
  insert into audit_log (business_id, actor, action, entity, entity_id, detail)
  values (f.business_id, null, 'submit', 'form_answers', f.id, jsonb_build_object('via', 'link', 'template', f.template_id));
  return jsonb_build_object('ok', true);
end $$;

-- ===================================================================== deleting a client
-- Hidden on every device and kept for the record; their upcoming visits are cancelled so those times open up online.
create or replace function public.delete_client(p_client uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_b uuid; v_n int;
begin
  select business_id into v_b from clients where id = p_client;
  if v_b is null or not public.has_role(v_b, '{owner,manager}') then raise exception 'not allowed' using errcode = '42501'; end if;
  update clients set deleted_at = coalesce(deleted_at, now()) where id = p_client;
  update appointments set status = 'cancelled', cancel_reason = 'Client deleted'
   where client_id = p_client and starts_at > now() and status in ('booked', 'confirmed');
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'cancelled', v_n);
end $$;

revoke execute on function public.records_guard() from public, anon, authenticated;
revoke execute on function public.forms_freeze() from public, anon, authenticated;
revoke execute on function public.log_health_view(uuid), public.health_index(uuid, timestamptz), public.save_form_answers(uuid, jsonb, text, jsonb), public.read_form_answers(uuid) from public, anon;
revoke execute on function public.intake_link_for(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.form_public_get(uuid), public.form_public_submit(uuid, jsonb, text, jsonb, jsonb), public.delete_client(uuid) from public;
grant execute on function public.form_public_get(uuid) to anon, authenticated;
grant execute on function public.form_public_submit(uuid, jsonb, text, jsonb, jsonb) to anon, authenticated;
revoke execute on function public.delete_client(uuid) from anon;
grant execute on function public.delete_client(uuid) to authenticated;
grant execute on function public.save_client_health(uuid, jsonb) to authenticated;
grant execute on function public.log_health_view(uuid) to authenticated;
grant execute on function public.health_index(uuid, timestamptz) to authenticated;
grant execute on function public.save_form_answers(uuid, jsonb, text, jsonb) to authenticated;
grant execute on function public.read_form_answers(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notes, public.forms, public.tickets;
  end if;
end $$;
