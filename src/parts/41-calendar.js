/* ===== Calendar ===== */
const SLOT_H = 20; // px per 15 minutes (matches --slot-h)
const isMobile = () => matchMedia('(max-width: 860px)').matches;

function gridRange(date, staffList) {
  const hrs = staffList.map((s) => s.days[dow(date)]).filter(Boolean);
  let lo = hrs.length ? Math.min(...hrs.map((h) => h[0])) : 540, hi = hrs.length ? Math.max(...hrs.map((h) => h[1])) : 1020;
  const appts = apptsOn(date); for (const a of appts) { lo = Math.min(lo, a.start); hi = Math.max(hi, a.start + a.dur); }
  lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
  return [lo, hi];
}
function calStaffColumns() {
  const all = bookableStaff(); const date = S.ui.date;
  if (S.ui.calStaff !== 'all') return all.filter((s) => s.id === S.ui.calStaff);
  if (isMobile()) { const w = all.find((s) => s.days[dow(date)]) || all[0]; return [w]; }
  const working = all.filter((s) => s.days[dow(date)] || apptsOn(date, s.id).length);
  return working.length ? working : all;
}
function daySummary(date) {
  const appts = apptsOn(date).filter((a) => a.status !== 'noshow');
  const booked = sum(appts, (a) => sum(a.items, (i) => i.price));
  const open = bookableStaff().filter((s) => s.days[dow(date)]).reduce((n, s) => n + freeSlots(s.id, date, 60, 30).length, 0);
  return `${appts.length} appointments · ${money(booked, { whole: true })} on the books · ${open} open hour slots`;
}
function apptBlock(a, gridStart, compact = false, lane = 0, lanes = 1) {
  const c = clientById(a.clientId); const cat = apptMainCat(a);
  const top = (a.start - gridStart) / 15 * SLOT_H; const height = Math.max(a.dur / 15 * SLOT_H - 2, 11);
  const short = a.dur <= 30; const micro = a.dur <= 15;
  const laneStyle = lanes > 1 ? `left:calc(${(lane / lanes) * 100}% + 3px);right:calc(${((lanes - lane - 1) / lanes) * 100}% + 3px);` : '';
  return `<div class="appt ${compact ? 'week-appt' : ''} status-${a.status} ${short ? 'short' : ''} ${micro ? 'micro' : ''}" data-act="open-appt" data-id="${a.id}" data-appt data-start="${a.start}" data-dur="${a.dur}" style="top:${top}px;height:${height}px;--cat:${CATEGORIES[cat].color};${laneStyle}" title="${esc(fullName(c))} · ${esc(apptTitle(a))}">
    <div class="t"><span class="ellipsis">${compact ? '' : fmtTime(a.start) + ' · '}${esc(fullName(c))}</span></div>
    <div class="s ellipsis">${esc(apptTitle(a))} · ${fmtDur(a.dur)}${a.source === 'online' ? ' · online' : ''}</div>
    <span class="st ${a.status}"></span></div>`;
}
function withLanes(appts) {
  // assign overlapping appointments to side-by-side lanes
  const sorted = appts.slice().sort(by((a) => a.start)); const out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => { if (!cluster.length) return; const lanes = []; for (const a of cluster) { let li = lanes.findIndex((end) => end <= a.start); if (li < 0) { li = lanes.length; lanes.push(0); } lanes[li] = a.start + a.dur; out.push({ a, lane: li, lanes: 0 }); } const n = lanes.length; out.slice(out.length - cluster.length).forEach((o) => (o.lanes = n)); cluster = []; };
  for (const a of sorted) { if (a.start >= clusterEnd) { flush(); clusterEnd = a.start + a.dur; } else clusterEnd = Math.max(clusterEnd, a.start + a.dur); cluster.push(a); }
  flush(); return out;
}
function timeAxis(lo, hi) { let s = ''; for (let t = lo; t < hi; t += 60) s += `<div class="cal-time">${fmtTime(t)}</div>`; return s; }

