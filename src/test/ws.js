// Multi-business flow: wizard → hair salon, med spa; switch; persistence; screenshots.
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, 'shots'); const url = 'file://' + path.join(__dirname, 'page.html');
const errors = [];
const TEST_NOW = (() => { const d = new Date(); d.setHours(10, 30, 0, 0); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d; })();   // the sample team is off on Sundays
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } }); const p = await ctx.newPage();
  await p.clock.setFixedTime(TEST_NOW);
  p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/^https?:/.test((m.location() || {}).url || '') && !/ERR_TUNNEL/.test(m.text())) errors.push('[console] ' + m.text()); });
  await p.goto(url); await p.waitForSelector('#rail .nav-item'); await p.waitForTimeout(200);
  const t = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name, '-', e.message.split('\n').slice(0, 3).join(' | ')); errors.push('[test ' + name + '] ' + e.message.split('\n')[0]); await p.evaluate(() => { window.Luster.ui.modal = null; document.getElementById('modal-root').innerHTML = ''; }).catch(() => {}); } };
  await t('wizard: create a hair salon', async () => {
    await p.click('.brand'); await p.waitForSelector('[data-act="new-business"]'); await p.screenshot({ path: `${OUT}/30-workspaces.png` });
    await p.click('[data-act="new-business"]'); await p.waitForSelector('.tpl-card'); await p.screenshot({ path: `${OUT}/31-wizard-type.png` });
    await p.click('.tpl-card[data-id="hair"]'); await p.click('[data-act="wiz-step"][data-s="1"]'); await p.waitForSelector('#wz-name');
    await p.fill('#wz-name', 'Magnolia Hair Studio'); await p.fill('#wz-owner', 'Renee'); await p.selectOption('#wz-team', '5'); await p.screenshot({ path: `${OUT}/32-wizard-details.png` });
    await p.click('[data-act="wiz-create"]'); await p.waitForSelector('[data-appt]'); await p.waitForTimeout(300);
    const name = await p.textContent('.brand-name'); if (!/Magnolia/.test(name)) throw new Error('brand not switched: ' + name);
    const first = await p.textContent('#rail'); if (!/Hair salon/.test(first)) throw new Error('template label missing');
    const legend = await p.textContent('.cal-legend'); if (!/Color/.test(legend)) throw new Error('hair categories missing: ' + legend);
    const owner = await p.evaluate(() => window.Luster.state.staff[0].name); if (!/^Renee/.test(owner)) throw new Error('owner name not used: ' + owner);
    await p.screenshot({ path: `${OUT}/33-hair-calendar.png` });
  });
  await t('hair: booking copy + contraindication', async () => {
    await p.click('[data-act="go"][data-view="booking"]'); await p.waitForSelector('.svc-row'); const txt = await p.textContent('.booking-frame'); if (!/stylist/i.test(txt)) throw new Error('noun not applied'); await p.screenshot({ path: `${OUT}/34-hair-booking.png` });
    const cid = await p.evaluate(() => { const c = window.Luster.state.clients.find((x) => x.flags.includes('ppd')); return c && c.id; }); if (!cid) throw new Error('no PPD client seeded');
    await p.evaluate((cid) => Actions['open-client']({ dataset: { id: cid } }), cid); await p.waitForSelector('.client-hero'); await p.click('[data-act="client-tab"][data-id="health"]'); await p.waitForTimeout(80);
    const health = await p.textContent('#client-detail'); if (!/Hair type|hair/i.test(health)) throw new Error('health tab not vertical');
    await p.click('[data-act="new-appt"]'); await p.waitForSelector('#drawer.open'); await p.click('#drawer [data-act="draft-svc"][data-id="h_root"]'); await p.waitForTimeout(60);
    const warn = await p.textContent('#drawer .drawer-body'); if (!/PPD/.test(warn)) throw new Error('no PPD warning'); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/35-hair-contra.png` }); await p.click('[data-act="close-drawer"]');
  });
  await t('hair: intake has the hair section and checkout works', async () => {
    const fid = await p.evaluate(() => { const c = window.Luster.state.clients[30]; return sendForm(c.id, 'intake').id; });
    await p.evaluate((id) => openModal('form-fill', { id }), fid); await p.waitForSelector('#ff'); const txt = await p.textContent('#ff'); if (!/Your hair/.test(txt) || !/patch test/i.test(txt)) throw new Error('hair intake section missing'); await p.click('[data-act="close-modal"]');
    await p.click('[data-act="go"][data-view="checkout"]'); await p.waitForSelector('.open-appt'); await p.click('.open-appt'); await p.waitForSelector('.ticket'); const cat = await p.textContent('.catalog'); if (!/Balayage/.test(cat)) throw new Error('hair catalog missing'); await p.click('[data-act="pay"][data-m="cash"]'); await p.waitForSelector('#cash-tendered'); await p.click('[data-act="cash-done"]'); await p.waitForSelector('.confirm-tick'); await p.click('[data-act="receipt-done"]');
  });
  await t('reports render for hair', async () => { await p.click('[data-act="go"][data-view="reports"]'); await p.waitForSelector('[data-chart="revenue"] svg'); const txt = await p.textContent('#content'); if (!/Color/.test(txt)) throw new Error('category revenue missing'); });
  await t('create a med spa + massage quickly', async () => {
    for (const [id, name] of [['medspa', 'Meridian Aesthetics'], ['massage', 'Still Water Massage']]) {
      await p.evaluate(([id, name]) => { window.Luster.createWorkspace(id, { name, team: 3, owner: 'Alex' }); window.Luster.ui = null; }, [id, name]);
      await p.evaluate(() => { S.ui = defaultUI(); App.go('calendar'); }); await p.waitForSelector('[data-appt]'); await p.waitForTimeout(200);
      const brand = await p.textContent('.brand-name'); if (!brand.includes(name.split(' ')[0])) throw new Error('not switched to ' + name);
      await p.screenshot({ path: `${OUT}/36-${id}-calendar.png` });
      await p.click('[data-act="go"][data-view="clients"]'); await p.click('#client-list .client-row'); await p.waitForTimeout(100); await p.click('[data-act="client-tab"][data-id="health"]'); await p.waitForTimeout(80); await p.screenshot({ path: `${OUT}/37-${id}-health.png` });
    }
  });
  await t('switch back to the example studio, persistence', async () => {
    await p.evaluate(() => window.Luster.save()); await p.waitForTimeout(400);
    const list = await p.evaluate(() => window.Luster.workspaces().map((w) => w.name)); if (list.length !== 4) throw new Error('expected 4 workspaces: ' + list.join(','));
    await p.click('.brand'); await p.waitForSelector('[data-act="ws-switch"]'); const btn = await p.$('[data-act="ws-switch"][data-id="demo"]'); if (!btn) throw new Error('no example-studio switch button'); await btn.click(); await p.waitForSelector('[data-appt]'); await p.waitForTimeout(300);
    const brand = await p.textContent('.brand-name'); if (!/Glow Theory Skin Studio/.test(brand)) throw new Error('switch back failed: ' + brand);
    await p.reload(); await p.waitForSelector('#rail .nav-item'); await p.waitForTimeout(400);
    const after = await p.evaluate(() => ({ name: window.Luster.state.business.name, n: window.Luster.workspaces().length, hairKept: window.Luster.workspaces().some((w) => w.name === 'Magnolia Hair Studio') })); if (after.name !== 'Glow Theory Skin Studio' || after.n !== 4 || !after.hairKept) throw new Error('persistence: ' + JSON.stringify(after));
    await p.click('.brand'); await p.waitForSelector('[data-act="ws-switch"]'); await p.click('[data-act="ws-switch"]:not([data-id="demo"])'); await p.waitForSelector('[data-appt]'); await p.waitForTimeout(300);
    const kept = await p.evaluate(() => window.Luster.state.business.name); console.log('      switched to', kept);
  });
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.map((e) => ' - ' + e).join('\n') : 'No errors.'); process.exit(errors.length ? 1 : 0);
})();
