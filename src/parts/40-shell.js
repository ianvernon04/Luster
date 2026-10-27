/* ===== Shell: navigation, rendering, drawer, modal, toasts, command palette ===== */
const Views = {}; const Drawers = {}; const Modals = {}; const Actions = {};
const NAV = [
  { id: 'calendar', label: 'Calendar', icon: 'calendar', key: 'C' },
  { id: 'clients', label: 'Clients', icon: 'clients', key: 'L' },
  { id: 'checkout', label: 'Checkout', icon: 'checkout', key: 'K' },
  { id: 'booking', label: 'Online booking', icon: 'booking' },
  { id: 'forms', label: 'Forms', icon: 'forms' },
  { id: 'messages', label: 'Messages', icon: 'messages' },
  { id: 'memberships', label: 'Memberships', icon: 'members' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const MOBILE_TABS = ['calendar', 'clients', 'checkout', 'messages'];

const App = {
  lastRenderMs: 0,
  go(view, patch = {}) {
    Object.assign(S.ui, patch); S.ui.view = view;
    try { if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view); } catch (e) {}
    this.render();
    const c = $('#content'); if (c) c.scrollTop = 0;
  },
  render() {
    const t = performance.now();
    renderRail(); renderTabbar(); renderMain(); renderDrawer();
    this.lastRenderMs = performance.now() - t;
    const perf = $('#perf-ms'); if (perf) perf.textContent = `${Math.max(1, Math.round(this.lastRenderMs))} ms`;
  },
  refresh() { this.render(); },
};

function navCounts() {
  const today = todayStr();
  return { calendar: apptsOn(today).filter((a) => !['completed', 'cancelled', 'noshow'].includes(a.status)).length, forms: st().forms.filter((f) => f.status === 'sent').length, messages: st().messages.filter((m) => m.reply && !m.read).length, checkout: apptsOn(today).filter((a) => ['checkedin', 'inservice'].includes(a.status)).length };
}
function renderRail() {
  const counts = navCounts(); const b = st().business;
  $('#rail').innerHTML = `
    <button class="brand" data-act="workspaces" title="Switch business"><div class="brand-mark">${esc(b.name[0] || 'L')}</div><div class="grow" style="min-width:0"><div class="brand-name ellipsis">${esc(b.name)}</div><div class="brand-sub">${esc(tpl().label)}</div></div><span class="sw">${I.more}</span></button>
    <button class="search" data-act="palette" style="margin:0 2px 12px"><span style="display:contents">${I.search}</span><span class="muted" style="flex:1;text-align:left;font-size:13px">Search…</span><kbd>⌘K</kbd></button>
    <div class="nav">${NAV.map((n) => `<button class="nav-item ${S.ui.view === n.id ? 'on' : ''}" data-act="go" data-view="${n.id}">${I[n.icon]}<span>${n.label}</span>${counts[n.id] ? `<span class="count">${counts[n.id]}</span>` : ''}</button>`).join('')}</div>
    <div class="rail-foot">
      <span class="perf"><span class="perf-dot"></span>Rendered in <b id="perf-ms" class="num">${Math.max(1, Math.round(App.lastRenderMs))} ms</b></span>
      ${isLive() ? `${cloudStatusHtml()}<span>${esc(st().business.name)} · ${st().clients.length} clients · ${st().appointments.length} appointments</span>` : `<span>All data on this device. No spinners.</span>
      <span>Luster demo · ${st().clients.length} clients · ${st().appointments.length} appointments</span>${/^https?:$/.test(location.protocol) && window.top === window.self ? '<a href="welcome/">What is Luster? →</a>' : ''}`}
    </div>`;
}
function renderTabbar() {
  const counts = navCounts();
  const more = !MOBILE_TABS.includes(S.ui.view);
  $('#tabbar').innerHTML = MOBILE_TABS.map((id) => { const n = NAV.find((x) => x.id === id); return `<button class="${S.ui.view === id ? 'on' : ''}" data-act="go" data-view="${id}">${I[n.icon]}<span>${n.label.replace('Online ', '')}</span>${counts[id] ? `<span class="sr-only">${counts[id]} open</span>` : ''}</button>`; }).join('') + `<button class="${more ? 'on' : ''}" data-act="more">${I.more}<span>More</span></button>`;
}
function renderMain() {
  const v = Views[S.ui.view] || Views.calendar;
  const top = $('#topbar'); const content = $('#content');
  top.innerHTML = `<div class="col" style="gap:1px"><h1>${v.title()}</h1>${v.sub ? `<div class="sub">${v.sub()}</div>` : ''}</div><div class="topbar-right">${v.actions ? v.actions() : ''}</div>`;
  content.className = 'content' + (v.flush ? ' flush' : '');
  content.innerHTML = v.render();
  if (v.mount) v.mount(content);
}
function rerenderContent() { const v = Views[S.ui.view]; const c = $('#content'); const scroll = c.scrollTop; c.innerHTML = v.render(); if (v.mount) v.mount(c); c.scrollTop = scroll; const top = $('#topbar'); top.innerHTML = `<div class="col" style="gap:1px"><h1>${v.title()}</h1>${v.sub ? `<div class="sub">${v.sub()}</div>` : ''}</div><div class="topbar-right">${v.actions ? v.actions() : ''}</div>`; renderRail(); renderTabbar(); }

/* ---- drawer ---- */
function openDrawer(kind, props = {}) { S.ui.drawer = { kind, ...props }; renderDrawer(); }
function closeDrawer() { S.ui.drawer = null; renderDrawer(); }
function renderDrawer() {
  const d = $('#drawer'); const spec = S.ui.drawer && Drawers[S.ui.drawer.kind] ? Drawers[S.ui.drawer.kind](S.ui.drawer) : null;
  if (!spec) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); if (!S.ui.drawer) setTimeout(() => { if (!S.ui.drawer) d.innerHTML = ''; }, 240); return; }
  d.innerHTML = `<div class="drawer-head">${spec.back ? `<button class="btn ghost icon" data-act="${spec.back.act}" ${spec.back.attrs || ''} aria-label="Back">${I.left}</button>` : ''}<h2 class="ellipsis">${spec.title}</h2>${spec.headActions || ''}<button class="btn ghost icon" data-act="close-drawer" aria-label="Close">${I.x}</button></div><div class="drawer-body" id="drawer-body">${spec.body}</div>${spec.foot ? `<div class="drawer-foot">${spec.foot}</div>` : ''}`;
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
  if (spec.mount) spec.mount(d);
}

