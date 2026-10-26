// Shared by the database tests and the end-to-end tests: an in-process Postgres (PGlite) dressed up like Supabase.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, '..', 'migrations');
export async function freshDb() {
  const db = new PGlite({ extensions: { btree_gist }, parsers: { 1082: (v) => v } });   // date columns stay 'YYYY-MM-DD', as PostgREST sends them
  await db.exec(`
    create schema if not exists auth; create schema if not exists extensions;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
  return db;
}
// run a statement as a given role / user, like PostgREST does per request
export async function as(db, who, sql, params = []) {
  const role = who === 'anon' ? 'anon' : who === 'postgres' ? null : 'authenticated';
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${role === 'authenticated' ? who : ''}', false);`);
  if (role) await db.exec(`set role ${role}`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
