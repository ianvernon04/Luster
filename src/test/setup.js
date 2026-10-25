// Setup links: ?biz=…&name=…&owner=…&team=… creates/selects the business at boot; idempotent across relaunches.
const { chromium } = require('playwright'); const path = require('path');
const base = 'file://' + path.join(__dirname, 'page.html');
const errors = []; let fails = 0;
const t = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { fails++; console.log('FAIL ', name, '-', e.message.split('\n')[0]); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] }).catch(() => chromium.launch());
  const open = async (ctx, url) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message)); await p.goto(url); await p.waitForSelector('#rail .nav-item'); await p.waitForTimeout(400); return p; };
  const info = (p) => p.evaluate(() => { const L = window.Luster; const ws = L.workspaces(); return { n: ws.length, name: L.state.business.name, tpl: L.state.templateId, staff: L.state.staff.map((s) => s.name), hint: !!document.querySelector('.install-hint'), cur: ws.find((w) => w.name === L.state.business.name)?.id }; });
  const magnolia = base + '?biz=hair&name=Magnolia%20Hair%20Studio&owner=Renee&team=5';
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  let p = await open(ctx, magnolia);
  await t('link creates the business and nothing else', async () => { const i = await info(p); eq(i.n, 1, 'workspaces'); eq(i.name, 'Magnolia Hair Studio', 'name'); eq(i.tpl, 'hair', 'template'); eq(i.staff.length, 6, 'team of 5 + front desk'); if (!/^Renee/.test(i.staff[0])) throw new Error('owner not first: ' + i.staff[0]); eq(i.hint, false, 'no install hint on file://'); });
  await t('relaunch with the same link is idempotent', async () => { await p.reload(); await p.waitForSelector('#rail .nav-item'); await p.waitForTimeout(300); const i = await info(p); eq(i.n, 1, 'workspaces'); eq(i.name, 'Magnolia Hair Studio', 'name'); });
  await t('a second link adds a second business and selects it', async () => { await p.goto(base + '?biz=lash&name=Flutter%20Lash%20Bar&owner=Dee&team=3'); await p.waitForSelector('#rail .nav-item'); await p.waitForTimeout(300); const i = await info(p); eq(i.n, 2, 'workspaces'); eq(i.name, 'Flutter Lash Bar', 'name'); eq(i.tpl, 'lash', 'template'); });
  await t('the first link opens the first business again', async () => { await p.goto(magnolia); await p.waitForSelector('#rail .nav-item'); await p.waitForTimeout(300); const i = await info(p); eq(i.n, 2, 'workspaces'); eq(i.name, 'Magnolia Hair Studio', 'name'); });
  await t('plain launch keeps the last business', async () => { await p.goto(base); await p.waitForSelector('#rail .nav-item'); await p.waitForTimeout(300); const i = await info(p); eq(i.name, 'Magnolia Hair Studio', 'name'); });
  await t('user data survives a relaunch through the link', async () => {
    await p.evaluate(() => { window.Luster.state.business.tagline = 'edited'; return window.Luster.save(); });
    await p.goto(magnolia); await p.waitForSelector('#rail .nav-item'); await p.waitForTimeout(300);
    eq(await p.evaluate(() => window.Luster.state.business.tagline), 'edited', 'tagline');
  });
  await ctx.close();
  await t('facial + the example name uses the built-in example business', async () => { const c = await browser.newContext(); const q = await open(c, base + '?biz=facial&name=Simply%20Facials'); const i = await info(q); eq(i.n, 1, 'workspaces'); eq(i.cur, 'simply', 'id'); eq(i.tpl, 'facial', 'template'); await c.close(); });
  await t('unknown biz is ignored', async () => { const c = await browser.newContext(); const q = await open(c, base + '?biz=bogus&name=Nope'); const i = await info(q); eq(i.n, 1, 'workspaces'); eq(i.tpl, 'facial', 'template'); await c.close(); });
  await t('medspa link with phone and address', async () => { const c = await browser.newContext(); const q = await open(c, base + '?biz=medspa&name=Meraki%20Med%20Spa&owner=Tara&team=4&phone=225-555-0101&address=123%20Perkins%20Rd'); const i = await info(q); eq(i.name, 'Meraki Med Spa', 'name'); eq(await q.evaluate(() => window.Luster.state.business.phone), '225-555-0101', 'phone'); eq(await q.evaluate(() => window.Luster.state.business.address), '123 Perkins Rd', 'address'); await c.close(); });
  await browser.close();
  if (errors.length) { console.log('page errors:', errors); fails++; }
  console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
