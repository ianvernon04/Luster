-- "Request a demo" on the website (welcome/): a studio leaves its name and how to reach it, and Luster gets back to them.
-- The website writes only through request_demo() (a spam trap, trimmed lengths, at most 5 an hour from one address).
-- Nobody signed in to Luster can read these: they're leads for Luster itself, read in the Supabase dashboard.

create table public.demo_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  studio      text,
  email       text,
  phone       text,
  kind        text,                               -- what kind of studio
  software    text,                               -- what they use now
  best_time   text,
  message     text,
  founding    boolean not null default false,     -- asked about a founding spot
  page        text,                               -- where on the site they asked
  ip          text,
  status      text not null default 'new' check (status in ('new', 'drafted', 'contacted', 'booked', 'closed')),
  note        text
);
create index demo_requests_status_idx on public.demo_requests (status, created_at);
alter table public.demo_requests enable row level security;   -- no policies: request_demo() writes, the dashboard reads
revoke all on public.demo_requests from anon, authenticated;

create or replace function public.request_demo(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_ip text; v_name text; v_email text; v_phone text;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 8000 then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if coalesce(p ->> 'website', '') <> '' then return jsonb_build_object('ok', true); end if;   -- the hidden field only bots fill in
  v_name  := left(btrim(coalesce(p ->> 'name', '')), 80);
  v_email := lower(left(btrim(coalesce(p ->> 'email', '')), 160));
  v_phone := left(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9+]', '', 'g'), 20);
  if v_name = '' then return jsonb_build_object('ok', false, 'reason', 'name'); end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v_email := ''; end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 10 then v_phone := ''; end if;
  if v_email = '' and v_phone = '' then return jsonb_build_object('ok', false, 'reason', 'contact'); end if;
  begin v_ip := btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)); exception when others then v_ip := null; end;
  if nullif(v_ip, '') is not null then
    if (select count(*) from rate_events where key = 'demo:' || v_ip and at > now() - interval '1 hour') >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;
    insert into rate_events (key) values ('demo:' || v_ip);
  end if;
  insert into demo_requests (name, studio, email, phone, kind, software, best_time, message, founding, page, ip)
  values (v_name,
          nullif(left(btrim(coalesce(p ->> 'studio', '')), 120), ''), nullif(v_email, ''), nullif(v_phone, ''),
          nullif(left(btrim(coalesce(p ->> 'kind', '')), 60), ''), nullif(left(btrim(coalesce(p ->> 'software', '')), 80), ''),
          nullif(left(btrim(coalesce(p ->> 'best_time', '')), 120), ''), nullif(left(btrim(coalesce(p ->> 'message', '')), 1000), ''),
          coalesce(p ->> 'founding', '') in ('true', 'on', '1', 'yes'), nullif(left(coalesce(p ->> 'page', ''), 200), ''), nullif(v_ip, ''));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.request_demo(jsonb) from public;
grant execute on function public.request_demo(jsonb) to anon, authenticated;
