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
  await t('facial + the example name uses the built-in example business', async () => { const c = await browser.newContext(); const q = await open(c, base + '?biz=facial&name=Glow%20Theory%20Skin%20Studio'); const i = await info(q); eq(i.n, 1, 'workspaces'); eq(i.cur, 'demo', 'id'); eq(i.tpl, 'facial', 'template'); await c.close(); });
  await t('the public demo is a made-up studio on the generic menu, never a real one', async () => {
    const c = await browser.newContext(); const q = await open(c, base);
    const g = await q.evaluate(() => { const s = window.Luster.state; return { name: s.business.name, studio: s.studio || null, sf: s.services.some((x) => x.id.startsWith('sf_')), phone: s.business.phone, simply: JSON.stringify(s.services).includes('Simply') }; });
    eq(g.name, 'Glow Theory Skin Studio', 'name'); eq(g.studio, null, 'profile'); eq(g.sf, false, 'a studio menu leaked in'); eq(g.simply, false, 'Simply Facials named in the generic menu'); eq(g.phone, '(225) 555-0142', 'placeholder phone');
    await c.close();
  });
  await t('Simply Facials\' pitch link opens their real menu, hours and memberships', async () => {
    const c = await browser.newContext(); const q = await open(c, base + '?studio=simplyfacials');
    const m = await q.evaluate(() => { const s = window.Luster.state; const v = s.services.find((x) => x.name === 'The Signature Facial'); return { name: s.business.name, studio: s.studio, phone: s.business.phone, sat: s.business.hours[6], cats: s.categories.length, sig: v && [v.price, v.dur], n: s.services.length, plan: s.plans[0].name + ' ' + s.plans[0].price, old: s.services.some((x) => x.id.startsWith('sv_')), restore: s.services.find((x) => x.id === 'sf_restore').cat, cryoConsent: s.consentFor.sf_cryosculpt, tax: s.business.taxRate }; });
    eq(m.name, 'Simply Facials', 'name'); eq(m.studio, 'simplyfacials', 'profile'); eq(m.phone, '(225) 955-3695', 'phone'); eq(JSON.stringify(m.sat), '[540,840]', 'Saturday 9–2'); eq(m.cats, 6, 'categories');
    eq(JSON.stringify(m.sig), '[125,45]', 'Signature $125 / 45 min'); eq(m.n, 18, 'services'); eq(m.plan, 'Essential Treatment Membership 99', 'first membership'); eq(m.old, false, 'generic menu leaked in');
    eq(m.restore, 'restore', 'RESTORE has its own section'); eq(m.cryoConsent, 'cryo', 'cryotherapy consent'); eq(m.tax, 0.105, 'Baton Rouge sales tax');
    // the demo follows the studio's own safety rules, and an oncology client booked for Procell is pointed to RESTORE
    const safety = await q.evaluate(() => { const st = window.Luster.state; const unsafe = st.appointments.filter((a) => { const c = st.clients.find((x) => x.id === a.clientId); return contraindications(c, a.items.map((it) => it.serviceId)).some((w) => w.level === 'bad' && w.services.length); }).length;
      const onc = st.clients.find((c) => c.flags.includes('oncology')); const w = contraindications(onc, ['sf_procell']).map((x) => x.text).join(' '); const ok = contraindications(onc, ['sf_restore']).filter((x) => x.services.length).length; return { unsafe, procell: /RESTORE/.test(w), restoreWarnings: ok }; });
    eq(safety.unsafe, 0, 'appointments that break a safety rule'); eq(safety.procell, true, 'Procell warning points to RESTORE'); eq(safety.restoreWarnings, 0, 'RESTORE itself flagged for an oncology client');
    // the same link again opens the same business; a setup link with the studio's exact name lands there too
    await q.goto(base + '?biz=facial&name=Simply%20Facials'); await q.waitForSelector('#rail .nav-item'); await q.waitForTimeout(300);
    const i = await info(q); eq(i.n, 1, 'workspaces after the name link'); eq(await q.evaluate(() => window.Luster.state.studio), 'simplyfacials', 'name link opens the profile');
    await c.close();
  });
  await t('a device that had Simply Facials as its example business keeps it, as that studio\'s pitch', async () => {
    const c = await browser.newContext();
    await c.addInitScript(() => { if (!localStorage.getItem('luster.ws.index')) { localStorage.setItem('luster.ws.index', JSON.stringify([{ id: 'simply', name: 'Simply Facials', templateId: 'facial', opts: {}, createdAt: '2026-10-20' }])); localStorage.setItem('luster.ws.current', 'simply'); } });
    const q = await open(c, base);
    const o = await q.evaluate(() => ({ name: window.Luster.state.business.name, studio: window.Luster.state.studio, n: window.Luster.workspaces().length, sig: window.Luster.state.services.some((x) => x.name === 'The Signature Facial') }));
    eq(o.name, 'Simply Facials', 'name'); eq(o.studio, 'simplyfacials', 'profile'); eq(o.n, 1, 'workspaces'); eq(o.sig, true, 'real menu');
    await c.close();
  });
  await t('any other facial studio gets the generic menu and its own team', async () => {
    const c = await browser.newContext(); const q = await open(c, base + '?biz=facial&name=Magnolia%20Skin%20Studio&owner=Tess&team=3');
    const g = await q.evaluate(() => { const s = window.Luster.state; return { studio: s.studio || null, sf: s.services.some((x) => x.id.startsWith('sf_')), first: s.staff[0].name, phone: s.business.phone }; });
    eq(g.studio, null, 'profile'); eq(g.sf, false, 'Simply menu leaked in'); if (!/^Tess /.test(g.first)) throw new Error('owner not first: ' + g.first); eq(g.phone, '(225) 555-0142', 'placeholder phone');
    await c.close();
  });
  await t('unknown biz is ignored', async () => { const c = await browser.newContext(); const q = await open(c, base + '?biz=bogus&name=Nope'); const i = await info(q); eq(i.n, 1, 'workspaces'); eq(i.tpl, 'facial', 'template'); await c.close(); });
  await t('medspa link with phone and address', async () => { const c = await browser.newContext(); const q = await open(c, base + '?biz=medspa&name=Meraki%20Med%20Spa&owner=Tara&team=4&phone=225-555-0101&address=123%20Perkins%20Rd'); const i = await info(q); eq(i.name, 'Meraki Med Spa', 'name'); eq(await q.evaluate(() => window.Luster.state.business.phone), '225-555-0101', 'phone'); eq(await q.evaluate(() => window.Luster.state.business.address), '123 Perkins Rd', 'address'); await c.close(); });
  await browser.close();
  if (errors.length) { console.log('page errors:', errors); fails++; }
  console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
