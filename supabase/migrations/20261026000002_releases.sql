-- Releases waiting to be deployed. Claude writes a release here (a .tar.gz overlay of the repo, base64-encoded);
-- the GitHub workflow (.github/workflows/luster.yml) picks up the newest one, rebuilds the app, runs every test,
-- and pushes to main only if they all pass. Read-only for everyone else: the repo is public anyway, and nobody but
-- the project owner can write here. The workflow reports back how it went (status + the tail of the test log), so a
-- failed release can be diagnosed without opening GitHub.
create table public.releases (
  id          text primary key check (id ~ '^[0-9]{8}-[0-9]{4}[a-z0-9-]*$'),
  created_at  timestamptz not null default now(),
  notes       text,
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  payload     text not null,
  status      text check (status in ('deployed', 'failed')),
  report      text,
  reported_at timestamptz
);
alter table public.releases enable row level security;
create policy releases_read on public.releases for select to anon, authenticated using (true);
revoke all on public.releases from anon, authenticated;
grant select on public.releases to anon, authenticated;

-- Called by the workflow with the public key. It can only record an outcome for a release from the last week that
-- hasn't deployed yet, so the worst a stranger could do is mislabel one; the app and the site never read this.
create or replace function public.release_report(p_id text, p_status text, p_report text default null) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_status not in ('deployed', 'failed') then return false; end if;
  update releases set status = p_status, report = left(p_report, 20000), reported_at = now()
   where id = p_id and status is distinct from 'deployed' and created_at > now() - interval '7 days';
  return found;
end $$;
revoke execute on function public.release_report(text, text, text) from public;
grant execute on function public.release_report(text, text, text) to anon, authenticated;
