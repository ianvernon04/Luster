/* ===== Online booking (client-facing preview) ===== */
const bkStaff = () => bookableStaff().filter((s) => !s.skills || bk().serviceIds.every((id) => s.skills.includes(id)));   // providers who do everything picked
function bk() { if (!S.ui.booking || !S.ui.booking.init) S.ui.booking = { init: true, serviceIds: [], staffId: 'any', date: null, start: null, resolvedStaff: null, name: '', phone: '', email: '', note: '' }; return S.ui.booking; }
function bkDur() { return sum(bk().serviceIds, (id) => svcById(id)?.dur || 0); }
function bkPrice() { return sum(bk().serviceIds, (id) => svcById(id)?.price || 0); }
function bkSlotsFor(date) {
  const b = bk(); const dur = bkDur(); if (!dur) return [];
  const staff = b.staffId === 'any' ? bkStaff() : [staffById(b.staffId)];
  const map = new Map();
  for (const s of staff) for (const t of freeSlots(s.id, date, dur, 30)) if (!map.has(t)) map.set(t, s.id);
  return Array.from(map.entries()).sort((a, b2) => a[0] - b2[0]);
}
Views.booking = {
  title: () => 'Online booking',
  sub: () => (isLive() ? `Your live booking page. What clients book here lands on the calendar within seconds.` : `Preview of what clients see at ${bizUrl('/book')} — bookings land straight on the calendar.`),
  actions: () => (isLive() ? `<button class="btn" data-act="cloud-copy">Copy link</button><button class="btn" data-act="cloud-open">Open</button>` : `<button class="btn" data-act="bk-reset">Start over</button>`),
  render() {
    if (isLive()) return `<div class="col" style="gap:12px;max-width:760px;margin:0 auto"><div class="card pad row between wrap" style="gap:10px"><div><div class="eyebrow">Booking link</div><div class="strong" style="word-break:break-all">${esc(shortLink(st().live.slug))}</div></div>${cloudStatusHtml()}</div>
      <iframe src="book/?s=${encodeURIComponent(st().live.slug)}" title="Your booking page" loading="lazy" style="width:100%;height:min(820px,calc(100vh - 220px));min-height:520px;border:1px solid var(--line-2);border-radius:var(--r-lg);background:var(--surface)"></iframe></div>`;
    const b = bk(); const step = S.ui.bookingStep || 0; const biz = st().business;
    const steps = ['Service', 'Esthetician', 'Time', 'Details', 'Confirm'];
    const stepsHtml = `<div class="steps">${steps.map((s, i) => `<span class="step ${i === step ? 'on' : i < step ? 'done' : ''}">${i < step ? '✓ ' : ''}${s}</span>`).join('')}</div>`;
    let body = '';
    if (step === 0) {
      const grouped = groupBy(st().services.filter((s) => !s.hidden && !s.noAuto), (s) => s.cat);
      body = CAT_ORDER.map((k) => `<div class="svc-group"><h3>${CATEGORIES[k].label}</h3><div class="col" style="gap:8px">${(grouped[k] || []).map((s) => `<button class="svc-row ${b.serviceIds.includes(s.id) ? 'on' : ''}" data-act="bk-svc" data-id="${s.id}"><div class="grow" style="min-width:0"><div class="strong">${esc(s.name)}</div><div class="d">${esc(s.desc || '')} ${fmtDur(s.dur)}</div></div><span class="p">${money(s.price, { whole: true })}</span></button>`).join('')}</div></div>`).join('') + `<div class="row between" style="position:sticky;bottom:0;background:var(--surface);padding:12px 0;border-top:1px solid var(--line-2)"><div>${b.serviceIds.length ? `<b>${b.serviceIds.length} selected</b> · ${fmtDur(bkDur())} · ${money(bkPrice(), { whole: true })}` : '<span class="muted">Pick one or more services</span>'}</div><button class="btn primary lg" data-act="bk-step" data-s="1" ${b.serviceIds.length ? '' : 'disabled'}>Choose ${esc(tpl().noun.pro)}</button></div>`;
    } else if (step === 1) {
      body = `<div class="staff-pick"><button class="staff-card ${b.staffId === 'any' ? 'on' : ''}" data-act="bk-staff" data-id="any"><div class="avatar lg" style="background:var(--surface-3);color:var(--ink-2)">${I.spark}</div><div class="strong">First available</div><div class="role">Most open times</div></button>${bkStaff().map((s) => `<button class="staff-card ${b.staffId === s.id ? 'on' : ''}" data-act="bk-staff" data-id="${s.id}"><div class="avatar lg" style="background:${s.color}">${initials(s.name)}</div><div class="strong">${esc(s.name.split(' ')[0])}</div><div class="role">${esc(s.role)}</div><div class="tiny faint">${esc(s.bio)}</div></button>`).join('')}</div><div class="row between" style="margin-top:16px"><button class="btn" data-act="bk-step" data-s="0">${I.left}Back</button><button class="btn primary lg" data-act="bk-step" data-s="2">Pick a time</button></div>`;
    } else if (step === 2) {
      const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i));
      if (!b.date) b.date = days.find((d) => bkSlotsFor(d).length) || days[0];
      const slots = bkSlotsFor(b.date);
      body = `<div class="days">${days.map((d) => { const n = bkSlotsFor(d).length; return `<button class="day ${b.date === d ? 'on' : ''}" data-act="bk-date" data-date="${d}" ${n ? '' : 'disabled'}><div class="dw">${DOW[dow(d)]}</div><div class="dn">${fromDateStr(d).getDate()}</div><div class="tiny faint">${n ? n + ' open' : 'full'}</div></button>`; }).join('')}</div>
        <div style="margin-top:14px"><div class="small muted" style="margin-bottom:8px">${fmtDate(b.date, 'long')} · ${fmtDur(bkDur())}${b.staffId === 'any' ? '' : ' with ' + esc(staffById(b.staffId).name.split(' ')[0])}</div>${slots.length ? `<div class="slots">${slots.map(([t, sid]) => `<button class="slot ${b.start === t && b.date ? 'on' : ''}" data-act="bk-time" data-min="${t}" data-staff="${sid}">${fmtTime(t)}</button>`).join('')}</div>` : '<div class="empty">No openings that day.</div>'}</div>
        <div class="row between" style="margin-top:16px"><button class="btn" data-act="bk-step" data-s="1">${I.left}Back</button><button class="btn primary lg" data-act="bk-step" data-s="3" ${b.start !== null ? '' : 'disabled'}>Your details</button></div>`;
    } else if (step === 3) {
      body = `<form class="col" style="gap:12px" id="bk-form" onsubmit="return false"><div class="field"><label for="bk-phone">Mobile number</label><input class="input" id="bk-phone" inputmode="tel" value="${esc(b.phone)}" placeholder="(225) 555-0123" data-on-input="bk-field" data-k="phone"><div class="hint" id="bk-known">${bkKnownHint(b.phone)}</div></div><div class="field"><label for="bk-name">Full name</label><input class="input" id="bk-name" value="${esc(b.name)}" placeholder="First Last" data-on-input="bk-field" data-k="name"></div><div class="field"><label for="bk-email">Email</label><input class="input" id="bk-email" inputmode="email" value="${esc(b.email)}" placeholder="you@example.com" data-on-input="bk-field" data-k="email"></div><div class="field"><label for="bk-note">Anything we should know?</label><textarea class="textarea" id="bk-note" placeholder="Skin concerns, allergies, running late…" data-on-input="bk-field" data-k="note">${esc(b.note)}</textarea></div></form>
        <div class="row between" style="margin-top:16px"><button class="btn" data-act="bk-step" data-s="2">${I.left}Back</button><button class="btn primary lg" data-act="bk-step" data-s="4" id="bk-next3" ${b.phone.replace(/\D/g, '').length >= 10 && b.name.trim() ? '' : 'disabled'}>Review</button></div>`;
    } else if (step === 4) {
      const s = staffById(b.resolvedStaff || b.staffId);
      body = `<div class="card pad summary"><div class="ln"><span class="muted">Services</span><span>${b.serviceIds.map((id) => esc(svcById(id).name)).join(' + ')}</span></div><div class="ln"><span class="muted">With</span><span>${esc(s.name)} · ${esc(s.role)}</span></div><div class="ln"><span class="muted">When</span><span>${fmtDate(b.date, 'long')} · ${fmtRange(b.start, bkDur())}</span></div><div class="ln"><span class="muted">Where</span><span>${esc(biz.address)}</span></div><div class="ln strong"><span>Total at checkout</span><span class="num">${money(bkPrice(), { whole: true })}</span></div></div>
        <div class="small muted" style="margin-top:12px">${st().settings.booking.depositRequired ? 'A card is required to hold this appointment.' : 'No deposit required.'} Please give us ${st().settings.booking.cancelHours} hours' notice to cancel or move. You'll get a text confirmation and a reminder the day before.</div>
        <div class="row between" style="margin-top:16px"><button class="btn" data-act="bk-step" data-s="3">${I.left}Back</button><button class="btn primary lg" data-act="bk-confirm">Book appointment</button></div>`;
    } else {
      const a = apptById(b.apptId); const s = a ? staffById(a.staffId) : null;
      body = a ? `<div class="confirm-tick">${I.check}</div><h3 style="text-align:center;font-family:var(--font-display);font-weight:400;font-size:26px;margin-top:12px">You're booked, ${esc(clientById(a.clientId).first)}.</h3><p class="muted" style="text-align:center">${esc(apptTitle(a))} with ${esc(s.name.split(' ')[0])}<br>${fmtDate(a.date, 'long')} · ${fmtTime(a.start)}</p><div class="alert info" style="margin-top:14px">${I.messages}<div>Confirmation texted to ${fmtPhone(clientById(a.clientId).phone)}. It's already on the studio calendar — <button class="btn sm" data-act="bk-see" data-date="${a.date}" data-id="${a.id}">see it there</button></div></div><div class="row" style="justify-content:center;margin-top:16px"><button class="btn" data-act="bk-reset">Book another</button></div>` : '<div class="empty">Something went sideways. Start over.</div>';
    }
    return `<div class="booking-frame"><div class="booking-hero"><div class="eyebrow">${esc(biz.name)}</div><h2>${step === 5 ? 'See you soon' : 'Book a visit'}</h2><p>${step === 0 ? esc(tpl().copy.bookingIntro) : step === 1 ? 'Who would you like to see?' : step === 2 ? 'Real-time availability — if you can see it, it\'s yours.' : step === 3 ? 'Returning clients: your number pulls up your file.' : step === 4 ? 'One last look.' : ''}</p></div>${step < 5 ? stepsHtml : ''}<div>${body}</div></div>`;
  },
};
function bkKnownHint(phone) { const d = phone.replace(/\D/g, ''); if (d.length < 10) return 'We text your confirmation and reminders here.'; const c = st().clients.find((x) => x.phone === d); return c ? `Welcome back, ${esc(c.first)} — we found your file.` : 'New here? Welcome. We\'ll send a short intake form before your visit.'; }
Object.assign(Actions, {
  'bk-reset': () => { S.ui.booking = null; S.ui.bookingStep = 0; rerenderContent(); },
  'bk-step': (el) => { S.ui.bookingStep = +el.dataset.s; rerenderContent(); },
  'bk-svc': (el) => { const b = bk(); const id = el.dataset.id; b.serviceIds = b.serviceIds.includes(id) ? b.serviceIds.filter((x) => x !== id) : [...b.serviceIds, id]; b.date = null; b.start = null; rerenderContent(); },
  'bk-staff': (el) => { const b = bk(); b.staffId = el.dataset.id; b.date = null; b.start = null; rerenderContent(); },
  'bk-date': (el) => { const b = bk(); b.date = el.dataset.date; b.start = null; rerenderContent(); },
  'bk-time': (el) => { const b = bk(); b.start = +el.dataset.min; b.resolvedStaff = el.dataset.staff; rerenderContent(); },
  'input:bk-field': (el) => { const b = bk(); b[el.dataset.k] = el.value; if (el.dataset.k === 'phone') { const d = el.value.replace(/\D/g, ''); const c = st().clients.find((x) => x.phone === d); const hint = $('#bk-known'); if (hint) hint.innerHTML = bkKnownHint(el.value); if (c && !b.name) { b.name = fullName(c); b.email = c.email; const n = $('#bk-name'); if (n) n.value = b.name; const e = $('#bk-email'); if (e) e.value = b.email; } } const next = $('#bk-next3'); if (next) next.disabled = !(b.phone.replace(/\D/g, '').length >= 10 && b.name.trim()); },
  'bk-confirm': () => {
    const b = bk(); const phone = b.phone.replace(/\D/g, ''); let c = st().clients.find((x) => x.phone === phone);
    if (!c) { const parts = b.name.trim().split(/\s+/); c = upsertClient({ first: parts[0], last: parts.slice(1).join(' '), phone, email: b.email.trim(), source: 'Website' }); }
    const staffId = b.resolvedStaff || (b.staffId === 'any' ? (bkStaff()[0] || bookableStaff()[0]).id : b.staffId);
    const items = b.serviceIds.map((id) => { const s = svcById(id); return { serviceId: id, price: s.price, dur: s.dur }; });
    if (conflicts(staffId, b.date, b.start, sum(items, (i) => i.dur)).length) { toast('That time was just taken — pick another', 'bad'); S.ui.bookingStep = 2; b.start = null; rerenderContent(); return; }
    const a = createAppointment({ clientId: c.id, staffId, date: b.date, start: b.start, items, notes: b.note, source: 'online', status: 'booked' });
    b.apptId = a.id; S.ui.bookingStep = 5; rerenderContent();
  },
  'bk-see': (el) => { S.ui.booking = null; S.ui.bookingStep = 0; App.go('calendar', { date: el.dataset.date, calMode: 'day', calStaff: 'all' }); openDrawer('appt', { id: el.dataset.id }); },
});
