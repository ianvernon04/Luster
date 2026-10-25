// Serves the repo root under /luster/ (the way GitHub Pages serves a project site) and checks the installable build:
// manifest, service worker, offline reload, the per-link manifest for setup links, and the iOS install hint.
// Run after ./build-pwa.sh:  node test/pwa.js
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..'); const PORT = 8766;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css', '.md': 'text/plain' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (!u.startsWith('/luster/')) { res.writeHead(404); return res.end(); }
  let f = path.join(ROOT, u.slice('/luster/'.length) || 'index.html'); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const errors = []; let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { fails++; console.log('FAIL ', name, '-', e.message.split('\n')[0]); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const base = `http://localhost:${PORT}/luster/`;
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'allow' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await p.goto(base, { waitUntil: 'load' }); await p.waitForSelector('.cal-grid', { timeout: 15000 });
  await t('manifest is the static file with a relative scope', async () => { const m = await p.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); return { href: l.href, json: await r.json() }; }); if (!m.href.endsWith('/luster/manifest.webmanifest')) throw new Error(m.href); eq(m.json.scope, './', 'scope'); eq(m.json.start_url, './index.html', 'start_url'); });
  await t('service worker activates with the subpath scope', async () => { const r = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, state: (r.active || {}).state }; }); eq(r.scope, base, 'scope'); eq(r.state, 'activated', 'state'); });
  await p.waitForTimeout(1200);
  await t('app shell is cached', async () => { const c = await p.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys[0]); return (await c.keys()).length; }); if (c < 8) throw new Error('cached entries: ' + c); });
  await t('offline reload still renders', async () => { await ctx.setOffline(true); await p.reload({ waitUntil: 'load' }).catch(() => {}); await p.waitForSelector('.cal-grid', { timeout: 15000 }); await ctx.setOffline(false); });
  await t('no install hint on desktop without a browser prompt', async () => { await p.waitForTimeout(1800); eq(await p.$('.install-hint'), null, 'hint'); });
  await ctx.close();
  // a setup link: manifest becomes a data: URL whose start_url is this exact URL
  const link = base + '?biz=hair&name=Magnolia%20Hair%20Studio&owner=Renee&team=5';
  const c2 = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'allow' }); const q = await c2.newPage(); q.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await q.goto(link, { waitUntil: 'load' }); await q.waitForSelector('.cal-grid', { timeout: 15000 });
  await t('setup link swaps in a manifest that launches the same link', async () => {
    const m = await q.evaluate(() => { const h = document.querySelector('link[rel=manifest]').getAttribute('href'); return { h, json: h.startsWith('data:') ? JSON.parse(decodeURIComponent(h.split(',')[1])) : null }; });
    if (!m.json) throw new Error('not a data manifest: ' + m.h.slice(0, 60)); eq(m.json.start_url, link, 'start_url'); eq(m.json.scope, base, 'scope'); if (!m.json.icons.every((i) => i.src.startsWith(base))) throw new Error('icons not absolute');
    eq(await q.evaluate(() => window.Luster.state.business.name), 'Magnolia Hair Studio', 'business');
  });
  await t('setup link survives offline relaunch', async () => { await q.waitForTimeout(1200); await c2.setOffline(true); await q.reload({ waitUntil: 'load' }).catch(() => {}); await q.waitForSelector('.cal-grid', { timeout: 15000 }); eq(await q.evaluate(() => window.Luster.state.business.name), 'Magnolia Hair Studio', 'business'); await c2.setOffline(false); });
  await c2.close();
  // iPad Safari: no install prompt exists, so the hint explains Share → Add to Home Screen
  const ipad = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true };
  const c3 = await browser.newContext(ipad); const r = await c3.newPage(); r.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await r.goto(base, { waitUntil: 'load' }); await r.waitForSelector('.cal-grid', { timeout: 15000 });
  await t('iPad gets the Add to Home Screen hint', async () => { await r.waitForSelector('.install-hint', { timeout: 4000 }); const txt = await r.textContent('.install-hint'); if (!/Add to Home Screen/.test(txt)) throw new Error(txt); await r.screenshot({ path: path.join(__dirname, 'shots', '40-install-hint-ipad.png') }); });
  await t('dismissing the hint sticks', async () => { await r.click('.install-hint [data-install-dismiss]'); await r.reload({ waitUntil: 'load' }); await r.waitForSelector('.cal-grid'); await r.waitForTimeout(2000); eq(await r.$('.install-hint'), null, 'hint'); });
  await c3.close();
  // Chrome's install prompt: a synthetic beforeinstallprompt shows the Install button
  const c4 = await browser.newContext({ viewport: { width: 1024, height: 768 } }); const s = await c4.newPage();
  await s.goto(base, { waitUntil: 'load' }); await s.waitForSelector('.cal-grid');
  await t('Chrome install prompt becomes an Install button', async () => { await s.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); }); await s.waitForSelector('.install-hint [data-install]', { timeout: 2000 }); await s.click('.install-hint [data-install]'); await s.waitForTimeout(200); eq(await s.$('.install-hint'), null, 'hint gone after accept'); });
  await c4.close();
  await browser.close(); server.close();
  if (errors.length) { console.log('page errors:', errors); fails++; }
  console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
