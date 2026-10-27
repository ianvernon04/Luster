// Runs every migration against an in-process Postgres (PGlite) dressed up like Supabase (auth schema, anon /
// authenticated roles, default grants), then checks the rules the schema promises.
//   cd supabase/test && npm i && node db.test.mjs
import assert from 'node:assert/strict';
import { freshDb, as } from './harness.mjs';
let fails = 0; const t = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { fails++; console.log('FAIL ', name, '-', e.message.split('\n')[0]); } };

const one = async (db, who, sql, params) => (await as(db, who, sql, params)).rows[0];
const j = async (db, who, sql, params) => Object.values(await one(db, who, sql, params))[0];

// next weekday (Mon=1) in Chicago, as YYYY-MM-DD, at least 2 days out so lead time never interferes
function nextDow(dowWanted, minDaysOut = 2) {
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  for (let i = minDaysOut; i < minDaysOut + 8; i++) { const d = new Date(Date.now() + i * 864e5); const w = new Date(fmt(d) + 'T12:00:00Z').getUTCDay(); if (w === dowWanted) return fmt(d); }
}
const U = { owner: '11111111-1111-4111-8111-111111111111', other: '22222222-2222-4222-8222-222222222222', desk: '33333333-3333-4333-8333-333333333333' };
const S = { dani: 'aaaaaaa1-0000-4000-8000-000000000001', bri: 'aaaaaaa1-0000-4000-8000-000000000002' };
const V = { sig: 'bbbbbbb1-0000-4000-8000-000000000001', exp: 'bbbbbbb1-0000-4000-8000-000000000002', wax: 'bbbbbbb1-0000-4000-8000-000000000003' };
const hours = [1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start_min: 540, end_min: 1020 }));   // Mon–Sat 9–5
const catalog = {
  services: [
    { id: V.sig, key: 'sv_sig', category: 'facial', name: 'Signature Facial', duration_min: 60, price_cents: 9500, sort: 1 },
    { id: V.exp, category: 'facial', name: 'Express Facial', duration_min: 30, buffer_min: 15, price_cents: 5500, sort: 2 },
    { id: V.wax, category: 'wax', name: 'Brow Wax', duration_min: 15, price_cents: 2000, online: false, sort: 3 },
  ],
  staff: [
    { id: S.dani, key: 's1', name: 'Danielle B', title: 'Owner', hours, services: [V.sig, V.exp, V.wax], sort: 1 },
    { id: S.bri, name: 'Brianna T', title: 'Esthetician', hours, services: [V.sig, V.exp], sort: 2 },
  ],
};
const client = (o = {}) => JSON.stringify({ first_name: 'Ava', last_name: 'Landry', phone: '(225) 555-0142', email: 'ava@example.com', ...o });

const db = await freshDb();
let biz;
await db.exec(`insert into auth.users (id) values ('${U.owner}'), ('${U.other}'), ('${U.desk}')`);

