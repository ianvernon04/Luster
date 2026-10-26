/* ===== Store: workspaces, persistence, derived data, mutations ===== */
const WS_INDEX_KEY = 'luster.ws.index', WS_CUR_KEY = 'luster.ws.current';
let LS_KEY = '';
const S = { state: null, ui: null, photoUrls: new Map(), wsId: null };
// Demo workspaces reseed when SEED_VERSION changes. Live workspaces hold real data, so their key never changes.
const wsKey = (id) => { const w = (S.wsIndex || []).find((x) => x.id === id); return w && w.live ? `luster.live.${id}` : `luster.ws.${id}.v${SEED_VERSION}`; };
function loadIndex() { try { const i = JSON.parse(localStorage.getItem(WS_INDEX_KEY) || '[]'); return Array.isArray(i) && i.length ? i : null; } catch (e) { return null; } }
function saveIndex(idx) { try { localStorage.setItem(WS_INDEX_KEY, JSON.stringify(idx)); } catch (e) {} }
function workspaces() { return S.wsIndex || (S.wsIndex = loadIndex() || [{ id: 'simply', name: TEMPLATES.facial.defaults.name, templateId: 'facial', opts: {}, createdAt: todayStr() }]); }
function currentWs() { return workspaces().find((w) => w.id === S.wsId) || workspaces()[0]; }
const tpl = () => TEMPLATES[(S.state && S.state.templateId) || 'facial'];
const bizUrl = (path = '') => `${(S.state && S.state.business.slug) || 'studio'}.example${path}`;

