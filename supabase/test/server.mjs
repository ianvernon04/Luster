// A small stand-in for a Supabase project, for tests: serves the repo's static files and answers the subset of
// Supabase's HTTP API that Luster uses (PostgREST tables + RPC, GoTrue password auth) from an in-process Postgres.
// Every request runs as the same database role Supabase would use (anon / authenticated), so RLS is exercised for real.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';

export const ANON_KEY = 'test-anon-key';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain', '.ics': 'text/calendar' };
const IDENT = /^[a-z_][a-z0-9_]*$/;
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export async function startServer({ db, root, port = 0, base = '/', config = {} }) {
  let chain = Promise.resolve();
  const exclusive = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };   // PGlite is one connection: one request at a time
  const users = new Map();   // email -> { id, password }
  const outbox = [];         // emails GoTrue would have sent: { to, kind, link }
  const recovery = new Map();   // one-time token -> email
  const colCache = new Map();
  const fnCache = new Map();
  const log = [];

  async function columns(table) {
    if (!colCache.has(table)) {
      const r = await db.query(`select column_name, data_type, udt_name, is_generated from information_schema.columns where table_schema = 'public' and table_name = $1`, [table]);
      colCache.set(table, new Map(r.rows.map((c) => [c.column_name, c])));
    }
    return colCache.get(table);
  }
  const castOf = (c) => (c.data_type === 'ARRAY' ? `${c.udt_name.slice(1)}[]` : c.udt_name);
  const toParam = (v, c) => {
    if (v === null || v === undefined) return null;
    if (c && c.data_type === 'ARRAY') return `{${v.map((x) => `"${String(x).replace(/(["\\])/g, '\\$1')}"`).join(',')}}`;
    if (c && (c.udt_name === 'jsonb' || c.udt_name === 'json')) return JSON.stringify(v);
    if (typeof v === 'object') return JSON.stringify(v);
    if (typeof v === 'boolean' || typeof v === 'number') return v;   // PGlite is strict about native types for bool/int params
    return String(v);
  };
  function who(req) {
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!auth || auth === ANON_KEY) return { role: 'anon', sub: '' };
    try { const p = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString()); if (p.exp && p.exp * 1000 < Date.now()) return { role: 'anon', sub: '', expired: true }; return { role: 'authenticated', sub: p.sub, email: p.email }; } catch (e) { return { role: 'anon', sub: '' }; }
  }
  async function runAs(req, fn) {
    const w = who(req);
    const ip = req.headers['x-test-ip'] || '127.0.0.1';
    return exclusive(async () => {
      await db.exec(`reset role`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.headers', $2, false)`, [w.sub || '', JSON.stringify({ 'x-forwarded-for': ip })]);
      await db.exec(`set role ${w.role}`);
      try { return await fn(w); } finally { await db.exec('reset role'); }
    });
  }
  function pgError(res, e) {
    const code = e.code || 'P0001';
    const status = code === '42501' ? 403 : code === '23P01' || code === '23505' ? 409 : code === 'PGRST116' ? 406 : 400;
    send(res, status, { code, message: e.message, details: e.detail || null, hint: e.hint || null });
  }
  function send(res, status, body, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  }
  async function readBody(req) { const chunks = []; for await (const c of req) chunks.push(c); const s = Buffer.concat(chunks).toString(); return s ? JSON.parse(s) : {}; }

  // ---- PostgREST filters: col=op.value
  function where(url, cols, params) {
    const parts = [];
    for (const [k, raw] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      if (!IDENT.test(k) || !cols.has(k)) throw Object.assign(new Error(`unknown column ${k}`), { code: '42703' });
      const c = cols.get(k); const cast = castOf(c);
      const m = raw.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|in|is|like|ilike)\.(.*)$/s); if (!m) throw Object.assign(new Error(`bad filter ${k}=${raw}`), { code: 'PGRST100' });
      const [, not, op, val] = m;
      let sql;
      if (op === 'is') sql = `${k} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
      else if (op === 'in') { const items = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')); params.push(`{${items.map((x) => `"${x}"`).join(',')}}`); sql = `${k} = any($${params.length}::${cast.replace('[]', '')}[])`; }
      else { params.push(val); const o = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' }[op]; sql = `${k} ${o} $${params.length}::${cast}`; }
      parts.push(not ? `not (${sql})` : sql);
    }
    return parts.length ? ` where ${parts.join(' and ')}` : '';
  }
  function selectList(url, cols) {
    const s = url.searchParams.get('select') || '*';
    if (s === '*') return '*';
    return s.split(',').map((c) => c.trim()).filter((c) => { if (!IDENT.test(c) || !cols.has(c)) throw Object.assign(new Error(`unknown column ${c}`), { code: '42703' }); return true; }).join(', ');
  }
  function orderBy(url, cols) {
    const o = url.searchParams.get('order'); if (!o) return '';
    return ' order by ' + o.split(',').map((p) => { const [c, dir, nulls] = p.split('.'); if (!cols.has(c)) throw new Error(`unknown column ${c}`); return `${c} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`; }).join(', ');
  }

  async function rest(req, res, url, table) {
    if (!IDENT.test(table)) return send(res, 404, { message: 'not found' });
    const cols = await exclusive(() => columns(table));
    if (!cols.size) return send(res, 404, { code: '42P01', message: `relation public.${table} does not exist` });
    const prefer = req.headers.prefer || ''; const wantRows = /return=representation/.test(prefer); const single = /vnd\.pgrst\.object/.test(req.headers.accept || '');
    try {
      let rows;
      if (req.method === 'GET') {
        const params = []; const sql = `select ${selectList(url, cols)} from public.${table}${where(url, cols, params)}${orderBy(url, cols)}${url.searchParams.get('limit') ? ` limit ${parseInt(url.searchParams.get('limit'), 10)}` : ''}`;
        rows = (await runAs(req, () => db.query(sql, params))).rows;
      } else if (req.method === 'POST') {
        const body = await readBody(req); const list = Array.isArray(body) ? body : [body];
        const upsert = /resolution=merge-duplicates/.test(prefer); const conflict = url.searchParams.get('on_conflict') || 'id';
        rows = await runAs(req, async () => {
          const out = [];
          for (const obj of list) {
            const keys = Object.keys(obj).filter((k) => cols.has(k) && cols.get(k).is_generated !== 'ALWAYS');
            const params = keys.map((k) => toParam(obj[k], cols.get(k)));
            const vals = keys.map((k, i) => `$${i + 1}::${castOf(cols.get(k))}`);
            let sql = `insert into public.${table} (${keys.join(', ')}) values (${vals.join(', ')})`;
            if (upsert) sql += ` on conflict (${conflict}) do update set ${keys.filter((k) => k !== conflict).map((k) => `${k} = excluded.${k}`).join(', ') || `${conflict} = excluded.${conflict}`}`;
            const r = await db.query(sql + ' returning *', params); out.push(...r.rows);
          }
          return out;
        });
      } else if (req.method === 'PATCH') {
        const body = await readBody(req); const keys = Object.keys(body).filter((k) => cols.has(k));
        const params = keys.map((k) => toParam(body[k], cols.get(k)));
        const sets = keys.map((k, i) => `${k} = $${i + 1}::${castOf(cols.get(k))}`);
        const sql = `update public.${table} set ${sets.join(', ')}${where(url, cols, params)} returning *`;
        rows = (await runAs(req, () => db.query(sql, params))).rows;
      } else return send(res, 405, { message: 'method not allowed' });
      log.push({ method: req.method, table, n: rows.length });
      if (single) { if (rows.length !== 1) return pgError(res, { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned` }); return send(res, 200, rows[0]); }
      if (req.method !== 'GET' && !wantRows) return send(res, 201, undefined);
      return send(res, req.method === 'POST' ? 201 : 200, rows);
    } catch (e) { return pgError(res, e); }
  }

  async function rpc(req, res, fn) {
    if (!IDENT.test(fn)) return send(res, 404, { message: 'not found' });
    if (!fnCache.has(fn)) {
      const r = await exclusive(() => db.query(`select pg_get_function_identity_arguments(p.oid) as args, p.proretset as set from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn]));
      if (!r.rows.length) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
      const sig0 = new Map(r.rows[0].args ? r.rows[0].args.split(', ').map((a) => { const [n, ...t] = a.split(' '); return [n, t.join(' ')]; }) : []);
      sig0.returnsSet = r.rows[0].set; fnCache.set(fn, sig0);
    }
    const sig = fnCache.get(fn); const body = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://x').searchParams) : await readBody(req);
    const keys = Object.keys(body).filter((k) => sig.has(k));
    const params = keys.map((k) => { const t = sig.get(k); const v = body[k]; if (v === null || v === undefined) return null; if (t.endsWith('[]')) return `{${v.map((x) => `"${x}"`).join(',')}}`; if (t === 'jsonb' || t === 'json') return JSON.stringify(v); if (typeof v === 'boolean' || typeof v === 'number') return v; return String(v); });
    const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${sig.get(k)}`).join(', ')})`;
    const sql = sig.returnsSet ? `select * from ${call}` : `select ${call} as result`;   // table functions come back as arrays, like PostgREST
    try {
      const r = await runAs(req, () => db.query(sql, params));
      log.push({ rpc: fn });
      return send(res, 200, sig.returnsSet ? r.rows : r.rows[0].result);
    } catch (e) { return pgError(res, e); }
  }

  function session(user) {
    const now = Math.floor(Date.now() / 1000);
    const token = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.sig`;
    return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: `r_${user.id}_${now}`,
             user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() } };
  }
  async function auth(req, res, url, p) {
    try {
      if (p === 'signup' && req.method === 'POST') {
        const { email, password } = await readBody(req);
        if (!email || !password || password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
        if (users.has(email.toLowerCase())) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        const u = { id: crypto.randomUUID(), email: email.toLowerCase(), password };
        await exclusive(() => db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.id, u.email]));
        users.set(u.email, u); return send(res, 200, config.confirmEmail ? { ...session(u).user, confirmation_sent_at: new Date().toISOString() } : session(u));
      }
      if (p === 'token' && req.method === 'POST') {
        const body = await readBody(req); const grant = url.searchParams.get('grant_type');
        if (grant === 'password') { const u = users.get((body.email || '').toLowerCase()); if (!u || u.password !== body.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials', error: 'invalid_grant', error_description: 'Invalid login credentials' }); return send(res, 200, session(u)); }
        if (grant === 'refresh_token') { const id = (body.refresh_token || '').split('_')[1]; const u = [...users.values()].find((x) => x.id === id); if (!u) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }); return send(res, 200, session(u)); }
      }
      if (p === 'recover' && req.method === 'POST') {   // password reset email: a one-time link through /verify back to the app
        const { email } = await readBody(req); const u = users.get((email || '').toLowerCase());
        if (u) { const tok = crypto.randomUUID(); recovery.set(tok, u.email); const back = url.searchParams.get('redirect_to') || '/';
          outbox.push({ to: u.email, kind: 'recovery', link: `http://localhost:${server.address().port}/sb/auth/v1/verify?token=${tok}&type=recovery&redirect_to=${encodeURIComponent(back)}` }); }
        return send(res, 200, {});
      }
      if (p === 'verify' && req.method === 'GET') {
        const tok = url.searchParams.get('token'); const back = url.searchParams.get('redirect_to') || '/'; const email = recovery.get(tok);
        if (!email) { res.writeHead(303, { location: `${back}#error=access_denied&error_code=otp_expired&error_description=${encodeURIComponent('Email link is invalid or has expired')}` }); return res.end(); }
        recovery.delete(tok); const s = session(users.get(email));
        res.writeHead(303, { location: `${back}#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery` }); return res.end();
      }
      if (p === 'user' && req.method === 'PUT') {
        const w = who(req); const u = [...users.values()].find((x) => x.id === w.sub); if (!u) return send(res, 401, { msg: 'invalid token' });
        const body = await readBody(req); if (body.password) { if (body.password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' }); u.password = body.password; }
        return send(res, 200, session(u).user);
      }
      if (p === 'user' && req.method === 'GET') { const w = who(req); const u = [...users.values()].find((x) => x.id === w.sub); return u ? send(res, 200, session(u).user) : send(res, 401, { msg: 'invalid token' }); }
      if (p === 'logout') return send(res, 204, undefined);
      return send(res, 404, { msg: `auth endpoint ${p} not emulated` });
    } catch (e) { return send(res, 500, { msg: e.message }); }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' }); return res.end(); }
    let m;
    if ((m = url.pathname.match(/^\/sb\/rest\/v1\/rpc\/([^/]+)$/))) return rpc(req, res, m[1]);
    if ((m = url.pathname.match(/^\/sb\/rest\/v1\/([^/]+)$/))) return rest(req, res, url, m[1]);
    if ((m = url.pathname.match(/^\/sb\/auth\/v1\/([^/]+)$/))) return auth(req, res, url, m[1]);
    if (url.pathname.startsWith('/sb/')) return send(res, 404, { message: 'not emulated' });
    if (!url.pathname.startsWith(base)) { res.writeHead(404); return res.end(); }
    let rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
    if (rel === 'config.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(`window.LUSTER_CONFIG = ${JSON.stringify({ supabaseUrl: `http://localhost:${server.address().port}/sb`, supabaseAnonKey: ANON_KEY, realtime: false, pollMs: 1500, ...(config.client || {}) })};`);
    }
    let file = path.join(root, rel); if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { const nf = path.join(root, '404.html'); res.writeHead(404, { 'content-type': 'text/html' }); return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(port, r));
  return { server, port: server.address().port, users, log, outbox, close: () => new Promise((r) => server.close(r)) };
}