await t('owner creates a business and becomes its owner', async () => {
  biz = await j(db, U.owner, `select public.create_business('Simply Facials Test', 'simply-test') as id`);
  const m = await one(db, U.owner, `select role from members where business_id = $1`, [biz]);
  assert.equal(m.role, 'owner');
});
await t('slug collisions are refused with a friendly message', async () => {
  await assert.rejects(as(db, U.other, `select public.create_business('Copycat', 'simply-test')`), /taken/);
});
await t('anonymous visitors cannot create businesses or read tables', async () => {
  await assert.rejects(as(db, 'anon', `select public.create_business('X', 'x-test')`), /permission denied/);
  await assert.rejects(as(db, 'anon', `select * from clients`), /permission denied/);
  await assert.rejects(as(db, 'anon', `select * from businesses`), /permission denied/);
});
await t('sync_catalog loads the team, menu and hours', async () => {
  const r = await j(db, U.owner, `select public.sync_catalog($1, $2::jsonb)`, [biz, JSON.stringify(catalog)]);
  assert.equal(r.ok, true); assert.equal(r.staff, 2); assert.equal(r.services, 3);
  const n = await one(db, U.owner, `select count(*)::int n from staff_hours where business_id = $1`, [biz]); assert.equal(n.n, 12);
});
await t('a non-member cannot sync someone else\'s catalog', async () => {
  await assert.rejects(as(db, U.other, `select public.sync_catalog($1, $2::jsonb)`, [biz, JSON.stringify(catalog)]), /not allowed/);
});
await t('booking page is "coming soon" until the owner turns it on', async () => {
  const p = await j(db, 'anon', `select public.booking_profile('simply-test')`); assert.equal(p.live, false);
  const s = await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[])`, [[V.sig]]); assert.equal(s.ok, false);
  await as(db, U.owner, `update businesses set is_live = true where id = $1`, [biz]);
});
await t('public profile shows online services and staff, nothing private', async () => {
  const p = await j(db, 'anon', `select public.booking_profile('simply-test')`);
  assert.equal(p.ok, true); assert.equal(p.live, true);
  assert.deepEqual(p.services.map((s) => s.name), ['Signature Facial', 'Express Facial']);   // Brow Wax is offline-only
  assert.deepEqual(p.staff.map((s) => s.name), ['Danielle B', 'Brianna T']);
  assert.ok(!JSON.stringify(p).includes('Landry'));
});
let monday, slot;
await t('open times come back in the studio\'s own time zone', async () => {
  monday = nextDow(1);
  const s = await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], null, $2::date, 1)`, [[V.sig], monday]);
  assert.equal(s.ok, true); assert.equal(s.days.length, 1); assert.equal(s.days[0].date, monday);
  const times = s.days[0].slots.map((x) => x.time);
  assert.equal(times[0], '09:00'); assert.equal(times[times.length - 1], '16:00');   // last 60-min start before 5 PM
  slot = s.days[0].slots[0];
  assert.equal(slot.staff.length, 2);
  // 9:00 in Chicago is 14:00 or 15:00 UTC depending on daylight time
  assert.ok(/T1[45]:00:00/.test(new Date(slot.at).toISOString()), slot.at);
});
let token1;
await t('a client books online; the client record is created', async () => {
  const r = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb, $4::uuid)`, [[V.sig], slot.at, client(), S.dani]);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.appointment.staff, 'Danielle B'); token1 = r.appointment.token;
  const c = await one(db, U.owner, `select first_name, phone_e164, source from clients where business_id = $1`, [biz]);
  assert.deepEqual(c, { first_name: 'Ava', phone_e164: '+12255550142', source: 'online' });
});
await t('that time disappears for that provider only', async () => {
  const s = await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], null, $2::date, 1)`, [[V.sig], monday]);
  assert.deepEqual(s.days[0].slots[0].staff, [S.bri]);
});
await t('the same provider cannot be booked twice for the same time', async () => {
  const r = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb, $4::uuid)`, [[V.sig], slot.at, client({ phone: '2255550199', first_name: 'Zoe' }), S.dani]);
  assert.equal(r.ok, false); assert.equal(r.reason, 'taken');
});
await t('the database itself refuses an overlapping insert (front desk path)', async () => {
  await assert.rejects(as(db, U.owner, `insert into appointments (business_id, staff_id, starts_at, ends_at) values ($1, $2, $3::timestamptz + interval '30 minutes', $3::timestamptz + interval '90 minutes')`, [biz, S.dani, slot.at]), /no_double_booking|conflicting key/);
});
await t('"anyone" fills the second provider, then reports the time as taken', async () => {
  const a = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.sig], slot.at, client({ phone: '2255550111', first_name: 'Mia' })]);
  assert.equal(a.ok, true); assert.equal(a.appointment.staff, 'Brianna T');
  const b = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.sig], slot.at, client({ phone: '2255550112', first_name: 'Liv' })]);
  assert.equal(b.ok, false); assert.equal(b.reason, 'taken');
});
await t('room turnover (buffer) blocks the next start', async () => {
  // Express is 30 min + 15 min buffer. Book Danielle at 10:00 → 10:30 is still blocked, 10:45 is open.
  const ten = new Date(new Date(slot.at).getTime() + 60 * 60e3).toISOString();
  const r = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb, $4::uuid)`, [[V.exp], ten, client({ phone: '2255550120', first_name: 'Kim' }), S.dani]);
  assert.equal(r.ok, true, JSON.stringify(r));
  const s = await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], $2::uuid, $3::date, 1)`, [[V.exp], S.dani, monday]);
  const times = s.days[0].slots.map((x) => x.time);
  assert.ok(!times.includes('10:30'), 'buffer ignored'); assert.ok(times.includes('10:45'), 'post-buffer time missing');
});
await t('services that are not online, or not offered by that provider, are refused', async () => {
  const w = await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[])`, [[V.wax]]); assert.equal(w.reason, 'bad_service');
  const later = new Date(new Date(slot.at).getTime() + 5 * 3600e3).toISOString();
  const r = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb, $4::uuid)`, [[V.wax], later, client({ phone: '2255550130' }), S.bri]);
  assert.equal(r.reason, 'bad_service');
});
await t('outside working hours and too-soon bookings are refused', async () => {
  const sunday = nextDow(0);
  const sun10 = (await one(db, 'postgres', `select (($1::date + time '10:00') at time zone 'America/Chicago') as at`, [sunday])).at;
  const r = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.sig], sun10, client({ phone: '2255550131' })]);
  assert.equal(r.reason, 'taken', JSON.stringify(r));
  const soon = new Date(Date.now() + 30 * 60e3).toISOString();
  const r2 = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.sig], soon, client({ phone: '2255550132' })]);
  assert.equal(r2.reason, 'too_soon', JSON.stringify(r2));
});
await t('bots that fill the hidden field are rejected; missing phone is refused', async () => {
  const later = new Date(new Date(slot.at).getTime() + 6 * 3600e3).toISOString();
  assert.equal((await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.sig], later, client({ website: 'http://spam' })])).reason, 'rejected');
  assert.equal((await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.sig], later, client({ phone: '12' })])).reason, 'missing_contact');
});
await t('the manage link shows the booking and allows changes 24h+ ahead', async () => {
  const g = await j(db, 'anon', `select public.booking_get($1::uuid)`, [token1]);
  assert.equal(g.ok, true); assert.equal(g.appointment.staff, 'Danielle B'); assert.equal(g.appointment.can_change, true);
  assert.ok(!('client' in g.appointment));
});
await t('reschedule moves it; the old time opens back up', async () => {
  const s = await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], $2::uuid, $3::date, 1)`, [[V.sig], S.dani, monday]);
  const target = s.days[0].slots.find((x) => x.time === '14:00');
  const r = await j(db, 'anon', `select public.booking_reschedule($1::uuid, $2::timestamptz)`, [token1, target.at]);
  assert.equal(r.ok, true, JSON.stringify(r));
  const s2 = await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], $2::uuid, $3::date, 1)`, [[V.sig], S.dani, monday]);
  const times = s2.days[0].slots.map((x) => x.time); assert.ok(times.includes('09:00')); assert.ok(!times.includes('14:00'));
});
await t('cancel frees the slot', async () => {
  assert.equal((await j(db, 'anon', `select public.booking_cancel($1::uuid)`, [token1])).ok, true);
  assert.equal((await j(db, 'anon', `select public.booking_get($1::uuid)`, [token1])).appointment.status, 'cancelled');
  assert.equal((await j(db, 'anon', `select public.booking_cancel($1::uuid)`, [token1])).reason, 'not_changeable');
});
await t('changes inside the cancellation window are refused', async () => {
  const soonish = (await one(db, 'postgres', `insert into appointments (business_id, staff_id, starts_at, ends_at, source) values ($1, $2, now() + interval '3 hours', now() + interval '4 hours', 'online') returning manage_token`, [biz, S.bri])).manage_token;
  assert.equal((await j(db, 'anon', `select public.booking_cancel($1::uuid)`, [soonish])).reason, 'too_late');
});
await t('a different person sharing a phone or email gets a separate file, flagged for review', async () => {
  const fri = nextDow(5);
  const at = (await one(db, 'postgres', `select (($1::date + time '13:00') at time zone 'America/Chicago') as at`, [fri])).at;
  const r = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.exp], at, client({ first_name: 'Maya' })]);   // Ava's phone + email, different person
  assert.equal(r.ok, true, JSON.stringify(r));
  const rows = (await as(db, U.owner, `select first_name, tags from clients where business_id = $1 and phone_e164 = '+12255550142' order by created_at`, [biz])).rows;
  assert.deepEqual(rows.map((x) => x.first_name), ['Ava', 'Maya']); assert.deepEqual(rows[1].tags, ['possible_duplicate']);
  const again = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.exp], new Date(new Date(at).getTime() + 3600e3).toISOString(), client({ first_name: 'ava', phone: '225.555.0142' })]);
  assert.equal(again.ok, true);
  const ava = (await as(db, U.owner, `select count(*)::int n from appointments a join clients c on c.id = a.client_id where c.first_name = 'Ava' and c.business_id = $1`, [biz])).rows[0].n;
  assert.ok(ava >= 2, 'returning client not matched by name + phone');
});
await t('staff of one studio cannot see another studio\'s clients', async () => {
  const mine = await as(db, U.owner, `select count(*)::int n from clients`); assert.ok(mine.rows[0].n >= 3, 'owner sees ' + JSON.stringify(mine.rows));
  const theirs = await as(db, U.other, `select count(*)::int n from clients`); assert.equal(theirs.rows[0].n, 0);
  const appts = await as(db, U.other, `select count(*)::int n from appointments`); assert.equal(appts.rows[0].n, 0);
});
await t('a non-member cannot write into another studio', async () => {
  await assert.rejects(as(db, U.other, `insert into clients (business_id, first_name) values ($1, 'Mallory')`, [biz]), /row-level security/);
  const upd = await as(db, U.other, `update appointments set status = 'cancelled' where business_id = $1 returning id`, [biz]); assert.equal(upd.rows.length, 0);
});
await t('ids from another studio are refused', async () => {
  const other = await j(db, U.other, `select public.create_business('Other Studio', 'other-test')`);
  await assert.rejects(as(db, U.other, `select public.sync_catalog($1, $2::jsonb)`, [other, JSON.stringify(catalog)]), /another business/);
  await assert.rejects(as(db, U.other, `insert into appointments (business_id, staff_id, starts_at, ends_at) values ($1, $2, now() + interval '3 days', now() + interval '3 days 1 hour')`, [other, S.dani]), /does not belong/);
});
await t('health files: providers and owners only, and every open is logged', async () => {
  await db.exec(`insert into members (business_id, user_id, role) values ('${biz}', '${U.desk}', 'front_desk')`);
  const cid = (await one(db, U.owner, `select id from clients where business_id = $1 order by created_at limit 1`, [biz])).id;
  await as(db, U.owner, `select public.save_client_health($1, $2::jsonb)`, [cid, JSON.stringify({ conditions: ['Cancer (current or past)'], oncology: { clearance: true } })]);
  const med = await j(db, U.owner, `select public.read_client_health($1)`, [cid]); assert.deepEqual(med.conditions, ['Cancer (current or past)']);
  await assert.rejects(as(db, U.desk, `select public.read_client_health($1)`, [cid]), /not allowed/);
  const direct = await as(db, U.owner, `select count(*)::int n from client_health`); assert.equal(direct.rows[0].n, 0);   // no direct reads, even for the owner
  const log = await as(db, U.owner, `select action, detail from audit_log where entity = 'client_health' order by at`);
  assert.deepEqual(log.rows.map((r) => r.action), ['update', 'view']);
  assert.ok(!JSON.stringify(log.rows).includes('Cancer'), 'medical content leaked into the audit log');
  const deskSees = await as(db, U.desk, `select count(*)::int n from audit_log`); assert.equal(deskSees.rows[0].n, 0);
});
await t('online bookings are in the audit log with no staff actor', async () => {
  const r = await as(db, U.owner, `select count(*)::int n from audit_log where entity = 'appointments' and action = 'insert' and actor is null`);
  assert.ok(r.rows[0].n >= 3);
});
await t('front desk can book and move appointments but not delete clients', async () => {
  const tue = nextDow(2);
  const at = (await one(db, 'postgres', `select (($1::date + time '11:00') at time zone 'America/Chicago') as at`, [tue])).at;
  const ins = await as(db, U.desk, `insert into appointments (business_id, staff_id, starts_at, ends_at, source) values ($1, $2, $3, $3::timestamptz + interval '1 hour', 'desk') returning id`, [biz, S.bri, at]);
  assert.equal(ins.rows.length, 1);
  const del = await as(db, U.desk, `delete from clients where business_id = $1 returning id`, [biz]); assert.equal(del.rows.length, 0);
});
await t('rate limit: a flood from one address is cut off', async () => {
  await db.exec(`select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9"}', false)`);
  const wed = nextDow(3); let last;
  for (let i = 0; i < 9; i++) {
    const at = (await one(db, 'postgres', `select (($1::date + time '09:00' + make_interval(hours => $2)) at time zone 'America/Chicago') as at`, [wed, i % 8])).at;
    last = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.exp], at, client({ phone: '22555502' + String(10 + i) })]);
  }
  assert.equal(last.reason, 'rate_limited');
  await db.exec(`select set_config('request.headers', '', false)`);
});
await t('one phone number cannot hold more than 3 upcoming online bookings', async () => {
  const thu = nextDow(4); const res = [];
  for (let i = 0; i < 4; i++) {
    const at = (await one(db, 'postgres', `select (($1::date + time '09:00' + make_interval(hours => $2)) at time zone 'America/Chicago') as at`, [thu, i])).at;
    res.push((await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.exp], at, client({ phone: '2255559999', first_name: 'Rae' })])).reason || 'ok');
  }
  assert.deepEqual(res, ['ok', 'ok', 'ok', 'too_many'], JSON.stringify(res));
});