/* Workspace state lives in IndexedDB (localStorage caps out around 5 MB; one busy workspace is 2–3 MB). */
const KV = {
  db: null,
  open() { return new Promise((res) => { if (this.db) return res(this.db); try { const req = indexedDB.open('luster-db', 1); req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos'); }; req.onsuccess = () => { this.db = req.result; res(this.db); }; req.onerror = () => res(null); req.onblocked = () => res(null); } catch (e) { res(null); } }); },
  async get(k) { const db = await this.open(); if (!db) return null; return new Promise((res) => { try { const r = db.transaction('kv', 'readonly').objectStore('kv').get(k); r.onsuccess = () => res(r.result ?? null); r.onerror = () => res(null); } catch (e) { res(null); } }); },
  async set(k, v) { const db = await this.open(); if (!db) return false; return new Promise((res) => { try { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); } }); },
  async del(k) { const db = await this.open(); if (!db) return; return new Promise((res) => { try { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch (e) { res(); } }); },
};
async function loadState() {
  const idx = workspaces(); saveIndex(idx);
  let cur = null; try { cur = localStorage.getItem(WS_CUR_KEY); } catch (e) {}
  const ws = idx.find((w) => w.id === cur) || idx[0]; S.wsId = ws.id; LS_KEY = wsKey(ws.id);
  let st = null;
  try { st = await KV.get(LS_KEY); if (st && typeof st === 'string') st = JSON.parse(st); } catch (e) { st = null; }
  if (ws.live) {
    // a real business: never reseeded, never thrown away; the cloud fills in anything missing
    if (!st) st = emptyLiveState(ws, null, null);
    st.live = { ...st.live, businessId: ws.live.businessId, slug: st.live?.slug || ws.live.slug, timezone: st.live?.timezone || ws.live.timezone };
    st.live.ids ||= { staff: {}, services: {} }; st.live.synced ||= { appt: {}, client: {} };
    APP_TZ = st.live.timezone; syncCategories(st.categories);
  } else {
    APP_TZ = null;
    if (!st || st.version !== SEED_VERSION) st = buildInitialState(ws.templateId, ws.opts || {});
    else { syncCategories(st.categories); refreshSeededActivity(st); }
  }
  S.state = st; st.refunds ||= []; st.clients.forEach((c) => { c.storeCredit ||= 0; }); syncCategories(st.categories); invalidateIndex();
  refreshTodayStatuses();
  try { localStorage.setItem(WS_CUR_KEY, ws.id); } catch (e) {}
  return st;
}
const saveState = debounce(() => { KV.set(LS_KEY, S.state).catch(() => {}); }, 200);
const saveNow = () => KV.set(LS_KEY, S.state);
function resetDemo() { const ws = currentWs(); if (ws.live) return; S.state = buildInitialState(ws.templateId, ws.opts || {}); S.state.refunds ||= []; invalidateIndex(); refreshTodayStatuses(); saveState(); }
function createWorkspace(templateId, opts) {
  Cloud.stop(); APP_TZ = null;
  const idx = workspaces(); const id = uid('ws_'); const name = (opts.name || '').trim() || TEMPLATES[templateId].defaults.name;
  idx.push({ id, name, templateId, opts: { ...opts, name }, createdAt: todayStr() }); saveIndex(idx);
  try { localStorage.setItem(WS_CUR_KEY, id); } catch (e) {}
  S.wsId = id; LS_KEY = wsKey(id); S.state = buildInitialState(templateId, opts); invalidateIndex(); refreshTodayStatuses(); saveState();
  return idx[idx.length - 1];
}
async function switchWorkspace(id) {
  if (!workspaces().some((w) => w.id === id)) return;
  await Cloud.idle(); Cloud.stop();   // finish any sync for the business we're leaving before swapping its data out
  await saveNow().catch(() => {}); try { localStorage.setItem(WS_CUR_KEY, id); } catch (e) {} S.photoUrls = new Map(); await loadState();
  if (isLive()) Cloud.start();
}
function deleteWorkspace(id) { const idx = workspaces(); if (idx.length <= 1 || id === S.wsId) return; S.wsIndex = idx.filter((w) => w.id !== id); saveIndex(S.wsIndex); KV.del(wsKey(id)); }

function defaultUI() {
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('luster.ui') || '{}'); } catch (e) {}
  const hash = (location.hash || '').slice(1);
  const views = ['calendar', 'clients', 'checkout', 'booking', 'forms', 'messages', 'memberships', 'reports', 'settings'];
  return {
    view: views.includes(hash) ? hash : 'calendar', date: nextOpenDay(todayStr()), calMode: prefs.calMode === 'week' && matchMedia('(max-width: 860px)').matches ? 'day' : (prefs.calMode || 'day'), calStaff: 'all', weekStaff: 's1',
    clientId: null, clientQuery: '', clientFilter: 'all', clientTab: 'timeline', checkoutApptId: null, ticket: null, drawer: null, modal: null, palette: false,
    reportRange: '30d', settingsTab: 'business', bookingStep: 0, booking: {}, formsTab: 'inbox', msgClient: null, compare: null,
  };
}
/* On a closed day (Sunday for most shops) the calendar opens on the next working day instead of an empty grid. */
function nextOpenDay(from) { try { const staff = S.state ? S.state.staff.filter((x) => x.bookable) : []; for (let i = 0; i < 7; i++) { const d = addDays(from, i); if (!staff.length || staff.some((x) => x.days[dow(d)])) return d; } } catch (e) {} return from; }
function savePrefs() { try { localStorage.setItem('luster.ui', JSON.stringify({ calMode: S.ui.calMode })); } catch (e) {} }

/* ---- IndexedDB for user-added photos (blobs never go into localStorage) ---- */
const PhotoDB = {
  async put(id, blob) { const db = await KV.open(); if (!db) return false; return new Promise((res) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(blob, id); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); },
  async get(id) { const db = await KV.open(); if (!db) return null; return new Promise((res) => { const tx = db.transaction('photos', 'readonly'); const r = tx.objectStore('photos').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); },
  async del(id) { const db = await KV.open(); if (!db) return; return new Promise((res) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').delete(id); tx.oncomplete = () => res(); tx.onerror = () => res(); }); },
};
async function photoUrl(photo) {
  if (photo.src === null || photo.src === undefined) return placeholderPhoto(photo.clientId + photo.id, photo.kind);
  if (photo.src !== 'idb') return photo.src;
  if (S.photoUrls.has(photo.id)) return S.photoUrls.get(photo.id);
  const blob = await PhotoDB.get(photo.id);
  if (!blob) return placeholderPhoto(photo.id, photo.kind);
  const url = URL.createObjectURL(blob); S.photoUrls.set(photo.id, url); return url;
}

/* ---- lookups ---- */
const st = () => S.state;
const staffById = (id) => st().staff.find((s) => s.id === id);
const svcById = (id) => st().services.find((s) => s.id === id);
const prodById = (id) => st().products.find((p) => p.id === id);
const clientById = (id) => st().clients.find((c) => c.id === id);
const apptById = (id) => st().appointments.find((a) => a.id === id);
const planById = (id) => st().plans.find((p) => p.id === id);
const tplById = (id) => st().formTemplates.find((t) => t.id === id);
const fullName = (c) => c ? `${c.first} ${c.last}` : 'Unknown';
const apptTitle = (a) => a.items.map((i) => svcById(i.serviceId)?.name || '—').join(' + ') || 'Blocked time';
const apptMainCat = (a) => (a.items[0] && svcById(a.items[0].serviceId)?.cat) || CAT_ORDER[0];
const apptEnd = (a) => a.start + a.dur;
const bookableStaff = () => st().staff.filter((s) => s.bookable);
const STATUS_LABEL = { booked: 'Booked', confirmed: 'Confirmed', checkedin: 'Checked in', inservice: 'In service', completed: 'Completed', noshow: 'No-show', cancelled: 'Cancelled' };
const STATUS_BADGE = { booked: 'info', confirmed: 'accent', checkedin: 'good', inservice: 'good', completed: '', noshow: 'bad', cancelled: 'bad' };

const _idx = { src: null, map: null };
function apptIndex() { const arr = st().appointments; if (_idx.src !== arr || !_idx.map) { const m = new Map(); for (const a of arr) { let l = m.get(a.date); if (!l) { l = []; m.set(a.date, l); } l.push(a); } _idx.src = arr; _idx.map = m; } return _idx.map; }
function invalidateIndex() { _idx.map = null; }
function apptsOn(date, staffId) { const l = apptIndex().get(date) || []; return l.filter((a) => (!staffId || a.staffId === staffId) && a.status !== 'cancelled'); }
function clientAppts(cid) { return st().appointments.filter((a) => a.clientId === cid).sort(by((a) => a.date + pad2(Math.floor(a.start / 60)) + pad2(a.start % 60))); }
function clientVisits(cid) { return clientAppts(cid).filter((a) => a.status === 'completed'); }
function clientStats(cid) {
  const c = clientById(cid); const visits = clientVisits(cid); const tix = st().tickets.filter((t) => t.clientId === cid);
  const spend = sum(tix, (t) => t.total) + (c.priorSpend || 0);
  const count = visits.length + (c.priorVisits || 0);
  const last = visits.length ? visits[visits.length - 1].date : null;
  const next = clientAppts(cid).find((a) => (a.date > todayStr() || (a.date === todayStr() && !['completed', 'noshow', 'cancelled'].includes(a.status))) && a.status !== 'cancelled');
  return { visits: count, spend, avg: count ? spend / count : 0, last, next, noshows: clientAppts(cid).filter((a) => a.status === 'noshow').length };
}
function clientFlags(c) { return c.flags.map((k) => FLAGS.find((f) => f.k === k)).filter(Boolean); }
/* Which of these services are unsafe or need a check for this client. Returns [{level, text, services:[names]}] worst first. */
function contraindications(c, serviceIds) {
  const out = [];
  for (const rule of (tpl().contra || [])) {
    if (!c.flags.includes(rule.flag)) continue;
    const hit = serviceIds.map((id) => svcById(id)).filter((s) => s && (rule.services.includes(s.id) || rule.cats.includes(s.cat)));
    if (hit.length) out.push({ level: rule.level, flag: rule.flag, text: rule.text, services: hit.map((s) => s.name) });
  }
  if (c.flags.includes('oncology') && c.medical?.cancer && c.medical.cancer.clearance !== 'Yes, letter on file' && serviceIds.length) out.unshift({ level: 'bad', flag: 'oncology', text: `No physician clearance letter on file (${c.medical.cancer.clearance || 'not asked'}). Get it before the first ${tpl().noun.visit}.`, services: [] });
  return out.sort((a, b) => (a.level === 'bad' ? 0 : 1) - (b.level === 'bad' ? 0 : 1));
}
function staffWorking(staffId, date) { const s = staffById(staffId); return s && s.days[dow(date)] ? s.days[dow(date)] : null; }
function conflicts(staffId, date, start, dur, ignoreId) {
  return apptsOn(date, staffId).filter((a) => a.id !== ignoreId && !['noshow'].includes(a.status) && overlaps(start, dur, a.start, a.dur));
}
function freeSlots(staffId, date, dur, step = 15, opts = {}) {
  const hrs = staffWorking(staffId, date); if (!hrs) return [];
  const out = []; const isToday = date === todayStr(); const lead = st().settings.booking.leadMinutes;
  for (let t = hrs[0]; t + dur <= hrs[1]; t += step) {
    if (!opts.allowPast && isToday && t < nowMin() + lead) continue;
    if (!conflicts(staffId, date, t, dur).length) out.push(t);
  }
  return out;
}
function searchClients(q, limit = 50) {
  const s = q.trim().toLowerCase(); const all = st().clients;
  if (!s) return all.slice().sort(by((c) => c.last + c.first)).slice(0, limit);
  const digits = s.replace(/\D/g, '');
  const scored = [];
  for (const c of all) {
    const name = `${c.first} ${c.last}`.toLowerCase(); let score = 0;
    if (name.startsWith(s)) score = 3; else if (c.last.toLowerCase().startsWith(s) || c.first.toLowerCase().startsWith(s)) score = 2.5; else if (name.includes(s)) score = 2;
    else if (c.email.toLowerCase().includes(s)) score = 1.5; else if (digits.length >= 3 && c.phone.includes(digits)) score = 1.4;
    if (score) scored.push([score, c]);
  }
  return scored.sort((a, b) => b[0] - a[0] || (a[1].last < b[1].last ? -1 : 1)).slice(0, limit).map((x) => x[1]);
}

/* ---- mutations (every one of them saves) ---- */
function commit() { invalidateIndex(); saveState(); if (isLive()) Cloud.soon(); }
function setStatus(apptId, status) {
  const a = apptById(apptId); if (!a) return; a.status = status; a.touched = true;
  if (status === 'checkedin') a.arrivedAt = new Date().toISOString();
  commit();
}
function createAppointment({ clientId, staffId, date, start, items, notes = '', source = 'front_desk', status = 'booked' }) {
  const dur = sum(items, (i) => i.dur);
  const a = { id: newId('a_'), clientId, staffId, date, start, items, dur, status, notes, source, createdAt: todayStr(), seeded: false };
  st().appointments.push(a);
  if (st().settings.reminders.confirmOnBooking && !isLive()) {   // a live business sends its own (see 47-handoff.js)
    const c = clientById(clientId); const sname = staffById(staffId).name.split(' ')[0];
    st().messages.push({ id: uid('m_'), clientId, appointmentId: a.id, channel: source === 'online' ? 'email' : 'sms', kind: 'confirmation', body: `You're booked: ${apptTitle(a)} with ${sname} on ${fmtDate(date, 'dow')} at ${fmtTime(start)}. Need to change it? Reply to this message.`, at: new Date().toISOString(), status: 'delivered', reply: null, seeded: false });
    void c;
  }
  // consent forms needed?
  for (const it of items) {
    const need = (st().consentFor || {})[it.serviceId]; if (!need) continue;
    if (!st().forms.some((f) => f.clientId === clientId && f.templateId === need && (f.status === 'sent' || (f.status === 'completed' && diffDays(f.date, date) < 365)))) st().forms.push({ id: newId('f_'), clientId, templateId: need, status: 'sent', sentAt: todayStr(), date: null, answers: null, appointmentId: a.id, seeded: false });
  }
  if (!st().forms.some((f) => f.clientId === clientId && f.templateId === 'intake')) st().forms.push({ id: newId('f_'), clientId, templateId: 'intake', status: 'sent', sentAt: todayStr(), date: null, answers: null, seeded: false });
  commit(); return a;
}
function moveAppointment(apptId, { date, start, staffId }) {
  const a = apptById(apptId); if (!a) return { ok: false, reason: 'Appointment not found' };
  const sid = staffId || a.staffId; const d = date || a.date;
  const hrs = staffWorking(sid, d);
  if (!hrs) return { ok: false, reason: `${staffById(sid).name.split(' ')[0]} isn't working ${fmtDate(d, 'dow')}` };
  if (start < hrs[0] || start + a.dur > hrs[1]) return { ok: false, reason: `Outside ${staffById(sid).name.split(' ')[0]}'s hours (${fmtTime(hrs[0])}–${fmtTime(hrs[1])})` };
  const cf = conflicts(sid, d, start, a.dur, a.id);
  if (cf.length) return { ok: false, reason: `Overlaps ${fullName(clientById(cf[0].clientId))} at ${fmtTime(cf[0].start)}` };
  a.date = d; a.start = start; a.staffId = sid; a.touched = true; a.seeded = false; commit();
  return { ok: true };
}
function cancelAppointment(apptId, reason) { const a = apptById(apptId); if (!a) return; a.status = 'cancelled'; a.cancelReason = reason || ''; a.touched = true; a.seeded = false; commit(); }
function addNote(clientId, { type = 'treatment', text, appointmentId = null, staffId = 's1' }) {
  const n = { id: newId('n_'), clientId, appointmentId, staffId, date: todayStr(), type, text, at: new Date().toISOString(), seeded: false };
  st().notes.push(n); commit(); return n;
}
function deleteNote(id) { const i = st().notes.findIndex((n) => n.id === id); if (i >= 0) { if (isLive()) (st().live.tomb ||= []).push({ table: 'notes', id }); st().notes.splice(i, 1); commit(); } }
async function addPhotoFromFile(clientId, file, kind, area, appointmentId = null) {
  const id = uid('p_');
  const blob = await downscaleImage(file, 1400);
  const ok = await PhotoDB.put(id, blob);
  const p = { id, clientId, appointmentId, date: todayStr(), kind, area: area || 'Full face', src: ok ? 'idb' : await blobToDataUrl(blob), seeded: false };
  st().photos.push(p); commit(); return p;
}
function deletePhoto(id) { const i = st().photos.findIndex((p) => p.id === id); if (i >= 0) { const p = st().photos[i]; st().photos.splice(i, 1); if (p.src === 'idb') PhotoDB.del(id); commit(); } }
function blobToDataUrl(blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }
function downscaleImage(file, max) {
  return new Promise((res) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => res(b || file), 'image/jpeg', 0.86);
    };
    img.onerror = () => res(file);
    img.src = url;
  });
}
function upsertClient(data, id) {
  let c = id ? clientById(id) : null;
  if (!c) { c = { id: newId('c_'), first: '', last: '', phone: '', email: '', dob: '', skin: '', concerns: [], allergies: [], flags: [], source: 'Front desk', createdAt: todayStr(), freq: 2, membershipId: null, memberSince: null, memberStatus: null, vip: false, priorVisits: 0, priorSpend: 0, seeded: false, prefs: '', cardOnFile: null }; st().clients.push(c); }
  Object.assign(c, data); c.seeded = c.seeded && !data.first ? c.seeded : c.seeded; commit(); return c;
}
function completeForm(formId, answers, signature) { const f = st().forms.find((x) => x.id === formId); if (!f) return; f.status = 'completed'; f.date = todayStr(); f.answers = answers; f.signature = signature || null; f.seeded = false; commit(); }
// a client deleted here or on another device: off every list and the calendar (a live business keeps the record in the cloud)
function forgetClient(id) { const s0 = st(); const i = s0.clients.findIndex((c) => c.id === id); if (i >= 0) s0.clients.splice(i, 1); s0.appointments = s0.appointments.filter((a) => a.clientId !== id); invalidateIndex(); if (S.ui.clientId === id) S.ui.clientId = null; }
function sendForm(clientId, templateId, appointmentId = null) { const f = { id: newId('f_'), clientId, templateId, status: 'sent', sentAt: todayStr(), date: null, answers: null, appointmentId, seeded: false }; st().forms.push(f); const c = clientById(clientId); if (!isLive()) st().messages.push({ id: uid('m_'), clientId, channel: 'sms', kind: 'form', body: `Hi ${c.first}, please complete your ${tplById(templateId).name} before your visit: ${bizUrl('/f/' + f.id.slice(-5))}`, at: new Date().toISOString(), status: 'delivered', reply: null, seeded: false }); commit(); return f; }
function sendMessage(clientId, body, kind = 'manual') { const m = { id: uid('m_'), clientId, channel: 'sms', kind, body, at: new Date().toISOString(), status: 'delivered', reply: null, seeded: false }; st().messages.push(m); commit(); return m; }
function closeTicket(ticket) {
  const t = { ...ticket, id: newId('t_'), closedAt: new Date().toISOString(), seeded: false };
  st().tickets.push(t);
  if (t.appointmentId) { const a = apptById(t.appointmentId); if (a) { a.status = 'completed'; a.ticketId = t.id; a.touched = true; a.seeded = false; } }
  for (const l of t.lines) if (l.type === 'product') { const p = prodById(l.refId); if (p) p.stock = Math.max(0, p.stock - l.qty); }
  for (const p of t.payments) if (p.method === 'credit') { const c = clientById(t.clientId); if (c) { c.storeCredit = Math.max(0, Math.round(((c.storeCredit || 0) - p.amount) * 100) / 100); c.seeded = false; } }
  for (const l of t.lines) if (l.type === 'gift') st().giftCards.push({ code: 'GLOW-' + String(rint(Math.random, 1000, 9999)), balance: l.price });
  commit(); return t;
}
/* Refund part or all of a closed ticket. lines: [{name,type,refId,qty,amount,partial}], method: original payment method | 'credit' | 'cash'. */
function refundTicket(ticketId, { lines, tipRefunded = 0, method, reason, note = '' }) {
  const t = st().tickets.find((x) => x.id === ticketId); if (!t) return null;
  const amount = Math.round((sum(lines, (l) => l.amount) + tipRefunded) * 100) / 100;
  const r = { id: newId('r_'), ticketId, clientId: t.clientId, staffId: t.staffId, date: todayStr(), lines, amount, tipRefunded, method, reason, note, at: new Date().toISOString(), seeded: false };
  st().refunds.push(r);
  t.refunded = Math.round(((t.refunded || 0) + amount) * 100) / 100; (t.refundIds ||= []).push(r.id); t.seeded = false;
  for (const l of lines) if (l.type === 'product' && !l.partial) { const p = prodById(l.refId); if (p) p.stock += l.qty; }
  if (method === 'credit') { const c = clientById(t.clientId); if (c) { c.storeCredit = Math.round(((c.storeCredit || 0) + amount) * 100) / 100; c.seeded = false; } }
  commit(); return r;
}
function ticketRefunds(t) { return st().refunds.filter((r) => r.ticketId === t.id); }
function addToWaitlist(entry) { st().waitlist.push({ id: uid('w_'), addedAt: todayStr(), seeded: false, ...entry }); commit(); }
function removeFromWaitlist(id) { const i = st().waitlist.findIndex((w) => w.id === id); if (i >= 0) { st().waitlist.splice(i, 1); commit(); } }

/* Seeded appointments for today follow the clock until someone touches them. */
function refreshTodayStatuses() {
  const today = todayStr(), now = nowMin(); let changed = false;
  for (const a of st().appointments) {
    if (!a.seeded || a.touched || a.date !== today || a.status === 'cancelled' || a.status === 'noshow') continue;
    let s = a.status;
    if (a.start + a.dur <= now) s = 'completed'; else if (a.start <= now) s = 'inservice'; else if (a.start - 20 <= now) s = 'checkedin'; else if (s === 'completed' || s === 'inservice' || s === 'checkedin') s = 'confirmed';
    if (s !== a.status) { a.status = s; changed = true; }
    if (s === 'completed' && !a.ticketId) { makeSeededTicket(a); changed = true; }
  }
  if (changed) commit();
}
function makeSeededTicket(a) {
  const rng = mulberry32(parseInt(a.id.replace(/\D/g, ''), 10) || 1);
  const lines = a.items.map((it) => ({ type: 'service', refId: it.serviceId, name: svcById(it.serviceId).name, price: it.price, qty: 1, staffId: a.staffId, note: '' }));
  const svcSub = sum(lines, (l) => l.price); const tip = chance(rng, 0.7) ? Math.round(svcSub * pick(rng, [0.15, 0.18, 0.2, 0.22])) : 0;
  const t = { id: 't' + a.id.replace(/^a_?/, ''), appointmentId: a.id, clientId: a.clientId, staffId: a.staffId, date: a.date, lines, discount: 0, tip, tax: 0, total: svcSub + tip, payments: [{ method: 'card', amount: svcSub + tip, last4: String(rint(rng, 1000, 9999)) }], closedAt: new Date().toISOString(), seeded: true };
  st().tickets.push(t); a.ticketId = t.id;
}
