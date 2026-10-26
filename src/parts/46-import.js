/* ===== Import clients from a CSV export (Boulevard, GlossGenius, Vagaro, Square, Mindbody, a spreadsheet) =====
   Columns are recognized by name, every guess can be changed before importing, and nothing is duplicated:
   a row whose phone or email matches an existing client with the same first name is skipped. Notes and allergy
   columns become notes on the client (allergies as caution notes). In a live business the imports sync like any edit. */

const IMPORT_FIELDS = [
  ['first', 'First name', ['first name', 'first', 'firstname', 'given name', 'client first name', 'customer first name']],
  ['last', 'Last name', ['last name', 'last', 'lastname', 'surname', 'family name', 'client last name', 'customer last name']],
  ['name', 'Full name', ['name', 'full name', 'client name', 'client', 'customer name', 'customer', 'contact name']],
  ['phone', 'Mobile phone', ['mobile phone', 'mobile', 'cell', 'cell phone', 'mobile number', 'phone', 'phone number', 'primary phone', 'home phone', 'telephone', 'sms phone']],
  ['email', 'Email', ['email', 'email address', 'e-mail', 'e-mail address', 'primary email']],
  ['dob', 'Birthday', ['birthday', 'birth date', 'date of birth', 'dob', 'birthdate']],
  ['since', 'Client since', ['created at', 'created', 'customer since', 'client since', 'date added', 'join date', 'first visit', 'first visit date', 'signup date']],
  ['lastVisit', 'Last visit', ['last visit', 'last visit date', 'last appointment', 'last appointment date', 'last booked']],
  ['visits', 'Visits', ['visits', 'total visits', 'number of visits', 'visit count', 'appointments', 'total appointments', 'appointment count']],
  ['spend', 'Total spend', ['total spend', 'total spent', 'lifetime value', 'lifetime spend', 'total sales', 'revenue', 'total revenue', 'sales']],
  ['notes', 'Notes', ['notes', 'client notes', 'note', 'comments', 'alerts', 'client alert', 'profile notes']],
  ['allergies', 'Allergies', ['allergies', 'allergy', 'sensitivities']],
  ['tags', 'Tags', ['tags', 'labels', 'groups', 'client tags']],
  ['marketing', 'Marketing OK', ['email marketing', 'marketing opt in', 'accepts marketing', 'marketing', 'email opt in', 'sms marketing', 'opted in']],
];

