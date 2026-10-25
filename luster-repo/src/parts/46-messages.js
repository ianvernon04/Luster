/* ===== Messages & automations ===== */
const KIND_LABEL = { reminder: 'Reminder', confirmation: 'Confirmation', rebook: 'Rebook nudge', birthday: 'Birthday', manual: 'Manual', form: 'Form link', receipt: 'Receipt', cancellation: 'Cancellation' };
const AUTOMATIONS = [
  ['confirmOnBooking', 'Confirmation when booked', 'Text (front desk) or email (online) the moment an appointment is made.'],
  ['sms24h', 'Reminder the day before', 'Sent at 10am. Replies with C confirm the appointment automatically.'],
  ['sms2h', 'Reminder 2 hours before', 'Short, friendly, with parking directions.'],
  ['rebookNudge', 'Rebook nudge', 'If a client hasn\'t rebooked within 4 weeks, nudge them with a booking link.'],
  ['birthday', 'Birthday perk', 'A birthday-month treat, sent on the 1st.'],
  ['reviewRequest', 'Review request after first visit', 'Ask new clients for a Google review the morning after.'],
];
Views.messages = {
  title: () => 'Messages',
  sub() { const today = todayStr(); const ms = st().messages; return `${ms.filter((m) => m.at.slice(0, 10) === today).length} sent today · ${ms.filter((m) => m.reply).length} replies in the last few days · simulated carrier`; },
  actions: () => `<div class="seg">${[['all', 'All'], ['replies', 'Replies'], ['reminder', 'Reminders'], ['confirmation', 'Confirmations'], ['rebook', 'Rebook'], ['manual', 'Manual']].map(([k, l]) => `<button class="btn ${(S.ui.msgFilter || 'all') === k ? 'on' : ''}" data-act="msg-filter" data-id="${k}">${l}</button>`).join('')}</div>`,
  render() {
    const f = S.ui.msgFilter || 'all'; const r = st().settings.reminders;
    let ms = st().messages.slice().sort(by((m) => m.at)).reverse();
    if (f === 'replies') ms = ms.filter((m) => m.reply); else if (f !== 'all') ms = ms.filter((m) => m.kind === f);
    const today = todayStr(); const tomorrow = addDays(today, 1);
    const due = apptsOn(tomorrow).filter((a) => a.status === 'booked' || a.status === 'confirmed').length;
    return `<div class="msg-layout">
      <div class="col" style="gap:12px"><div class="card pad"><h3 style="margin-bottom:4px">Automations</h3><div class="small muted" style="margin-bottom:6px">${due} reminders queue for tomorrow at 10am.</div>${AUTOMATIONS.map(([k, l, d]) => `<div class="toggle"><div><div class="strong small">${l}</div><div class="tiny faint">${d}</div></div><button class="switch ${r[k] ? 'on' : ''}" data-act="auto-toggle" data-k="${k}" role="switch" aria-checked="${!!r[k]}" aria-label="${l}"></button></div>`).join('')}</div>
      <div class="card pad"><h3 style="margin-bottom:8px">This week</h3><div class="grid-2" style="gap:8px"><div class="stat"><div class="label">Reminders sent</div><div class="value">${st().messages.filter((m) => m.kind === 'reminder').length}</div></div><div class="stat"><div class="label">Confirmed by reply</div><div class="value">${st().messages.filter((m) => m.kind === 'reminder' && m.reply).length}</div></div><div class="stat"><div class="label">Rebook nudges</div><div class="value">${st().messages.filter((m) => m.kind === 'rebook').length}</div></div><div class="stat"><div class="label">Replied</div><div class="value">${st().messages.filter((m) => m.kind === 'rebook' && m.reply).length}</div></div></div></div></div>
      <div class="card pad"><h3 style="margin-bottom:6px">Log</h3>${ms.length ? ms.slice(0, 60).map((m) => { const c = clientById(m.clientId); if (!c) return ''; return `<div class="msg"><div style="cursor:pointer" data-act="open-client" data-id="${c.id}">${avatar(c, 'sm')}</div><div style="min-width:0"><div class="row wrap" style="gap:6px"><b style="cursor:pointer" data-act="open-client" data-id="${c.id}">${esc(fullName(c))}</b><span class="badge ${m.kind === 'manual' ? 'accent' : ''}">${KIND_LABEL[m.kind] || m.kind}</span><span class="tiny faint">${m.channel.toUpperCase()}</span></div><div class="body">${esc(m.body)}</div>${m.reply ? `<div class="bubble" style="margin-top:6px;display:inline-block">${esc(m.reply)}</div>` : ''}</div><div class="col" style="align-items:flex-end;gap:4px"><span class="when">${timeAgo(m.at)}</span>${m.reply ? `<button class="btn sm" data-act="msg-client" data-id="${c.id}">Reply</button>` : ''}</div></div>`; }).join('') : '<div class="empty">No messages match.</div>'}</div></div>`;
  },
};
Object.assign(Actions, {
  'msg-filter': (el) => { S.ui.msgFilter = el.dataset.id; rerenderContent(); },
  'auto-toggle': (el) => { const r = st().settings.reminders; r[el.dataset.k] = !r[el.dataset.k]; commit(); el.classList.toggle('on', r[el.dataset.k]); el.setAttribute('aria-checked', String(!!r[el.dataset.k])); toast(`${AUTOMATIONS.find((a) => a[0] === el.dataset.k)[1]} ${r[el.dataset.k] ? 'on' : 'off'}`); },
});

