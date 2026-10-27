/* ===== Reports ===== */
const RANGES = { today: ['Today', 1], '7d': ['7 days', 7], '30d': ['30 days', 30], '90d': ['90 days', 90] };
function rangeDates(key) { const n = RANGES[key][1]; const end = todayStr(); const start = addDays(end, -(n - 1)); return { start, end, prevStart: addDays(start, -n), prevEnd: addDays(start, -1), n }; }
// a gift card is money held for the client, not revenue yet: it counts when it's spent, not when it's sold
const giftSold = (t) => sum(t.lines.filter((l) => l.type === 'gift'), (l) => l.price * l.qty);
const earned = (t) => Math.max(0, t.total - t.tip - giftSold(t));
function periodStats(start, end) {
  const tix = st().tickets.filter((t) => t.date >= start && t.date <= end);
  const appts = st().appointments.filter((a) => a.date >= start && a.date <= end);
  const done = appts.filter((a) => a.status === 'completed'); const noshow = appts.filter((a) => a.status === 'noshow');
  const refundList = st().refunds.filter((r) => r.date >= start && r.date <= end); const refunds = sum(refundList, (r) => r.amount - (r.tipRefunded || 0) - sum((r.lines || []).filter((l) => l.type === 'gift'), (l) => l.amount));
  const revenue = sum(tix, earned) - refunds; const tips = sum(tix, (t) => t.tip) - sum(refundList, (r) => r.tipRefunded || 0);
  const svcRev = sum(tix, (t) => sum(t.lines.filter((l) => l.type === 'service'), (l) => l.price * l.qty));
  const retailRev = sum(tix, (t) => sum(t.lines.filter((l) => l.type === 'product'), (l) => l.price * l.qty));
  const withRetail = tix.filter((t) => t.lines.some((l) => l.type === 'product')).length;
  // rebook: completed visits whose client has a later appointment on the books
  const rebooked = done.filter((a) => st().appointments.some((b) => b.clientId === a.clientId && b.id !== a.id && b.status !== 'cancelled' && (b.date > a.date))).length;
  const newClients = st().clients.filter((c) => c.createdAt >= start && c.createdAt <= end).length;
  const online = appts.filter((a) => a.source === 'online').length;
  return { revenue, tips, refunds, refundCount: refundList.length, svcRev, retailRev, tickets: tix.length, avg: tix.length ? revenue / tix.length : 0, done: done.length, noshowRate: appts.length ? noshow.length / (done.length + noshow.length || 1) : 0, rebookRate: done.length ? rebooked / done.length : 0, retailAttach: tix.length ? withRetail / tix.length : 0, newClients, onlineShare: appts.length ? online / appts.length : 0, tix, appts };
}
function delta(cur, prev, { pct: asPct = true, upGood = true, fmt = (v) => v } = {}) {
  if (delta.off) return '<span class="delta flat">prior period outside demo history</span>';
  if (!prev && !cur) return '<span class="delta flat">—</span>';
  if (!prev) return `<span class="delta flat">new</span>`;
  const d = asPct ? (cur - prev) / Math.abs(prev) : cur - prev; const up = d > 0.001, down = d < -0.001;
  const cls = !up && !down ? 'flat' : (up === upGood) ? 'up' : 'down';
  const txt = asPct ? `${d > 0 ? '+' : ''}${Math.round(d * 100)}%` : `${d > 0 ? '+' : ''}${fmt(d)}`;
  return `<span class="delta ${cls}">${txt} <span class="faint">vs prior</span></span>`;
}
function sparkline(values) {
  if (values.length < 2) return ''; const w = 100, hgt = 28, max = Math.max(...values, 1);
  const pts = values.map((v, i) => [i / (values.length - 1) * w, hgt - 2 - (v / max) * (hgt - 4)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L100 28 L0 28 Z" fill="var(--accent)" opacity="0.1"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="var(--accent)" stroke="var(--surface-2)" stroke-width="1.5"/></svg>`;
}
Views.reports = {
  title: () => 'Reports',
  sub: () => { const r = rangeDates(S.ui.reportRange); return r.n === 1 ? fmtDate(r.end, 'long') : `${fmtDate(r.start)} – ${fmtDate(r.end)} · compared with the ${r.n} days before`; },
  actions: () => `<div class="seg">${Object.entries(RANGES).map(([k, [l]]) => `<button class="btn ${S.ui.reportRange === k ? 'on' : ''}" data-act="report-range" data-id="${k}">${l}</button>`).join('')}</div>`,
  render() {
    const r = rangeDates(S.ui.reportRange); const cur = periodStats(r.start, r.end); const prev = periodStats(r.prevStart, r.prevEnd); const hasPrior = diffDays(r.prevStart, todayStr()) <= HISTORY_DAYS;
    const days = Array.from({ length: r.n }, (_, i) => addDays(r.start, i));
    const byDay = days.map((d) => sum(cur.tix.filter((t) => t.date === d), earned));
    const sparkVals = r.n === 1 ? Array.from({ length: 12 }, (_, i) => sum(st().tickets.filter((t) => t.date === addDays(r.end, i - 11)), earned)) : (r.n <= 12 ? byDay : Array.from({ length: 12 }, (_, i) => { const a = Math.floor(i * r.n / 12), b = Math.floor((i + 1) * r.n / 12); return sum(byDay.slice(a, b)); }));
    delta.off = !hasPrior;
    const tiles = `<div class="report-grid">
      <div class="stat span-4"><div class="label">Net revenue (before tips, after refunds)</div><div class="value">${money(cur.revenue, { whole: true })}</div>${delta(cur.revenue, prev.revenue)}${sparkline(sparkVals)}</div>
      <div class="stat span-4"><div class="label">Tickets closed</div><div class="value">${cur.tickets}</div>${delta(cur.tickets, prev.tickets)}</div>
      <div class="stat span-4"><div class="label">Average ticket</div><div class="value">${money(cur.avg, { whole: true })}</div>${delta(cur.avg, prev.avg)}</div>
      <div class="stat span-3"><div class="label">Tips</div><div class="value">${money(cur.tips, { whole: true })}</div>${delta(cur.tips, prev.tips)}</div>
      <div class="stat span-3"><div class="label">Rebook rate</div><div class="value">${pct(cur.rebookRate)}</div>${delta(cur.rebookRate, prev.rebookRate, { pct: false, fmt: (v) => Math.round(v * 100) + ' pts' })}</div>
      <div class="stat span-3"><div class="label">No-show rate</div><div class="value">${pct(cur.noshowRate, 1)}</div>${delta(cur.noshowRate, prev.noshowRate, { pct: false, upGood: false, fmt: (v) => (v * 100).toFixed(1) + ' pts' })}</div>
      <div class="stat span-3"><div class="label">Retail attach</div><div class="value">${pct(cur.retailAttach)}</div>${delta(cur.retailAttach, prev.retailAttach, { pct: false, fmt: (v) => Math.round(v * 100) + ' pts' })}</div>
      <div class="stat span-3"><div class="label">Refunds</div><div class="value">${money(cur.refunds, { whole: true })}</div><div class="delta ${cur.refunds > prev.refunds && prev.refunds ? 'down' : 'flat'}">${cur.refundCount} refund${cur.refundCount === 1 ? '' : 's'} · ${cur.revenue + cur.refunds ? pct(cur.refunds / (cur.revenue + cur.refunds), 1) : '0%'} of gross</div></div>
    </div>`;
    const catRev = CAT_ORDER.map((k) => ({ k, v: sum(cur.tix, (t) => sum(t.lines.filter((l) => l.type === 'service' && svcById(l.refId)?.cat === k), (l) => l.price * l.qty)) }));
    const retailV = cur.retailRev; const catMax = Math.max(...catRev.map((c) => c.v), retailV, 1);
    const staffRows = bookableStaff().map((s) => { const booked = sum(cur.appts.filter((a) => a.staffId === s.id && !['cancelled', 'noshow'].includes(a.status)), (a) => a.dur); const avail = days.reduce((n, d) => { const h = s.days[dow(d)]; return n + (h ? h[1] - h[0] : 0); }, 0); const rev = sum(cur.tix.filter((t) => t.staffId === s.id), earned); const tips = sum(cur.tix.filter((t) => t.staffId === s.id), (t) => t.tip); return { s, util: avail ? booked / avail : 0, rev, tips, n: cur.tix.filter((t) => t.staffId === s.id).length }; });
    const svcCounts = {}; for (const t of cur.tix) for (const l of t.lines) if (l.type === 'service') { const o = (svcCounts[l.refId] ||= { n: 0, rev: 0 }); o.n += l.qty; o.rev += l.price * l.qty; }
    const topSvc = Object.entries(svcCounts).map(([id, o]) => ({ s: svcById(id), ...o })).filter((x) => x.s).sort((a, b) => b.rev - a.rev).slice(0, 8);
    const hours = Array.from({ length: 11 }, (_, i) => 480 + i * 60); const dows = [1, 2, 3, 4, 5, 6];
    const heat = dows.map((wd) => hours.map((h) => cur.appts.filter((a) => dow(a.date) === wd && a.start >= h && a.start < h + 60 && a.status !== 'cancelled').length));
    const heatMax = Math.max(1, ...heat.flat());
    const charts = `<div class="report-grid" style="margin-top:12px">
      <div class="card pad span-8"><div class="card-head"><h3>${r.n === 1 ? 'Revenue by hour' : 'Revenue by day'}</h3><span class="small muted">before tips · hover for detail</span></div><div data-chart="revenue" style="min-height:220px"></div></div>
      <div class="card pad span-4"><div class="card-head"><h3>Revenue by category</h3></div>${catRev.map(({ k, v }) => `<div class="hbar"><span class="row" style="gap:6px">${catDot(k)}${CATEGORIES[k].label}</span><div class="track"><div class="fill" style="width:${(v / catMax * 100).toFixed(1)}%;background:${CATEGORIES[k].color}"></div></div><span class="v">${money(v, { whole: true })}</span></div>`).join('')}<div class="hbar"><span class="row" style="gap:6px"><i class="cat-dot" style="background:var(--ink-3)"></i>Retail</span><div class="track"><div class="fill" style="width:${(retailV / catMax * 100).toFixed(1)}%;background:var(--ink-3)"></div></div><span class="v">${money(retailV, { whole: true })}</span></div><div class="tiny faint" style="margin-top:8px">Services ${money(cur.svcRev, { whole: true })} · retail ${money(cur.retailRev, { whole: true })}</div></div>
      <div class="card pad span-6"><div class="card-head"><h3>Team</h3><span class="small muted">utilization = booked ÷ scheduled hours</span></div>${staffRows.map(({ s, util, rev, tips, n }) => `<div class="hbar" style="grid-template-columns:110px 1fr 150px"><span class="row" style="gap:6px"><span class="avatar sm" style="background:${s.color};width:20px;height:20px;font-size:9px">${initials(s.name)}</span>${esc(s.name.split(' ')[0])}</span><div class="track"><div class="fill" style="width:${(util * 100).toFixed(0)}%"></div></div><span class="v">${pct(util)} · ${money(rev, { whole: true })}<span class="faint"> · ${n} tix</span></span></div>`).join('')}</div>
      <div class="card pad span-6"><div class="card-head"><h3>Busiest hours</h3><span class="small muted">appointments started · Mon–Sat</span></div>${heat.map((row, i) => `<div class="row" style="gap:6px;margin-bottom:3px"><span class="tiny faint" style="width:28px">${DOW[dows[i]]}</span><div class="heat grow">${row.map((v, j) => `<div class="cell" style="--v:${(v / heatMax).toFixed(2)}" data-tip="${DOW[dows[i]]} ${fmtTime(hours[j])}: ${v} appointment${v === 1 ? '' : 's'}"></div>`).join('')}</div></div>`).join('')}<div class="row" style="gap:6px"><span style="width:28px"></span><div class="heat-labels grow">${hours.map((h) => `<span>${fmtTime(h).replace('am', 'a').replace('pm', 'p')}</span>`).join('')}</div></div></div>
      <div class="card pad span-6"><div class="card-head"><h3>Top services</h3></div><div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>Service</th><th class="r">Booked</th><th class="r">Revenue</th><th class="r">Avg</th></tr></thead><tbody>${topSvc.map((x) => `<tr><td>${catDot(x.s.cat, 'display:inline-block;vertical-align:middle;margin-right:8px')}${esc(x.s.name)}</td><td class="r">${x.n}</td><td class="r">${money(x.rev, { whole: true })}</td><td class="r">${money(x.n ? x.rev / x.n : 0, { whole: true })}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No tickets in range.</td></tr>'}</tbody></table></div></div>
      <div class="card pad span-6"><div class="card-head"><h3>Clients</h3></div><div class="grid-2" style="gap:8px"><div class="stat"><div class="label">New clients</div><div class="value">${cur.newClients}</div>${delta(cur.newClients, prev.newClients)}</div><div class="stat"><div class="label">Booked online</div><div class="value">${pct(cur.onlineShare)}</div>${delta(cur.onlineShare, prev.onlineShare, { pct: false, fmt: (v) => Math.round(v * 100) + ' pts' })}</div><div class="stat"><div class="label">Members</div><div class="value">${st().clients.filter((c) => c.membershipId && c.memberStatus === 'active').length}</div><div class="delta flat">${money(sum(st().clients.filter((c) => c.membershipId && c.memberStatus === 'active'), (c) => planById(c.membershipId).price), { whole: true })}/mo recurring</div></div><div class="stat"><div class="label">Due for rebook</div><div class="value">${st().clients.filter((c) => { const s = clientStats(c.id); return s.last && !s.next && diffDays(s.last, todayStr()) >= 28; }).length}</div><div class="delta flat">no future appointment</div></div></div></div>
    </div>`;
    return tiles + charts;
  },
  mount(root) {
    const draw = () => { const el = $('[data-chart="revenue"]', root); if (!el) return; const r = rangeDates(S.ui.reportRange); const cur = periodStats(r.start, r.end); let labels, values, tips;
      if (r.n === 1) { const hours = Array.from({ length: 12 }, (_, i) => 480 + i * 60); values = hours.map((h) => sum(cur.tix.filter((t) => { const m = new Date(t.closedAt); return m.getHours() * 60 >= h && m.getHours() * 60 < h + 60; }), earned)); labels = hours.map((h) => fmtTime(h)); tips = hours.map((h, i) => `${fmtTime(h)}–${fmtTime(h + 60)}: ${money(values[i])}`); }
      else { const days = Array.from({ length: r.n }, (_, i) => addDays(r.start, i)); values = days.map((d) => sum(cur.tix.filter((t) => t.date === d), earned)); labels = days.map((d) => r.n <= 7 ? fmtDate(d, 'dow') : r.n <= 31 ? String(fromDateStr(d).getDate()) : fmtDate(d, 'short')); tips = days.map((d, i) => `${fmtDate(d, 'dow')}: ${money(values[i])} · ${cur.tix.filter((t) => t.date === d).length} tickets`); }
      el.innerHTML = barChart({ values, labels, tips, width: el.clientWidth || 600, height: 220, labelEvery: r.n > 31 ? 15 : r.n > 14 ? 5 : 1 }); };
    draw();
    if (window.ResizeObserver) { const ro = new ResizeObserver(debounce(draw, 120)); const el = $('[data-chart="revenue"]', root); if (el) ro.observe(el); }
  },
};
function barChart({ values, labels, tips, width, height, labelEvery = 1 }) {
  const padL = 44, padR = 8, padT = 18, padB = 26; const W = Math.max(280, width), H = height;
  const n = values.length; const max = Math.max(...values, 1); const niceMax = niceCeil(max); const plotW = W - padL - padR, plotH = H - padT - padB;
  const band = plotW / n; const bw = Math.min(24, band * 0.62); const y = (v) => padT + plotH - (v / niceMax) * plotH;
  const ticks = [0, niceMax / 2, niceMax];
  const maxI = values.indexOf(Math.max(...values));
  let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue chart">`;
  s += `<g class="grid">${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join('')}</g>`;
  s += ticks.map((t) => `<text x="${padL - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${t >= 1000 ? compact(t) : Math.round(t)}</text>`).join('');
  values.forEach((v, i) => { const x = padL + band * i + (band - bw) / 2; const top = y(v); const h = Math.max(0, padT + plotH - top); const r = Math.min(4, h); const path = h > 0 ? `M${x} ${padT + plotH} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + bw - r} Q${x + bw} ${top} ${x + bw} ${top + r} V${padT + plotH} Z` : '';
    s += `<rect x="${(padL + band * i).toFixed(1)}" y="${padT}" width="${band.toFixed(1)}" height="${plotH}" fill="transparent" data-tip="${esc(tips[i])}"/>`;
    if (path) s += `<path class="bar" d="${path}" fill="var(--accent)" data-tip="${esc(tips[i])}"/>`;
    if (i === maxI && v > 0) s += `<text class="lbl" x="${(x + bw / 2).toFixed(1)}" y="${(top - 5).toFixed(1)}" text-anchor="middle">${money(v, { whole: true })}</text>`;
    if (i % labelEvery === 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`; });
  s += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}"/></svg>`;
  return s;
}
function niceCeil(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 8 ? 8 : 10; return n * p; }
/* tooltips for anything with data-tip */
(function () {
  const root = document.getElementById('tip-root'); let tip = null;
  document.addEventListener('pointermove', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (!el) { if (tip) { tip.remove(); tip = null; } return; } if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; root.appendChild(tip); } tip.textContent = el.dataset.tip; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; });
  document.addEventListener('pointerleave', () => { if (tip) { tip.remove(); tip = null; } });
})();
Object.assign(Actions, { 'report-range': (el) => { S.ui.reportRange = el.dataset.id; rerenderContent(); } });
