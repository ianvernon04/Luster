// Serves the repo root under /luster/ (the way GitHub Pages serves a project site) and checks the installable build:
// manifest, service worker, offline reload, the per-link manifest for setup links, and the iOS install hint.
// Run after ./build-pwa.sh:  node test/pwa.js
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..'); const PORT = 8766;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.md': 'text/plain' };
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
  // the website: a first visit from a plain link (an Instagram bio, a typed address) lands on it; everything that already
  // worked (setup and pitch links, sign-in links, the installed app, a device that has opened the app) goes straight in
  const c0 = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const w = await c0.newPage(); w.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await w.goto(base, { waitUntil: 'load' });
  await t('a first visit from a plain link lands on the website', async () => { await w.waitForURL(base + 'welcome/'); if (!/reads the intake form/.test(await w.textContent('h1'))) throw new Error('no headline'); });
  await t('the website\'s pictures load and its link preview is set', async () => {
    const broken = await w.evaluate(async () => { const imgs = [...document.images]; imgs.forEach((i) => { i.loading = 'eager'; }); await new Promise((r) => setTimeout(r, 1000)); return imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src); });
    eq(broken.length, 0, 'broken images ' + broken.join(', ')); if (!/\/welcome\/og\.jpg$/.test(await w.getAttribute('meta[property="og:image"]', 'content'))) throw new Error('og:image');
    eq(await w.evaluate(async () => (await fetch('og.jpg')).ok), true, 'og.jpg missing');
  });
  await t('"Try it yourself" opens the demo, and from then on the address opens the app', async () => {
    await w.click('.hero a[href="../?demo"]'); await w.waitForSelector('.cal-grid', { timeout: 15000 });
    await w.goto(base, { waitUntil: 'load' }); await w.waitForSelector('.cal-grid', { timeout: 15000 }); eq(new URL(w.url()).pathname, '/luster/', 'returning visitor');
  });
  await c0.close();
  await t('sign-in links and the installed app are never sent to the website', async () => {
    const c = await browser.newContext(); const q = await c.newPage(); q.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    await q.goto(base + '#error=access_denied&error_description=Email%20link%20is%20invalid', { waitUntil: 'load' }); await q.waitForSelector('#rail .nav-item', { state: 'attached', timeout: 15000 });
    eq(new URL(q.url()).pathname, '/luster/', 'email link'); await c.close();
    const c2 = await browser.newContext(); await c2.addInitScript(() => { Object.defineProperty(window.navigator, 'standalone', { get: () => true }); }); const r2 = await c2.newPage();
    await r2.goto(base, { waitUntil: 'load' }); await r2.waitForSelector('#rail .nav-item', { state: 'attached', timeout: 15000 }); eq(new URL(r2.url()).pathname, '/luster/', 'installed app'); await c2.close();
  });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'allow' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await p.goto(base + '?demo', { waitUntil: 'load' }); await p.waitForSelector('.cal-grid', { timeout: 15000 });
  await t('manifest is the static file with a relative scope', async () => { const m = await p.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); return { href: l.href, json: await r.json() }; }); if (!m.href.endsWith('/luster/manifest.webmanifest')) throw new Error(m.href); eq(m.json.scope, './', 'scope'); eq(m.json.start_url, './index.html', 'start_url'); });
  await t('service worker activates with the subpath scope', async () => {
    // ready resolves as soon as there is an active worker, which can still be "activating" on a slow machine: wait for the
    // state change instead of reading it once
    const r = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; const w = r.active;
      if (w && w.state !== 'activated') await new Promise((res) => { const done = () => { if (w.state === 'activated') res(); }; w.addEventListener('statechange', done); setTimeout(res, 10000); done(); });
      return { scope: r.scope, state: (r.active || {}).state }; });
    eq(r.scope, base, 'scope'); eq(r.state, 'activated', 'state');
  });
  await p.waitForTimeout(1200);
  await t('app shell is cached', async () => { const c = await p.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys[0]); return (await c.keys()).length; }); if (c < 8) throw new Error('cached entries: ' + c); });
  await t('offline reload still renders', async () => { await ctx.setOffline(true); await p.reload({ waitUntil: 'load' }).catch(() => {}); await p.waitForSelector('.cal-grid', { timeout: 15000 }); await ctx.setOffline(false); });
  await t('visiting the privacy page never replaces the cached app', async () => {
    await p.goto(base + 'privacy.html', { waitUntil: 'load' }); if (!/Privacy/.test(await p.textContent('h1'))) throw new Error('privacy page');
    await ctx.setOffline(true); await p.goto(base, { waitUntil: 'load' }).catch(() => {});   // the next launch is offline
    await p.waitForSelector('.cal-grid', { timeout: 15000 }); await ctx.setOffline(false);
  });
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
  await r.goto(base + '?demo', { waitUntil: 'load' }); await r.waitForSelector('.cal-grid', { timeout: 15000 });
  await t('iPad gets the Add to Home Screen hint', async () => { await r.waitForSelector('.install-hint', { timeout: 4000 }); const txt = await r.textContent('.install-hint'); if (!/Add to Home Screen/.test(txt)) throw new Error(txt); await r.screenshot({ path: path.join(__dirname, 'shots', '40-install-hint-ipad.png') }); });
  await t('dismissing the hint sticks', async () => { await r.click('.install-hint [data-install-dismiss]'); await r.reload({ waitUntil: 'load' }); await r.waitForSelector('.cal-grid'); await r.waitForTimeout(2000); eq(await r.$('.install-hint'), null, 'hint'); });
  await c3.close();
  // Chrome's install prompt: a synthetic beforeinstallprompt shows the Install button
  const c4 = await browser.newContext({ viewport: { width: 1024, height: 768 } }); const s = await c4.newPage();
  await s.goto(base + '?demo', { waitUntil: 'load' }); await s.waitForSelector('.cal-grid');
  await t('Chrome install prompt becomes an Install button', async () => { await s.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); }); await s.waitForSelector('.install-hint [data-install]', { timeout: 2000 }); await s.click('.install-hint [data-install]'); await s.waitForTimeout(200); eq(await s.$('.install-hint'), null, 'hint gone after accept'); });
  await c4.close();
  await browser.close(); server.close();
  if (errors.length) { console.log('page errors:', errors); fails++; }
  console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