/* ---- modal ---- */
function openModal(kind, props = {}) { S.ui.modal = { kind, ...props }; renderModal(); }
function closeModal() { S.ui.modal = null; renderModal(); }
function renderModal() {
  const root = $('#modal-root'); const spec = S.ui.modal && Modals[S.ui.modal.kind] ? Modals[S.ui.modal.kind](S.ui.modal) : null;
  if (!spec) { root.innerHTML = ''; return; }
  root.innerHTML = `<div class="scrim" data-act="scrim"><div class="modal ${spec.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-head"><h2>${spec.title}</h2><button class="btn ghost icon" data-act="close-modal" aria-label="Close">${I.x}</button></div><div class="modal-body">${spec.body}</div>${spec.foot ? `<div class="modal-foot">${spec.foot}</div>` : ''}</div></div>`;
  if (spec.mount) spec.mount(root);
}

/* ---- toasts ---- */
function toast(msg, kind = 'good', action) {
  const el = h(`<div class="toast ${kind}"><span>${msg}</span>${action ? `<button class="btn sm" data-act="${action.act}" ${action.attrs || ''}>${action.label}</button>` : ''}</div>`);
  $('#toasts').appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, action ? 6000 : 3200);
}

/* ---- confirm (in-page; the viewer never shows native dialogs) ---- */
Modals.confirm = (m) => ({ title: m.title, body: `<p>${m.text}</p>`, foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn ${m.danger ? 'danger' : 'primary'}" data-act="confirm-ok">${m.ok || 'Confirm'}</button>`, });
let _confirmFn = null;
function confirmModal(title, text, ok, fn, danger = false) { _confirmFn = fn; openModal('confirm', { title, text, ok, danger }); }
Actions['confirm-ok'] = () => { const f = _confirmFn; _confirmFn = null; closeModal(); if (f) f(); };

/* ---- command palette ---- */
function openPalette() { S.ui.palette = true; renderPalette(''); setTimeout(() => $('#palette-q')?.focus(), 10); }
function closePalette() { S.ui.palette = false; $('#palette-root').innerHTML = ''; }
function paletteResults(q) {
  const s = q.trim().toLowerCase(); const out = [];
  const actions = [
    { label: 'New appointment', hint: 'N', act: 'new-appt', icon: 'plus' }, { label: 'New client', act: 'new-client', icon: 'user' }, { label: 'Import clients from a CSV', act: 'import-open', icon: 'dl' }, { label: 'Open checkout', act: 'go', attrs: 'data-view="checkout"', icon: 'checkout' },
    { label: 'Go to today', act: 'cal-today', icon: 'calendar' }, { label: 'Preview online booking', act: 'go', attrs: 'data-view="booking"', icon: 'booking' }, { label: 'Reports', act: 'go', attrs: 'data-view="reports"', icon: 'reports' }, { label: 'Settings', act: 'go', attrs: 'data-view="settings"', icon: 'settings' }, { label: 'Switch business', act: 'workspaces', icon: 'more' }, { label: 'Set up a new business', act: 'new-business', icon: 'plus' }, { label: 'Reset demo data', act: 'reset-demo-ask', icon: 'repeat' },
  ];
  const clients = s ? searchClients(s, 7) : st().clients.filter((c) => apptsOn(todayStr()).some((a) => a.clientId === c.id)).slice(0, 5);
  if (clients.length) out.push({ group: s ? 'Clients' : 'On the books today', items: clients.map((c) => ({ label: fullName(c), hint: fmtPhone(c.phone), act: 'open-client', attrs: `data-id="${c.id}"`, avatar: c })) });
  const acts = actions.filter((a) => !s || a.label.toLowerCase().includes(s));
  if (acts.length) out.push({ group: 'Actions', items: acts });
  const views = NAV.filter((n) => s && n.label.toLowerCase().includes(s)).map((n) => ({ label: `Go to ${n.label}`, act: 'go', attrs: `data-view="${n.id}"`, icon: n.icon }));
  if (views.length) out.push({ group: 'Pages', items: views });
  return out;
}
function renderPalette(q) {
  const groups = paletteResults(q); let idx = 0;
  $('#palette-root').innerHTML = `<div class="palette" data-act="palette-scrim"><div class="palette-box" role="dialog"><div class="palette-input">${I.search}<input id="palette-q" placeholder="Search clients, or type a command…" value="${esc(q)}" autocomplete="off"><kbd class="tiny faint">esc</kbd></div><div class="palette-list" id="palette-list">${groups.map((g) => `<div class="palette-group">${g.group}</div>${g.items.map((it) => `<div class="palette-item ${idx++ === 0 ? 'on' : ''}" data-act="${it.act}" ${it.attrs || ''} data-palette-item>${it.avatar ? `<div class="avatar sm" style="${avatarStyle(fullName(it.avatar))}">${initials(fullName(it.avatar))}</div>` : (it.icon ? I[it.icon] : '')}<span>${esc(it.label)}</span>${it.hint ? `<span class="k">${esc(it.hint)}</span>` : ''}</div>`).join('')}`).join('') || '<div class="palette-group">No matches</div>'}</div></div></div>`;
  const input = $('#palette-q');
  input.addEventListener('input', () => { const v = input.value; const list = $('#palette-list'); const gs = paletteResults(v); let i = 0; list.innerHTML = gs.map((g) => `<div class="palette-group">${g.group}</div>${g.items.map((it) => `<div class="palette-item ${i++ === 0 ? 'on' : ''}" data-act="${it.act}" ${it.attrs || ''} data-palette-item>${it.avatar ? `<div class="avatar sm" style="${avatarStyle(fullName(it.avatar))}">${initials(fullName(it.avatar))}</div>` : (it.icon ? I[it.icon] : '')}<span>${esc(it.label)}</span>${it.hint ? `<span class="k">${esc(it.hint)}</span>` : ''}</div>`).join('')}`).join('') || '<div class="palette-group">No matches</div>'; });
  input.addEventListener('keydown', (e) => {
    const items = $$('[data-palette-item]'); const cur = items.findIndex((x) => x.classList.contains('on'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = clamp(cur + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1); items.forEach((x) => x.classList.remove('on')); items[n]?.classList.add('on'); items[n]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); const it = items[cur] || items[0]; if (it) { closePalette(); runAction(it); } }
  });
}

/* ---- workspaces: one app, many businesses ---- */
Modals.workspaces = () => ({ title: 'Businesses', body: `<div class="small muted">Every business gets its own workspace: its own clients, calendar, services, forms and settings. Switch any time.</div><div class="list">${workspaces().map((w) => { const T = TEMPLATES[w.templateId] || TEMPLATES.facial; const cur = w.id === S.wsId; return `<div class="ws-row"><div class="ws-mark" style="background:hsl(${hashHue(w.name)} 32% 44%)">${esc(w.name[0])}</div><div class="grow"><div class="strong">${esc(w.name)}${w.live ? ' <span class="badge good">Live</span>' : ''}${cur ? ' <span class="badge accent">Open</span>' : ''}</div><div class="small muted">${w.live ? esc(shortLink(w.live.slug)) : `${esc(T.label)} demo · set up ${relDate(w.createdAt).toLowerCase()}`}</div></div>${cur ? '' : `<button class="btn sm primary" data-act="ws-switch" data-id="${w.id}">Open</button><button class="btn sm ghost icon" data-act="ws-delete-ask" data-id="${w.id}" aria-label="Delete">${I.trash}</button>`}</div>`; }).join('')}</div>`, foot: `<button class="btn" data-act="close-modal">Close</button>${Cloud.available() ? '<button class="btn" data-act="cloud-from-cloud">Open from the cloud</button>' : ''}<button class="btn primary" data-act="new-business">${I.plus}Set up a new business</button>` });
Modals.wizard = () => {
  const w = S.ui.wiz; const T = w.templateId ? TEMPLATES[w.templateId] : null;
  if (w.step === 0) return { title: 'What kind of business?', wide: true, body: `<div class="small muted">Pick the closest fit. Services, forms, consents and safety rules come pre-built; everything is editable afterward.</div><div class="tpl-grid">${Object.values(TEMPLATES).map((t) => `<button class="tpl-card ${w.templateId === t.id ? 'on' : ''}" data-act="wiz-type" data-id="${t.id}"><b>${esc(t.label)}</b><span>${esc(t.blurb)}</span><span class="tiny">${t.services.length} services · ${t.consents.length} consent${t.consents.length === 1 ? '' : 's'}</span></button>`).join('')}</div>`, foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="wiz-step" data-s="1" ${w.templateId ? '' : 'disabled'}>Next</button>` };
  if (w.step === 1) return { title: `Set up a ${T.label.toLowerCase()}`, body: `<form class="col" style="gap:12px" id="wiz-form" onsubmit="return false"><div class="field"><label for="wz-name">Business name</label><input class="input" id="wz-name" name="name" placeholder="${esc(T.defaults.exampleName)}" value="${esc(w.name || '')}" autocomplete="off"></div><div class="field-row"><div class="field"><label for="wz-owner">Owner's first name</label><input class="input" id="wz-owner" name="owner" placeholder="Who runs the place" value="${esc(w.owner || '')}"></div><div class="field"><label for="wz-team">Bookable team members</label><select class="select" id="wz-team" name="team">${[2, 3, 4, 5, 6].map((n) => `<option ${(w.team || 4) == n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div><div class="field-row"><div class="field"><label for="wz-phone">Phone</label><input class="input" id="wz-phone" name="phone" inputmode="tel" placeholder="${esc(T.defaults.phone)}" value="${esc(w.phone || '')}"></div><div class="field"><label for="wz-address">Address</label><input class="input" id="wz-address" name="address" placeholder="${esc(T.defaults.address)}" value="${esc(w.address || '')}"></div></div><div class="alert info">${I.info}<div>We'll fill it with 400 sample clients and four months of history so it looks like a running shop. Payments and texting stay simulated.</div></div></form>`, foot: `<button class="btn" data-act="wiz-step" data-s="0">${I.left}Back</button><div class="grow"></div><button class="btn primary" data-act="wiz-create">Create workspace</button>`, mount(root) { setTimeout(() => $('#wz-name', root)?.focus(), 30); } };
  return null;
};
Object.assign(Actions, {
  workspaces: () => { closePalette(); openModal('workspaces'); },
  'new-business': () => { closePalette(); S.ui.wiz = { step: 0, templateId: null }; openModal('wizard'); },
  'wiz-type': (el) => { S.ui.wiz.templateId = el.dataset.id; renderModal(); },
  'wiz-step': (el) => { const f = $('#wiz-form'); if (f) Object.assign(S.ui.wiz, formValues(f)); S.ui.wiz.step = +el.dataset.s; renderModal(); },
  'wiz-create': () => { const f = $('#wiz-form'); const v = f ? formValues(f) : {}; const w = S.ui.wiz; const ws = createWorkspace(w.templateId, { name: v.name, owner: v.owner, team: v.team, phone: v.phone, address: v.address }); closeModal(); S.ui = defaultUI(); App.go('calendar'); toast(`${ws.name} is ready — ${st().clients.length} sample clients, ${st().appointments.length} appointments`); },
  'ws-switch': async (el) => { closeModal(); await switchWorkspace(el.dataset.id); S.ui = defaultUI(); App.go('calendar'); toast(`Switched to ${st().business.name}`); },
  'ws-delete-ask': (el) => { const w = workspaces().find((x) => x.id === el.dataset.id); confirmModal(`Delete ${w.name}?`, 'Its clients, calendar and history are removed from this device.', 'Delete', () => { deleteWorkspace(el.dataset.id); openModal('workspaces'); toast('Business removed'); }, true); },
});

/* ---- more sheet (phone) ---- */
Modals.more = () => ({ title: 'More', body: `<div class="list">${NAV.filter((n) => !MOBILE_TABS.includes(n.id)).map((n) => `<button class="list-row click" data-act="go" data-view="${n.id}" style="border:0;background:transparent;text-align:left;width:100%">${I[n.icon]}<span class="strong">${n.label}</span></button>`).join('')}</div>` });

/* ---- action dispatch ---- */
function runAction(el, ev) { const act = el.dataset.act; const fn = Actions[act]; if (fn) fn(el, ev); }
Object.assign(Actions, {
  go: (el) => { closeModal(); closePalette(); App.go(el.dataset.view); },
  more: () => openModal('more'),
  palette: () => openPalette(),
  'palette-scrim': (el, ev) => { if (ev.target === el) closePalette(); },
  scrim: (el, ev) => { if (ev.target === el) closeModal(); },
  'close-drawer': () => closeDrawer(),
  'close-modal': () => closeModal(),
  'reset-demo-ask': () => confirmModal('Reset demo data?', `${st().business.name} goes back to its sample set. Anything you added is gone; other businesses aren't touched.`, 'Reset', () => { resetDemo(); S.ui = defaultUI(); App.go('calendar'); toast('Demo data reset'); }, true),
  'toggle-theme': () => { const r = document.documentElement; const cur = r.getAttribute('data-theme'); const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark'); if (next) r.setAttribute('data-theme', next); else r.removeAttribute('data-theme'); },
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.tagName === 'A') return;
  runAction(el, e);
});
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase(); const typing = ['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); S.ui.palette ? closePalette() : openPalette(); return; }
  if (e.key === 'Escape') { if (S.ui.palette) return closePalette(); if (S.ui.modal) return closeModal(); if (S.ui.drawer) return closeDrawer(); }
  if (typing || S.ui.palette || S.ui.modal) return;
  if (e.key === '/') { e.preventDefault(); openPalette(); }
  else if (e.key.toLowerCase() === 'n') Actions['new-appt']?.();
  else if (e.key.toLowerCase() === 't') Actions['cal-today']?.();
  else if (e.key === 'ArrowLeft' && S.ui.view === 'calendar') Actions['cal-prev']?.();
  else if (e.key === 'ArrowRight' && S.ui.view === 'calendar') Actions['cal-next']?.();
});
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (Views[v] && v !== S.ui.view) App.go(v); });

