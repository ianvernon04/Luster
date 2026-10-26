-- Remote support: what went wrong on a studio's iPad, so it can be fixed from the other side of the world.
-- Devices report app errors and sync problems through log_app_event (capped per person, scrubbed of contact details
-- on the device). Owners can read their own studio's events; Luster support reads them with the service role.
create table public.app_events (
  id          bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  user_id     uuid,
  kind        text not null check (kind in ('error', 'sync', 'info')),
  message     text not null,
  detail      jsonb not null default '{}'::jsonb,
  device      text,
  build       text,
  at          timestamptz not null default now()
);
create index app_events_at_idx on public.app_events (at desc);
create index app_events_business_idx on public.app_events (business_id, at desc);
alter table public.app_events enable row level security;
create policy app_events_read on public.app_events for select to authenticated using (business_id is not null and public.has_role(business_id, '{owner}'));
revoke all on public.app_events from anon, authenticated;
grant select on public.app_events to authenticated;

create or replace function public.log_app_event(p_business uuid, p_kind text, p_message text, p_detail jsonb default '{}'::jsonb,
                                                p_device text default null, p_build text default null) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;
  if p_business is not null and not public.is_member(p_business) then p_business := null; end if;
  if p_kind not in ('error', 'sync', 'info') then p_kind := 'info'; end if;
  -- 60 an hour per person is plenty for a real problem and useless for flooding
  if (select count(*) from rate_events where key = 'diag:' || v_user and at > now() - interval '1 hour') >= 60 then return false; end if;
  insert into rate_events (key) values ('diag:' || v_user);
  insert into app_events (business_id, user_id, kind, message, detail, device, build)
  values (p_business, v_user, p_kind, left(coalesce(p_message, ''), 500),
          case when jsonb_typeof(p_detail) = 'object' and octet_length(p_detail::text) <= 8000 then p_detail else '{}'::jsonb end,
          left(p_device, 200), left(p_build, 40));
  delete from app_events where at < now() - interval '90 days';
  return true;
end $$;
revoke execute on function public.log_app_event(uuid, text, text, jsonb, text, text) from public, anon;
grant execute on function public.log_app_event(uuid, text, text, jsonb, text, text) to authenticated;
