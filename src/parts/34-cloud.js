/* ===== Cloud: live businesses on Supabase =====
   A demo workspace never touches the network. A live workspace mirrors one real business in the cloud:
   - the iPad keeps a full local copy, so the calendar is instant and works offline;
   - local edits are pushed by diffing each record against what the cloud last confirmed (no edit can be missed);
   - cloud changes (online bookings, other devices) arrive by realtime, with a polling fallback;
   - the database refuses double-bookings and overspent gift cards, and a refused edit is rolled back on screen with an explanation.
   In the cloud: business, team, hours, services, clients, appointments, notes, forms (answers and health files through
   audited functions), tickets, refunds, gift cards and their ledger. Still on this device only: photos, products and
   stock, memberships, messages, waitlist. */
const CLOUD_CFG = window.LUSTER_CONFIG || {};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
const ymd = (d) => (d ? String(d).slice(0, 10) : null);   // the cloud's plain dates, whatever shape they arrive in
const newUuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15); return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
const isLive = () => !!(S.state && S.state.live);
const BLOCK_SVC = '__block';
function ensureBlockService() { if (!svcById(BLOCK_SVC)) st().services.push({ id: BLOCK_SVC, name: 'Blocked time', cat: CAT_ORDER[0], dur: 30, price: 0, desc: '', hidden: true, noAuto: true, internal: true }); }
const newId = (prefix) => (isLive() ? newUuid() : uid(prefix));
function hashOf(obj) { const s = JSON.stringify(obj); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
function bookingSlug(name) { return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'studio'; }
function appBaseUrl() { const p = location.pathname; return location.origin + p.slice(0, p.lastIndexOf('/') + 1); }
function bookingUrl(slug) { return `${appBaseUrl()}book/${slug}`; }

const Cloud = {
  sbClient: null, user: null, timer: null, channel: null, busy: false, again: false, status: 'off', lastError: '', lastSyncAt: null, started: false,
  available() { return !!(window.supabase && window.supabase.createClient && CLOUD_CFG.supabaseUrl && CLOUD_CFG.supabaseAnonKey && !/YOUR-PROJECT/.test(CLOUD_CFG.supabaseUrl)); },
  sb() {
    if (!this.sbClient && this.available()) this.sbClient = window.supabase.createClient(CLOUD_CFG.supabaseUrl, CLOUD_CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'luster.auth' } });
    return this.sbClient;
  },
  async refreshUser() { const sb = this.sb(); if (!sb) return null; try { const { data } = await sb.auth.getSession(); this.user = data && data.session ? data.session.user : null; } catch (e) { this.user = null; } return this.user; },
  async signIn(email, password) {
    const { data, error } = await this.sb().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(/confirm/i.test(error.message) ? 'Confirm your email first: open the link we sent you, then sign in here.' : /invalid/i.test(error.message) ? 'That email and password don’t match.' : error.message);
    this.user = data.user; return data.user;
  },
  async signUp(email, password) {
    const { data, error } = await this.sb().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: appBaseUrl() } });
    if (error) throw new Error(/already/i.test(error.message) ? 'That email already has an account. Sign in instead.' : error.message);
    if (!data.session) return { needsConfirm: true };
    this.user = data.user; return { user: data.user };
  },
  async resetPassword(email) {
    const { error } = await this.sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: appBaseUrl() });
    if (error) throw new Error(/rate|seconds/i.test(error.message) ? 'A link was sent a moment ago. Check your inbox, or try again in a minute.' : error.message);
  },
  async setPassword(password) {
    const { data, error } = await this.sb().auth.updateUser({ password });
    if (error) throw new Error(/same|different/i.test(error.message) ? 'Pick a password you haven\'t used before.' : /expired|session/i.test(error.message) ? 'That reset link has expired. Ask for a new one from the sign-in screen.' : error.message);
    this.user = data.user; return data.user;
  },
  // Links from Luster's emails land on the app: a password reset (#…type=recovery) or an email confirmation (type=signup).
  // supabase-js reads the link when the client is created; we only add the next step and the plain-English errors.
  handleAuthRedirect() {
    const h = location.hash || ''; if (!/(access_token|error_description)=/.test(h)) return;
    const p = new URLSearchParams(h.slice(1));
    if (p.get('error_description')) {
      history.replaceState(null, '', location.pathname + location.search);
      toast(/expired|invalid/i.test(p.get('error_description')) ? 'That link has expired. Ask for a new one from the sign-in screen.' : esc(p.get('error_description')), 'bad'); return;
    }
    if (!this.available()) return;
    const type = p.get('type'); const sb = this.sb();   // creating the client signs this device in from the link
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event !== 'PASSWORD_RECOVERY' && event !== 'SIGNED_IN') return;
      setTimeout(() => { try { data.subscription.unsubscribe(); } catch (e) {} }, 0);
      this.refreshUser().then(() => {
        if (event === 'PASSWORD_RECOVERY' || type === 'recovery') openModal('newPassword', {});
        else { toast(type === 'signup' ? "Email confirmed. You're signed in." : "You're signed in."); if (isLive()) this.start(); }
        renderRail();
      });
    });
  },
  async signOut() { this.stop(); try { await this.sb().auth.signOut(); } catch (e) {} this.user = null; },

  /* ---------------------------------------------------------------- mapping */
  L() { return S.state.live; },
  tz() { return this.L().timezone || 'America/Chicago'; },
  uuidOf(kind, key) { const m = this.L().ids[kind]; return m[key] || (isUuid(key) ? key : null); },
  keyOf(kind, uuid) { const m = this.L().ids[kind]; for (const k in m) if (m[k] === uuid) return k; return uuid; },
  apptRow(a) {
    const tz = this.tz(); const start = zonedToUtc(a.date, a.start, tz);
    return {
      id: a.id, business_id: this.L().businessId, client_id: isUuid(a.clientId) ? a.clientId : null, staff_id: this.uuidOf('staff', a.staffId),
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + a.dur * 60000).toISOString(), status: a.status,
      source: a.source === 'online' ? 'online' : a.source === 'import' ? 'import' : 'desk',
      services: a.items.filter((i) => i.serviceId !== BLOCK_SVC).map((i) => { const v = svcById(i.serviceId); return { service_id: this.uuidOf('services', i.serviceId), key: i.serviceId, name: v ? v.name : (i.name || ''), duration_min: i.dur, price_cents: Math.round((i.price ?? (v ? v.price : 0)) * 100) }; }),
      note: a.notes || null, cancel_reason: a.status === 'cancelled' ? (a.cancelReason || null) : null,
    };
  },
  apptFromRow(r, existing) {
    const tz = this.tz(); const s = tzParts(new Date(r.starts_at), tz);
    return { ...(existing || {}), id: r.id, clientId: r.client_id, staffId: this.keyOf('staff', r.staff_id), date: s.date, start: s.min,
      dur: Math.round((new Date(r.ends_at) - new Date(r.starts_at)) / 60000),
      items: (r.services && r.services.length ? r.services.map((x) => ({ serviceId: x.key || this.keyOf('services', x.service_id), dur: x.duration_min, price: x.price_cents / 100 }))
        : [{ serviceId: BLOCK_SVC, dur: Math.round((new Date(r.ends_at) - new Date(r.starts_at)) / 60000), price: 0 }]),
      status: r.status, notes: r.note || '', source: r.source === 'online' ? 'online' : r.source === 'import' ? 'import' : 'front_desk',
      cancelReason: r.cancel_reason || '', manageToken: r.manage_token || (existing && existing.manageToken) || null, createdAt: (existing && existing.createdAt) || tzParts(new Date(r.created_at), tz).date, seeded: false, cloud: true };
  },
  clientRow(c) {
    return { id: c.id, business_id: this.L().businessId, first_name: c.first || '', last_name: c.last || '', phone: c.phone || null, email: c.email || null,
      birthday: c.dob || null, flags: c.flags || [], tags: [...new Set([...(c.vip ? ['vip'] : []), ...((c.tags || []).filter((t) => t !== 'vip'))])],
      profile: { skin: c.skin || '', concerns: c.concerns || [], prefs: c.prefs || '', allergies: c.allergies || [], since: c.createdAt || null, priorVisits: c.priorVisits || 0, priorSpend: c.priorSpend || 0, lastVisit: c.importedLastVisit || null },
      marketing_opt_in: !!c.marketingOptIn, source: c.source || null };
  },
  clientFromRow(r, existing) {
    const base = existing || { skin: '', concerns: [], allergies: [], flags: [], freq: 2, membershipId: null, memberSince: null, memberStatus: null, vip: false, priorVisits: 0, priorSpend: 0, prefs: '', cardOnFile: null, storeCredit: 0, medical: null };
    const prof = r.profile || {};
    return { ...base, id: r.id, first: r.first_name || '', last: r.last_name || '', phone: r.phone_e164 ? r.phone_e164.replace(/^\+1/, '').replace(/\D/g, '') : (r.phone || '').replace(/\D/g, ''),
      email: r.email || '', dob: ymd(r.birthday) || '', flags: r.flags || [], tags: r.tags || [], vip: (r.tags || []).includes('vip'),
      skin: prof.skin ?? base.skin, concerns: prof.concerns ?? base.concerns, prefs: prof.prefs ?? base.prefs, allergies: prof.allergies ?? base.allergies ?? [], marketingOptIn: !!r.marketing_opt_in,
      priorVisits: prof.priorVisits ?? base.priorVisits, priorSpend: prof.priorSpend ?? base.priorSpend, importedLastVisit: prof.lastVisit ?? base.importedLastVisit ?? null,
      source: r.source === 'online' ? 'Online booking' : (r.source || base.source || 'Front desk'),
      createdAt: base.createdAt || prof.since || tzParts(new Date(r.created_at), this.tz()).date, seeded: false, cloud: true };
  },
  syncedRef(kind, id) { return isUuid(id) && this.L().synced[kind] && this.L().synced[kind][id] ? id : null; },   // only point at rows the cloud has
  noteRow(n) {
    return { id: n.id, business_id: this.L().businessId, client_id: n.clientId, appointment_id: this.syncedRef('appt', n.appointmentId),
      staff_id: n.staffId ? this.uuidOf('staff', n.staffId) : null, kind: n.type || 'treatment', body: n.text || '', noted_on: n.date || todayStr() };
  },
  noteFromRow(r, ex) {
    return { ...(ex || {}), id: r.id, clientId: r.client_id, appointmentId: r.appointment_id || (ex && ex.appointmentId) || null,
      staffId: r.staff_id ? this.keyOf('staff', r.staff_id) : ((ex && ex.staffId) || null), date: ymd(r.noted_on), type: r.kind, text: r.body, at: (ex && ex.at) || r.created_at, seeded: false };
  },
  formRow(f) {
    return { id: f.id, business_id: this.L().businessId, client_id: f.clientId, appointment_id: this.syncedRef('appt', f.appointmentId),
      template_id: f.templateId, status: f.status === 'completed' ? 'completed' : 'sent', sent_on: f.sentAt || null, completed_on: f.status === 'completed' ? (f.date || todayStr()) : null };
  },
  formFromRow(r, ex) {
    return { answers: null, signature: null, ...(ex || {}), id: r.id, clientId: r.client_id, appointmentId: r.appointment_id || (ex && ex.appointmentId) || null,
      templateId: r.template_id, status: r.status, sentAt: ymd(r.sent_on), date: ymd(r.completed_on), publicToken: r.public_token || (ex && ex.publicToken) || null, seeded: false };
  },
  ticketRow(t) {
    const { id, appointmentId, clientId, staffId, date, total, refunded, closedAt, seeded, cloud, ...rest } = t;
    return { id, business_id: this.L().businessId, client_id: isUuid(clientId) ? clientId : null, appointment_id: this.syncedRef('appt', appointmentId),
      staff_id: staffId ? this.uuidOf('staff', staffId) : null, sold_on: date || todayStr(), closed_at: closedAt || new Date().toISOString(),
      total_cents: Math.round((total || 0) * 100), refunded_cents: Math.round((refunded || 0) * 100), data: rest };
  },
  ticketFromRow(r, ex) {
    return { ...(ex || {}), ...(r.data || {}), id: r.id, appointmentId: r.appointment_id || (ex && ex.appointmentId) || null, clientId: r.client_id,
      staffId: r.staff_id ? this.keyOf('staff', r.staff_id) : ((ex && ex.staffId) || null), date: ymd(r.sold_on), total: r.total_cents / 100,
      refunded: r.refunded_cents / 100, closedAt: (ex && ex.closedAt) || r.closed_at, seeded: false };
  },
  refundRow(x) {
    const { id, ticketId, clientId, staffId, date, amount, method, reason, seeded, cloud, ...rest } = x;
    return { id, business_id: this.L().businessId, ticket_id: ticketId, client_id: isUuid(clientId) ? clientId : null,
      staff_id: staffId ? this.uuidOf('staff', staffId) : null, refunded_on: date || todayStr(), amount_cents: Math.round((amount || 0) * 100),
      method: method || null, reason: reason || null, data: rest };
  },
  refundFromRow(r, ex) {
    return { ...(ex || {}), ...(r.data || {}), id: r.id, ticketId: r.ticket_id, clientId: r.client_id, staffId: r.staff_id ? this.keyOf('staff', r.staff_id) : ((ex && ex.staffId) || null),
      date: ymd(r.refunded_on), amount: r.amount_cents / 100, method: r.method, reason: r.reason, seeded: false };
  },
  // a gift card is sent once; what it holds is worked out by the database from the ledger (never sent from here)
  giftRow(g) {
    return { id: g.id, business_id: this.L().businessId, code: g.code, amount_cents: Math.round((g.amount || 0) * 100), client_id: isUuid(g.clientId) ? g.clientId : null,
      ticket_id: this.syncedRef('ticket', g.ticketId), issued_on: g.date || todayStr(), data: { recipient: g.recipient || null, note: g.note || null } };
  },
  giftFromRow(r, ex) {
    return { ...(ex || {}), id: r.id, code: r.code, amount: r.amount_cents / 100, cloudBalance: r.balance_cents / 100, clientId: r.client_id || (ex && ex.clientId) || null,
      ticketId: r.ticket_id || (ex && ex.ticketId) || null, date: ymd(r.issued_on), recipient: (r.data && r.data.recipient) || '', note: (r.data && r.data.note) || '', seeded: false };
  },
  giftUseRow(u) {
    return { id: u.id, business_id: this.L().businessId, card_id: u.cardId, ticket_id: this.syncedRef('ticket', u.ticketId), kind: u.kind,
      amount_cents: Math.round((u.amount || 0) * 100), used_on: u.date || todayStr(), data: { at: u.at || null } };
  },
  giftUseFromRow(r, ex) {
    return { ...(ex || {}), id: r.id, cardId: r.card_id, ticketId: r.ticket_id || (ex && ex.ticketId) || null, kind: r.kind, amount: r.amount_cents / 100,
      date: ymd(r.used_on), at: (r.data && r.data.at) || r.created_at, seeded: false };
  },
  // what syncs, in dependency order (a row is pushed only after what it points at)
  kinds() {
    return [
      { kind: 'client', table: 'clients', list: () => st().clients, row: (x) => this.clientRow(x), from: (r, ex) => this.clientFromRow(r, ex) },
      { kind: 'appt', table: 'appointments', list: () => st().appointments.filter((a) => this.uuidOf('staff', a.staffId)), all: () => st().appointments, row: (x) => this.apptRow(x), from: (r, ex) => this.apptFromRow(r, ex) },
      { kind: 'ticket', table: 'tickets', list: () => st().tickets, row: (x) => this.ticketRow(x), from: (r, ex) => this.ticketFromRow(r, ex) },
      { kind: 'gift', table: 'gift_cards', list: () => st().giftCards, row: (x) => this.giftRow(x), from: (r, ex) => this.giftFromRow(r, ex) },
      // a use goes up after its card, and after the sale it belongs to (the ledger can't be corrected later)
      { kind: 'giftUse', table: 'gift_card_uses', list: () => st().giftUses.filter((u) => this.L().synced.gift[u.cardId] && (!u.ticketId || this.L().synced.ticket[u.ticketId])), all: () => st().giftUses, row: (x) => this.giftUseRow(x), from: (r, ex) => this.giftUseFromRow(r, ex) },
      { kind: 'refund', table: 'refunds', list: () => st().refunds.filter((x) => this.L().synced.ticket[x.ticketId]), all: () => st().refunds, row: (x) => this.refundRow(x), from: (r, ex) => this.refundFromRow(r, ex) },
      { kind: 'note', table: 'notes', list: () => st().notes.filter((n) => this.L().synced.client[n.clientId]), all: () => st().notes, row: (x) => this.noteRow(x), from: (r, ex) => this.noteFromRow(r, ex) },
      { kind: 'form', table: 'forms', list: () => st().forms.filter((f) => this.L().synced.client[f.clientId]), all: () => st().forms, row: (x) => this.formRow(x), from: (r, ex) => this.formFromRow(r, ex) },
    ];
  },
  // the studio's forms as the client's phone renders them; the business type's own intake questions are marked so the
  // phone can work out the same caution flags the iPad would (book/intake.js)
  // each template also carries the services that need it signed first, so every device asks for the same consents
  formTemplatesPayload() {
    const vertical = new Set(((tpl().intake || {}).section || { fields: [] }).fields.map((f) => f.id));
    const needs = st().consentFor || {};
    return (st().formTemplates || []).map((t) => ({ business_id: this.L().businessId, template_id: t.id, kind: t.kind || 'consent', name: t.name,
      definition: { ...t, fields: t.fields.map((f) => (t.id === 'intake' && vertical.has(f.id) ? { ...f, vertical: true } : f)), services: Object.keys(needs).filter((k) => needs[k] === t.id).sort() } }));
  },
  // a device opening the business from the cloud (or after another device changed them) gets the studio's own forms and
  // which services need which consent, instead of the business type's defaults
  async pullForms() {
    const sb = this.sb(); const L = this.L();
    if (L.formsHash && hashOf(this.formTemplatesPayload()) !== L.formsHash) return;   // this device's form changes aren't sent yet: they win
    const rows = await this.fetchAll(() => sb.from('form_templates').select('template_id, kind, name, definition').eq('business_id', L.businessId).order('template_id'));
    if (!rows.length) return;
    const byId = new Map((st().formTemplates || []).map((t) => [t.id, t])); const needs = {}; let mapped = false;
    for (const r of rows) {
      const { services, ...def } = r.definition || {}; if (!Array.isArray(def.fields)) continue;
      byId.set(r.template_id, { ...def, id: r.template_id, kind: r.kind || def.kind, name: r.name || def.name, fields: def.fields.map(({ vertical, ...f }) => f) });
      if (Array.isArray(services)) { mapped = true; for (const k of services) needs[k] = r.template_id; }
    }
    st().formTemplates = Array.from(byId.values());
    if (mapped) st().consentFor = needs;   // sent by a device that knows the mapping (older versions didn't send one)
    L.formsHash = hashOf(this.formTemplatesPayload());
  },
  catalogPayload(state = S.state, ids = this.L().ids) {
    return {
      categories: (state.categories || []).map((c) => ({ key: c.id, label: c.label })),
      services: state.services.filter((v) => !v.internal).map((v, i) => ({ id: ids.services[v.id], key: v.id, category: v.cat, name: v.name, description: v.desc || null, duration_min: v.dur, buffer_min: 0, price_cents: Math.round(v.price * 100), online: !v.hidden, sort: i })),
      staff: state.staff.map((s, i) => ({ id: ids.staff[s.id], key: s.id, name: s.name, title: s.role || null, color: s.color || null, bio: s.bio || null, bookable: !!s.bookable, online: !!s.bookable, sort: i,
        hours: Object.entries(s.days || {}).map(([d, r]) => ({ dow: +d, start_min: r[0], end_min: r[1] })),
        services: s.bookable ? state.services.filter((v) => !v.internal && (!s.skills || s.skills.includes(v.id))).map((v) => ids.services[v.id]) : [] })),
    };
  },
  bookingSettings(state = S.state) {
    const b = state.settings.booking;
    return { lead_min: b.leadMinutes, max_days: b.windowDays, cancel_hours: b.cancelHours, step_min: 15,
      policy: `Please give us ${b.cancelHours} hours' notice to cancel or reschedule.`, categories: (state.categories || []).map((c) => ({ key: c.id, label: c.label })) };
  },
  bizRow(state = S.state) { const b = state.business; return { name: b.name, phone: b.phone || null, address: b.address || null, booking: this.bookingSettings(state) }; },

  /* ---------------------------------------------------------------- going live */
  async goLive({ name, slug, phone, address, timezone }) {
    const sb = this.sb(); const from = S.state;
    const ids = { staff: {}, services: {} };
    for (const s of from.staff) ids.staff[s.id] = newUuid();
    for (const v of from.services) ids.services[v.id] = newUuid();
    const { data: bizId, error } = await sb.rpc('create_business', { p_name: name, p_slug: slug, p_template: from.templateId, p_timezone: timezone, p_phone: phone || null, p_email: null, p_address: address || null });
    if (error) throw new Error(error.message);
    const draft = { ...from, business: { ...from.business, name, phone: phone || '', address: address || '' } };
    const up = await sb.from('businesses').update({ ...this.bizRow(draft), is_live: true }).eq('id', bizId); if (up.error) throw new Error(up.error.message);
    const cat = await sb.rpc('sync_catalog', { p_business: bizId, p_catalog: this.catalogPayload(draft, ids) }); if (cat.error) throw new Error(cat.error.message);
    const ws = createLiveWorkspace({ businessId: bizId, slug, timezone, ids, from: draft });
    return ws;
  },
  async myBusinesses() {
    const sb = this.sb(); const { data, error } = await sb.from('businesses').select('id, slug, name, template_id, timezone, is_live').order('created_at');
    if (error) throw new Error(error.message); return data || [];
  },

  /* ---------------------------------------------------------------- the sync loop */
  async start() {
    if (!isLive() || !this.available()) return;
    this.stop(); this.started = true; APP_TZ = this.tz();
    await this.refreshUser();
    if (!this.user) { this.setStatus('signedout'); return; }
    await this.sync({ full: true });
    this.subscribe();
    const every = CLOUD_CFG.pollMs || 20000;
    this.timer = setInterval(() => { if (document.visibilityState !== 'hidden') this.sync(); }, every);
  },
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; if (this.channel) { try { this.sb().removeChannel(this.channel); } catch (e) {} } this.channel = null; this.started = false; },
  setStatus(s, err = '') { this.status = s; this.lastError = err; const el = $('#cloud-status'); if (el) el.outerHTML = cloudStatusHtml(); if (s === 'error') Diag.report('sync', err); },
  soon() { clearTimeout(this._soon); this._soon = setTimeout(() => this.sync(), 350); },   // after local edits
  idle() { return this.inflight || Promise.resolve(); },
  sync(opts = {}) {
    if (this.busy) { this.again = true; this.againFull = this.againFull || !!opts.full; return this.inflight.then(() => this.followup); }   // a full sync asked for mid-sync still happens
    this.inflight = this._sync(opts).finally(() => { this.inflight = null; }); return this.inflight;
  },
  async _sync({ full = false } = {}) {
    if (!isLive() || !this.user) return;
    this.busy = true; const L = this.L(); const ws = S.wsId;
    try {
      this.setStatus('syncing');
      await this.pull(full);
      if (S.wsId !== ws) return;
      this.rowErrors = [];
      await this.push();
      if (this.rowErrors.length) throw new Error(`Some records didn't save: ${this.rowErrors.slice(0, 2).join('; ')}`);
      L.lastSync = new Date().toISOString(); this.lastSyncAt = Date.now(); this.setStatus('ok');
    } catch (e) {
      const offline = !navigator.onLine || /fetch|network|Failed to/i.test(e.message || '');
      this.setStatus(offline ? 'offline' : e.auth ? 'signedout' : 'error', e.message || String(e));
    } finally {
      this.busy = false; saveState();
      if (this.again) { const full = this.againFull; this.again = false; this.againFull = false; this.followup = new Promise((r) => setTimeout(() => this.sync({ full }).then(r, r), 50)); }
    }
  },
  async fetchAll(build) {
    const out = []; const page = 1000;
    for (let from = 0; ; from += page) { const { data, error } = await build().range(from, from + page - 1); if (error) throw this.err(error); out.push(...(data || [])); if (!data || data.length < page) break; }
    return out;
  },
  err(error) { const e = new Error(error.message || 'Cloud error'); e.code = error.code; if (error.code === '42501' || error.code === 'PGRST301' || /JWT/i.test(error.message || '')) e.auth = true; return e; },
  async pull(full) {
    const sb = this.sb(); const L = this.L(); const biz = L.businessId;
    for (const k of ['client', 'appt', 'ticket', 'gift', 'giftUse', 'refund', 'note', 'form', 'health', 'answers', 'healthAt']) L.synced[k] ||= {};
    if (full) { await this.pullCatalog(); await this.pullForms(); }
    const since = full ? null : L.lastPull;
    const overlap = (t) => new Date(Date.parse(t) - 120000).toISOString();   // rows can commit slightly out of timestamp order; re-reading two minutes is cheap and merges are idempotent
    const tz = this.tz(); const from = zonedToUtc(addDays(todayStr(), -180), 0, tz).toISOString();
    let maxAt = since; let changed = 0; const fresh = []; const signed = [];
    for (const k of this.kinds()) {
      const rows = await this.fetchAll(() => {
        let q = sb.from(k.table).select('*').eq('business_id', biz);
        if (since) q = q.gte('updated_at', overlap(since)); else if (k.table === 'appointments') q = q.gte('starts_at', from);
        return q.order('updated_at').order('id');
      });
      for (const r of rows) {
        if (k.kind === 'appt' && !apptById(r.id) && r.source === 'online' && L.lastPull) fresh.push(r.id);
        if (k.kind === 'form' && r.status === 'completed' && L.lastPull) { const loc = st().forms.find((x) => x.id === r.id); if (!loc || loc.status !== 'completed') signed.push(r.id); }
        this.merge(k, r); changed++;
        if (!maxAt || r.updated_at > maxAt) maxAt = r.updated_at;
      }
    }
    {   // health files: everything on a full sync, what changed since last time otherwise (intake filled in on a client's phone)
      const { data, error } = await sb.rpc('health_index', { p_business: biz, p_since: full || !since ? null : overlap(since) });
      if (!error) for (const h of data || []) { const c = clientById(h.client_id); if (c && c.healthInCloud !== h.updated_at) { c.healthInCloud = h.updated_at; changed++; } }
    }
    for (const id of signed.slice(0, 3)) { const f = st().forms.find((x) => x.id === id); const c = f && clientById(f.clientId); if (!c) continue; const t = tplById(f.templateId); toast(`${esc(fullName(c))} filled in ${t && t.kind === 'intake' ? 'their intake form' : esc(t ? t.name : 'a form')}${clientFlags(c).length ? ` · ${esc(clientFlags(c).map((x) => x.label).join(', '))}` : ''}`, clientFlags(c).some((x) => x.level === 'bad') ? 'bad' : 'good', { act: 'open-client', attrs: `data-id="${c.id}"`, label: 'View' }); }
    L.lastPull = maxAt || new Date().toISOString();
    if (changed) { invalidateIndex(); this.repaint(); }
    for (const id of fresh.slice(0, 3)) { const a = apptById(id); if (!a || a.status === 'cancelled') continue; const c = clientById(a.clientId); toast(`New online booking: ${esc(fullName(c))}, ${fmtDate(a.date, 'dow')} ${fmtTime(a.start)} with ${esc((staffById(a.staffId) || { name: '' }).name.split(' ')[0])}`, 'good', { act: 'open-appt', attrs: `data-id="${a.id}"`, label: 'View' }); }
  },
  merge(k, r) {
    const L = this.L(); const map = L.synced[k.kind]; const list = (k.all || k.list)();
    const local = list.find((x) => x.id === r.id);
    if (k.kind === 'note' && r.deleted_at) { if (local) { const arr = st().notes; arr.splice(arr.indexOf(local), 1); } delete map[r.id]; return; }
    if (k.kind === 'client' && r.deleted_at) { forgetClient(r.id); delete map[r.id]; (L.gone ||= {})[r.id] = 1; return; }
    if (k.kind === 'appt' && r.client_id && L.gone && L.gone[r.client_id]) return;   // a deleted client's visits stay in the record, off the calendar
    if (local && map[r.id] && hashOf(k.row(local)) !== map[r.id]) return;   // an unsent local edit wins until it's pushed
    if (k.kind === 'appt' && (!r.services || !r.services.length)) ensureBlockService();
    const next = k.from(r, local);
    if (local) Object.assign(local, next);
    else ({ client: st().clients, appt: st().appointments, ticket: st().tickets, gift: st().giftCards, giftUse: st().giftUses, refund: st().refunds, note: st().notes, form: st().forms })[k.kind].push(next);
    map[r.id] = hashOf(k.row(local || next));
  },
  async pullCatalog() {
    const sb = this.sb(); const L = this.L(); const biz = L.businessId;
    const [staff, hours, services, links, bizRows] = await Promise.all([
      this.fetchAll(() => sb.from('staff').select('*').eq('business_id', biz).order('sort')),
      this.fetchAll(() => sb.from('staff_hours').select('*').eq('business_id', biz)),
      this.fetchAll(() => sb.from('services').select('*').eq('business_id', biz).order('sort')),
      this.fetchAll(() => sb.from('staff_services').select('*').eq('business_id', biz)),
      this.fetchAll(() => sb.from('businesses').select('*').eq('id', biz)),
    ]);
    const st0 = S.state;
    if (L.catalogHash && hashOf([this.catalogPayload(), this.bizRow()]) !== L.catalogHash) return;   // local menu/team edits not sent yet: push wins
    if (bizRows[0]) {
      const b = bizRows[0]; Object.assign(st0.business, { name: b.name, phone: b.phone || '', address: b.address || '' }); L.slug = b.slug; L.timezone = b.timezone; APP_TZ = b.timezone;
      // the menu's sections travel with the booking settings; another device (or a menu set up for the studio) may have changed them
      const cats = b.booking && Array.isArray(b.booking.categories) ? b.booking.categories.filter((c) => c && c.key) : [];
      if (cats.length) { st0.categories = cats.map((c) => ({ id: c.key, label: c.label || c.key })); syncCategories(st0.categories); }
    }
    for (const v of services) {
      const key = v.key || v.id; L.ids.services[key] = v.id;
      let loc = svcById(key);
      if (!loc) { loc = { id: key, name: v.name, cat: v.category, dur: v.duration_min, price: v.price_cents / 100, desc: v.description || '' }; st0.services.push(loc); }
      Object.assign(loc, { name: v.name, cat: v.category, dur: v.duration_min, price: v.price_cents / 100, desc: v.description || '', hidden: !v.online || !v.active, retired: !v.active });
    }
    for (const s of staff) {
      const key = s.key || s.id; L.ids.staff[key] = s.id;
      let loc = staffById(key);
      if (!loc) { loc = { id: key, name: s.name, role: s.title || '', color: s.color || '#566068', bookable: s.bookable, days: {}, bio: s.bio || '' }; st0.staff.push(loc); }
      const days = {}; for (const h of hours.filter((x) => x.staff_id === s.id)) { const cur = days[h.dow]; days[h.dow] = cur ? [Math.min(cur[0], h.start_min), Math.max(cur[1], h.end_min)] : [h.start_min, h.end_min]; }
      const skills = links.filter((x) => x.staff_id === s.id).map((x) => this.keyOf('services', x.service_id));
      Object.assign(loc, { name: s.name, role: s.title || '', color: s.color || loc.color, bookable: s.bookable && s.active, days, bio: s.bio || '', retired: !s.active, skills: s.bookable ? skills : undefined });
    }
    L.catalogHash = hashOf([this.catalogPayload(), this.bizRow()]);
    renderRail();
  },
  mergeAppt(r) { this.merge(this.kinds()[1], r); },
  async push() {
    const sb = this.sb(); const L = this.L();
    // business, menu, team, hours (owners and managers; the database refuses anyone else)
    const ch = hashOf([this.catalogPayload(), this.bizRow()]);
    if (ch !== L.catalogHash) {
      const missing = (kind, list) => list.filter((x) => !L.ids[kind][x.id]).forEach((x) => { L.ids[kind][x.id] = newUuid(); });
      missing('staff', st().staff); missing('services', st().services.filter((v) => !v.internal));
      const r2 = await sb.rpc('sync_catalog', { p_business: L.businessId, p_catalog: this.catalogPayload() });
      if (r2.error && r2.error.code === '42501') { L.catalogHash = null; await this.pullCatalog(); toast('Only owners and managers can change services, team or hours. Changes undone.', 'bad'); this.repaint(); }
      else {
        if (r2.error) throw this.err(r2.error);
        const r1 = await sb.from('businesses').update(this.bizRow()).eq('id', L.businessId); if (r1.error) throw this.err(r1.error);
        L.catalogHash = hashOf([this.catalogPayload(), this.bizRow()]);
      }
    }
    for (const k of ['client', 'appt', 'ticket', 'gift', 'giftUse', 'refund', 'note', 'form', 'health', 'answers', 'healthAt']) L.synced[k] ||= {};
    const ft = this.formTemplatesPayload(); const fth = hashOf(ft);
    if (fth !== L.formsHash) {
      const r = await sb.from('form_templates').upsert(ft, { onConflict: 'business_id,template_id' });
      if (r.error && !(r.error.code === '42501' || /row-level security/i.test(r.error.message))) throw this.err(r.error);
      L.formsHash = fth;   // refused means this person isn't an owner or manager: one of them will send it
    }
    for (const k of this.kinds()) {
      const map = L.synced[k.kind];
      const dirty = k.list().filter((x) => !x.seeded).map((x) => [x, k.row(x)]).filter(([x, r]) => map[x.id] !== hashOf(r));
      for (let i = 0; i < dirty.length; i += 50) await this.pushRows(k.table, dirty.slice(i, i + 50), map);
    }
    // deleted notes and clients are hidden in the cloud, never erased
    for (const tomb of [...(L.tomb || [])]) {
      const done = () => { L.tomb = (L.tomb || []).filter((x) => x !== tomb); };
      if (tomb.table === 'clients') {
        if (!L.synced.client[tomb.id]) { done(); continue; }   // never reached the cloud: nothing to hide
        const r = await sb.rpc('delete_client', { p_client: tomb.id });
        if (r.error && (r.error.code === '42501' || /not allowed/i.test(r.error.message))) { done(); delete L.synced.client[tomb.id]; toast('Only owners and managers can delete clients. The file is back.', 'bad'); this.again = true; this.againFull = true; continue; }
        if (r.error) throw this.err(r.error);
        done(); delete L.synced.client[tomb.id]; (L.gone ||= {})[tomb.id] = 1; continue;
      }
      const r = await sb.from(tomb.table).update({ deleted_at: new Date().toISOString() }).eq('id', tomb.id);
      if (r.error) throw this.err(r.error);
      done(); delete L.synced.note[tomb.id];
    }
    // signed forms: answers and signature go through the audited function, never a table
    for (const f of st().forms) {
      if (f.status !== 'completed' || !f.answers || !L.synced.form[f.id]) continue;
      const { __sig, ...answers } = f.answers; const raw = f.signature || __sig; const sig = typeof raw === 'string' && raw.startsWith('data:image/') ? raw : null;
      const h = hashOf([answers, sig]); if (L.synced.answers[f.id] === h) continue;
      const r = await sb.rpc('save_form_answers', { p_form: f.id, p_answers: answers, p_signature: sig, p_meta: { device: navigator.userAgent.slice(0, 160), template: f.templateId } });
      if (r.error) throw this.err(r.error);
      L.synced.answers[f.id] = h;
    }
    // health files: anyone on the team can save one (intake at the front desk); reading is on demand and logged
    for (const c of st().clients) {
      if (!c.medical || !L.synced.client[c.id]) continue;
      const h = hashOf(c.medical); if (L.synced.health[c.id] === h) continue;
      const r = await sb.rpc('save_client_health', { p_client: c.id, p_medical: c.medical });
      if (r.error) throw this.err(r.error);
      L.synced.health[c.id] = h; c.healthInCloud = new Date().toISOString(); L.synced.healthAt[c.id] = c.healthInCloud;
    }
  },
  // Opening a health file: fetched from the cloud when this iPad doesn't have the latest (the database logs the view),
  // otherwise read locally and the view is still logged. Returns true when the caller should wait for a repaint.
  openHealth(c) {
    if (!isLive() || !this.user || !this.L().synced.client[c.id]) return false;
    const L = this.L(); const stale = c.healthInCloud && L.synced.healthAt[c.id] !== c.healthInCloud && hashOf(c.medical || null) === (L.synced.health[c.id] || hashOf(null));
    const key = `${c.id}`; const now = Date.now(); this._viewed ||= {};
    if (!stale && (!c.medical || (this._viewed[key] && now - this._viewed[key] < 10 * 60000))) return false;
    this._viewed[key] = now;
    if (!stale) { this.sb().rpc('log_health_view', { p_client: c.id }).then(() => {}, () => {}); return false; }
    if (this._loading === c.id) return true; this._loading = c.id;
    this.sb().rpc('read_client_health', { p_client: c.id }).then(({ data, error }) => {
      this._loading = null;
      if (error) { toast(/not allowed/i.test(error.message) ? 'Only owners, managers and providers can open health files.' : `Couldn't open the health file: ${esc(error.message)}`, 'bad'); c.healthInCloud = L.synced.healthAt[c.id] = c.healthInCloud; saveState(); this.repaint(); return; }
      if (data && Object.keys(data).length) c.medical = data;
      L.synced.health[c.id] = hashOf(c.medical || null); L.synced.healthAt[c.id] = c.healthInCloud; saveState(); this.repaint();
    }, () => { this._loading = null; });
    return true;
  },
  // A signed form from another device: answers come down when someone opens it (logged).
  openFormAnswers(f) {
    if (!isLive() || !this.user || f.status !== 'completed' || f.answers || this._loadingForm === f.id || (f.answersMissing && Date.now() - f.answersMissing < 60000)) return false;
    this._loadingForm = f.id;
    this.sb().rpc('read_form_answers', { p_form: f.id }).then(({ data, error }) => {
      this._loadingForm = null;
      if (error) { toast(/not allowed/i.test(error.message) ? 'Only owners, managers and providers can open signed forms.' : `Couldn't open the form: ${esc(error.message)}`, 'bad'); return; }
      if (data) { f.answers = { ...(data.answers || {}) }; f.signature = data.signature || f.signature || null; this.L().synced.answers[f.id] = hashOf([data.answers || {}, data.signature || null]); saveState(); }
      else f.answersMissing = Date.now();   // not in the cloud yet (the signing device hasn't synced): show what we have, ask again later
      if (S.ui.modal && S.ui.modal.kind === 'form-view') renderModal();
    }, () => { this._loadingForm = null; });
    return true;
  },
  async pushRows(table, pairs, map) {
    const { error } = await this.sb().from(table).upsert(pairs.map((p) => p[1]), { onConflict: 'id' });
    if (!error) { for (const [x, r] of pairs) map[x.id] = hashOf(r); return; }
    if (pairs.length > 1) { for (const p of pairs) await this.pushRows(table, [p], map); return; }   // find the one bad row
    const [x] = pairs[0];
    if (error.code === '23P01' && table === 'appointments') return this.refused(x, map);
    if (error.code === '23514' && table === 'gift_card_uses') return this.giftRefused(x, map, error);
    const e = this.err(error); if (e.auth || !error.code) throw e;   // signed out or offline: stop and retry later
    // one bad record must not hold up everything else: keep going, report it, retry it next sync
    (this.rowErrors ||= []).push(`${table}: ${error.message}`);
  },
  async refused(a, map) {
    // The database refused this appointment because the provider is already booked (usually by an online client
    // a moment ago). Put the calendar back to the truth and say so.
    const c = clientById(a.clientId); const who = `${fullName(c)} at ${fmtTime(a.start)} ${fmtDate(a.date, 'dow')}`;
    const { data } = await this.sb().from('appointments').select('*').eq('id', a.id);
    if (data && data[0]) { delete map[a.id]; this.mergeAppt(data[0]); toast(`Change undone for ${esc(who)}: that time was just booked online.`, 'bad'); }
    else { const i = st().appointments.indexOf(a); if (i >= 0) st().appointments.splice(i, 1); delete map[a.id]; toast(`Couldn't book ${esc(who)}: that time was just booked online.`, 'bad'); }
    invalidateIndex(); await this.pull(false); this.repaint();
  },
  // The database refused a gift card use: the card didn't have that much left (another iPad spent it first, or this one
  // was offline). The use comes off this iPad's ledger, the sale is marked as still owing that amount, and the desk is told.
  giftRefused(u, map, error) {
    const arr = st().giftUses; const i = arr.indexOf(u); if (i >= 0) arr.splice(i, 1); delete map[u.id];
    const g = st().giftCards.find((x) => x.id === u.cardId); const t = st().tickets.find((x) => x.id === u.ticketId); const c = t && clientById(t.clientId);
    const code = g ? g.code : 'A gift card';
    if (u.kind === 'redeem') {
      if (t) {
        const p = (t.payments || []).find((x) => x.cardId === u.cardId && !x.declined && Math.abs(x.amount - u.amount) < 0.005); if (p) p.declined = true;
        t.giftShort = Math.round(((t.giftShort || 0) + u.amount) * 100) / 100; t.seeded = false;
      }
      toast(`${esc(code)} didn't have ${money(u.amount)} left: it was spent on another iPad first.${c ? ` Collect ${money(u.amount)} from ${esc(fullName(c))} another way.` : ''}`, 'bad', t ? { label: 'Ticket', act: 'open-ticket', attrs: `data-id="${t.id}"` } : undefined);
    } else toast(`Couldn't change ${esc(code)}: ${esc(error.message)}`, 'bad');
    Diag.report('sync', `gift card use refused: ${error.message}`);
    this.again = true;   // send the marked sale and pull the card's real balance
  },
  subscribe() {
    if (CLOUD_CFG.realtime === false) return;
    const sb = this.sb(); const biz = this.L().businessId;
    try {
      this.channel = sb.channel(`biz-${biz}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `business_id=eq.${biz}` }, () => this.sync())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `business_id=eq.${biz}` }, () => this.sync())
        .subscribe();
    } catch (e) { /* polling still runs */ }
  },
  repaint() {
    // don't yank the screen out from under someone typing
    const a = document.activeElement; if ((a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && $('#content').contains(a)) || $('.appt.dragging')) { S.ui.stale = true; return; }
    if (S.ui.modal) { S.ui.stale = true; renderRail(); return; }
    if (['calendar', 'clients', 'checkout', 'booking', 'settings'].includes(S.ui.view)) rerenderContent(); renderRail();
    if (S.ui.drawer && S.ui.drawer.kind === 'appt') renderDrawer();
  },
};

function cloudStatusHtml() {
  if (!isLive()) return '<span id="cloud-status"></span>';
  const s = Cloud.status; const waiting = st().appointments.filter((a) => !a.seeded && Cloud.L().synced.appt[a.id] !== hashOf(Cloud.apptRow(a))).length;
  const label = s === 'ok' ? `Live · synced${Cloud.lastSyncAt ? ' ' + fmtClockNow(Cloud.lastSyncAt) : ''}` : s === 'syncing' ? 'Live · syncing…' : s === 'offline' ? `Live · offline${waiting ? ` · ${waiting} waiting` : ''}` : s === 'signedout' ? 'Live · signed out' : s === 'error' ? 'Live · sync problem' : 'Live';
  const color = s === 'ok' || s === 'syncing' ? 'var(--good)' : s === 'offline' ? 'var(--warn)' : 'var(--bad)';
  return `<span id="cloud-status" class="perf" title="${esc(Cloud.lastError || '')}"><span class="perf-dot" style="background:${color}"></span>${label}</span>`;
}
function fmtClockNow(ms) { const m = Math.floor((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} hr ago`; }

/* A brand-new live workspace: this business's menu, team, hours and settings — and none of the sample clients. */
function createLiveWorkspace({ businessId, slug, timezone, ids, from }) {
  const idx = workspaces();
  const entry = { id: businessId, name: from.business.name, templateId: from.templateId, live: { businessId, slug, timezone }, opts: {}, createdAt: todayStr() };
  const i = idx.findIndex((w) => w.id === businessId); if (i >= 0) idx[i] = entry; else idx.push(entry); saveIndex(idx);
  const state = emptyLiveState(entry, from, ids);
  try { localStorage.setItem(WS_CUR_KEY, businessId); } catch (e) {}
  S.wsId = businessId; LS_KEY = wsKey(businessId); S.state = state; S.photoUrls = new Map(); APP_TZ = timezone;
  syncCategories(state.categories); invalidateIndex(); saveState();
  return entry;
}
function emptyLiveState(entry, from, ids) {
  const base = from || catalogFor(entry.templateId, { name: entry.name });
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const keep = ['templateId', 'studio', 'copy', 'business', 'categories', 'staff', 'services', 'products', 'plans', 'formTemplates', 'consentFor', 'settings'];
  const st0 = { version: SEED_VERSION, seedDay: todayStr() };
  for (const k of keep) if (base[k] !== undefined) st0[k] = copy(base[k]);
  if (!from) { st0.staff = []; st0.services = []; }
  st0.business = { ...st0.business, name: entry.name };
  Object.assign(st0, { clients: [], appointments: [], notes: [], photos: [], forms: [], messages: [], waitlist: [], refunds: [], tickets: [], giftCards: [], giftUses: [] });
  st0.staff.forEach((s) => { delete s.bias; });
  st0.live = { businessId: entry.live.businessId, slug: entry.live.slug, timezone: entry.live.timezone, ids: ids ? copy(ids) : { staff: {}, services: {} }, synced: { appt: {}, client: {} }, lastPull: null, lastSync: null, catalogHash: null };
  return st0;
}