function dayGrid() {
  const date = S.ui.date; const cols = calStaffColumns(); const [lo, hi] = gridRange(date, cols); const H = (hi - lo) / 15 * SLOT_H;
  const closed = !bookableStaff().some((s) => s.days[dow(date)]);
  let html = `<div class="cal-grid" style="--cols:${cols.length}">`;
  html += `<div class="cal-head corner"></div>`;
  for (const s of cols) { const hrs = s.days[dow(date)]; const n = apptsOn(date, s.id).length; html += `<div class="cal-head"><div class="avatar sm" style="background:${s.color}">${initials(s.name)}</div><div class="grow"><div class="who ellipsis">${esc(s.name.split(' ')[0])}</div><div class="meta">${hrs ? `${fmtTime(hrs[0])}–${fmtTime(hrs[1])} · ${n} booked` : 'Off today'}</div></div></div>`; }
  html += `<div class="cal-times" style="height:${H}px">${timeAxis(lo, hi)}</div>`;
  for (const s of cols) {
    const hrs = s.days[dow(date)];
    html += `<div class="cal-col ${hrs ? '' : 'off'}" data-col data-staff="${s.id}" style="height:${H}px">`;
    if (hrs) { if (hrs[0] > lo) html += `<div class="off-band" style="top:0;height:${(hrs[0] - lo) / 15 * SLOT_H}px"></div>`; if (hrs[1] < hi) html += `<div class="off-band" style="top:${(hrs[1] - lo) / 15 * SLOT_H}px;bottom:0"></div>`; }
    for (let t = lo; t < hi; t += 15) html += `<div class="cal-slot" data-act="slot" data-staff="${s.id}" data-min="${t}" style="top:${(t - lo) / 15 * SLOT_H}px" title="Book ${fmtTime(t)}"></div>`;
    for (const { a, lane, lanes } of withLanes(apptsOn(date, s.id))) html += apptBlock(a, lo, false, lane, lanes);
    if (date === todayStr() && nowMin() >= lo && nowMin() <= hi) html += `<div class="now-line" data-now style="top:${(nowMin() - lo) / 15 * SLOT_H}px"></div>`;
    html += `</div>`;
  }
  html += `</div>`;
  if (closed) html = `<div class="alert info" style="margin:12px 18px 0">${I.info}<div><b>Studio closed ${fmtDate(date, 'dow')}.</b> Nobody is scheduled. You can still drop a booking on the grid if someone comes in.</div></div>` + html;
  return `<div class="cal-scroll" id="cal-scroll">${html}</div>`;
}
function weekGrid() {
  const start = startOfWeek(S.ui.date); const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const staff = staffById(S.ui.weekStaff) || bookableStaff()[0];
  let lo = 540, hi = 1080; for (const d of days) { const hrs = staff.days[dow(d)]; if (hrs) { lo = Math.min(lo, hrs[0]); hi = Math.max(hi, hrs[1]); } for (const a of apptsOn(d, staff.id)) { lo = Math.min(lo, a.start); hi = Math.max(hi, a.start + a.dur); } }
  lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60; const H = (hi - lo) / 15 * SLOT_H;
  let html = `<div class="cal-grid week"><div class="cal-head corner"></div>`;
  for (const d of days) { const n = apptsOn(d, staff.id).length; html += `<div class="cal-head ${d === todayStr() ? 'today-col' : ''}" style="cursor:pointer" data-act="cal-goto-day" data-date="${d}"><div class="daynum">${fromDateStr(d).getDate()}</div><div><div class="who">${DOW[dow(d)]}</div><div class="meta">${staff.days[dow(d)] ? `${n} booked` : 'Off'}</div></div></div>`; }
  html += `<div class="cal-times" style="height:${H}px">${timeAxis(lo, hi)}</div>`;
  for (const d of days) {
    const hrs = staff.days[dow(d)];
    html += `<div class="cal-col ${hrs ? '' : 'off'}" data-col data-staff="${staff.id}" data-date="${d}" style="height:${H}px">`;
    if (hrs) { if (hrs[0] > lo) html += `<div class="off-band" style="top:0;height:${(hrs[0] - lo) / 15 * SLOT_H}px"></div>`; if (hrs[1] < hi) html += `<div class="off-band" style="top:${(hrs[1] - lo) / 15 * SLOT_H}px;bottom:0"></div>`; }
    for (let t = lo; t < hi; t += 15) html += `<div class="cal-slot" data-act="slot" data-staff="${staff.id}" data-date="${d}" data-min="${t}" style="top:${(t - lo) / 15 * SLOT_H}px"></div>`;
    for (const { a, lane, lanes } of withLanes(apptsOn(d, staff.id))) html += apptBlock(a, lo, true, lane, lanes);
    if (d === todayStr() && nowMin() >= lo && nowMin() <= hi) html += `<div class="now-line" data-now style="top:${(nowMin() - lo) / 15 * SLOT_H}px"></div>`;
    html += `</div>`;
  }
  return `<div class="cal-scroll" id="cal-scroll">${html}</div>`;
}
function agendaList() {
  const date = S.ui.date; const cols = S.ui.calStaff === 'all' ? bookableStaff() : [staffById(S.ui.calStaff)];
  const appts = cols.flatMap((s) => apptsOn(date, s.id)).sort(by((a) => a.start));
  if (!appts.length) return `<div class="content"><div class="empty"><span class="serif">Nothing on the books</span>Tap a time on the day view to add one.</div></div>`;
  return `<div class="content"><div class="agenda">${appts.map((a) => { const c = clientById(a.clientId); const s = staffById(a.staffId); return `<div class="agenda-item" data-act="open-appt" data-id="${a.id}" style="--cat:${CATEGORIES[apptMainCat(a)].color};cursor:pointer"><div class="num small"><b>${fmtTime(a.start)}</b><div class="faint">${fmtDur(a.dur)}</div></div><div class="grow"><div class="strong">${esc(fullName(c))}</div><div class="small muted ellipsis">${esc(apptTitle(a))} · ${esc(s.name.split(' ')[0])}</div></div>${statusBadge(a.status)}</div>`; }).join('')}</div></div>`;
}

