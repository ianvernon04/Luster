// Client import from CSV exports: column recognition, messy cells, duplicates, notes and allergy flags.
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const url = 'file://' + path.join(__dirname, 'page.html');
let fails = 0; const errors = [];
const t = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { fails++; console.log('FAIL ', name, '-', e.message.split('\n')[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luster-import-'));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await p.goto(url); await p.waitForSelector('#rail .nav-item', { state: 'attached' });
  const existing = await p.evaluate(() => { const c = window.Luster.state.clients[0]; return { first: c.first, phone: c.phone, n: window.Luster.state.clients.length }; });

  // a Boulevard-style export: BOM, quoted commas and line breaks, +1 phones, birthdays without a year, one duplicate, one blank row
  const blvd = '﻿' + [
    'First Name,Last Name,Email,Mobile Phone,Birthday,Created At,Tags,Notes,Total Visits,Total Sales',
    'Camille,Broussard,camille@example.com,+1 (225) 555-0199,03/09,2023-01-05T14:00:00Z,"VIP, regular","Prefers Danielle, quiet room",14,"$1,820.00"',
    'Josette,Guidry,,225.555.0177,1990-07-21,1/15/2024,,"Sensitive skin.\nNo fragrance.",3,240',
    `${existing.first},Duplicate,,${existing.phone},,,,,,`,
    ',,,,,,,,,',
    ',,nobody@example.com,,,,,,,',
    'Rhonda,Arceneaux,rhonda@example.com,2255550166,,,,,,',
  ].join('\r\n');
  fs.writeFileSync(path.join(tmp, 'boulevard-clients.csv'), blvd);
  // a GlossGenius-style export: one "Client Name" column, last-name-first rows, an allergies column
  const gg = ['Client Name,Phone Number,Email Address,Date of Birth,Allergies,Client Since', '"Landry, Ava",(225) 555-0142,ava@example.com,9/14/88,Latex,2022-06-01', 'Mia Hebert,2255550111,,,None,'].join('\n');
  fs.writeFileSync(path.join(tmp, 'glossgenius.csv'), gg);

  const openImport = async (file) => {
    await p.evaluate(() => Actions['import-open']()); await p.waitForSelector('#import-file', { state: 'attached' });
    await p.setInputFiles('#import-file', path.join(tmp, file)); await p.waitForSelector('[data-act="import-run"]');
  };
  await t('Boulevard export: columns recognized, duplicate and blank rows counted', async () => {
    await openImport('boulevard-clients.csv');
    const badges = (await p.textContent('#modal-root')).replace(/\s+/g, ' '); ok(/3 to import/.test(badges) && /1 already here/.test(badges) && /1 row without a name/.test(badges) && /from Boulevard/.test(badges), badges.slice(0, 300));
    const mapped = await p.evaluate(() => window.Luster.ui.modal.map); ok(mapped.first === 0 && mapped.phone === 3 && mapped.dob === 4 && mapped.since === 5 && mapped.spend === 9, JSON.stringify(mapped));
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(__dirname, 'shots', '50-import-preview.png') });
  });
  await t('changing a column choice updates the preview', async () => {
    await p.selectOption('select[data-k="email"]', ''); await p.waitForTimeout(80);
    ok(!/camille@example\.com/.test(await p.textContent('#modal-root table')), 'email still shown');
    await p.selectOption('select[data-k="email"]', '2'); await p.waitForTimeout(80);
    ok(/camille@example\.com/.test(await p.textContent('#modal-root table')), 'email not restored');
  });
  await t('importing creates the clients with history, tags and notes', async () => {
    await p.click('[data-act="import-run"]'); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const S = window.Luster.state; const c = S.clients.find((x) => x.first === 'Camille' && x.last === 'Broussard'); const j = S.clients.find((x) => x.first === 'Josette' && x.last === 'Guidry'); return { n: S.clients.length, c, j, notes: S.notes.filter((n) => n.clientId === c.id || n.clientId === j.id).map((n) => n.text) }; });
    ok(r.n === existing.n + 3, `count ${r.n} vs ${existing.n}+3`);
    ok(r.c.phone === '2255550199' && r.c.dob === '1900-03-09' && r.c.createdAt === '2023-01-05' && r.c.priorVisits === 14 && r.c.priorSpend === 1820 && r.c.vip === true, JSON.stringify(r.c).slice(0, 300));
    await p.evaluate((id) => { window.Luster.ui.clientId = id; window.Luster.go('clients'); }, r.c.id); await p.waitForTimeout(100);
    ok(/Birthday Mar 9/.test(await p.textContent('.client-hero')) && !/Age 1\d\d/.test(await p.textContent('.client-hero')), 'birthday without a year shown as an age');
    ok(r.j.phone === '2255550177' && r.j.dob === '1990-07-21' && r.j.createdAt === '2024-01-15', JSON.stringify(r.j).slice(0, 200));
    ok(r.notes.some((n) => /Prefers Danielle, quiet room/.test(n)) && r.notes.some((n) => /Sensitive skin\.\nNo fragrance\./.test(n)), JSON.stringify(r.notes));
  });
  await t('importing the same file again adds nobody', async () => {
    await openImport('boulevard-clients.csv');
    ok(/0 to import/.test(await p.textContent('#modal-root')), 'reimport would duplicate');
    ok(await p.isDisabled('[data-act="import-run"]'), 'import button enabled with nothing to import');
    await p.click('#modal-root [data-act="close-modal"]');
  });
  await t('GlossGenius export: "Last, First" names, two-digit years, allergies become a caution note and flag', async () => {
    await openImport('glossgenius.csv');
    ok(/from GlossGenius/.test(await p.textContent('#modal-root')), 'source');
    await p.click('[data-act="import-run"]'); await p.waitForTimeout(150);
    const ava = await p.evaluate(() => { const S = window.Luster.state; const c = S.clients.filter((x) => x.first === 'Ava' && x.last === 'Landry').pop(); return { c, notes: S.notes.filter((n) => n.clientId === c.id) }; });
    ok(ava.c && ava.c.dob === '1988-09-14' && ava.c.flags.includes('allergy'), JSON.stringify(ava.c).slice(0, 300));
    ok(ava.notes.some((n) => n.type === 'caution' && /Latex/.test(n.text)), JSON.stringify(ava.notes));
    const mia = await p.evaluate(() => window.Luster.state.clients.filter((x) => x.first === 'Mia' && x.last === 'Hebert').pop());
    ok(mia && !mia.flags.includes('allergy'), '"None" became an allergy');
  });
  await browser.close();
  if (errors.length) { console.log('page errors:\n ' + errors.join('\n ')); fails++; }
  console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
