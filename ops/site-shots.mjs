// Screenshots for the website (welcome/), taken from the real app so the site never shows anything Luster can't do.
//   ./src/build-pwa.sh && node ops/site-shots.mjs [outdir]      (then ops/site-images.py turns them into the site's WebP files)
// The iPad shots come from the public demo (a made-up studio on the generic menu, never a real one); the phone shots come
// from that same demo put online on the test stand-in for Supabase, booked and filled in on a phone the way a client would.
// Brand fonts: where Google Fonts can't be reached (a sandbox), set LUSTER_FONTS to a folder holding the unpacked npm packages
// @fontsource/instrument-sans and @fontsource/instrument-serif, and the shots use the real typefaces anyway.
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
import { freshDb } from '../supabase/test/harness.mjs'; import { startServer } from '../supabase/test/server.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'supabase', 'test', 'shots', 'site')); fs.mkdirSync(out, { recursive: true });

const db = await freshDb();
const srv = await startServer({ db, root, config: { client: { realtime: false, pollMs: 1500 } } });
const base = `http://localhost:${srv.port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ipad = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, timezoneId: 'America/Chicago', locale: 'en-US', serviceWorkers: 'block' };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Chicago', locale: 'en-US', serviceWorkers: 'block' };
const shot = async (p, name, opts = {}) => { await p.evaluate(() => document.fonts.ready); return p.screenshot({ path: path.join(out, name + '.png'), ...opts }); };
async function brandFonts(ctx) {
  const dir = process.env.LUSTER_FONTS; if (!dir) return;
  const files = {};
  for (const pkg of fs.readdirSync(dir)) { const d = path.join(dir, pkg, 'package', 'files'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (/-latin-\d+-(normal|italic)\.woff2$/.test(f)) files[f] = path.join(d, f); }
  const css = Object.keys(files).map((f) => { const [, w, st] = f.match(/-latin-(\d+)-(normal|italic)\.woff2$/); return `@font-face{font-family:'${f.startsWith('instrument-serif') ? 'Instrument Serif' : 'Instrument Sans'}';font-style:${st};font-weight:${w};font-display:block;src:url(https://fonts.gstatic.com/luster/${f}) format('woff2')}`; }).join('\n');
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => { const f = r.request().url().split('/').pop(); return files[f] ? r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(files[f]) }) : r.abort(); });
}
// a weekday morning in Baton Rouge, so the demo calendar is mid-day and full
const morning = (() => { const d = new Date(); d.setDate(d.getDate() + ((9 - d.getDay()) % 7 || 7)); d.setHours(10, 40, 0, 0); return d; })();   // next Tuesday

// ---- the demo on an iPad: a full day, and a caution on an appointment that clashes with the client's health history
{
  const c = await browser.newContext(ipad); await brandFonts(c); const p = await c.newPage(); await p.clock.setFixedTime(morning);
  await p.goto(base + '?demo'); await p.waitForSelector('.cal-grid [data-appt]'); await p.waitForTimeout(400);
  await shot(p, 'ipad-calendar');
  // a client who took Accutane this year, booked for a chemical peel: the appointment says so before anyone starts
  const aid = await p.evaluate(() => {
    const st = window.Luster.state; const c = st.clients.find((x) => !x.flags.length && x.first && x.last);
    c.flags = ['accutane']; c.medical = { ...(c.medical || {}), meds: ['Accutane / isotretinoin (last 12 months)'] };
    const v = st.services.find((x) => x.id === 'sv_peel'); const s = st.staff.find((x) => x.bookable && x.days[new Date().getDay()]) || st.staff[0];
    const free = freeSlots(s.id, todayStr(), v.dur, 15, { allowPast: true }); const start = free.find((m) => m >= 13 * 60) ?? free[free.length - 1];
    return createAppointment({ clientId: c.id, staffId: s.id, date: todayStr(), start, items: [{ serviceId: v.id, dur: v.dur, price: v.price }] }).id;
  });
  await p.evaluate((id) => openDrawer('appt', { id }), aid); await p.waitForSelector('#drawer.open .alert'); await p.waitForTimeout(500);
  await shot(p, 'ipad-caution');
  // the same client's file, health tab
  await p.evaluate((id) => { closeDrawer(); const a = window.Luster.state.appointments.find((x) => x.id === id); window.Luster.ui.clientId = a.clientId; window.Luster.ui.clientTab = 'health'; window.Luster.go('clients'); }, aid);
  await p.waitForTimeout(500); await shot(p, 'ipad-client');
  // checkout: a gift card sold, its code on the receipt
  await p.evaluate(() => { const c = window.Luster.state.clients[7]; startTicket({ clientId: c.id }); });
  await p.click('[data-act="co-tab"][data-id="gift"]'); await p.click('[data-act="ticket-add"][data-type="gift"][data-id="100"]');
  await p.click('[data-act="pay"][data-m="cash"]'); await p.click('[data-act="cash-done"]'); await p.waitForSelector('.gift-codes'); await p.waitForTimeout(600);
  await shot(p, 'ipad-giftcard');
  await c.close();
}