Views.calendar = {
  title() { if (S.ui.calMode === 'week') { const s = startOfWeek(S.ui.date); return `${fmtDate(s, 'short')} – ${fmtDate(addDays(s, 6), 'short')}`; } return S.ui.date === todayStr() ? `Today, ${fmtDate(S.ui.date, 'dow')}` : fmtDate(S.ui.date, 'long'); },
  sub() { return S.ui.calMode === 'week' ? `${staffById(S.ui.weekStaff)?.name || ''} · week view` : daySummary(S.ui.date); },
  actions() {
    return `<div class="seg"><button class="btn ${S.ui.calMode === 'day' ? 'on' : ''}" data-act="cal-mode" data-mode="day">Day</button><button class="btn hide-mobile ${S.ui.calMode === 'week' ? 'on' : ''}" data-act="cal-mode" data-mode="week">Week</button><button class="btn ${S.ui.calMode === 'agenda' ? 'on' : ''}" data-act="cal-mode" data-mode="agenda">List</button></div>
      <div class="row" style="gap:4px"><button class="btn icon" data-act="cal-prev" aria-label="Previous">${I.left}</button><button class="btn hide-mobile" data-act="cal-today">Today</button><button class="btn icon" data-act="cal-next" aria-label="Next">${I.right}</button></div>
      <input type="date" class="input hide-mobile" style="width:auto" value="${S.ui.date}" data-on-change="cal-date" id="cal-date-input">
      <button class="btn primary" data-act="new-appt">${I.plus}<span class="hide-mobile">New appointment</span></button>`;
  },
  flush: true,
  render() {
    const staff = bookableStaff();
    const chips = S.ui.calMode === 'week'
      ? `<div class="staff-chips">${staff.map((s) => `<button class="chip ${S.ui.weekStaff === s.id ? 'on' : ''}" data-act="cal-weekstaff" data-id="${s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name.split(' ')[0])}</button>`).join('')}</div>`
      : `<div class="staff-chips">${isMobile() ? '' : `<button class="chip ${S.ui.calStaff === 'all' ? 'on' : ''}" data-act="cal-staff" data-id="all">Everyone</button>`}${staff.map((s) => `<button class="chip ${S.ui.calStaff === s.id ? 'on' : ''}" data-act="cal-staff" data-id="${s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name.split(' ')[0])}</button>`).join('')}</div>`;
    const wl = st().waitlist.length;
    const toolbar = `<div class="cal-toolbar">${chips}<div class="grow"></div><button class="btn sm" data-act="open-waitlist">Waitlist${wl ? ` <span class="badge accent">${wl}</span>` : ''}</button></div>`;
    const body = S.ui.calMode === 'day' ? dayGrid() : S.ui.calMode === 'week' ? weekGrid() : agendaList();
    const legend = `<div class="cal-legend">${CAT_ORDER.map((k) => `<span>${catDot(k)}${CATEGORIES[k].label}</span>`).join('')}<span class="faint" style="margin-left:auto">Drag to reschedule · click an empty slot to book</span></div>`;
    return `<div class="cal">${toolbar}${body}${legend}</div>`;
  },
  mount(root) {
    const scroll = $('#cal-scroll', root); if (!scroll) return;
    bindDrag(scroll);
    // scroll so the morning (or now) is in view
    const now = $('[data-now]', scroll);
    requestAnimationFrame(() => { if (now) scroll.scrollTop = Math.max(0, now.offsetTop - 160); });
  },
};

/* ---- drag to reschedule ---- */
let suppressClickUntil = 0;
function bindDrag(scroll) {
  let drag = null;
  scroll.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-appt]'); if (!el || e.button !== 0) return;
    const a = apptById(el.dataset.id); if (!a || ['completed', 'cancelled', 'noshow'].includes(a.status)) return;
    drag = { el, a, x0: e.clientX, y0: e.clientY, moved: false, col: el.parentElement, top0: parseFloat(el.style.top) };
    el.setPointerCapture(e.pointerId);
  });
  scroll.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; drag.el.classList.add('dragging'); }
    const snapped = Math.round(dy / SLOT_H) * SLOT_H;
    drag.el.style.transform = `translate(${dx}px, ${snapped}px)`;
    // highlight target column
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-col]');
    $$('[data-col]', scroll).forEach((c) => (c.style.background = ''));
    if (under && under !== drag.col) under.style.background = 'var(--accent-soft)';
    drag.target = under;
  });
  const finish = (e) => {
    if (!drag) return;
    const d = drag; drag = null; d.el.classList.remove('dragging'); $$('[data-col]', scroll).forEach((c) => (c.style.background = ''));
    if (!d.moved) return;
    suppressClickUntil = Date.now() + 300;
    const col = d.target || d.col; const dy = e.clientY - d.y0; const snapped = Math.round(dy / SLOT_H) * SLOT_H;
    const newTop = d.top0 + snapped; const gridStart = gridStartOf(col);
    const newStart = clamp(gridStart + Math.round(newTop / SLOT_H) * 15, 0, 24 * 60 - 15);
    const res = moveAppointment(d.a.id, { start: newStart, staffId: col.dataset.staff, date: col.dataset.date || d.a.date });
    if (!res.ok) { d.el.style.transform = ''; toast(res.reason, 'bad'); return; }
    rerenderContent(); toast(`Moved to ${fmtTime(newStart)}${col.dataset.staff !== d.a.staffId ? ` with ${staffById(col.dataset.staff).name.split(' ')[0]}` : ''}`, 'good', { label: 'Undo', act: 'undo-move', attrs: `data-id="${d.a.id}" data-start="${d.a.start}" data-staff="${d.a.staffId}" data-date="${d.a.date}"` });
  };
  scroll.addEventListener('pointerup', finish); scroll.addEventListener('pointercancel', finish);
}
function gridStartOf(col) { const t = $('.cal-time', col.closest('.cal-grid')); if (!t) return 540; const txt = t.textContent.trim(); const m = txt.match(/(\d+)(?::(\d+))?(am|pm)/); let hh = parseInt(m[1], 10) % 12 + (m[3] === 'pm' ? 12 : 0); return hh * 60 + (m[2] ? parseInt(m[2], 10) : 0); }

