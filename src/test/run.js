// Headless smoke test for the Luster demo: loads the built page, walks the main flows, screenshots desktop/phone in light/dark.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const url = 'file://' + path.join(__dirname, 'page.html');
const errors = [];
const TEST_NOW = (() => { const d = new Date(); d.setHours(10, 30, 0, 0); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d; })();   // the sample team is off on Sundays
const lastToast = async (p) => { const ts = await p.$$('.toast'); return ts.length ? (await ts[ts.length - 1].textContent()) : ''; };
async function page(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1366, height: 860 }, colorScheme: opts.dark ? 'dark' : 'light', deviceScaleFactor: 1, hasTouch: !!opts.touch });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(TEST_NOW);
  p.on('console', (m) => { if (m.type() === 'error' && !/^https?:/.test((m.location() || {}).url || '') && !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|fonts\.g/.test(m.text())) errors.push(`[console] ${m.text()}`); });   // web fonts may be unreachable in sandboxes
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await p.goto(url); await p.waitForSelector('#rail .nav-item', { state: 'attached', timeout: 15000 }); await p.waitForTimeout(200);
  return { ctx, p };
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] }).catch(() => chromium.launch());
  const { p } = await page(browser);
  const t = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { console.log('FAIL ', name, '-', e.message.split('\n').slice(0, 4).join(' | ')); errors.push(`[test ${name}] ${e.message.split('\n')[0]}`); await p.evaluate(() => { window.Luster.ui.modal = null; document.getElementById('modal-root').innerHTML = ''; window.Luster.ui.drawer = null; document.getElementById('drawer').classList.remove('open'); document.getElementById('palette-root').innerHTML = ''; window.Luster.ui.palette = false; }).catch(() => {}); } };

  await t('boot renders calendar', async () => { await p.waitForSelector('.cal-grid [data-appt]', { timeout: 5000 }); const n = await p.$$eval('[data-appt]', (a) => a.length); if (n < 3) throw new Error('too few appointments: ' + n); });
  await p.screenshot({ path: `${OUT}/01-calendar.png` });
  await t('open appointment drawer', async () => { await p.click('[data-appt]'); await p.waitForSelector('#drawer.open .drawer-body'); const txt = await p.textContent('#drawer .drawer-head h2'); if (!txt.includes('·')) throw new Error('bad title ' + txt); });
  await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}/02-appt-drawer.png` });
  await t('check in + status', async () => { const btn = await p.$('#drawer [data-act="set-status"][data-status="checkedin"]'); if (btn) { await btn.click(); await p.waitForTimeout(100); const b = await p.textContent('#drawer .badge'); if (!/Checked in|In service|Completed/.test(b)) throw new Error('status not updated: ' + b); } });
  await t('book from empty slot', async () => {
    await p.click('[data-act="close-drawer"]'); await p.waitForTimeout(250);
    const pt = await p.evaluate(() => { const sc = document.getElementById('cal-scroll'); const r = sc.getBoundingClientRect(); for (const s of document.querySelectorAll('.cal-slot')) { const b = s.getBoundingClientRect(); if (b.top > r.top + 70 && b.bottom < r.bottom - 10) { const x = b.left + b.width / 2, y = b.top + b.height / 2; if (document.elementFromPoint(x, y) === s) return { x, y }; } } return null; }); if (!pt) throw new Error('no clickable empty slot'); await p.mouse.click(pt.x, pt.y);
    await p.waitForSelector('#draft-q'); await p.fill('#draft-q', 'lan'); await p.waitForTimeout(50);
    await p.click('#draft-results .client-row[data-act="draft-pick"]');
    await p.click('#drawer [data-act="draft-svc"]'); await p.waitForTimeout(50);
    let slot = await p.$('#drawer .slot'); if (!slot) { const tomorrow = await p.evaluate(() => addDays(todayStr(), 1)); await p.fill('#draft-date', tomorrow); await p.dispatchEvent('#draft-date', 'change'); await p.waitForTimeout(80); slot = await p.$('#drawer .slot'); } if (!slot) throw new Error('no time slots offered'); await slot.click();
    const save = await p.$('[data-act="draft-save"]'); if (await save.isDisabled()) throw new Error('save disabled'); await save.click(); await p.waitForTimeout(200);
    const toast = await lastToast(p); if (!/Booked/.test(toast)) throw new Error('no booked toast: ' + toast);
  });
  await t('drag an appointment', async () => {
    const el = await p.$('[data-appt]:not(.status-completed):not(.status-inservice)'); if (!el) throw new Error('nothing draggable');
    const box = await el.boundingBox(); const before = await el.getAttribute('data-start');
    await p.mouse.move(box.x + box.width / 2, box.y + 10); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2, box.y + 10 + 36, { steps: 6 }); await p.mouse.move(box.x + box.width / 2, box.y + 10 + 72, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
    const toast = await lastToast(p); if (!toast) throw new Error('no toast after drag (either moved or conflict expected)');
    console.log('      drag toast:', toast.trim().slice(0, 60), '| was', before);
  });
  await t('week view', async () => { await p.click('[data-act="cal-mode"][data-mode="week"]'); await p.waitForSelector('.cal-grid.week'); });
  await p.screenshot({ path: `${OUT}/03-week.png` });
  await t('list view', async () => { await p.click('[data-act="cal-mode"][data-mode="agenda"]'); await p.waitForSelector('.agenda'); await p.click('[data-act="cal-mode"][data-mode="day"]'); });
  await t('command palette search', async () => { await p.keyboard.press('Control+k'); await p.waitForSelector('#palette-q'); await p.type('#palette-q', 'heb'); await p.waitForTimeout(60); const n = await p.$$eval('[data-palette-item]', (a) => a.length); if (n < 2) throw new Error('no results'); await p.keyboard.press('Enter'); await p.waitForSelector('.client-hero'); });
  await p.screenshot({ path: `${OUT}/04-client.png`, fullPage: false });
  await t('client tabs', async () => { for (const tab of ['notes', 'photos', 'forms', 'membership', 'timeline']) { await p.click(`[data-act="client-tab"][data-id="${tab}"]`); await p.waitForTimeout(60); } });
  await t('add a note', async () => { await p.click('[data-act="client-tab"][data-id="notes"]'); await p.fill('#note-text', 'Test note from the smoke test.'); await p.click('[data-act="add-note"]'); await p.waitForTimeout(80); const txt = await p.textContent('#client-detail'); if (!txt.includes('Test note from the smoke test')) throw new Error('note missing'); });
  await t('photos tab + compare', async () => { await p.click('[data-act="client-tab"][data-id="photos"]'); await p.waitForTimeout(80); const cmp = await p.$('[data-act="compare"][data-before]:not([data-before=""])'); if (cmp) { await cmp.click(); await p.waitForSelector('#compare'); await p.screenshot({ path: `${OUT}/05-compare.png` }); await p.click('[data-act="close-modal"]'); } else console.log('      (this client has no photo pair)'); });
  await t('upload a photo', async () => { await p.click('[data-act="client-tab"][data-id="photos"]'); await p.waitForTimeout(60); const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DwHwyBNAMDACxkBfdYbeKBAAAAAElFTkSuQmCC', 'base64'); await p.setInputFiles('#photo-file', { name: 'test.png', mimeType: 'image/png', buffer: png }); await p.waitForTimeout(500); const txt = await lastToast(p); if (!/photo saved/.test(txt)) throw new Error('no photo toast: ' + txt); });
  await t('client list filters + search', async () => { await p.click('[data-act="client-filter"][data-id="members"]'); await p.waitForTimeout(60); await p.fill('#client-q', 'a'); await p.waitForTimeout(60); const n = await p.$$eval('#client-list .client-row', (a) => a.length); if (n < 1) throw new Error('no rows'); await p.click('[data-act="client-filter"][data-id="all"]'); });
  await t('checkout flow (cash)', async () => {
    await p.click('[data-act="go"][data-view="checkout"]'); await p.waitForSelector('.open-appts, .empty');
    const first = await p.$('.open-appt'); if (!first) throw new Error('no open appointments'); await first.click(); await p.waitForSelector('.ticket');
    const step = async (sel) => { try { await p.click(sel, { timeout: 4000 }); } catch (e) { throw new Error('click failed: ' + sel + ' :: ' + e.message.split('\n').slice(0, 3).join(' ')); } };
    await step('[data-act="co-tab"][data-id="retail"]'); await step('.cat-item'); await step('[data-act="ticket-tip"][data-p="20"]'); await p.waitForTimeout(60);
    await p.screenshot({ path: `${OUT}/06-checkout.png` });
    await step('[data-act="pay"][data-m="cash"]'); await p.waitForSelector('#cash-tendered'); await step('[data-act="cash-done"]'); await p.waitForSelector('.confirm-tick');
    await p.screenshot({ path: `${OUT}/07-receipt.png` });
    const rb = await p.$('[data-act="rebook-from-ticket"]'); if (rb) { await rb.click(); await p.waitForSelector('#drawer.open'); const save = await p.$('[data-act="draft-save"]'); if (save && !(await save.isDisabled())) { await save.click(); await p.waitForTimeout(150); } else { await p.click('[data-act="close-drawer"]'); } } else { console.log('      (client already rebooked)'); await p.click('[data-act="receipt-done"]'); }
  });
  await t('checkout flow (terminal)', async () => { await p.click('[data-act="go"][data-view="checkout"]'); const first = await p.$('.open-appt'); if (!first) { console.log('      (no more open appointments)'); return; } await first.click(); await p.waitForSelector('.ticket'); await p.click('[data-act="pay"][data-m="card"]'); await p.waitForSelector('.confirm-tick', { timeout: 6000 }); await p.click('[data-act="receipt-done"]'); });
  await t('online booking flow', async () => {
    await p.click('[data-act="go"][data-view="booking"]'); await p.waitForSelector('.svc-row'); await p.click('.svc-row'); await p.click('[data-act="bk-step"][data-s="1"]'); await p.click('[data-act="bk-staff"][data-id="any"]'); await p.click('[data-act="bk-step"][data-s="2"]'); await p.waitForSelector('.slot'); await p.click('.slot'); await p.click('[data-act="bk-step"][data-s="3"]');
    await p.fill('#bk-phone', '2255559999'); await p.fill('#bk-name', 'Smoke Tester'); await p.fill('#bk-email', 'smoke@example.com'); await p.waitForTimeout(60); await p.click('#bk-next3'); await p.waitForSelector('[data-act="bk-confirm"]'); await p.screenshot({ path: `${OUT}/08-booking-confirm.png` }); await p.click('[data-act="bk-confirm"]'); await p.waitForSelector('.confirm-tick'); await p.screenshot({ path: `${OUT}/09-booked.png` });
  });
  await t('forms: fill + sign', async () => {
    await p.click('[data-act="go"][data-view="forms"]'); await p.waitForSelector('.table, .empty'); const fill = await p.$('[data-act="fill-form"]'); if (!fill) throw new Error('nothing awaiting'); await fill.click(); await p.waitForSelector('#ff');
    for (let pass = 0; pass < 3; pass++) for (const box of await p.$$('#ff [data-field][data-type]:not([hidden])')) { const on = await box.$('.opt.on'); const opt = await box.$('.opt'); if (opt && !on) await opt.click(); }
    for (const cb of await p.$$('#ff .form-field[data-type="agree"]:not([hidden]) input')) await cb.check();
    const cv = await p.$('#sig-pad'); await cv.scrollIntoViewIfNeeded(); const b = await cv.boundingBox(); await p.mouse.move(b.x + 20, b.y + 60); await p.mouse.down(); await p.mouse.move(b.x + 200, b.y + 90, { steps: 8 }); await p.mouse.move(b.x + 380, b.y + 50, { steps: 8 }); await p.mouse.up();
    await p.screenshot({ path: `${OUT}/10-form.png` }); await p.click('[data-act="form-submit"]'); await p.waitForTimeout(150); const toast = await lastToast(p); if (!/signed/.test(toast)) throw new Error('not signed: ' + toast);
  });
  await t('refund a closed ticket (partial, to store credit)', async () => {
    await p.click('[data-act="go"][data-view="checkout"]'); await p.waitForSelector('.open-appts, .empty');
    const row = await p.$('.list-row[data-act="open-ticket"]'); if (!row) throw new Error('no closed tickets today'); await row.click(); await p.waitForSelector('[data-act="refund-open"]');
    await p.click('[data-act="refund-open"]'); await p.waitForSelector('[data-rl="0"]');
    await p.check('[data-rl="0"]'); await p.fill('[data-rlamt="0"]', '10'); await p.selectOption('#rf-method', 'credit'); await p.selectOption('#rf-reason', 'Goodwill'); await p.fill('#rf-note', 'Smoke test refund');
    const btn = await p.$('#rf-submit'); if (await btn.isDisabled()) throw new Error('submit disabled'); const label = await btn.textContent(); if (!/\$10\.00/.test(label)) throw new Error('total wrong: ' + label);
    await p.screenshot({ path: `${OUT}/21-refund.png` });
    await btn.click(); await p.waitForTimeout(150); const toast = await lastToast(p); if (!/Refunded \$10\.00/.test(toast)) throw new Error('no refund toast: ' + toast);
    const credit = await p.evaluate(() => { const r = window.Luster.state.refunds.find((x) => x.note === 'Smoke test refund'); const c = window.Luster.state.clients.find((c) => c.id === r.clientId); return { credit: c.storeCredit, refunded: window.Luster.state.tickets.find((t) => t.id === r.ticketId).refunded }; });
    if (credit.credit < 10 || credit.refunded < 10) throw new Error('credit not applied ' + JSON.stringify(credit));
    await p.click('[data-act="refunds-list"]'); await p.waitForSelector('.modal .table'); await p.click('[data-act="close-modal"]');
  });
  await t('intake form: conditional cancer block + health tab', async () => {
    await p.click('[data-act="go"][data-view="forms"]'); await p.waitForSelector('.table, .empty');
    const fid = await p.evaluate(() => { let f = window.Luster.state.forms.find((x) => x.status === 'sent' && x.templateId === 'intake'); if (!f) { const c = window.Luster.state.clients[50]; f = sendForm(c.id, 'intake'); } return f.id; });
    await p.evaluate((id) => openModal('form-fill', { id }), fid); await p.waitForSelector('#ff');
    const hiddenBefore = await p.$eval('[data-field="cancer_type"]', (el) => el.hidden); if (!hiddenBefore) throw new Error('cancer block visible before selection');
    await p.click('[data-field="conditions"] .opt:has-text("Cancer")'); await p.waitForTimeout(50);
    const hiddenAfter = await p.$eval('[data-field="cancer_type"]', (el) => el.hidden); if (hiddenAfter) throw new Error('cancer block did not appear');
    await p.fill('#ff-cancer_type', 'Breast'); await p.click('[data-field="cancer_status"] .opt:has-text("In treatment now")'); await p.click('[data-field="cancer_tx"] .opt:has-text("Radiation")'); await p.waitForTimeout(30);
    await p.fill('#ff-cancer_radiation_area', 'Left chest'); await p.click('[data-field="cancer_lymph"] .opt:has-text("Left side")'); await p.click('[data-field="cancer_port"] .opt:has-text("Yes")'); await p.click('[data-field="cancer_effects"] .opt:has-text("Fatigue")'); await p.click('[data-field="cancer_clearance"] .opt:has-text("Not yet")');
    for (const box of await p.$$('#ff [data-field][data-type="choice"]:not([hidden]), #ff [data-field][data-type="multi"]:not([hidden])')) { const on = await box.$('.opt.on'); if (!on) { const opt = await box.$('.opt'); if (opt) await opt.click(); } }
    await p.screenshot({ path: `${OUT}/22-intake.png` });
    for (const cb of await p.$$('#ff .form-field[data-type="agree"] input')) await cb.check();
    const cv = await p.$('#sig-pad'); await cv.scrollIntoViewIfNeeded(); const b = await cv.boundingBox(); await p.mouse.move(b.x + 20, b.y + 60); await p.mouse.down(); await p.mouse.move(b.x + 200, b.y + 90, { steps: 8 }); await p.mouse.move(b.x + 380, b.y + 50, { steps: 8 }); await p.mouse.up();
    await p.click('[data-act="form-submit"]'); await p.waitForTimeout(150); const toast = await lastToast(p); if (!/signed/.test(toast)) throw new Error('not signed: ' + toast); if (!/Oncology/.test(toast)) throw new Error('oncology flag missing in toast: ' + toast);
    const cid = await p.evaluate((id) => window.Luster.state.forms.find((x) => x.id === id).clientId, fid);
    await p.evaluate((cid) => Actions['open-client']({ dataset: { id: cid } }), cid); await p.waitForSelector('.client-hero'); await p.click('[data-act="client-tab"][data-id="health"]'); await p.waitForTimeout(80);
    const txt = await p.textContent('#client-detail'); if (!/Oncology client/.test(txt) || !/No clearance letter/.test(txt) || !/Left chest/.test(txt)) throw new Error('health tab missing oncology details');
    await p.screenshot({ path: `${OUT}/23-health.png` });
    // contraindication warning when booking a peel for this client
    await p.click('[data-act="new-appt"]'); await p.waitForSelector('#drawer.open'); await p.click('#drawer [data-act="draft-svc"][data-id="sv_peel"]'); await p.waitForTimeout(60);
    const warn = await p.textContent('#drawer .drawer-body'); if (!/Oncology client/.test(warn) || !/clearance/.test(warn)) throw new Error('no contraindication warning in booking form');
    await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/24-contra.png` }); await p.click('[data-act="close-drawer"]');
  });
  await t('messages', async () => { await p.click('[data-act="go"][data-view="messages"]'); await p.waitForSelector('.msg'); await p.click('[data-act="auto-toggle"]'); });
  await t('memberships', async () => { await p.click('[data-act="go"][data-view="memberships"]'); await p.waitForSelector('.table tbody tr'); });
  await t('reports', async () => { await p.click('[data-act="go"][data-view="reports"]'); await p.waitForSelector('[data-chart="revenue"] svg'); for (const r of ['today', '7d', '90d', '30d']) { await p.click(`[data-act="report-range"][data-id="${r}"]`); await p.waitForTimeout(80); } });
  await p.screenshot({ path: `${OUT}/11-reports.png`, fullPage: false });
  await t('settings tabs', async () => { await p.click('[data-act="go"][data-view="settings"]'); for (const tab of ['staff', 'services', 'products', 'booking', 'data', 'business']) { await p.click(`[data-act="settings-tab"][data-id="${tab}"]`); await p.waitForTimeout(40); } });
  await t('team hours and services: dropdowns and checkboxes save, bad ranges refused', async () => {
    await p.click('[data-act="settings-tab"][data-id="staff"]'); await p.waitForTimeout(60);
    const s = await p.evaluate(() => { const x = window.Luster.state.staff.find((y) => y.bookable && y.days[2]); return { id: x.id, h: x.days[2].slice() }; });
    await p.click(`details[data-more="${s.id}:hours"] summary`); await p.click(`details[data-more="${s.id}:svc"] summary`); await p.waitForTimeout(40);
    await p.selectOption(`select[data-on-change="staff-hours"][data-id="${s.id}"][data-d="2"][data-end="1"]`, '1080'); await p.waitForTimeout(60);
    let h = await p.evaluate((id) => window.Luster.state.staff.find((y) => y.id === id).days[2], s.id); if (h[1] !== 1080 || h[0] !== s.h[0]) throw new Error('end time not saved: ' + JSON.stringify(h));
    await p.selectOption(`select[data-on-change="staff-hours"][data-id="${s.id}"][data-d="2"][data-end="0"]`, '1200'); await p.waitForTimeout(60);
    h = await p.evaluate((id) => window.Luster.state.staff.find((y) => y.id === id).days[2], s.id); if (h[0] !== s.h[0]) throw new Error('start after end was accepted');
    if (!/after the start/.test(await lastToast(p))) throw new Error('no warning for a start after the end');
    const end = await p.$eval(`select[data-on-change="staff-hours"][data-id="${s.id}"][data-d="2"][data-end="1"] option[value="1440"]`, (o) => o.textContent); if (end !== 'midnight') throw new Error('midnight label: ' + end);
    await p.evaluate(() => rerenderContent()); if (!(await p.$eval(`details[data-more="${s.id}:svc"]`, (d) => d.open))) throw new Error('Services panel closed itself on a re-render');
    const box = `input[data-on-change="staff-skill"][data-id="${s.id}"]`; const svc = await p.$eval(box, (i) => i.dataset.svc);
    await p.uncheck(`${box}[data-svc="${svc}"]`); await p.waitForTimeout(60);
    let sk = await p.evaluate((id) => window.Luster.state.staff.find((y) => y.id === id).skills, s.id); if (!sk || sk.includes(svc)) throw new Error('service not removed: ' + JSON.stringify(sk));
    await p.check(`${box}[data-svc="${svc}"]`); await p.waitForTimeout(60);
    sk = await p.evaluate((id) => window.Luster.state.staff.find((y) => y.id === id).skills, s.id); if (sk !== undefined && sk !== null) throw new Error('re-checking every service should mean "does everything": ' + JSON.stringify(sk));
    await p.screenshot({ path: `${OUT}/25-team-settings.png` });
  });
  await t('exports: clients and appointments as spreadsheets, everything as a backup file', async () => {
    await p.click('[data-act="settings-tab"][data-id="data"]'); await p.waitForSelector('[data-act="export-csv"][data-k="clients"]');
    const n = await p.evaluate(() => ({ c: window.Luster.state.clients.length, a: window.Luster.state.appointments.length }));
    const grab = async (sel) => { const [dl] = await Promise.all([p.waitForEvent('download'), p.click(sel)]); return { name: dl.suggestedFilename(), text: require('fs').readFileSync(await dl.path(), 'utf8') }; };
    const cl = await grab('[data-act="export-csv"][data-k="clients"]'); const rows = cl.text.replace(/^\ufeff/, '').split('\r\n');
    if (!/-clients-\d{4}-\d{2}-\d{2}\.csv$/.test(cl.name) || !/^First Name,Last Name,Phone,Email/.test(rows[0]) || rows.length !== n.c + 1) throw new Error(`clients export: ${cl.name} ${rows.length} rows vs ${n.c}`);
    const ap = await grab('[data-act="export-csv"][data-k="appointments"]'); if (ap.text.replace(/^\ufeff/, '').split('\r\n').length !== n.a + 1) throw new Error('appointments export row count');
    const bk = await grab('[data-act="export-json"]'); const j = JSON.parse(bk.text); if (j.clients.length !== n.c) throw new Error('backup incomplete');
    // a name that looks like a formula comes out as text
    const orig = await p.evaluate(() => window.Luster.state.clients[0].first);
    await p.evaluate(() => { window.Luster.state.clients[0].first = '=HYPERLINK("http://x")'; });
    const cl2 = await grab('[data-act="export-csv"][data-k="clients"]'); if (!cl2.text.includes(`"'=HYPERLINK(""http://x"")"`)) throw new Error('formula not neutralised');
    await p.evaluate((o) => { window.Luster.state.clients[0].first = o; }, orig);
  });
  await t('persistence across reload', async () => { await p.evaluate(() => window.Luster.save()); await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(400); const has = await p.evaluate(() => window.Luster.state.clients.some((c) => c.first === 'Smoke')); if (!has) throw new Error('state did not persist'); });
  await t('render speed', async () => { const ms = await p.evaluate(() => { const t = performance.now(); window.Luster.go('clients'); window.Luster.go('calendar'); return performance.now() - t; }); console.log('      two view renders:', ms.toFixed(1), 'ms'); if (ms > 400) throw new Error('slow render ' + ms); });

  // dark mode desktop
  const d = await page(browser, { dark: true }); await d.p.waitForSelector('[data-appt]'); await d.p.screenshot({ path: `${OUT}/12-calendar-dark.png` });
  await d.p.click('[data-act="go"][data-view="reports"]'); await d.p.waitForTimeout(200); await d.p.screenshot({ path: `${OUT}/13-reports-dark.png` });
  await d.p.click('[data-act="go"][data-view="clients"]'); await d.p.click('#client-list .client-row'); await d.p.waitForTimeout(150); await d.p.screenshot({ path: `${OUT}/14-client-dark.png` });
  // phone
  const m = await page(browser, { viewport: { width: 390, height: 844 }, touch: true });
  await m.p.waitForSelector('[data-appt]'); await m.p.screenshot({ path: `${OUT}/15-phone-calendar.png` });
  const overflow = await m.p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(overflow > 0 ? `FAIL  phone horizontal overflow ${overflow}px` : 'ok    no horizontal overflow on phone');
  await m.p.click('[data-appt]'); await m.p.waitForTimeout(250); await m.p.screenshot({ path: `${OUT}/16-phone-drawer.png` }); await m.p.click('[data-act="close-drawer"]');
  await m.p.click('.tabbar [data-view="clients"]'); await m.p.waitForTimeout(150); await m.p.screenshot({ path: `${OUT}/17-phone-clients.png` });
  await m.p.click('#client-list .client-row'); await m.p.waitForTimeout(150); await m.p.screenshot({ path: `${OUT}/18-phone-client.png` });
  await m.p.click('.tabbar [data-view="checkout"]'); await m.p.waitForTimeout(150); const oa = await m.p.$('.open-appt'); if (oa) { await oa.click(); await m.p.waitForTimeout(150); } await m.p.screenshot({ path: `${OUT}/19-phone-checkout.png` });
  await m.p.click('.tabbar [data-act="more"]'); await m.p.waitForTimeout(100); await m.p.click('#modal-root [data-act="go"][data-view="booking"]'); await m.p.waitForTimeout(150); await m.p.screenshot({ path: `${OUT}/20-phone-booking.png` });
  const overflow2 = await m.p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(overflow2 > 0 ? `FAIL  phone horizontal overflow (booking) ${overflow2}px` : 'ok    no horizontal overflow on phone booking');

  await browser.close();
  console.log('\n' + (errors.length ? `ERRORS (${errors.length}):\n` + errors.map((e) => ' - ' + e).join('\n') : 'No console/page errors.'));
  process.exit(errors.length ? 1 : 0);
})();