/* ---- shared small renderers ---- */
function avatar(c, size = '') { const n = fullName(c); return `<div class="avatar ${size}" style="${avatarStyle(n)}">${initials(n)}</div>`; }
function statusBadge(status) { return `<span class="badge ${STATUS_BADGE[status] || ''}">${STATUS_LABEL[status] || status}</span>`; }
function flagBadges(c, withNotes = false) {
  return clientFlags(c).map((f) => `<span class="badge ${f.level}" title="${esc(f.note)}">${I.warn}${f.k === 'allergy' ? esc('Allergy: ' + c.allergies.join(', ')) : esc(f.label)}</span>`).join('') + (c.vip ? '<span class="badge accent">VIP</span>' : '') + (c.membershipId ? `<span class="badge good">${esc(planById(c.membershipId)?.name || 'Member')}${c.memberStatus === 'past_due' ? ' · past due' : ''}</span>` : '') + (diffDays(c.createdAt, todayStr()) <= 45 ? '<span class="badge info">New</span>' : '');
}
function clientAlerts(c) {
  const fl = clientFlags(c).filter((f) => f.k !== 'allergy');
  const out = fl.map((f) => `<div class="alert ${f.level}">${I.warn}<div><b>${esc(f.label)}.</b> ${esc(f.note)}</div></div>`);
  if (c.allergies.length) out.push(`<div class="alert warn">${I.warn}<div><b>Allergy on file:</b> ${esc(c.allergies.join(', '))}</div></div>`);
  if (c.flags.includes('oncology') && c.medical?.cancer && c.medical.cancer.clearance !== 'Yes, letter on file') out.push(`<div class="alert bad">${I.forms}<div><b>No physician clearance letter on file.</b> Status: ${esc(c.medical.cancer.clearance || 'not asked')}. Required before the first treatment.</div></div>`);
  return out.join('');
}