function contraHtml(c, serviceIds) {
  const rs = contraindications(c, serviceIds); if (!rs.length) return '';
  return `<div class="col" style="gap:6px">${rs.map((r) => `<div class="alert ${r.level}">${I.warn}<div>${r.services.length ? `<b>${esc(r.services.join(', '))}:</b> ` : ''}${esc(r.text)}</div></div>`).join('')}</div>`;
}

/* ---- drawers: appointment detail / edit / new ---- */
Drawers.appt = ({ id }) => {
  const a = apptById(id); if (!a) return null;
  const c = clientById(a.clientId); const s = staffById(a.staffId); const stats = clientStats(c.id);
  const pendingForms = st().forms.filter((f) => f.clientId === c.id && f.status === 'sent');
  const price = sum(a.items, (i) => i.price);
  const canCheckIn = ['booked', 'confirmed'].includes(a.status);
  const foot = a.status === 'completed' ? `<button class="btn" data-act="open-ticket" data-id="${a.ticketId || ''}">View ticket</button><button class="btn primary" data-act="rebook" data-id="${a.id}">${I.repeat}Rebook in 4 weeks</button>`
    : a.status === 'cancelled' || a.status === 'noshow' ? `<button class="btn primary" data-act="rebook" data-id="${a.id}">${I.repeat}Book again</button>`
    : `${canCheckIn ? `<button class="btn good" data-act="set-status" data-id="${a.id}" data-status="checkedin">${I.check}Check in</button>` : ''}${a.status === 'checkedin' ? `<button class="btn good" data-act="set-status" data-id="${a.id}" data-status="inservice">Start service</button>` : ''}${['checkedin', 'inservice'].includes(a.status) ? `<button class="btn primary" data-act="checkout-appt" data-id="${a.id}">${I.checkout}Checkout</button>` : ''}${a.status === 'confirmed' || a.status === 'booked' ? `<button class="btn" data-act="checkout-appt" data-id="${a.id}">Checkout</button>` : ''}<button class="btn" data-act="edit-appt" data-id="${a.id}">${I.edit}Edit</button><button class="btn danger" data-act="cancel-appt-ask" data-id="${a.id}">Cancel</button>${a.date <= todayStr() && canCheckIn ? `<button class="btn ghost" data-act="set-status" data-id="${a.id}" data-status="noshow">No-show</button>` : ''}`;
  return {
    title: `${fmtTime(a.start)} · ${esc(fullName(c))}`,
    headActions: `<button class="btn ghost icon" data-act="msg-client" data-id="${c.id}" aria-label="Text client" title="Text ${esc(c.first)}">${I.messages}</button>`,
    body: `
      <div class="row between"><div>${statusBadge(a.status)} ${a.source === 'online' ? '<span class="badge info">Booked online</span>' : ''}</div><div class="small faint">${fmtDate(a.date, 'dow')}</div></div>
      <div class="row" style="gap:12px;cursor:pointer" data-act="open-client" data-id="${c.id}">${avatar(c, 'lg')}<div class="grow"><div class="strong" style="font-size:16px">${esc(fullName(c))}</div><div class="small muted">${fmtPhone(c.phone)} · ${stats.visits} visits · ${stats.last ? 'last ' + relDate(stats.last).toLowerCase() : 'first visit'}</div><div class="flags">${flagBadges(c)}</div></div>${I.right}</div>
      ${contraHtml(c, a.items.map((i) => i.serviceId))}
      ${clientAlerts(c)}
      ${pendingForms.length ? `<div class="alert warn">${I.forms}<div><b>${pendingForms.length} form${pendingForms.length > 1 ? 's' : ''} not signed:</b> ${pendingForms.map((f) => esc(tplById(f.templateId).name)).join(', ')}. <button class="btn sm" style="margin-top:6px" data-act="fill-form" data-id="${pendingForms[0].id}">Fill out now</button></div></div>` : ''}
      <div class="panel"><div class="eyebrow" style="margin-bottom:8px">Services</div>${a.items.map((i) => { const sv = svcById(i.serviceId); return `<div class="row between" style="padding:4px 0"><span>${catDot(sv.cat, 'display:inline-block;vertical-align:middle;margin-right:8px')}${esc(sv.name)}</span><span class="small muted num">${fmtDur(i.dur)} · ${money(i.price, { whole: true })}</span></div>`; }).join('')}<div class="divider" style="margin:8px 0"></div><div class="row between strong"><span>${fmtRange(a.start, a.dur)}</span><span class="num">${money(price, { whole: true })}</span></div></div>
      <dl class="kv"><dt>With</dt><dd><span class="row" style="gap:6px"><span class="avatar sm" style="background:${s.color};width:20px;height:20px;font-size:9px">${initials(s.name)}</span>${esc(s.name)}</span></dd><dt>Booked</dt><dd>${relDate(a.createdAt)} · ${a.source === 'online' ? 'online' : 'front desk'}</dd>${a.arrivedAt ? `<dt>Arrived</dt><dd>${new Date(a.arrivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</dd>` : ''}${c.prefs ? `<dt>Prefers</dt><dd>${esc(c.prefs)}</dd>` : ''}</dl>
      <div class="field"><label for="appt-note-${a.id}">Appointment note</label><textarea class="textarea" id="appt-note-${a.id}" data-on-change="appt-note" data-id="${a.id}" placeholder="Running late, special requests, who referred them…" style="min-height:64px">${esc(a.notes || '')}</textarea></div>
      ${lastNotesFor(c.id, 2)}`,
    foot,
  };
};
function lastNotesFor(cid, n) {
  const notes = st().notes.filter((x) => x.clientId === cid).sort(by((x) => x.date)).reverse().slice(0, n);
  if (!notes.length) return '';
  return `<div><div class="eyebrow" style="margin-bottom:8px">Last notes</div><div class="col">${notes.map((x) => `<div class="note ${x.type}">${esc(x.text)}<div class="by">${esc(staffById(x.staffId)?.name.split(' ')[0] || '')} · ${fmtDate(x.date, 'short')}</div></div>`).join('')}</div></div>`;
}

/* new / edit appointment share a draft in S.ui.draft */
function newDraft(init = {}) {
  const date = init.date || S.ui.date || todayStr();
  const staffId = init.staffId || (bookableStaff().find((s) => s.days[dow(date)]) || bookableStaff()[0]).id;
  return { clientId: init.clientId || null, clientQuery: '', staffId, date, start: init.start ?? null, serviceIds: init.serviceIds || [], notes: init.notes || '', editId: init.editId || null, newClient: null };
}
function draftDur(d) { return sum(d.serviceIds, (id) => svcById(id)?.dur || 0); }
Drawers['appt-form'] = () => {
  const d = S.ui.draft; if (!d) return null;
  const c = d.clientId ? clientById(d.clientId) : null; const dur = draftDur(d); const price = sum(d.serviceIds, (id) => svcById(id)?.price || 0);
  const slots = dur ? freeSlots(d.staffId, d.date, dur, 15, { allowPast: true }) : [];
  const staffHrs = staffWorking(d.staffId, d.date);
  if (d.start !== null && dur && !slots.includes(d.start) && !(d.editId && apptById(d.editId)?.start === d.start && apptById(d.editId)?.date === d.date && apptById(d.editId)?.staffId === d.staffId)) { /* keep but flag */ }
  const grouped = groupBy(st().services, (s) => s.cat);
  const clientBlock = c ? `<div class="row" style="gap:10px">${avatar(c)}<div class="grow"><div class="strong">${esc(fullName(c))}</div><div class="small muted">${fmtPhone(c.phone)}${c.membershipId ? ' · ' + esc(planById(c.membershipId).name) : ''}</div><div class="flags">${flagBadges(c)}</div></div>${d.editId ? '' : `<button class="btn sm ghost" data-act="draft-clear-client">Change</button>`}</div>${contraHtml(c, d.serviceIds)}`
    : d.newClient ? `<div class="panel"><div class="eyebrow" style="margin-bottom:6px">New client</div><div class="field-row"><input class="input" id="nc-first" placeholder="First name" value="${esc(d.newClient.first || '')}" data-on-input="draft-nc" data-k="first"><input class="input" id="nc-last" placeholder="Last name" value="${esc(d.newClient.last || '')}" data-on-input="draft-nc" data-k="last"></div><div class="field-row" style="margin-top:8px"><input class="input" id="nc-phone" placeholder="Mobile" inputmode="tel" value="${esc(d.newClient.phone || '')}" data-on-input="draft-nc" data-k="phone"><input class="input" id="nc-email" placeholder="Email (optional)" inputmode="email" value="${esc(d.newClient.email || '')}" data-on-input="draft-nc" data-k="email"></div><button class="btn sm ghost" style="margin-top:8px" data-act="draft-cancel-nc">Search existing instead</button></div>`
    : `<div class="field"><label for="draft-q">Client</label><div class="search">${I.search}<input id="draft-q" placeholder="Name or phone…" value="${esc(d.clientQuery)}" data-on-input="draft-q" autocomplete="off"></div><div id="draft-results" class="list">${draftResults(d.clientQuery)}</div></div>`;
  return {
    title: d.editId ? 'Edit appointment' : 'New appointment',
    body: `${clientBlock}
      <div class="field"><label>Services <span class="faint">· ${dur ? fmtDur(dur) + ' · ' + money(price, { whole: true }) : 'pick at least one'}</span></label>
        ${CAT_ORDER.map((k) => `<div class="small eyebrow" style="margin:6px 0 2px">${CATEGORIES[k].label}</div><div class="row wrap" style="gap:6px">${(grouped[k] || []).map((s) => `<button class="chip ${d.serviceIds.includes(s.id) ? 'on' : ''}" data-act="draft-svc" data-id="${s.id}">${esc(s.name)} <span class="faint num">${s.dur}m · $${s.price}</span></button>`).join('')}</div>`).join('')}</div>
      <div class="field-row"><div class="field"><label for="draft-staff">With</label><select class="select" id="draft-staff" data-on-change="draft-staff">${bookableStaff().map((s) => `<option value="${s.id}" ${s.id === d.staffId ? 'selected' : ''}>${esc(s.name.split(' ')[0])}${s.days[dow(d.date)] ? '' : ' (off)'}</option>`).join('')}</select></div><div class="field"><label for="draft-date">Date</label><input type="date" class="input" id="draft-date" value="${d.date}" data-on-change="draft-date"></div></div>
      <div class="field"><label>Time ${staffHrs ? `<span class="faint">· ${staffById(d.staffId).name.split(' ')[0]} works ${fmtTime(staffHrs[0])}–${fmtTime(staffHrs[1])}</span>` : `<span class="badge warn">${staffById(d.staffId).name.split(' ')[0]} is off ${DOW[dow(d.date)]}</span>`}</label>
        ${!dur ? '<div class="small faint">Choose services to see open times.</div>' : slots.length ? `<div class="slots">${slots.map((t) => `<button class="slot ${d.start === t ? 'on' : ''}" data-act="draft-time" data-min="${t}" ${d.date === todayStr() && t < nowMin() ? 'style="opacity:.55" title="Earlier today — fine for logging a walk-in"' : ''}>${fmtTime(t)}</button>`).join('')}</div>` : `<div class="small muted">No open ${fmtDur(dur)} gaps${staffHrs ? ' that day' : ''}. Try another day or esthetician.</div>`}
        ${d.start !== null && dur && !slots.includes(d.start) ? `<div class="small warn-ink" style="color:var(--warn-ink)">Currently ${fmtTime(d.start)} — not an open slot anymore; pick a new time.</div>` : ''}</div>
      <div class="field"><label for="draft-notes">Note</label><input class="input" id="draft-notes" value="${esc(d.notes)}" placeholder="Optional" data-on-input="draft-notes"></div>`,
    foot: `<button class="btn" data-act="close-drawer">Cancel</button><div class="grow"></div>${d.editId ? '' : `<button class="btn" data-act="draft-waitlist" ${(c || d.newClient) && d.serviceIds.length ? '' : 'disabled'}>Add to waitlist</button>`}<button class="btn primary" data-act="draft-save" ${(c || (d.newClient && d.newClient.first && d.newClient.phone)) && dur && d.start !== null ? '' : 'disabled'}>${d.editId ? 'Save changes' : 'Book it'}</button>`,
    mount(root) { if (!c && !d.newClient) { const q = $('#draft-q', root); if (q && d.focusSearch) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); d.focusSearch = false; } } },
  };
};
function draftResults(q) {
  const res = searchClients(q, 6);
  return res.map((c) => `<div class="client-row" data-act="draft-pick" data-id="${c.id}">${avatar(c, 'sm')}<div class="grow"><div class="nm">${esc(fullName(c))}</div><div class="mt">${fmtPhone(c.phone)}${c.membershipId ? ' · member' : ''}</div></div></div>`).join('') + `<div class="client-row" data-act="draft-new-client"><div class="avatar sm" style="background:var(--surface-3);color:var(--ink-2)">${I.plus}</div><div class="nm">New client${q.trim() ? ` “${esc(q.trim())}”` : ''}</div></div>`;
}
function refreshDraft() { renderDrawer(); }

