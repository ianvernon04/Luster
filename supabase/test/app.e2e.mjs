// End-to-end: the installable app (root index.html) going live, a client booking on the public page, and the booking
// landing on the iPad calendar — with the iPad set to Japan time and the studio in Baton Rouge.
//   ./src/build-pwa.sh && cd supabase/test && node app.e2e.mjs
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import { freshDb, as } from './harness.mjs'; import { startServer } from './server.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..', '..');
const shots = path.join(here, 'shots'); fs.mkdirSync(shots, { recursive: true });

let fails = 0; const errors = [];
const t = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { fails++; console.log('FAIL ', name, '-', e.message.split('\n').filter(Boolean).slice(0, 3).join(' | ')); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
// CI runners are slower than a laptop: stretch every wait there (LUSTER_TEST_SLOW=2 to try it locally)
const SLOW = Number(process.env.LUSTER_TEST_SLOW || (process.env.CI ? 3 : 1));
const until = async (fn, ms = 8000, what = 'condition') => { const end = Date.now() + ms * SLOW; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await new Promise((r) => setTimeout(r, 150)); } throw new Error(`timed out waiting for ${what} (${JSON.stringify(last)})`); };
const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const db = await freshDb();
const srv = await startServer({ db, root, config: { client: { realtime: false, pollMs: 1200 } } });
const base = `http://localhost:${srv.port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
async function ctx(opts) {
  const c = await browser.newContext({ timezoneId: 'Asia/Tokyo', locale: 'en-US', serviceWorkers: 'block', ...opts }); const p = await c.newPage();
  p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  // a failed request to somewhere other than our own test server (web fonts behind a sandbox proxy) isn't the app's fault
  const offSite = (m) => { const u = (m.location() || {}).url || ''; return /^https?:/.test(u) && !u.startsWith('http://localhost:'); };
  p.on('console', (m) => { if (m.type() === 'error' && !offSite(m) && !/fonts\.g|ERR_TUNNEL|ERR_NAME|status of 4\d\d|WebSocket/.test(m.text())) errors.push('[console] ' + m.text()); });
  return { c, p };
}
const ipad = { viewport: { width: 1180, height: 820 }, hasTouch: true };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

const { p: pad } = await ctx(ipad);
await pad.goto(base + '?studio=simplyfacials'); await pad.waitForSelector('#rail .nav-item', { state: 'attached' });   // the pitch link creates Simply Facials' demo
await pad.goto(base); await pad.waitForSelector('#rail .nav-item', { state: 'attached' });                            // later reloads use the plain app

await t('demo app shows the go-live card in Online booking settings', async () => {
  await pad.click('[data-act="go"][data-view="settings"]'); await pad.click('[data-act="settings-tab"][data-id="booking"]');
  await pad.waitForSelector('[data-act="cloud-golive"]');
});
await t('create an account, then put the business online', async () => {
  await pad.click('[data-act="cloud-golive"]'); await pad.waitForSelector('#ca-email');
  await pad.click('[data-act="cloud-auth-mode"]'); await pad.waitForSelector('text=Create your Luster account');
  await pad.fill('#ca-email', 'ixv@nwluster.com'); await pad.fill('#ca-pass', 'short'); await pad.click('[data-act="cloud-auth-submit"]');
  await pad.waitForSelector('#modal-root .alert.bad'); ok(/8 characters/.test(await pad.textContent('#modal-root .alert.bad')), 'password rule');
  await pad.fill('#ca-pass', 'correct-horse-battery'); await pad.click('[data-act="cloud-auth-submit"]');
  await pad.waitForSelector('#gl-slug');
  ok((await pad.inputValue('#gl-slug')) === 'simply-facials', await pad.inputValue('#gl-slug'));
  await pad.fill('#gl-name', 'Luster Test Studio'); await pad.fill('#gl-slug', 'Bad Slug!'); await pad.click('[data-act="golive-submit"]');
  await pad.waitForSelector('#modal-root .alert.bad');
  await pad.fill('#gl-slug', 'luster-test'); await pad.fill('#gl-phone', '(225) 555-0100'); await pad.fill('#gl-addr', '4353 Perkins Rd, Baton Rouge, LA');
  await pad.click('[data-act="golive-submit"]'); await pad.waitForSelector('text=Luster Test Studio is live');
  ok(/book\/luster-test/.test(await pad.textContent('#modal-root')), 'link missing');
  await pad.screenshot({ path: `${shots}/a1-live.png` });
  await pad.click('#modal-root [data-act="close-modal"]');
});
await t('the cloud has the business, team, menu, hours and booking rules', async () => {
  const b = (await as(db, 'postgres', `select id, is_live, timezone, booking from businesses where slug = 'luster-test'`)).rows[0];
  ok(b && b.is_live && b.timezone === 'America/Chicago', JSON.stringify(b));
  ok(b.booking.categories.length >= 3 && b.booking.cancel_hours === 24, JSON.stringify(b.booking));
  const n = (await as(db, 'postgres', `select (select count(*) from staff where business_id = $1)::int st, (select count(*) from services where business_id = $1)::int sv, (select count(*) from staff_hours where business_id = $1)::int h, (select count(*) from staff where business_id = $1 and key = 's1')::int k`, [b.id])).rows[0];
  ok(n.st >= 3 && n.sv >= 10 && n.h >= 10 && n.k === 1, JSON.stringify(n));
});
await t('the iPad now runs on Baton Rouge time and says it is live', async () => {
  await until(async () => /Live · synced/.test(await pad.textContent('#rail')), 8000, 'synced status');
  ok(await pad.evaluate(() => todayStr()) === chicagoToday(), 'app date is not the studio date');
  ok(await pad.evaluate(() => window.Luster.state.clients.length) === 0, 'sample clients came along');
});
let booked; let phoneP;
await t('a client books on their phone', async () => {
  const { p } = await ctx(phone); phoneP = p;
  await p.goto(`${base}book/luster-test`); await p.waitForSelector('.opt');
  await p.locator('.opt').first().click(); await p.click('.bar [data-act="go"]');
  await p.click('[data-act="go"][data-s="2"]'); await p.waitForSelector('.slot');
  await p.locator('.day:not([disabled])').nth(2).click();
  const slot = p.locator('.slot').first(); booked = { at: await slot.getAttribute('data-at'), time: await slot.getAttribute('data-time') }; await slot.click();
  await p.click('[data-act="go"][data-s="3"]'); await p.fill('#f-first', 'Ava'); await p.fill('#f-last', 'Landry'); await p.fill('#f-phone', '(225) 555-0142');
  await p.click('#f button[type="submit"]'); await p.click('[data-act="book"]'); await p.waitForSelector('.done');
  await p.waitForSelector('.next'); await p.screenshot({ path: `${shots}/a2b-booked-phone.png` });
  booked.date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(booked.at));
});
await t('it lands on the iPad calendar at the studio\'s time, with a heads-up', async () => {
  const a = await until(() => pad.evaluate(() => window.Luster.state.appointments.find((x) => x.source === 'online')), 8000, 'online appointment');
  const [h, m] = booked.time.split(':').map(Number);
  ok(a.date === booked.date && a.start === h * 60 + m, `landed at ${a.date} ${a.start}, booked ${booked.date} ${booked.time}`);
  const c = await pad.evaluate((id) => window.Luster.state.clients.find((x) => x.id === id), a.clientId);
  ok(c && c.first === 'Ava' && c.phone === '2255550142', JSON.stringify(c));
  await until(async () => /New online booking: Ava Landry/.test(await pad.textContent('#toasts')), 4000, 'toast');
  await pad.evaluate((d) => { window.Luster.ui.date = d; window.Luster.go('calendar'); }, booked.date);
  await pad.waitForSelector(`[data-appt="${a.id}"], [data-id="${a.id}"]`, { timeout: 4000 }).catch(async () => { ok(/Ava/.test(await pad.textContent('#content')), 'not drawn on the calendar'); });
  await pad.screenshot({ path: `${shots}/a2-landed.png` });
});
await t('the new client fills in their intake on their phone; the iPad gets the cautions and the health file', async () => {
  const p = phoneP; await p.waitForSelector('.next'); ok(/health form/.test(await p.textContent('.next')), 'no intake card after booking');
  await p.click('.next a'); await p.waitForSelector('#ff .ffield'); await p.screenshot({ path: `${shots}/a6a-intake-top.png` });
  ok(/Hi Ava/.test(await p.textContent('#app')), 'not addressed to the client');
  await p.click('[data-field="conditions"] .chip[data-v="Cancer (current or past)"]');
  await p.fill('[data-input="cancer_type"]', 'Breast');
  await p.click('#ff button[type="submit"]'); await p.waitForSelector('#ff .alert.bad');
  ok(/Please answer/.test(await p.textContent('#ff .alert.bad')), 'missing answers not flagged');
  await p.click('[data-field="allergies"] .chip[data-v="Latex"]');
  // answer everything else the quickest way, as a hurried client would
  for (let i = 0; i < 3; i++) await p.evaluate(() => { for (const box of document.querySelectorAll('#ff .ffield[data-type="choice"], #ff .ffield[data-type="multi"]')) { if (box.hidden || box.querySelector('.chip[aria-pressed="true"]')) continue; box.querySelector('.chip').click(); } });
  for (const cb of await p.$$('#ff .ffield[data-type="agree"]:not([hidden]) input')) await cb.check();
  const cv = await p.$('#sig'); await cv.scrollIntoViewIfNeeded(); const b = await cv.boundingBox();
  await p.mouse.move(b.x + 20, b.y + 80); await p.mouse.down(); await p.mouse.move(b.x + 160, b.y + 40, { steps: 6 }); await p.mouse.move(b.x + 300, b.y + 100, { steps: 6 }); await p.mouse.up();
  await p.screenshot({ path: `${shots}/a6-intake-phone.png`, fullPage: false });
  await p.click('#ff button[type="submit"]'); await p.waitForSelector('.done');
  ok(/Thank you, Ava/.test(await p.textContent('.done')), 'no thank-you');
  const c = await until(() => pad.evaluate(() => { const c = window.Luster.state.clients.find((x) => x.first === 'Ava'); return c && c.flags.includes('oncology') && c.flags.includes('allergy') && c.allergies.includes('Latex') && c; }), 8000, 'cautions on the iPad');
  await until(async () => /Ava Landry filled in their intake form/.test(await pad.textContent('#toasts')), 6000, 'signed toast');
  await pad.evaluate((cid) => { window.Luster.ui.clientId = cid; window.Luster.ui.clientTab = 'health'; window.Luster.go('clients'); }, c.id);
  await until(() => pad.evaluate((cid) => { const x = window.Luster.state.clients.find((y) => y.id === cid); return x.medical && x.medical.cancer && x.medical.cancer.type === 'Breast'; }, c.id), 6000, 'health file from the phone');
  await pad.waitForTimeout(200); await pad.screenshot({ path: `${shots}/a7-intake-landed.png` });
  const again = await p.evaluate(() => location.href); const p2 = await (await browser.newContext({ timezoneId: 'Asia/Tokyo' })).newPage(); await p2.goto(again); await p2.waitForSelector('.empty');
  ok(/Already received/.test(await p2.textContent('#app')), 'the link still opens the form after signing');
});
let deskId;
await t('a front-desk booking reaches the cloud and closes that time online', async () => {
  deskId = await pad.evaluate((d) => {
    const s = window.Luster.state.staff.find((x) => x.bookable && x.id !== 's1') || window.Luster.state.staff[0];
    const v = window.Luster.state.services.find((x) => !x.hidden);
    const c = upsertClient({ first: 'Mia', last: 'Hebert', phone: '2255550111', email: '' });
    return createAppointment({ clientId: c.id, staffId: s.id, date: d, start: 13 * 60, items: [{ serviceId: v.id, dur: v.dur, price: v.price }] }).id;
  }, booked.date);
  const row = await until(async () => (await as(db, 'postgres', `select a.source, a.starts_at, s.key, c.first_name from appointments a join staff s on s.id = a.staff_id join clients c on c.id = a.client_id where a.id = $1`, [deskId])).rows[0], 6000, 'desk row in cloud');
  ok(row.source === 'desk' && row.first_name === 'Mia', JSON.stringify(row));
  const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date(row.starts_at));
  ok(local === '13:00', 'stored at the wrong instant: ' + local);
  const local2 = await pad.evaluate((id) => { const a = window.Luster.state.appointments.find((x) => x.id === id); return { svc: a.items[0].serviceId, staff: a.staffId }; }, deskId);
  const ids = (await as(db, 'postgres', `select (select v.id from services v join businesses b on b.id = v.business_id where b.slug = 'luster-test' and v.key = $1) sv, (select s.id from staff s join businesses b on b.id = s.business_id where b.slug = 'luster-test' and s.key = $2) st`, [local2.svc, local2.staff])).rows[0];
  const slots = (await as(db, 'anon', `select public.booking_slots('luster-test', $1::uuid[], $2::uuid, $3::date, 1) r`, [[ids.sv], ids.st, booked.date])).rows[0].r;
  ok(!slots.days.length || !slots.days[0].slots.some((x) => x.time === '13:00'), '13:00 still offered online');
});
await t('hours and services set in Settings reach the booking page', async () => {
  const pick = await pad.evaluate(() => { const st0 = window.Luster.state; const s2 = st0.staff.find((x) => x.id === 's2'); const v = st0.services.find((x) => !x.hidden && !x.internal);
    const all = st0.services.filter((x) => !x.internal).map((x) => x.id); s2.skills = all.filter((id) => id !== v.id); s2.days = { ...s2.days, 2: [600, 960] }; commit(); return { svc: v.id, name: s2.name }; });
  const biz = (await as(db, 'postgres', `select id from businesses where slug = 'luster-test'`)).rows[0].id;
  await until(async () => (await as(db, 'postgres', `select count(*)::int n from staff_services ss join staff s on s.id = ss.staff_id join services v on v.id = ss.service_id where s.business_id = $1 and s.key = 's2' and v.key = $2`, [biz, pick.svc])).rows[0].n === 0, 8000, 'skill removed in cloud');
  const h = (await as(db, 'postgres', `select start_min, end_min from staff_hours h join staff s on s.id = h.staff_id where s.business_id = $1 and s.key = 's2' and h.dow = 2`, [biz])).rows[0];
  ok(h && h.start_min === 600 && h.end_min === 960, 'hours not synced: ' + JSON.stringify(h));
  const prof = (await as(db, 'anon', `select public.booking_profile('luster-test') p`)).rows[0].p;
  const svcId = (await as(db, 'postgres', `select id from services where business_id = $1 and key = $2`, [biz, pick.svc])).rows[0].id;
  ok(!prof.staff.find((x) => x.name === pick.name).services.includes(svcId), 'booking page still offers that provider');
});
await t('moving and checking in at the desk sync too', async () => {
  await pad.evaluate((id) => { moveAppointment(id, { start: 14 * 60 }); setStatus(id, 'confirmed'); }, deskId);
  await until(async () => { const r = (await as(db, 'postgres', `select status, starts_at from appointments where id = $1`, [deskId])).rows[0]; return r.status === 'confirmed' && new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date(r.starts_at)) === '14' && r; }, 6000, 'move + status');
});
await t('if the desk grabs a time a client just booked online, the database refuses and the iPad says so', async () => {
  const biz = (await as(db, 'postgres', `select id from businesses where slug = 'luster-test'`)).rows[0].id;
  const s1 = (await as(db, 'postgres', `select id from staff where business_id = $1 and key = 's1'`, [biz])).rows[0].id;
  const at = (await as(db, 'postgres', `select (($1::date + time '16:00') at time zone 'America/Chicago') as at`, [booked.date])).rows[0].at;
  // the online client wins the race: their row is in the cloud before the iPad has heard about it
  await as(db, 'postgres', `insert into appointments (business_id, staff_id, starts_at, ends_at, source) values ($1, $2, $3, $3::timestamptz + interval '1 hour', 'online')`, [biz, s1, at]);
  const clash = await pad.evaluate((d) => { const v = window.Luster.state.services.find((x) => !x.hidden); const c = window.Luster.state.clients[0]; return createAppointment({ clientId: c.id, staffId: 's1', date: d, start: 16 * 60, items: [{ serviceId: v.id, dur: 60, price: v.price }] }).id; }, booked.date);
  await until(async () => /just booked online/.test(await pad.textContent('#toasts')), 8000, 'refusal toast').catch(async (e) => { throw new Error(e.message + ' · cloud: ' + await pad.evaluate(() => Cloud.status + ' ' + Cloud.lastError)); });
  const stillThere = await pad.evaluate((id) => !!window.Luster.state.appointments.find((x) => x.id === id), clash);
  ok(!stillThere, 'refused booking still on the calendar');
  const n = (await as(db, 'postgres', `select count(*)::int n from appointments where business_id = $1 and starts_at = $2`, [biz, at])).rows[0].n; ok(n === 1, 'double booked: ' + n);
  await pad.screenshot({ path: `${shots}/a3-refused.png` });
});

let ava;
await t('notes, a signed intake, a health file, a sale and a refund all reach the cloud', async () => {
  ava = await pad.evaluate(() => window.Luster.state.clients.find((c) => c.first === 'Ava').id);
  await pad.evaluate((cid) => {
    addNote(cid, { type: 'caution', text: 'Mild redness after glycolic; patch test first', staffId: 's1' });
    addNote(cid, { type: 'treatment', text: 'Temporary note to delete', staffId: 's1' });
    const f = sendForm(cid, 'intake');
    const answers = { conditions: ['Cancer (current or past)'], cancer_type: 'Breast', cancer_status: 'In treatment', meds: [], allergies: ['None known'], __sig: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' };
    const { __sig, ...rest } = answers; completeForm(f.id, rest, __sig); applyIntakeToClient(window.Luster.state.clients.find((c) => c.id === cid), rest);   // as the Sign & save button does
    const v = window.Luster.state.services.find((x) => !x.hidden && !x.internal);
    const t = closeTicket({ appointmentId: null, clientId: cid, staffId: 's1', date: todayStr(), lines: [{ type: 'service', refId: v.id, name: v.name, price: v.price, qty: 1, staffId: 's1', note: '' }], discount: 0, tip: 20, tax: 0, total: v.price + 20, payments: [{ method: 'card', amount: v.price + 20, last4: '4242' }] });
    refundTicket(t.id, { lines: [{ name: v.name, type: 'service', refId: v.id, qty: 1, amount: 10, partial: true }], tipRefunded: 0, method: 'credit', reason: 'Allergic reaction', note: '' });
  }, ava);
  const q = async (sql) => (await as(db, 'postgres', sql, [ava])).rows;
  // health files are the last step of a sync pass, so once one is there everything before it is too
  await until(async () => (await q(`select 1 from refunds where client_id = $1`)).length === 1 && (await q(`select 1 from notes where client_id = $1`)).length === 2
    && (await q(`select 1 from client_health where client_id = $1 and medical ? 'cancer' and updated_by is not null`)).length === 1, 10000, 'records in cloud');   // the phone already left a health file: wait for the desk's
  const notes = await q(`select kind, body from notes where client_id = $1 and deleted_at is null order by created_at`);
  ok(notes.length === 2 && notes[0].kind === 'caution', JSON.stringify(notes));
  const form = (await q(`select f.status, a.signature is not null as signed, a.answers ? 'conditions' as has from forms f join form_answers a on a.form_id = f.id where f.client_id = $1`))[0];
  ok(form && form.status === 'completed' && form.signed && form.has, JSON.stringify(form));
  const health = (await q(`select medical -> 'cancer' ->> 'type' as t from client_health where client_id = $1`))[0]; ok(health && health.t === 'Breast', JSON.stringify(health));
  const flags = (await q(`select flags from clients where id = $1`))[0].flags; ok(flags.includes('oncology'), 'oncology flag not synced: ' + flags);
  const tk = (await q(`select total_cents, refunded_cents, data -> 'payments' -> 0 ->> 'last4' as last4 from tickets where client_id = $1`))[0];
  ok(tk && tk.refunded_cents === 1000 && tk.last4 === '4242', JSON.stringify(tk));
});
await t('reload: still signed in, still live, data back instantly from the device', async () => {
  await pad.reload(); await pad.waitForSelector('#rail .nav-item', { state: 'attached' });
  ok(await pad.evaluate(() => !!window.Luster.state.live), 'not live after reload');
  ok(await pad.evaluate(() => window.Luster.state.appointments.length) >= 2, 'appointments missing after reload');
  await until(async () => /Live · synced/.test(await pad.textContent('#rail')), 8000, 'synced after reload');
});
let pad2;
await t('a second iPad signs in and opens the same business from the cloud', async () => {
  const { p } = await ctx(ipad); pad2 = p;
  await p.goto(base + '?demo'); await p.waitForSelector('#rail .nav-item', { state: 'attached' });
  await p.evaluate(() => Actions.workspaces()); await p.click('[data-act="cloud-from-cloud"]');
  await p.waitForSelector('#ca-email'); await p.fill('#ca-email', 'ixv@nwluster.com'); await p.fill('#ca-pass', 'correct-horse-battery'); await p.click('[data-act="cloud-auth-submit"]');
  await p.waitForSelector('[data-act="cloud-open-biz"]'); await p.click('[data-act="cloud-open-biz"]');
  await until(() => p.evaluate(() => window.Luster.state.live && window.Luster.state.appointments.filter((a) => a.status !== 'cancelled').length >= 2), 8000, 'appointments on the second iPad');
  const names = await p.evaluate(() => window.Luster.state.staff.map((s) => s.name)); const first = await pad.evaluate(() => window.Luster.state.staff.map((s) => s.name));
  ok(JSON.stringify(names) === JSON.stringify(first), `team differs: ${names} vs ${first}`);
  // the studio's own menu sections, consent forms and which services need them come down too, not the business type's defaults
  const setup = (q) => q.evaluate(() => { const s = window.Luster.state; return JSON.stringify({ cats: s.categories.map((c) => c.id + ':' + c.label), consentFor: Object.keys(s.consentFor || {}).sort().map((k) => k + '>' + s.consentFor[k]), forms: s.formTemplates.map((f) => f.id).sort() }); });
  await until(async () => (await setup(p)) === (await setup(pad)), 8000, 'menu sections and consents on the second iPad').catch(async (e) => { throw new Error(e.message + ': ' + await setup(p) + ' vs ' + await setup(pad)); });
  ok(/sf_cryosculpt>cryo/.test(await setup(p)), 'cryotherapy consent mapping missing');
  ok(await p.evaluate(() => window.Luster.state.clients.some((c) => c.first === 'Ava' && c.flags)), 'clients missing');
});
await t('the second iPad gets notes, the sale and the flags, and opens health files on demand (logged)', async () => {
  await pad2.evaluate(() => Cloud.sync({ full: true }));
  await until(() => pad2.evaluate((cid) => window.Luster.state.notes.filter((n) => n.clientId === cid).length === 2 && window.Luster.state.tickets.some((t) => t.clientId === cid && t.refunded === 10), ava), 8000, 'records on iPad 2');
  const c = await pad2.evaluate((cid) => { const c = window.Luster.state.clients.find((x) => x.id === cid); return { flags: c.flags, medical: c.medical, inCloud: !!c.healthInCloud }; }, ava);
  ok(c.flags.includes('oncology') && !c.medical && c.inCloud, JSON.stringify(c));
  const before = (await as(db, 'postgres', `select count(*)::int n from audit_log where entity = 'client_health' and action = 'view' and entity_id = $1`, [ava])).rows[0].n;
  await pad2.evaluate((cid) => { window.Luster.ui.clientId = cid; window.Luster.ui.clientTab = 'health'; window.Luster.go('clients'); }, ava);
  await until(() => pad2.evaluate((cid) => !!window.Luster.state.clients.find((x) => x.id === cid).medical, ava), 6000, 'health file fetched');
  const after = (await as(db, 'postgres', `select count(*)::int n from audit_log where entity = 'client_health' and action = 'view' and entity_id = $1`, [ava])).rows[0].n;
  ok(after === before + 1, `views logged: ${before} → ${after}`);
  const fids = await pad2.evaluate((cid) => window.Luster.state.forms.filter((f) => f.clientId === cid && f.status === 'completed').map((f) => f.id), ava);
  ok(fids.length >= 2, 'expected the phone intake and the desk intake: ' + fids.length);
  for (const fid of fids) {
    await pad2.evaluate((id) => openModal('form-view', { id }), fid);
    await until(() => pad2.evaluate((id) => { const f = window.Luster.state.forms.find((x) => x.id === id); return !!(f.signature && f.signature.startsWith('data:image/') && f.answers); }, fid), 6000, 'signed form fetched');
    await until(async () => !!(await pad2.$('#modal-root img[alt="Signature"]')), 4000, 'signature shown');
  }
  await pad2.screenshot({ path: `${shots}/a5-second-ipad-form.png` });
});
await t('a deleted note disappears everywhere but stays in the record', async () => {
  const nid = await pad.evaluate((cid) => { const n = window.Luster.state.notes.find((x) => x.clientId === cid && /delete/.test(x.text)); deleteNote(n.id); return n.id; }, ava);
  await until(async () => (await as(db, 'postgres', `select deleted_at from notes where id = $1`, [nid])).rows[0].deleted_at, 6000, 'soft delete in cloud');
  await pad2.evaluate(() => Cloud.sync());
  await until(() => pad2.evaluate((id) => !window.Luster.state.notes.some((n) => n.id === id), nid), 6000, 'note gone on iPad 2');
});
await t('gift cards: sold on one iPad, spent on the other, and the same money can\'t be spent twice', async () => {
  const biz = (await as(db, 'postgres', `select id from businesses where slug = 'luster-test'`)).rows[0].id;
  const cloudBalance = async (id) => (await as(db, 'postgres', `select balance_cents from gift_cards where id = $1`, [id])).rows[0].balance_cents;
  // iPad 1 sells a $100 card; the code is on the receipt and goes out from the studio's phone
  await pad.evaluate((cid) => startTicket({ clientId: cid }), ava); await pad.waitForSelector('.ticket');
  await pad.click('[data-act="co-tab"][data-id="gift"]'); await pad.click('[data-act="ticket-add"][data-type="gift"][data-id="100"]');
  await pad.click('[data-act="pay"][data-m="cash"]'); await pad.waitForSelector('#cash-tendered'); await pad.click('[data-act="cash-done"]');
  await pad.waitForSelector('.gift-codes .gift-code'); const code = (await pad.textContent('.gift-codes .gift-code')).trim();
  await pad.screenshot({ path: `${shots}/a10-gift-sold.png` });
  await pad.click('[data-act="gift-send"]'); await pad.waitForSelector('#ho-body'); ok((await pad.inputValue('#ho-body')).includes(code), 'code not in the message');
  await pad.click('#modal-root [data-act="close-modal"]');
  const card = await until(async () => (await as(db, 'postgres', `select id, balance_cents, client_id, ticket_id from gift_cards where business_id = $1 and code = $2`, [biz, code])).rows[0], 8000, 'card in the cloud');
  ok(card.balance_cents === 10000 && card.client_id === ava, JSON.stringify(card));
  await until(async () => (await as(db, 'postgres', `select ticket_id from gift_cards where id = $1`, [card.id])).rows[0].ticket_id, 8000, 'card linked to its sale');
  // iPad 2 has never seen the card: it checks the code with the cloud, and the visit comes off the card
  const v = await pad2.evaluate(() => window.Luster.state.services.filter((s) => !s.internal && !s.hidden && s.price >= 20 && s.price <= 80).sort((a, b) => a.price - b.price)[0]);
  await pad2.evaluate((cid) => { closeModal(); startTicket({ clientId: cid }); }, ava); await pad2.waitForSelector('.ticket');   // the signed form from the last test is still open there
  await pad2.click(`[data-act="ticket-add"][data-type="service"][data-id="${v.id}"]`);
  await pad2.click('[data-act="pay"][data-m="gift"]'); await pad2.waitForSelector('#gift-code'); await pad2.fill('#gift-code', code.replace('-', ' ').toLowerCase()); await pad2.click('[data-act="gift-apply"]');
  await pad2.waitForSelector('#modal-root [data-act="receipt-done"]');
  const paid = await pad2.evaluate(() => { const ts = window.Luster.state.tickets; return ts[ts.length - 1].payments.find((p) => p.method === 'gift').amount; });
  ok(paid === v.price, `paid ${paid} for a ${v.price} visit`); await pad2.click('#modal-root [data-act="receipt-done"]');
  await until(async () => (await cloudBalance(card.id)) === 10000 - paid * 100, 8000, 'balance in the cloud after spending');
  await pad.evaluate(() => Cloud.sync());
  await until(() => pad.evaluate(({ code, want }) => Math.abs(giftBalance(giftByCode(code)) - want) < 0.001, { code, want: 100 - paid }), 8000, 'new balance on iPad 1');
  // another device spends all but $10 a moment before iPad 1 rings up the rest of the card: the cloud refuses iPad 1's use
  const rest = 100 - paid;
  await as(db, 'postgres', `insert into gift_card_uses (business_id, card_id, kind, amount_cents, used_on) values ($1, $2, 'redeem', $3, current_date)`, [biz, card.id, (rest - 10) * 100]);
  const tid = await pad.evaluate(({ cid, code, rest, v }) => { const g = giftByCode(code); return closeTicket({ appointmentId: null, clientId: cid, staffId: 's1', date: todayStr(), lines: [{ type: 'service', refId: v.id, name: v.name, price: rest, qty: 1, staffId: 's1', note: '' }], discount: 0, tip: 0, tax: 0, total: rest, payments: [{ method: 'gift', amount: rest, last4: code.slice(-4), cardId: g.id, code }] }).id; }, { cid: ava, code, rest, v });
  await until(async () => /didn.t have/.test(await pad.textContent('#toasts')), 8000, 'overspent toast');
  ok((await cloudBalance(card.id)) === 1000, 'cloud balance changed: ' + await cloudBalance(card.id));
  const after = await pad.evaluate(({ code, tid }) => ({ left: giftBalance(giftByCode(code)), short: window.Luster.state.tickets.find((t) => t.id === tid).giftShort, uses: window.Luster.state.giftUses.filter((u) => u.ticketId === tid).length }), { code, tid });
  ok(after.uses === 0 && after.short === rest && Math.abs(after.left - 10) < 0.001, JSON.stringify(after));
  await until(async () => Number((await as(db, 'postgres', `select data ->> 'giftShort' s from tickets where id = $1`, [tid])).rows[0]?.s) === rest, 8000, 'the sale marked as still owing');
  await pad.screenshot({ path: `${shots}/a11-gift-refused.png` });
  // the desk takes the rest in cash and records it on the ticket
  await pad.evaluate((id) => openModal('ticket', { id }), tid); await pad.waitForSelector('#modal-root [data-act="short-pay"]');
  ok(/declined/.test(await pad.textContent('#modal-root')), 'declined gift payment not shown');
  await pad.click('#modal-root [data-act="short-pay"]'); await pad.click('#modal-root [data-act="short-paid"][data-m="cash"]');
  await until(async () => { const d = (await as(db, 'postgres', `select data from tickets where id = $1`, [tid])).rows[0].data; return Number(d.giftShort) === 0 && d.payments.some((x) => x.method === 'cash' && x.amount === rest) && d.payments.some((x) => x.method === 'gift' && x.declined); }, 8000, 'settled in the cloud');
});
await t('a live business never pretends: texts hand off to the studio phone, cards are recorded not charged', async () => {
  const before = await pad.evaluate(() => window.Luster.state.messages.length);
  const cid = await pad.evaluate(() => window.Luster.state.clients.find((c) => c.first === 'Ava').id);
  const d = await pad.evaluate(() => addDays(todayStr(), 1));
  const aid = await pad.evaluate(({ cid, d }) => { const v = window.Luster.state.services.find((x) => !x.hidden && !x.internal); return createAppointment({ clientId: cid, staffId: 's2', date: d, start: 15 * 60, items: [{ serviceId: v.id, dur: v.dur, price: v.price }] }).id; }, { cid, d });
  ok(await pad.evaluate((n) => window.Luster.state.messages.slice(n).every((m) => m.status !== 'delivered'), before), 'a pretend confirmation was logged as delivered');
  // the text modal offers Messages / Copy, and logs what was handed off
  await pad.evaluate((id) => openModal('message', { clientId: id }), cid); await pad.waitForSelector('#modal-root [data-act="handoff"]');
  ok(/isn't connected yet/.test(await pad.textContent('#modal-root')), 'no hand-off note');
  await pad.fill('#msg-body', 'Hi Ava, we had a cancellation at 2pm tomorrow, want it?'); await pad.click('#modal-root [data-act="handoff"][data-via="copy"]');
  const m = await until(() => pad.evaluate(() => window.Luster.state.messages.find((x) => /cancellation at 2pm/.test(x.body))), 4000, 'message logged');
  ok(m.status === 'handed_off' && m.via === 'copy', JSON.stringify(m));
  // tomorrow's reminders, by hand, with the client's change-or-cancel link
  await pad.evaluate(() => window.Luster.go('messages')); await pad.waitForSelector('text=Reminders for tomorrow');
  await pad.click(`[data-act="appt-remind-send"][data-id="${aid}"]`); await pad.waitForSelector('#ho-body');
  const body = await pad.inputValue('#ho-body'); ok(/tomorrow at 3pm/.test(body) && /book\/\?t=[0-9a-f-]{36}/.test(body), 'reminder text: ' + body);
  await pad.click('#modal-root [data-act="handoff"][data-via="copy"]'); await pad.waitForSelector(`text=1 of`);
  await pad.screenshot({ path: `${shots}/a8-reminders.png` });
  // checkout: the card goes through the studio's own terminal; Luster records it
  await pad.evaluate((id) => Actions['checkout-appt']({ dataset: { id } }), aid); await pad.waitForSelector('[data-act="pay"][data-m="card"]');
  ok(!(await pad.$('[data-act="pay"][data-m="card_on_file"]')), 'card on file offered in a live business');
  await pad.click('[data-act="pay"][data-m="card"]'); await pad.waitForSelector('#modal-root [data-act="confirm-ok"]');
  ok(/doesn.t charge the card/.test(await pad.textContent('#modal-root')), 'no terminal note');
  await pad.click('#modal-root [data-act="confirm-ok"]'); await pad.waitForSelector('#modal-root [data-act="receipt-done"]');
  const tk = await pad.evaluate((id) => window.Luster.state.tickets.find((x) => x.appointmentId === id), aid); ok(tk && tk.payments[0].method === 'card', JSON.stringify(tk && tk.payments));
  await pad.click('#modal-root [data-act="receipt-done"]');
});
await t('deleting a client: gone from both iPads, upcoming visit cancelled in the cloud, kept for the record', async () => {
  const { cid, aid } = await pad.evaluate(() => { const c = upsertClient({ first: 'Temp', last: 'Person', phone: '2255550999', email: '' }); const v = window.Luster.state.services.find((x) => !x.hidden && !x.internal);
    const a = createAppointment({ clientId: c.id, staffId: 's1', date: addDays(todayStr(), 3), start: 11 * 60, items: [{ serviceId: v.id, dur: v.dur, price: v.price }] }); return { cid: c.id, aid: a.id }; });
  await until(async () => (await as(db, 'postgres', `select status from appointments where id = $1`, [aid])).rows[0], 8000, 'appointment in cloud');
  await pad2.evaluate(() => Cloud.sync()); await until(() => pad2.evaluate((id) => !!window.Luster.state.clients.find((c) => c.id === id), cid), 8000, 'client on iPad 2');
  await pad.evaluate((id) => { window.Luster.ui.clientId = id; window.Luster.go('clients'); Actions['delete-client-ask']({ dataset: { id } }); }, cid);
  await pad.click('#modal-root [data-act="confirm-ok"]');
  await until(async () => (await as(db, 'postgres', `select deleted_at from clients where id = $1`, [cid])).rows[0].deleted_at, 8000, 'deleted in cloud');
  ok((await as(db, 'postgres', `select status from appointments where id = $1`, [aid])).rows[0].status === 'cancelled', 'upcoming visit not cancelled');
  await pad2.evaluate(() => Cloud.sync());
  await until(() => pad2.evaluate(({ cid, aid }) => !window.Luster.state.clients.some((c) => c.id === cid) && !window.Luster.state.appointments.some((a) => a.id === aid), { cid, aid }), 8000, 'still on iPad 2');
  await pad2.evaluate(() => Cloud.sync({ full: true })); await pad2.waitForTimeout(400);
  ok(await pad2.evaluate((id) => !window.Luster.state.clients.some((c) => c.id === id), cid), 'came back on a full sync');
});
await t('the Online booking page in the app shows the real booking page', async () => {
  await pad.evaluate(() => window.Luster.go('booking')); await pad.waitForSelector('iframe[title="Your booking page"]');
  const frame = pad.frameLocator('iframe[title="Your booking page"]'); await frame.locator('.opt').first().waitFor();
  await pad.screenshot({ path: `${shots}/a4-booking-view.png` });
});
await t('a script error on the iPad reaches support, without the client\'s phone or email', async () => {
  await pad.evaluate(() => setTimeout(() => { throw new Error('diag test: call 225-555-0142 or ava@example.com'); }, 0));
  const row = await until(async () => (await as(db, 'postgres', `select kind, message, build, device, business_id from app_events where message like '%diag test%'`)).rows[0], 6000, 'support event');
  ok(row.kind === 'error' && /\[phone\]/.test(row.message) && /\[email\]/.test(row.message) && !/555-0142|ava@example/.test(row.message), row.message);
  ok(row.build && row.build !== 'dev' && row.business_id, JSON.stringify(row));
  // the error was thrown on purpose; it's left out of the page-error check at the end (its event can arrive after this point)
});
await t('website kit: button code with the booking link, a QR code, a printable sign', async () => {
  await pad.evaluate(() => { window.Luster.go('settings'); Actions['settings-tab']({ dataset: { id: 'booking' } }); });
  await pad.waitForSelector('#qr-box svg');
  await pad.click('[data-act="web-copy-code"]'); await pad.waitForSelector('#web-code');
  ok(/href="http:\/\/localhost:\d+\/book\/luster-test"/.test(await pad.inputValue('#web-code')), 'button code without the link');
  await pad.click('#modal-root [data-act="close-modal"]');
  const [dl] = await Promise.all([pad.waitForEvent('download'), pad.click('[data-act="qr-sign"]')]);
  const size = fs.statSync(await dl.path()).size; ok(dl.suggestedFilename() === 'luster-test-booking-sign.png' && size > 20000, `${dl.suggestedFilename()} ${size}`);
  if (process.env.LUSTER_KEEP_QR) fs.copyFileSync(await dl.path(), process.env.LUSTER_KEEP_QR);
  await pad.waitForTimeout(150); await pad.screenshot({ path: `${shots}/a9-website-kit.png` });
});
await t('the website: a first visit from an Instagram bio lands on it, a demo request reaches Luster with where it came from, Sign in opens the studio, the demo links back', async () => {
  const { c, p } = await ctx(phone);
  await p.goto(base + '?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=PAZXh0bgNhZW0CMTEAAabc');   // what Instagram makes of nwluster.com
  await p.waitForURL(/\/welcome\/\?utm_source=ig&utm_medium=social&utm_content=link_in_bio$/); await p.waitForSelector('#rq');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the website scrolls sideways on a phone');
  await p.click('#rq button[type="submit"]'); await p.waitForSelector('#rq-err.on'); ok(/your name/.test(await p.textContent('#rq-err')), 'an empty request went through');
  await p.fill('#rq-name', 'Kelsey Test'); await p.click('#rq button[type="submit"]'); ok(/email or a mobile/.test(await p.textContent('#rq-err')), 'a request with no way to reach them went through');
  await p.fill('#rq-studio', 'Neu Skin Test'); await p.fill('#rq-phone', '(225) 555-0177'); await p.selectOption('#rq-kind', 'Med spa'); await p.fill('#rq-software', 'Square');
  await p.click('#founding [data-founding]'); ok(await p.isChecked('#rq-founding'), 'founding box not ticked');
  await p.click('#rq button[type="submit"]'); await p.waitForSelector('#rq-thanks.on');
  ok(/Thank you, Kelsey!/.test(await p.textContent('#rq-thanks')), 'no thank-you');
  const row = (await as(db, 'postgres', `select name, studio, phone, kind, software, founding, status, page from demo_requests where name = 'Kelsey Test'`)).rows[0];
  ok(row && row.phone === '2255550177' && row.founding === true && row.status === 'new' && row.kind === 'Med spa' && row.page === '/welcome/?utm_source=ig&utm_medium=social&utm_content=link_in_bio', JSON.stringify(row));
  await p.screenshot({ path: `${shots}/a12-website-request.png` });
  await p.goto(base + 'welcome/'); await p.click('footer a[href="../?signin"]'); await p.waitForSelector('#ca-email');
  ok(!/signin/.test(p.url()), 'the sign-in flag stayed in the address'); await c.close();
  const { c: c2, p: d } = await ctx(ipad); await d.goto(base + '?demo'); await d.waitForSelector('#rail .nav-item', { state: 'attached' });
  await d.click('.rail-foot a[href="welcome/"]'); await d.waitForURL(/\/welcome\/$/); await c2.close();
});
await t('forgot password: the emailed link opens the app, a new password is set, an old link is refused', async () => {
  const { p } = await ctx(ipad);
  await p.goto(base + '?demo'); await p.waitForSelector('#rail .nav-item', { state: 'attached' });
  await p.evaluate(() => Actions['cloud-from-cloud']()); await p.waitForSelector('[data-act="cloud-auth-forgot"]');
  await p.click('[data-act="cloud-auth-forgot"]'); await p.fill('#ca-email', 'ixv@nwluster.com'); await p.click('[data-act="cloud-auth-reset"]');
  await p.waitForSelector('#modal-root .alert.info'); ok(/reset link is on its way/.test(await p.textContent('#modal-root')), 'no confirmation');
  const mail = srv.outbox.filter((m) => m.to === 'ixv@nwluster.com' && m.kind === 'recovery').pop(); ok(mail, 'no reset email');
  await p.goto(mail.link); await p.waitForSelector('#np-pass');
  await p.fill('#np-pass', 'new-horse-battery-2'); await p.fill('#np-pass2', 'new-horse-battery-2'); await p.click('[data-act="np-submit"]');
  await until(async () => /Password changed/.test(await p.textContent('#toasts')), 4000, 'password changed toast');
  ok(srv.users.get('ixv@nwluster.com').password === 'new-horse-battery-2', 'password not updated');
  ok(!/access_token/.test(await p.evaluate(() => location.href)), 'token left in the address bar');
  await p.goto(mail.link); await until(async () => /link has expired/.test(await p.textContent('#toasts')), 4000, 'used link accepted');
});

await browser.close(); await srv.close();
const unexpected = errors.filter((e) => !/diag test/.test(e));
if (unexpected.length) { console.log('page errors:\n ' + [...new Set(unexpected)].join('\n ')); fails++; }
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