/* ===== Memberships ===== */
Views.memberships = {
  title: () => 'Memberships',
  sub() { const m = st().clients.filter((c) => c.membershipId); const mrr = sum(m.filter((c) => c.memberStatus === 'active'), (c) => planById(c.membershipId).price); return `${m.length} members · ${money(mrr, { whole: true })} monthly recurring · ${m.filter((c) => c.memberStatus === 'past_due').length} past due`; },
  actions: () => `<div class="seg">${[['all', 'All'], ['active', 'Active'], ['past_due', 'Past due'], ['risk', 'At risk']].map(([k, l]) => `<button class="btn ${(S.ui.memFilter || 'all') === k ? 'on' : ''}" data-act="mem-filter" data-id="${k}">${l}</button>`).join('')}</div>`,
  render() {
    const today = todayStr(); const f = S.ui.memFilter || 'all';
    let members = st().clients.filter((c) => c.membershipId).map((c) => ({ c, plan: planById(c.membershipId), stats: clientStats(c.id) }));
    const risk = (m) => m.c.memberStatus === 'past_due' || !m.stats.last || diffDays(m.stats.last, today) > 45;
    if (f === 'active') members = members.filter((m) => m.c.memberStatus === 'active'); else if (f === 'past_due') members = members.filter((m) => m.c.memberStatus === 'past_due'); else if (f === 'risk') members = members.filter(risk);
    members.sort(by((m) => (m.c.memberStatus === 'past_due' ? '0' : '1') + m.c.last));
    const month = today.slice(0, 7);
    return `<div class="col" style="gap:16px"><div class="auto-grid">${st().plans.map((p) => { const ms = st().clients.filter((c) => c.membershipId === p.id); return `<div class="card pad"><div class="row between"><div><div class="eyebrow">Plan</div><div class="strong" style="font-size:18px">${esc(p.name)}</div></div><div class="strong" style="font-size:22px">${money(p.price, { whole: true })}<span class="small muted">/mo</span></div></div><ul class="small muted" style="margin:10px 0;padding-left:18px;line-height:1.7">${p.perks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><div class="row between small"><span>${ms.length} members · ${ms.filter((c) => c.memberStatus === 'active').length} active</span><span class="num strong">${money(ms.filter((c) => c.memberStatus === 'active').length * p.price, { whole: true })}/mo</span></div></div>`; }).join('')}<div class="card pad"><div class="eyebrow">Why it matters</div><div class="strong" style="font-size:18px">Members rebook on autopilot</div><p class="small muted" style="margin-top:6px">Recurring revenue you can count on the 1st of the month, before anyone walks in. Every member card keeps a visit credit, a retail discount and a card on file — checkout for members is one tap.</p></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Plan</th><th>Since</th><th>Status</th><th>Last visit</th><th>This month</th><th class="r">Lifetime</th><th></th></tr></thead><tbody>${members.map(({ c, plan, stats }) => { const used = st().tickets.some((t) => t.clientId === c.id && t.date.slice(0, 7) === month && t.lines.some((l) => l.note && l.note.includes('visit'))); return `<tr class="click" data-act="open-client" data-id="${c.id}"><td><div class="row">${avatar(c, 'sm')}<span class="strong">${esc(fullName(c))}</span></div></td><td>${esc(plan.name)}</td><td class="small muted">${fmtDate(c.memberSince, 'short')} ${c.memberSince.slice(0, 4)}</td><td>${c.memberStatus === 'active' ? '<span class="badge good">Active</span>' : '<span class="badge bad">Past due</span>'}</td><td class="small ${stats.last && diffDays(stats.last, today) > 45 ? 'warn-ink' : 'muted'}" style="${stats.last && diffDays(stats.last, today) > 45 ? 'color:var(--warn-ink)' : ''}">${stats.last ? relDate(stats.last) : 'Never'}</td><td class="small">${used ? '<span class="badge">Visit used</span>' : '<span class="badge accent">Visit available</span>'}</td><td class="r num">${money(stats.spend, { whole: true })}</td><td class="r">${c.memberStatus === 'past_due' ? `<button class="btn sm primary" data-act="member-retry-row" data-id="${c.id}">Retry card</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">No members match.</td></tr>'}</tbody></table></div></div>`;
  },
};
Object.assign(Actions, {
  'mem-filter': (el) => { S.ui.memFilter = el.dataset.id; rerenderContent(); },
  'member-retry-row': (el, ev) => { ev.stopPropagation(); const c = clientById(el.dataset.id); c.memberStatus = 'active'; c.seeded = false; commit(); rerenderContent(); toast(`${c.first}'s card went through (simulated)`); },
});