Drawers.waitlist = () => ({
  title: 'Waitlist',
  body: st().waitlist.length ? `<div class="list">${st().waitlist.slice().sort(by((w) => w.addedAt)).map((w) => { const c = clientById(w.clientId); const sv = svcById(w.serviceId); return `<div class="list-row">${avatar(c, 'sm')}<div class="grow"><div class="strong">${esc(fullName(c))}</div><div class="small muted">${esc(sv?.name || '')}${w.staffId ? ' · ' + esc(staffById(w.staffId).name.split(' ')[0]) : ' · anyone'} · ${esc(w.note || '')}</div><div class="tiny faint">Added ${relDate(w.addedAt).toLowerCase()}</div></div><button class="btn sm" data-act="waitlist-book" data-id="${w.id}">Book</button><button class="btn sm ghost icon" data-act="waitlist-remove" data-id="${w.id}" aria-label="Remove">${I.x}</button></div>`; }).join('')}</div>` : `<div class="empty"><span class="serif">Waitlist is empty</span>Add someone from the new-appointment form when there's no opening.</div>`,
});

Modals.cancel = ({ id }) => ({ title: 'Cancel appointment', body: `<p>${esc(fullName(clientById(apptById(id).clientId)))} · ${fmtDate(apptById(id).date, 'dow')} ${fmtTime(apptById(id).start)}</p><div class="field"><label for="cancel-reason">Reason (optional)</label><select class="select" id="cancel-reason"><option>Client request</option><option>Sick</option><option>Rescheduled</option><option>Esthetician unavailable</option><option>Other</option></select></div><label class="check"><input type="checkbox" id="cancel-notify" checked> Text the client a cancellation notice</label>`, foot: `<button class="btn" data-act="close-modal">Keep it</button><button class="btn danger" data-act="cancel-appt" data-id="${id}">Cancel appointment</button>` });