// ---- the same demo put online, then booked and filled in on a client's phone
{
  const c = await browser.newContext({ ...ipad, deviceScaleFactor: 1 }); await brandFonts(c); const pad = await c.newPage();
  await pad.goto(base + '?demo'); await pad.waitForSelector('#rail .nav-item', { state: 'attached' });
  await pad.click('[data-act="go"][data-view="settings"]'); await pad.click('[data-act="settings-tab"][data-id="booking"]'); await pad.click('[data-act="cloud-golive"]');
  await pad.waitForSelector('#ca-email'); await pad.click('[data-act="cloud-auth-mode"]');
  await pad.fill('#ca-email', 'demo@nwluster.com'); await pad.fill('#ca-pass', 'site-shots-only'); await pad.click('[data-act="cloud-auth-submit"]');
  await pad.waitForSelector('#gl-slug'); await pad.fill('#gl-slug', 'glow-theory'); await pad.fill('#gl-phone', '(225) 555-0142'); await pad.fill('#gl-addr', '1200 Perkins Rd, Baton Rouge, LA');
  await pad.click('[data-act="golive-submit"]'); await pad.waitForSelector('text=is live');

  const pc = await browser.newContext(phone); await brandFonts(pc); const p = await pc.newPage();
  await p.goto(`${base}book/glow-theory`); await p.waitForSelector('.opt'); await p.waitForTimeout(300);
  await shot(p, 'phone-services');
  await p.locator('.opt', { hasText: 'Chemical Peel' }).first().click(); await p.click('.bar [data-act="go"]');
  await p.click('[data-act="go"][data-s="2"]'); await p.waitForSelector('.slot');
  await p.locator('.day:not([disabled])').nth(2).click(); await p.locator('.slot').nth(3).click(); await p.waitForTimeout(200);
  await shot(p, 'phone-times');
  await p.click('[data-act="go"][data-s="3"]'); await p.fill('#f-first', 'Jordan'); await p.fill('#f-last', 'Avery'); await p.fill('#f-phone', '(225) 555-0188');
  await p.click('#f button[type="submit"]'); await p.click('[data-act="book"]'); await p.waitForSelector('.done'); await p.waitForSelector('.next');
  await shot(p, 'phone-booked');
  await p.click('.next a'); await p.waitForSelector('#ff .ffield');
  await p.click('[data-field="meds"] .chip[data-v="Accutane / isotretinoin (last 12 months)"]');
  await p.locator('[data-field="meds"]').scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -140)); await p.waitForTimeout(300);
  await shot(p, 'phone-intake');
  await pc.close(); await c.close();
}

await browser.close(); await srv.close();
console.log('screenshots in', out, fs.readdirSync(out).filter((f) => f.endsWith('.png')).join(', '));