// ----------------------------------------------------------------- records: notes, forms, health, checkout
await t('notes: the team shares them, other studios never see them, deletes are soft', async () => {
  const cid = (await one(db, U.owner, `select id from clients where business_id = $1 order by created_at limit 1`, [biz])).id;
  const nid = (await one(db, U.desk, `insert into notes (business_id, client_id, staff_id, kind, body) values ($1, $2, $3, 'caution', 'Reacted to glycolic: redness 48h') returning id`, [biz, cid, S.dani])).id;
  assert.equal((await as(db, U.owner, `select count(*)::int n from notes where id = $1`, [nid])).rows[0].n, 1);
  assert.equal((await as(db, U.other, `select count(*)::int n from notes where id = $1`, [nid])).rows[0].n, 0);
  await as(db, U.desk, `update notes set deleted_at = now() where id = $1`, [nid]);
  const del = await as(db, U.desk, `delete from notes where id = $1 returning id`, [nid]); assert.equal(del.rows.length, 0, 'hard delete allowed');
});
await t('front desk can record an intake but cannot read health details back', async () => {
  const cid = (await one(db, U.owner, `select id from clients where business_id = $1 and first_name = 'Mia'`, [biz])).id;
  await as(db, U.desk, `select public.save_client_health($1, $2::jsonb)`, [cid, JSON.stringify({ conditions: ['Diabetes'] })]);
  await assert.rejects(as(db, U.desk, `select public.read_client_health($1)`, [cid]), /not allowed/);
  await assert.rejects(as(db, U.desk, `select public.log_health_view($1)`, [cid]), /not allowed/);
  const med = await j(db, U.owner, `select public.read_client_health($1)`, [cid]); assert.deepEqual(med.conditions, ['Diabetes']);
  await as(db, U.owner, `select public.log_health_view($1)`, [cid]);
  const idx = (await as(db, U.desk, `select * from public.health_index($1)`, [biz])).rows; assert.ok(idx.some((r) => r.client_id === cid), 'index missing');
  assert.equal((await as(db, U.other, `select * from public.health_index($1)`, [biz])).rows.length, 0);
});
await t('form answers and signatures: saved by anyone on the team, read only by clinical roles, every read logged', async () => {
  const cid = (await one(db, U.owner, `select id from clients where business_id = $1 order by created_at limit 1`, [biz])).id;
  const fid = (await one(db, U.desk, `insert into forms (business_id, client_id, template_id, status, sent_on) values ($1, $2, 'consent_peel', 'sent', current_date) returning id`, [biz, cid])).id;
  const sig = 'data:image/png;base64,iVBORw0KGgo=';
  await as(db, U.desk, `select public.save_form_answers($1, $2::jsonb, $3, $4::jsonb)`, [fid, JSON.stringify({ ack_risks: true }), sig, JSON.stringify({ device: 'iPad' })]);
  await as(db, U.desk, `update forms set status = 'completed', completed_on = current_date where id = $1`, [fid]);
  await assert.rejects(as(db, U.desk, `select public.read_form_answers($1)`, [fid]), /not allowed/);
  const a = await j(db, U.owner, `select public.read_form_answers($1)`, [fid]);
  assert.equal(a.answers.ack_risks, true); assert.equal(a.signature, sig); assert.ok(a.signed_at, 'no signing time');
  await assert.rejects(as(db, U.desk, `select public.save_form_answers($1, '{}'::jsonb, 'javascript:alert(1)')`, [fid]), /data URL/);
  await assert.rejects(as(db, 'anon', `select public.read_form_answers($1)`, [fid]), /permission denied/);
  await assert.rejects(as(db, 'anon', `select * from form_answers`), /permission denied/);
  const log = (await as(db, U.owner, `select action from audit_log where entity = 'form_answers' and entity_id = $1 order by at`, [fid])).rows.map((r) => r.action);
  assert.deepEqual(log, ['update', 'view']);
});
await t('checkout: tickets and refunds sync, guarded against other studios\' ids', async () => {
  const cid = (await one(db, U.owner, `select id from clients where business_id = $1 order by created_at limit 1`, [biz])).id;
  const tid = (await one(db, U.desk, `insert into tickets (business_id, client_id, staff_id, sold_on, total_cents, data) values ($1, $2, $3, current_date, 11400, '{"lines":[{"name":"Signature Facial","price":95}],"tip":19}') returning id`, [biz, cid, S.dani])).id;
  await as(db, U.desk, `insert into refunds (business_id, ticket_id, client_id, refunded_on, amount_cents, method, reason, data) values ($1, $2, $3, current_date, 1900, 'credit', 'Allergic reaction', '{}')`, [biz, tid, cid]);
  await as(db, U.desk, `update tickets set refunded_cents = 1900 where id = $1`, [tid]);
  assert.equal((await as(db, U.other, `select count(*)::int n from tickets`)).rows[0].n, 0);
  const other = (await one(db, U.other, `select id from businesses where slug = 'other-test'`)).id;
  await assert.rejects(as(db, U.other, `insert into tickets (business_id, client_id, sold_on, total_cents, data) values ($1, $2, current_date, 100, '{}')`, [other, cid]), /does not belong/);
  await assert.rejects(as(db, U.other, `insert into refunds (business_id, ticket_id, refunded_on, amount_cents, data) values ($1, $2, current_date, 100, '{}')`, [other, tid]), /does not belong/);
});
await t('gift cards: one balance for every device, never spent below zero, the ledger never rewritten', async () => {
  const cid = (await one(db, U.owner, `select id from clients where business_id = $1 order by created_at limit 1`, [biz])).id;
  const tid = (await one(db, U.desk, `insert into tickets (business_id, client_id, sold_on, total_cents, data) values ($1, $2, current_date, 10000, '{"lines":[{"type":"gift","name":"Gift card $100","price":100}]}') returning id`, [biz, cid])).id;
  // the iPad that sold it sends the card; whatever balance it claims is ignored
  const card = await one(db, U.desk, `insert into gift_cards (business_id, code, amount_cents, balance_cents, client_id, ticket_id, issued_on) values ($1, 'k7qm-4xpd', 10000, 999999, $2, $3, current_date) returning id, code, balance_cents`, [biz, cid, tid]);
  assert.equal(card.code, 'K7QM-4XPD'); assert.equal(card.balance_cents, 10000);
  const use = (id, cents, kind = 'redeem') => as(db, U.desk, `insert into gift_card_uses (id, business_id, card_id, ticket_id, kind, amount_cents, used_on) values ($1, $2, $3, $4, $5, $6, current_date)
    on conflict (id) do update set amount_cents = excluded.amount_cents, kind = excluded.kind`, [id, biz, card.id, tid, kind, cents]);
  const bal = async () => (await one(db, U.owner, `select balance_cents b from gift_cards where id = $1`, [card.id])).b;
  const u1 = 'ccccccc1-0000-4000-8000-000000000001';
  await use(u1, 6000); assert.equal(await bal(), 4000);
  // a device that didn't hear back sends the same use again (or an altered copy): nothing changes
  await use(u1, 6000); await use(u1, 100); assert.equal(await bal(), 4000);
  assert.equal((await one(db, U.owner, `select amount_cents a from gift_card_uses where id = $1`, [u1])).a, 6000);
  // another iPad tries to spend more than is left
  await assert.rejects(use('ccccccc1-0000-4000-8000-000000000002', 5000), /has \$40\.00 left/);
  assert.equal(await bal(), 4000);
  // a refund goes back onto the card, never past what it was sold for, and only as a negative amount
  await use('ccccccc1-0000-4000-8000-000000000003', -1000, 'refund'); assert.equal(await bal(), 5000);
  await assert.rejects(use('ccccccc1-0000-4000-8000-000000000004', -6000, 'refund'), /more than it was sold for/);
  await assert.rejects(use('ccccccc1-0000-4000-8000-000000000005', 1000, 'refund'), /check constraint/);
  // what a card is worth and its code can't be edited, and its balance can't be set
  await as(db, U.desk, `update gift_cards set amount_cents = 50000, balance_cents = 50000, code = 'FREE-MONEY' where id = $1`, [card.id]);
  assert.deepEqual(await one(db, U.owner, `select amount_cents, balance_cents, code from gift_cards where id = $1`, [card.id]), { amount_cents: 10000, balance_cents: 5000, code: 'K7QM-4XPD' });
  // nothing is ever deleted
  await as(db, U.owner, `delete from gift_card_uses where id = $1`, [u1]); await as(db, U.owner, `delete from gift_cards where id = $1`, [card.id]);
  assert.equal(await bal(), 5000);
  // one code per studio
  await assert.rejects(as(db, U.desk, `insert into gift_cards (business_id, code, amount_cents, issued_on) values ($1, 'K7QM-4XPD', 2500, current_date)`, [biz]), /duplicate key/);
  // other studios can't see it, spend it, or point their own cards at this studio's sales
  assert.equal((await one(db, U.other, `select count(*)::int n from gift_cards`)).n, 0);
  const other = (await one(db, U.other, `select id from businesses where slug = 'other-test'`)).id;
  await assert.rejects(as(db, U.other, `insert into gift_card_uses (business_id, card_id, kind, amount_cents, used_on) values ($1, $2, 'redeem', 100, current_date)`, [other, card.id]), /does not belong/);
  await assert.rejects(as(db, U.other, `insert into gift_cards (business_id, code, amount_cents, ticket_id, issued_on) values ($1, 'ABCD-2345', 100, $2, current_date)`, [other, tid]), /does not belong/);
  await assert.rejects(as(db, 'anon', `select * from gift_cards`), /permission denied/);
  await assert.rejects(as(db, 'anon', `select * from gift_card_uses`), /permission denied/);
  // the sale and every use are in the audit log
  const log = (await as(db, U.owner, `select entity || ':' || action as e from audit_log where entity_id in ($1, $2) order by at`, [card.id, u1])).rows.map((r) => r.e);
  assert.ok(log.includes('gift_cards:insert') && log.includes('gift_card_uses:insert'), JSON.stringify(log));
});