Object.assign(Actions, {
  'cal-mode': (el) => { S.ui.calMode = el.dataset.mode; savePrefs(); rerenderContent(); },
  'cal-prev': () => { S.ui.date = addDays(S.ui.date, S.ui.calMode === 'week' ? -7 : -1); rerenderContent(); },
  'cal-next': () => { S.ui.date = addDays(S.ui.date, S.ui.calMode === 'week' ? 7 : 1); rerenderContent(); },
  'cal-today': () => { if (S.ui.view !== 'calendar') return App.go('calendar', { date: todayStr() }); S.ui.date = todayStr(); rerenderContent(); },
  'cal-staff': (el) => { S.ui.calStaff = el.dataset.id; rerenderContent(); },
  'cal-weekstaff': (el) => { S.ui.weekStaff = el.dataset.id; rerenderContent(); },
  'cal-goto-day': (el) => { S.ui.date = el.dataset.date; S.ui.calMode = 'day'; rerenderContent(); },
  'open-appt': (el) => { if (Date.now() < suppressClickUntil) return; openDrawer('appt', { id: el.dataset.id }); },
  slot: (el) => { if (Date.now() < suppressClickUntil) return; S.ui.draft = newDraft({ staffId: el.dataset.staff, date: el.dataset.date || S.ui.date, start: +el.dataset.min }); S.ui.draft.focusSearch = true; openDrawer('appt-form'); },
  'new-appt': () => { if (S.ui.view !== 'calendar' && S.ui.view !== 'clients') App.go('calendar'); S.ui.draft = newDraft({ clientId: S.ui.view === 'clients' ? S.ui.clientId : null }); S.ui.draft.focusSearch = true; openDrawer('appt-form'); },
  'edit-appt': (el) => { const a = apptById(el.dataset.id); S.ui.draft = newDraft({ clientId: a.clientId, staffId: a.staffId, date: a.date, start: a.start, serviceIds: a.items.map((i) => i.serviceId), notes: a.notes, editId: a.id }); openDrawer('appt-form'); },
  rebook: (el) => { const a = apptById(el.dataset.id); const date = addDays(todayStr() > a.date ? todayStr() : a.date, 28); S.ui.draft = newDraft({ clientId: a.clientId, staffId: a.staffId, date, serviceIds: a.items.map((i) => i.serviceId) }); const slots = freeSlots(a.staffId, date, draftDur(S.ui.draft)); const near = slots.find((t) => t >= a.start) ?? slots[0] ?? null; S.ui.draft.start = near; openDrawer('appt-form'); },
  'set-status': (el) => { setStatus(el.dataset.id, el.dataset.status); const a = apptById(el.dataset.id); renderDrawer(); rerenderContent(); toast(`${fullName(clientById(a.clientId))} · ${STATUS_LABEL[a.status]}`); },
  'cancel-appt-ask': (el) => openModal('cancel', { id: el.dataset.id }),
  'cancel-appt': (el) => { const a = apptById(el.dataset.id); const reason = $('#cancel-reason')?.value; const notify = $('#cancel-notify')?.checked; cancelAppointment(a.id, reason); if (notify) sendMessage(a.clientId, `Hi ${clientById(a.clientId).first}, your ${apptTitle(a)} on ${fmtDate(a.date, 'dow')} at ${fmtTime(a.start)} has been cancelled. Rebook any time: ${bizUrl('/book')}`, 'cancellation'); closeModal(); closeDrawer(); rerenderContent(); toast('Appointment cancelled', 'good'); },
  'undo-move': (el) => { const res = moveAppointment(el.dataset.id, { start: +el.dataset.start, staffId: el.dataset.staff, date: el.dataset.date }); if (res.ok) { rerenderContent(); toast('Moved back'); } else toast(res.reason, 'bad'); },
  'open-waitlist': () => openDrawer('waitlist'),
  'waitlist-remove': (el) => { removeFromWaitlist(el.dataset.id); renderDrawer(); rerenderContent(); },
  'waitlist-book': (el) => { const w = st().waitlist.find((x) => x.id === el.dataset.id); S.ui.draft = newDraft({ clientId: w.clientId, staffId: w.staffId || undefined, serviceIds: [w.serviceId], notes: w.note }); S.ui.draft.waitlistId = w.id; openDrawer('appt-form'); },
  'draft-pick': (el) => { S.ui.draft.clientId = el.dataset.id; refreshDraft(); },
  'draft-clear-client': () => { S.ui.draft.clientId = null; S.ui.draft.focusSearch = true; refreshDraft(); },
  'draft-new-client': () => { const q = S.ui.draft.clientQuery.trim().split(/\s+/); S.ui.draft.newClient = { first: q[0] || '', last: q.slice(1).join(' ') || '', phone: '', email: '' }; refreshDraft(); setTimeout(() => $(S.ui.draft.newClient.first ? '#nc-phone' : '#nc-first')?.focus(), 20); },
  'draft-cancel-nc': () => { S.ui.draft.newClient = null; S.ui.draft.focusSearch = true; refreshDraft(); },
  'draft-svc': (el) => { const d = S.ui.draft; const id = el.dataset.id; d.serviceIds = d.serviceIds.includes(id) ? d.serviceIds.filter((x) => x !== id) : [...d.serviceIds, id]; const dur = draftDur(d); if (d.start !== null && dur && !freeSlots(d.staffId, d.date, dur, 15, { allowPast: true }).includes(d.start) && !d.editId) d.start = null; refreshDraft(); },
  'draft-time': (el) => { S.ui.draft.start = +el.dataset.min; refreshDraft(); },
  'draft-waitlist': () => { const d = S.ui.draft; let cid = d.clientId; if (!cid && d.newClient) cid = upsertClient({ first: d.newClient.first.trim(), last: d.newClient.last.trim(), phone: d.newClient.phone.replace(/\D/g, ''), email: d.newClient.email.trim() }).id; addToWaitlist({ clientId: cid, serviceId: d.serviceIds[0], staffId: d.staffId, note: d.notes || `Wants ${fmtDate(d.date, 'short')}` }); closeDrawer(); rerenderContent(); toast('Added to waitlist'); },
  'draft-save': () => {
    const d = S.ui.draft; let cid = d.clientId;
    if (!cid && d.newClient) { const nc = upsertClient({ first: d.newClient.first.trim(), last: d.newClient.last.trim(), phone: d.newClient.phone.replace(/\D/g, ''), email: d.newClient.email.trim(), source: 'Front desk' }); cid = nc.id; }
    const items = d.serviceIds.map((id) => { const s = svcById(id); return { serviceId: id, price: s.price, dur: s.dur }; });
    if (d.editId) {
      const a = apptById(d.editId); const dur = sum(items, (i) => i.dur);
      const cf = conflicts(d.staffId, d.date, d.start, dur, a.id); if (cf.length) return toast(`Overlaps ${fullName(clientById(cf[0].clientId))} at ${fmtTime(cf[0].start)}`, 'bad');
      Object.assign(a, { staffId: d.staffId, date: d.date, start: d.start, items, dur, notes: d.notes, touched: true, seeded: false }); commit();
      closeDrawer(); S.ui.date = d.date; rerenderContent(); toast('Appointment updated'); openDrawer('appt', { id: a.id }); return;
    }
    const a = createAppointment({ clientId: cid, staffId: d.staffId, date: d.date, start: d.start, items, notes: d.notes });
    if (d.waitlistId) removeFromWaitlist(d.waitlistId);
    closeDrawer(); if (S.ui.view === 'calendar') { S.ui.date = d.date; } rerenderContent();
    toast(`Booked ${fullName(clientById(cid))} · ${fmtDate(d.date, 'dow')} ${fmtTime(d.start)}`, 'good', { label: 'Open', act: 'open-appt', attrs: `data-id="${a.id}"` });
  },
});
/* input / change delegation */
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-on-input]'); if (!el) return; const k = el.dataset.onInput;
  if (k === 'draft-q') { S.ui.draft.clientQuery = el.value; const r = $('#draft-results'); if (r) r.innerHTML = draftResults(el.value); }
  else if (k === 'draft-nc') { S.ui.draft.newClient[el.dataset.k] = el.value; const ok = S.ui.draft.newClient.first && S.ui.draft.newClient.phone && draftDur(S.ui.draft) && S.ui.draft.start !== null; const b = $('[data-act="draft-save"]'); if (b) b.disabled = !ok; }
  else if (k === 'draft-notes') S.ui.draft.notes = el.value;
  else if (Actions['input:' + k]) Actions['input:' + k](el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-on-change]'); if (!el) return; const k = el.dataset.onChange;
  if (k === 'cal-date') { if (el.value) { S.ui.date = el.value; rerenderContent(); } }
  else if (k === 'draft-staff') { S.ui.draft.staffId = el.value; const dur = draftDur(S.ui.draft); if (S.ui.draft.start !== null && dur && !freeSlots(el.value, S.ui.draft.date, dur, 15, { allowPast: true }).includes(S.ui.draft.start)) S.ui.draft.start = null; refreshDraft(); }
  else if (k === 'draft-date') { if (el.value) { S.ui.draft.date = el.value; const dur = draftDur(S.ui.draft); if (S.ui.draft.start !== null && dur && !freeSlots(S.ui.draft.staffId, el.value, dur, 15, { allowPast: true }).includes(S.ui.draft.start)) S.ui.draft.start = null; refreshDraft(); } }
  else if (k === 'appt-note') { const a = apptById(el.dataset.id); if (a) { a.notes = el.value; a.touched = true; commit(); toast('Note saved'); } }
  else if (Actions['change:' + k]) Actions['change:' + k](el, e);
});