// RFC 4180-ish CSV: quotes, doubled quotes, commas/newlines inside quotes, CRLF, BOM, tab- or semicolon-separated files
function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', '\t', ';'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}
const normHeader = (h) => String(h || '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
function guessMapping(headers) {
  const map = {}; const used = new Set();
  for (const [key, , names] of IMPORT_FIELDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && names.includes(normHeader(h)));
    if (i >= 0) { map[key] = i; used.add(i); }
  }
  // second pass: looser "contains" matches for anything still unmapped (e.g. "Client Mobile Phone #")
  for (const [key, , names] of IMPORT_FIELDS) {
    if (map[key] !== undefined) continue;
    const i = headers.findIndex((h, idx) => !used.has(idx) && names.some((n) => n.length > 3 && normHeader(h).includes(n)));
    if (i >= 0) { map[key] = i; used.add(i); }
  }
  return map;
}
// dates in the shapes exports actually use: 2024-03-09, 3/9/2024, 03/09/24, Mar 9 2024, 9-Mar-2024, 2024-03-09T15:04:05Z
function parseLooseDate(v, { birthday = false } = {}) {
  const s = String(v || '').trim(); if (!s) return '';
  let y, m, d; let mm;
  if ((mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [+mm[1], +mm[2], +mm[3]];
  else if ((mm = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/))) { m = +mm[1]; d = +mm[2]; y = mm[3] ? +mm[3] : null; if (y !== null && y < 100) y += y > (new Date().getFullYear() % 100) + 1 ? 1900 : 2000; }
  else { const t = Date.parse(s); if (isNaN(t)) return ''; const dt = new Date(t); [y, m, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()]; if (!/\d{4}/.test(s)) y = null; }
  if (!m || !d || m > 12 || d > 31) return '';
  if (y === null) y = birthday ? 1900 : new Date().getFullYear();   // birthdays without a year keep month/day
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
const moneyNum = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0; };
const truthy = (v) => /^(y|yes|true|1|opted in|subscribed|x)$/i.test(String(v || '').trim());

function importPlan(rows, map) {
  const get = (r, k) => (map[k] !== undefined && map[k] !== '' ? String(r[map[k]] ?? '').trim() : '');
  const existing = st().clients;
  const key = (first, phone, email) => [first.toLowerCase(), phone, email.toLowerCase()];
  const seen = []; const out = { add: [], dupes: 0, blank: 0 };
  for (const r of rows) {
    let first = get(r, 'first'), last = get(r, 'last');
    if (!first && !last && get(r, 'name')) { const parts = get(r, 'name').split(/\s+/); if (/,/.test(get(r, 'name'))) { const [l, f] = get(r, 'name').split(',').map((x) => x.trim()); first = f || ''; last = l || ''; } else { first = parts.shift() || ''; last = parts.join(' '); } }
    first = first.replace(/\s+/g, ' '); last = last.replace(/\s+/g, ' ');
    if (!first && !last) { out.blank++; continue; }
    if (!first) { first = last; last = ''; }
    let phone = get(r, 'phone').replace(/\D/g, ''); if (phone.length === 11 && phone[0] === '1') phone = phone.slice(1);
    const email = get(r, 'email').toLowerCase();
    const [kf, kp, ke] = key(first, phone, email);
    const clash = (c) => c.first.toLowerCase() === kf && ((kp && c.phone === kp) || (ke && (c.email || '').toLowerCase() === ke));
    if (existing.some(clash) || seen.some((x) => x.first.toLowerCase() === kf && ((kp && x.phone === kp) || (ke && x.email === ke)))) { out.dupes++; continue; }
    const c = { first, last, phone, email, dob: parseLooseDate(get(r, 'dob'), { birthday: true }), createdAt: parseLooseDate(get(r, 'since')) || todayStr(),
      lastVisit: parseLooseDate(get(r, 'lastVisit')), priorVisits: Math.round(moneyNum(get(r, 'visits'))), priorSpend: Math.round(moneyNum(get(r, 'spend'))),
      tags: get(r, 'tags') ? get(r, 'tags').split(/[;,|]/).map((t) => t.trim().toLowerCase()).filter(Boolean) : [], marketing: truthy(get(r, 'marketing')),
      notes: get(r, 'notes'), allergies: get(r, 'allergies') };
    seen.push(c); out.add.push(c);
  }
  return out;
}

function runImport(plan, source) {
  let n = 0;
  for (const x of plan.add) {
    const c = upsertClient({ first: x.first, last: x.last, phone: x.phone, email: x.email, dob: x.dob, source: `Imported from ${source}`, createdAt: x.createdAt,
      priorVisits: x.priorVisits, priorSpend: x.priorSpend, vip: x.tags.includes('vip'), tags: x.tags, freq: 2, marketingOptIn: x.marketing, importedLastVisit: x.lastVisit || null });
    if (x.notes) addNote(c.id, { type: 'general', text: `From ${source}: ${x.notes}`, staffId: null });
    if (x.allergies && !/^(none|no|n\/a|na|-)$/i.test(x.allergies)) { addNote(c.id, { type: 'caution', text: `Allergies (from ${source}): ${x.allergies}`, staffId: null }); if (!c.flags.includes('allergy')) { c.flags = [...c.flags, 'allergy']; c.allergies = [...(c.allergies || []), x.allergies]; } }
    n++;
  }
  commit(); return n;
}

Modals.importClients = (m) => {
  if (!m.rows) return {
    title: 'Import clients',
    body: `<div class="col" style="gap:12px"><p class="small muted">Export your client list from your current software as a CSV file (Boulevard, GlossGenius, Vagaro, Square and Mindbody all have one, usually under Clients → Export), then choose it here. Nothing is imported until you check the preview.</p>
      <label class="btn primary" style="align-self:flex-start">${I.dl}Choose CSV file<input type="file" accept=".csv,.tsv,.txt,text/csv" id="import-file" hidden></label>
      ${m.error ? `<div class="alert bad">${I.warn}<div>${esc(m.error)}</div></div>` : ''}</div>`,
    foot: '<button class="btn" data-act="close-modal">Cancel</button>',
    mount: (root) => { const inp = $('#import-file', root); if (inp) inp.addEventListener('change', async () => { const f = inp.files && inp.files[0]; if (!f) return; try { const text = await f.text(); const rows = parseCsv(text); if (rows.length < 2) return openModal('importClients', { error: 'That file has no rows under the header.' }); openModal('importClients', { file: f.name, headers: rows[0], rows: rows.slice(1), map: guessMapping(rows[0]), source: guessSource(f.name, rows[0]) }); } catch (e) { openModal('importClients', { error: `Couldn't read that file: ${e.message}` }); } }); },
  };
  const plan = importPlan(m.rows, m.map);
  const opts = (sel) => `<option value="">— not in this file —</option>${m.headers.map((h, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(h || `Column ${i + 1}`)}</option>`).join('')}`;
  const sample = plan.add.slice(0, 5);
  return {
    title: `Import ${esc(m.file)}`, wide: true,
    body: `<div class="col" style="gap:14px">
      <div class="row wrap" style="gap:8px"><span class="badge good">${plan.add.length} to import</span>${plan.dupes ? `<span class="badge">${plan.dupes} already here, skipped</span>` : ''}${plan.blank ? `<span class="badge warn">${plan.blank} row${plan.blank === 1 ? '' : 's'} without a name, skipped</span>` : ''}<span class="small muted">from ${esc(m.source)}</span></div>
      <div class="grid-3" style="gap:10px">${IMPORT_FIELDS.map(([k, label]) => `<div class="field"><label>${label}</label><select class="select" data-on-change="import-map" data-k="${k}">${opts(m.map[k])}</select></div>`).join('')}</div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Birthday</th><th class="r">Visits</th><th>Notes</th></tr></thead><tbody>${sample.map((x) => `<tr><td class="strong">${esc(`${x.first} ${x.last}`.trim())}</td><td style="white-space:nowrap">${esc(fmtPhone(x.phone))}</td><td>${esc(x.email)}</td><td style="white-space:nowrap">${x.dob ? esc(fromDateStr(x.dob).toLocaleDateString('en-US', x.dob.startsWith('1900-') ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })) : ''}</td><td class="r">${x.priorVisits || ''}</td><td class="small muted">${esc((x.allergies ? `Allergies: ${x.allergies}. ` : '') + x.notes).slice(0, 80)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nothing to import with these columns.</td></tr>'}</tbody></table></div>
      <div class="small muted">Showing the first ${sample.length}. Duplicates are matched on first name plus phone or email. Allergy columns become caution notes and set the allergy flag.</div></div>`,
    foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="import-run" ${plan.add.length ? '' : 'disabled'}>Import ${plan.add.length} client${plan.add.length === 1 ? '' : 's'}</button>`,
  };
};
function guessSource(name, headers) {
  const n = `${name} ${headers.join(' ')}`.toLowerCase();
  return /boulevard|blvd/.test(n) ? 'Boulevard' : /glossgenius|gloss/.test(n) ? 'GlossGenius' : /vagaro/.test(n) ? 'Vagaro' : /square/.test(n) ? 'Square' : /mindbody/.test(n) ? 'Mindbody' : /fresha/.test(n) ? 'Fresha' : /booksy/.test(n) ? 'Booksy' : 'your old software';
}
Object.assign(Actions, {
  'import-open': () => { closePalette(); openModal('importClients', {}); },
  'change:import-map': (el) => { const m = S.ui.modal; const map = { ...m.map }; if (el.value === '') delete map[el.dataset.k]; else map[el.dataset.k] = +el.value; openModal('importClients', { ...m, map }); },
  'import-run': () => { const m = S.ui.modal; const plan = importPlan(m.rows, m.map); const n = runImport(plan, m.source); closeModal(); S.ui.clientId = null; App.go('clients'); toast(`Imported ${n} client${n === 1 ? '' : 's'} from ${esc(m.source)}${isLive() ? '. Syncing to the cloud…' : ''}`); },
});
