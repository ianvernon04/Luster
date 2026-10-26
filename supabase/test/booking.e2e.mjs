// End-to-end: the public booking page (book/index.html) against a Supabase stand-in, in a phone-sized browser
// set to Japan time — the way the studio owner will test it from Okinawa.
//   cd supabase/test && node booking.e2e.mjs
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import { freshDb, as } from './harness.mjs'; import { startServer } from './server.mjs'; import { seedStudio, S, V } from './fixtures.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..', '..');
const shots = path.join(here, 'shots'); fs.mkdirSync(shots, { recursive: true });

let fails = 0; const errors = [];
const t = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { fails++; console.log('FAIL ', name, '-', e.message.split('\n')[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const db = await freshDb();
const biz = await seedStudio(db);
await seedStudio(db, { slug: 'soon-test', name: 'Soon Studio', live: false }).catch(() => {});
const srv = await startServer({ db, root });
const base = `http://localhost:${srv.port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Asia/Tokyo', locale: 'en-US' };
async function page(opts = {}) {
  const ctx = await browser.newContext({ ...phone, ...opts }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  // a failed request to somewhere other than our own test server (web fonts behind a sandbox proxy) isn't the app's fault
  const offSite = (m) => { const u = (m.location() || {}).url || ''; return /^https?:/.test(u) && !u.startsWith('http://localhost:'); };
  p.on('console', (m) => { if (m.type() === 'error' && !offSite(m) && !/fonts\.g|ERR_TUNNEL|ERR_NAME|status of 4/.test(m.text())) errors.push('[console] ' + m.text()); });
  return p;
}
const click = (p, sel) => p.locator(sel).first().click();

const p = await page();
await t('pretty link /book/<studio> lands on the booking page', async () => {
  await p.goto(`${base}/book/simply-test`); await p.waitForURL(/\/book\/\?s=simply-test/); await p.waitForSelector('.opt');
});
await t('studio header, contact, and a time-zone note for a visitor in Japan', async () => {
  ok((await p.textContent('h1')) === 'Simply Facials Test', 'name');
  const meta = await p.textContent('.hero .meta'); ok(/Perkins Rd/.test(meta) && /555-0100/.test(meta), meta);
  const tz = await p.textContent('.tz'); ok(/Central Time/.test(tz), tz);
});
await t('menu grouped by section; offline-only services hidden', async () => {
  const groups = await p.$$eval('.group h3', (h) => h.map((x) => x.textContent)); ok(JSON.stringify(groups) === '["Facials","Peels"]', groups.join(','));
  const names = await p.$$eval('.opt .t', (n) => n.map((x) => x.textContent)); ok(!names.includes('Brow Wax'), 'brow wax shown');
  await p.screenshot({ path: `${shots}/b1-services.png` });
});
await t('choosing two services totals time and price', async () => {
  await click(p, '.opt:has-text("Signature Facial")'); await click(p, '.opt:has-text("Lactic Peel")');
  const bar = await p.textContent('.bar .sum'); ok(/2 services · 1 hr 45 min/.test(bar) && /\$205/.test(bar), bar);
  await click(p, '.bar [data-act="go"]');
});
await t('only providers who do both services are offered', async () => {
  const names = await p.$$eval('.opt .t', (n) => n.map((x) => x.textContent)); ok(JSON.stringify(names) === '["Anyone available","Danielle Boudreaux"]', names.join(','));
  await click(p, '[data-act="go"][data-s="2"]'); await p.waitForSelector('.slot');
});
let picked;
await t('open times show in studio time, grouped by part of day', async () => {
  // today may already be half gone in Baton Rouge (or closed by the 2-hour notice), so look at the next full day
  await p.locator('.day:not([disabled])').nth(1).click();
  const first = await p.textContent('.slot'); ok(first === '9:00 AM', first);
  const periods = await p.$$eval('.period', (x) => x.map((e) => e.textContent)); ok(periods[0] === 'Morning', periods.join(','));
  const sub = await p.textContent('.card .sub'); ok(/1 hr 45 min/.test(sub) && /C[SD]T/.test(sub), sub);
  await p.screenshot({ path: `${shots}/b2-times.png` });
  await p.locator('.day:not([disabled])').nth(2).click();   // two+ days out, so the booking can still be changed online
  const btn = p.locator('.slot').nth(2); picked = await btn.getAttribute('data-at'); await btn.click();
  await click(p, '[data-act="go"][data-s="3"]'); await p.waitForSelector('#f');
});
await t('details are validated before review', async () => {
  await p.fill('#f-first', 'Ava'); await p.fill('#f-phone', '225 555'); await click(p, '#f button[type="submit"]');
  ok(/mobile number/.test(await p.textContent('.alert')), 'phone not validated');
  await p.fill('#f-last', 'Landry'); await p.fill('#f-phone', '(225) 555-0142'); await p.fill('#f-email', 'ava@example.com'); await click(p, '#f button[type="submit"]');
  await p.waitForSelector('[data-act="book"]');
  const sum = await p.textContent('.summary'); ok(/Signature Facial/.test(sum) && /Lactic Peel/.test(sum) && /First available/.test(sum) && /\$205/.test(sum), sum);
  await p.screenshot({ path: `${shots}/b3-review.png` });
});
let manageHref;
await t('booking confirms and lands in the studio\'s calendar', async () => {
  await click(p, '[data-act="book"]'); await p.waitForSelector('.done h2');
  ok((await p.textContent('.done h2')) === "You're booked", 'no confirmation');
  ok(/with Danielle Boudreaux/.test(await p.textContent('.done')), 'wrong provider');
  manageHref = await p.getAttribute('a:has-text("Change or cancel")', 'href'); ok(/\?t=/.test(manageHref), manageHref);
  await p.screenshot({ path: `${shots}/b4-booked.png` });
  const r = await as(db, 'postgres', `select a.source, a.status, a.starts_at, s.name staff, c.first_name, c.phone_e164 from appointments a join staff s on s.id = a.staff_id join clients c on c.id = a.client_id where a.business_id = $1`, [biz]);
  ok(r.rows.length === 1, 'rows ' + r.rows.length); const a = r.rows[0];
  ok(a.source === 'online' && a.status === 'booked' && a.staff === 'Danielle Boudreaux' && a.first_name === 'Ava' && a.phone_e164 === '+12255550142', JSON.stringify(a));
  ok(new Date(a.starts_at).toISOString() === new Date(picked).toISOString(), 'time drifted: ' + a.starts_at + ' vs ' + picked);
});
await t('calendar file downloads', async () => {
  const [dl] = await Promise.all([p.waitForEvent('download'), click(p, '[data-act="ics"]')]);
  const body = fs.readFileSync(await dl.path(), 'utf8'); ok(/BEGIN:VEVENT/.test(body) && /DTSTART:\d{8}T\d{6}Z/.test(body) && /Signature Facial/.test(body), body.slice(0, 200));
});
await t('manage link: reschedule to another time', async () => {
  await p.goto(manageHref); await p.waitForSelector('[data-act="m-resched"]');
  ok(/Your appointment/.test(await p.textContent('.card h2')), 'manage page');
  await click(p, '[data-act="m-resched"]'); await p.waitForSelector('.slot');
  await p.locator('.day:not([disabled])').nth(3).click();   // still outside the 24-hour window, so it can be cancelled next
  const target = p.locator('.slot').nth(5); const newAt = await target.getAttribute('data-at'); await target.click();
  await click(p, '[data-act="m-move"]'); await p.waitForSelector('.alert.info');
  ok(/Moved/.test(await p.textContent('.alert.info')), 'no moved note');
  const r = await as(db, 'postgres', `select starts_at from appointments where business_id = $1`, [biz]); ok(new Date(r.rows[0].starts_at).toISOString() === new Date(newAt).toISOString(), 'not moved');
});
await t('manage link: cancel with a second tap', async () => {
  await click(p, '[data-act="m-ask"]'); await click(p, '[data-act="m-cancel"]'); await p.waitForSelector('.alert.bad');
  ok(/cancelled/i.test(await p.textContent('.card')), 'not cancelled');
  const r = await as(db, 'postgres', `select status from appointments where business_id = $1`, [biz]); ok(r.rows[0].status === 'cancelled', r.rows[0].status);
  await p.screenshot({ path: `${shots}/b5-cancelled.png` });
});
await t('two clients, one time: the second is told and shown fresh times', async () => {
  const a = await page(); const b = await page(); let takenAt;
  for (const x of [a, b]) {
    await x.goto(`${base}/book/?s=simply-test`); await x.waitForSelector('.opt');
    await click(x, '.opt:has-text("Express Facial")'); await click(x, '.bar [data-act="go"]');
    await click(x, `.opt[data-id="${S.bri}"]`); await click(x, '[data-act="go"][data-s="2"]'); await x.waitForSelector('.slot');
    if (x === a) takenAt = await x.getAttribute('.slot', 'data-at');
    await click(x, '.slot'); await click(x, '[data-act="go"][data-s="3"]');
    await x.fill('#f-first', x === a ? 'Mia' : 'Liv'); await x.fill('#f-phone', x === a ? '2255550111' : '2255550112'); await click(x, '#f button[type="submit"]'); await x.waitForSelector('[data-act="book"]');
  }
  const taken = await a.locator('[data-act="book"]').count() && (await (async () => { await click(a, '[data-act="book"]'); await a.waitForSelector('.done'); })());
  void taken;
  await click(b, '[data-act="book"]'); await b.waitForSelector('.alert.bad');
  ok(/just booked that time/.test(await b.textContent('.alert.bad')), await b.textContent('.alert.bad'));
  ok(takenAt && (await b.$(`.slot[data-at="${takenAt}"]`)) === null, 'the taken time is still offered: ' + takenAt);
  await b.screenshot({ path: `${shots}/b6-taken.png` });
});
await t('a studio that has not gone live says so', async () => {
  const x = await page(); await x.goto(`${base}/book/?s=soon-test`); await x.waitForSelector('.empty h2');
  ok(/coming soon/.test(await x.textContent('.empty h2')), 'no coming soon');
});
await t('unknown studio and broken manage links fail gracefully', async () => {
  const x = await page(); await x.goto(`${base}/book/?s=nope-nope`); await x.waitForSelector('.empty h2'); ok(/couldn't find/.test(await x.textContent('.empty h2')), 'unknown');
  await x.goto(`${base}/book/?t=00000000-0000-4000-8000-000000000000`); await x.waitForSelector('.empty h2'); ok(/couldn't find/.test(await x.textContent('.empty h2')), 'token');
});
await t('dark mode renders', async () => {
  const x = await page({ colorScheme: 'dark' }); await x.goto(`${base}/book/?s=simply-test`); await x.waitForSelector('.opt');
  await x.screenshot({ path: `${shots}/b7-dark.png` });
  const overflow = await x.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(overflow <= 0, 'horizontal overflow ' + overflow);
});

await browser.close(); await srv.close();
if (errors.length) { console.log('page errors:\n ' + errors.join('\n ')); fails++; }
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