// ---------------------------------------------------------------- intake on the client's phone
const intakeDef = { id: 'intake', name: 'New Client Intake', kind: 'intake', fields: [
  { id: 'conditions', label: 'Conditions', type: 'multi', options: ['Cancer (current or past)', 'Diabetes', 'None of these'] },
  { id: 'accurate', label: 'Accurate', type: 'agree' }, { id: 'sig', label: 'Signature', type: 'signature' }] };
await t('form templates: owners and managers keep them, the front desk and other studios can only read their own', async () => {
  await as(db, U.owner, `insert into form_templates (business_id, template_id, kind, name, definition) values ($1, 'intake', 'intake', 'New Client Intake', $2::jsonb)`, [biz, JSON.stringify(intakeDef)]);
  await assert.rejects(as(db, U.desk, `update form_templates set name = 'x' where business_id = $1 returning 1`, [biz]).then((r) => { if (!r.rows.length) throw new Error('row-level security'); }), /row-level security/);
  assert.equal((await one(db, U.desk, `select count(*)::int n from form_templates where business_id = $1`, [biz])).n, 1);
  assert.equal((await one(db, U.other, `select count(*)::int n from form_templates`)).n, 0);
  await assert.rejects(as(db, 'anon', `select * from form_templates`), /permission denied/);
});
let intakeToken, intakeClient;
await t('booking online hands a new client their intake link; booking again hands back the same one', async () => {
  const slot = (await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], null, $2::date, 1)`, [[V.exp], nextDow(4, 3)])).days[0].slots[0];
  const r = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.exp], slot.at, client({ first_name: 'Nora', phone: '2255550177', email: 'nora@example.com' })]);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.ok(r.appointment.intake_token, 'no intake link'); intakeToken = r.appointment.intake_token;
  const f = await one(db, U.owner, `select client_id, status, definition ->> 'name' as name from forms where public_token = $1`, [intakeToken]);
  assert.equal(f.status, 'sent'); assert.equal(f.name, 'New Client Intake', 'questions not frozen onto the form'); intakeClient = f.client_id;
  const g = await j(db, 'anon', `select public.booking_get($1)`, [r.appointment.token]); assert.equal(g.appointment.intake_token, intakeToken);
  const slot2 = (await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], null, $2::date, 1)`, [[V.exp], nextDow(5, 3)])).days[0].slots[0];
  const r2 = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.exp], slot2.at, client({ first_name: 'Nora', phone: '2255550177', email: 'nora@example.com' })]);
  assert.equal(r2.appointment.intake_token, intakeToken, 'a second intake form was created');
});
await t('the link shows the questions and the client\'s first name, nothing more; bad links say not found', async () => {
  const g = await j(db, 'anon', `select public.form_public_get($1)`, [intakeToken]);
  assert.equal(g.ok, true); assert.equal(g.client.first_name, 'Nora'); assert.equal(g.form.definition.fields.length, 3); assert.equal(g.business.name, 'Simply Facials Test');
  assert.ok(!JSON.stringify(g).includes('2255550177') && !JSON.stringify(g).includes('nora@example.com'), 'contact details leaked');
  const bad = await j(db, 'anon', `select public.form_public_get($1)`, ['00000000-0000-4000-8000-000000000000']); assert.equal(bad.reason, 'not_found');
  await assert.rejects(as(db, 'anon', `select public.intake_link_for($1, $2)`, [biz, intakeClient]), /permission denied/);
});
await t('a form\'s link and questions never change after it is sent', async () => {
  const before = await one(db, U.owner, `select id, public_token, definition from forms where public_token = $1`, [intakeToken]);
  await as(db, U.desk, `update forms set public_token = gen_random_uuid(), definition = '{"fields":[]}'::jsonb where id = $1`, [before.id]);
  const after = await one(db, U.owner, `select public_token, definition from forms where id = $1`, [before.id]);
  assert.equal(after.public_token, before.public_token); assert.deepEqual(after.definition, before.definition);
});
await t('the client signs on their phone: answers and signature filed, cautions added to their file, health file updated', async () => {
  await as(db, U.owner, `update clients set flags = '{vip_note}', profile = profile || '{"allergies":["Penicillin"]}'::jsonb where id = $1`, [intakeClient]);
  await as(db, U.owner, `select public.save_client_health($1, '{"pregnancy":"Pregnant"}'::jsonb)`, [intakeClient]);
  const bad = await j(db, 'anon', `select public.form_public_submit($1, $2::jsonb, $3)`, [intakeToken, JSON.stringify({ accurate: true }), 'javascript:alert(1)']);
  assert.equal(bad.reason, 'signature');
  const derived = { flags: ['oncology', 'allergy', 'Robert"); drop table x;--'], allergies: ['Latex'], skin: 'Dry', concerns: ['Redness'], prefs: 'quiet room', medical: { conditions: ['Cancer (current or past)'], cancer: { type: 'Breast' } } };
  const r = await j(db, 'anon', `select public.form_public_submit($1, $2::jsonb, $3, $4::jsonb, $5::jsonb)`, [intakeToken, JSON.stringify({ conditions: ['Cancer (current or past)'], accurate: true }), 'data:image/png;base64,iVBORw0KGgo=', JSON.stringify(derived), JSON.stringify({ device: 'iPhone' })]);
  assert.equal(r.ok, true, JSON.stringify(r));
  const f = await one(db, U.owner, `select status, completed_on from forms where public_token = $1`, [intakeToken]); assert.equal(f.status, 'completed'); assert.ok(f.completed_on);
  const c = await one(db, U.owner, `select flags, profile from clients where id = $1`, [intakeClient]);
  assert.deepEqual([...c.flags].sort(), ['allergy', 'oncology', 'vip_note']); assert.deepEqual([...c.profile.allergies].sort(), ['Latex', 'Penicillin']); assert.equal(c.profile.skin, 'Dry');
  const h = await j(db, U.owner, `select public.read_client_health($1)`, [intakeClient]); assert.equal(h.cancer.type, 'Breast'); assert.equal(h.pregnancy, 'Pregnant', 'the link overwrote what the studio had');
  const fid = (await one(db, U.owner, `select id from forms where public_token = $1`, [intakeToken])).id;
  const a = await j(db, U.owner, `select public.read_form_answers($1)`, [fid]); assert.equal(a.answers.accurate, true); assert.ok(a.signature.startsWith('data:image/png'));
  const again = await j(db, 'anon', `select public.form_public_submit($1, '{}'::jsonb, 'data:image/png;base64,AA==')`, [intakeToken]); assert.equal(again.reason, 'done');
  const shown = await j(db, 'anon', `select public.form_public_get($1)`, [intakeToken]); assert.equal(shown.reason, 'done');
  const idx = (await as(db, U.owner, `select * from public.health_index($1, now() - interval '1 minute')`, [biz])).rows; assert.ok(idx.some((x) => x.client_id === intakeClient), 'health index missed the new file');
  assert.equal((await as(db, U.owner, `select * from public.health_index($1, now() + interval '1 minute')`, [biz])).rows.length, 0);
});
await t('a client who already filled in the intake gets no new link', async () => {
  const slot = (await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], null, $2::date, 1)`, [[V.exp], nextDow(6, 3)])).days[0].slots[0];
  const r = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.exp], slot.at, client({ first_name: 'Nora', phone: '2255550177' })]);
  assert.equal(r.ok, true); assert.equal(r.appointment.intake_token, null);
});
await t('deleting a client: owners and managers only; hidden for the record, upcoming visits cancelled, never matched again', async () => {
  await assert.rejects(as(db, U.desk, `select public.delete_client($1)`, [intakeClient]), /not allowed/);
  await assert.rejects(as(db, 'anon', `select public.delete_client($1)`, [intakeClient]), /permission denied/);
  const upcoming = (await one(db, U.owner, `select count(*)::int n from appointments where client_id = $1 and starts_at > now() and status = 'booked'`, [intakeClient])).n; assert.ok(upcoming >= 2);
  const r = await j(db, U.owner, `select public.delete_client($1)`, [intakeClient]); assert.equal(r.cancelled, upcoming);
  const c = await one(db, U.owner, `select deleted_at from clients where id = $1`, [intakeClient]); assert.ok(c.deleted_at);
  const slot = (await j(db, 'anon', `select public.booking_slots('simply-test', $1::uuid[], null, $2::date, 1)`, [[V.exp], nextDow(4, 10)])).days[0].slots[0];
  const b = await j(db, 'anon', `select public.booking_create('simply-test', $1::uuid[], $2::timestamptz, $3::jsonb)`, [[V.exp], slot.at, client({ first_name: 'Nora', phone: '2255550177' })]);
  const nc = await one(db, U.owner, `select client_id from appointments where id = $1`, [b.appointment.id]); assert.notEqual(nc.client_id, intakeClient, 'booked onto the deleted file');
});

// ---------------------------------------------------------------- the website
await t('demo requests: anyone can ask, nobody signed in can read them, bots and floods are turned away', async () => {
  const ask = (o) => j(db, 'anon', `select public.request_demo($1::jsonb)`, [JSON.stringify(o)]);
  assert.deepEqual(await ask({ name: '  Kelsey  ', studio: 'Neu Skin Esthetics', email: 'Kelsey@Example.com', kind: 'Skin & facial studio', software: 'Square', best_time: 'Tue afternoon', message: 'Want to see the intake', founding: true, page: '/welcome/' }), { ok: true });
  const r = await one(db, 'postgres', `select name, studio, email, phone, founding, status, software from demo_requests order by created_at desc limit 1`);
  assert.deepEqual(r, { name: 'Kelsey', studio: 'Neu Skin Esthetics', email: 'kelsey@example.com', phone: null, founding: true, status: 'new', software: 'Square' });
  assert.equal((await ask({ name: 'No Contact' })).reason, 'contact');
  assert.equal((await ask({ name: 'Bad Email', email: 'not-an-email', phone: '555' })).reason, 'contact');
  assert.equal((await ask({ email: 'x@example.com' })).reason, 'name');
  assert.deepEqual(await ask({ name: 'Phone Only', phone: '(225) 555-0188' }), { ok: true });
  assert.equal((await one(db, 'postgres', `select phone from demo_requests where name = 'Phone Only'`)).phone, '2255550188');
  // the hidden field: thanked, not kept
  assert.deepEqual(await ask({ name: 'Bot', email: 'bot@example.com', website: 'http://spam.example' }), { ok: true });
  assert.equal((await one(db, 'postgres', `select count(*)::int n from demo_requests where name = 'Bot'`)).n, 0);
  // nobody but Luster reads them
  await assert.rejects(as(db, 'anon', `select * from demo_requests`), /permission denied/);
  await assert.rejects(as(db, U.owner, `select * from demo_requests`), /permission denied/);
  await assert.rejects(as(db, 'anon', `insert into demo_requests (name) values ('direct')`), /permission denied/);
  // five an hour from one address
  await db.exec(`select set_config('request.headers', '{"x-forwarded-for": "198.51.100.7"}', false)`);
  for (let i = 0; i < 5; i++) assert.deepEqual(await ask({ name: 'Flood ' + i, email: `f${i}@example.com` }), { ok: true });
  assert.equal((await ask({ name: 'Flood 6', email: 'f6@example.com' })).reason, 'rate_limited');
  await db.exec(`select set_config('request.headers', '', false)`);
});

// ---------------------------------------------------------------- remote support
await t('devices report problems for support; capped per person; owners read their own studio only', async () => {
  assert.equal(await j(db, U.desk, `select public.log_app_event($1, 'sync', 'Sync problem: timeout', '{"rows":3}'::jsonb, 'iPad Safari', 'abc123')`, [biz]), true);
  await assert.rejects(as(db, 'anon', `select public.log_app_event(null, 'error', 'x')`), /permission denied/);
  await assert.rejects(as(db, U.desk, `insert into app_events (kind, message) values ('error', 'forged')`), /permission denied/);
  const own = await one(db, U.owner, `select count(*)::int n, max(message) m from app_events where business_id = $1`, [biz]); assert.equal(own.n, 1); assert.equal(own.m, 'Sync problem: timeout');
  assert.equal((await one(db, U.desk, `select count(*)::int n from app_events`)).n, 0, 'front desk reads support events');
  assert.equal((await one(db, U.other, `select count(*)::int n from app_events`)).n, 0, 'another studio reads them');
  // someone else's business id is dropped, not trusted
  await j(db, U.other, `select public.log_app_event($1, 'error', 'mine?')`, [biz]);
  assert.equal((await one(db, 'postgres', `select business_id from app_events where message = 'mine?'`)).business_id, null);
  for (let i = 0; i < 70; i++) await as(db, U.other, `select public.log_app_event(null, 'error', 'spam')`);
  assert.equal((await one(db, 'postgres', `select count(*)::int n from app_events where user_id = $1`, [U.other])).n, 60);
});

console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
