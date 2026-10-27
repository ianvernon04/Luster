/* ===== Checkout ===== */
function newTicket({ appointmentId = null, clientId }) {
  const a = appointmentId ? apptById(appointmentId) : null; const c = clientById(clientId);
  const plan = c.membershipId && c.memberStatus === 'active' ? planById(c.membershipId) : null;
  const month = todayStr().slice(0, 7);
  const usedVisit = plan ? st().tickets.some((t) => t.clientId === c.id && t.date.slice(0, 7) === month && t.lines.some((l) => l.note && l.note.includes('visit'))) : true;
  let visitApplied = false;
  const lines = (a ? a.items : []).map((it) => {
    const s = svcById(it.serviceId); let price = it.price, note = '';
    if (plan && !visitApplied && plan.includes.includes(s.id) && !usedVisit) { price = 0; note = `${plan.name} visit`; visitApplied = true; }
    else if (plan && s.addon) { price = Math.min(price, 15); note = 'Member add-on'; }
    return { id: uid('l'), type: 'service', refId: s.id, name: s.name, price, listPrice: it.price, qty: 1, staffId: a.staffId, note };
  });
  return { appointmentId, clientId, staffId: a ? a.staffId : st().staff[0].id, lines, discount: { type: 'none', value: 0 }, tipPct: null, tip: 0, payments: [], plan };
}
function ticketTotals(t) {
  const svc = sum(t.lines.filter((l) => l.type === 'service'), (l) => l.price * l.qty);
  const retail = sum(t.lines.filter((l) => l.type === 'product' || l.type === 'gift'), (l) => l.price * l.qty);
  const taxable = sum(t.lines.filter((l) => l.type === 'product'), (l) => l.price * l.qty);
  const r2 = (n) => Math.round(n * 100) / 100;
  const disc = t.discount.type === 'pct' ? r2((svc + retail) * t.discount.value / 100) : t.discount.type === 'amt' ? Math.min(t.discount.value, svc + retail) : 0;
  const tax = r2(taxable * st().business.taxRate);
  const tipBase = Math.max(svc, sum(t.lines.filter((l) => l.type === 'service'), (l) => (l.listPrice || l.price) * l.qty));
  const tip = t.tipPct !== null ? r2(tipBase * t.tipPct / 100) : r2(t.tip || 0);
  const paid = sum(t.payments, (p) => p.amount);
  const total = r2(svc + retail - disc + tax + tip);
  return { svc, retail, disc, tax, tip, tipBase, total, paid, due: r2(total - paid) };
}
function openTicketsHtml() {
  const today = todayStr();
  const open = apptsOn(today).filter((a) => !['completed', 'cancelled', 'noshow'].includes(a.status)).sort(by((a) => (a.status === 'inservice' ? 0 : a.status === 'checkedin' ? 1 : 2) + '' + pad2(Math.floor(a.start / 60)) + pad2(a.start % 60)));
  const closed = st().tickets.filter((t) => t.date === today).sort(by((t) => t.closedAt)).reverse();
  return `<div class="col" style="gap:20px">
    <div><div class="card-head"><h3>Ready to check out</h3><span class="small muted">${open.length} on today's book</span></div>${open.length ? `<div class="open-appts">${open.map((a) => { const c = clientById(a.clientId); return `<button class="open-appt" data-act="checkout-appt" data-id="${a.id}">${avatar(c)}<div class="grow" style="min-width:0;text-align:left"><div class="strong ellipsis">${esc(fullName(c))}</div><div class="small muted ellipsis">${fmtTime(a.start)} · ${esc(apptTitle(a))}</div><div style="margin-top:4px">${statusBadge(a.status)}</div></div><span class="num strong">${money(sum(a.items, (i) => i.price), { whole: true })}</span></button>`; }).join('')}</div>` : '<div class="empty">Everyone is checked out. Nice.</div>'}</div>
    <div class="grid-2"><div class="card pad"><h3 style="margin-bottom:8px">Walk-in or retail only</h3><div class="search">${I.search}<input id="co-q" placeholder="Find a client…" data-on-input="co-q" autocomplete="off"></div><div class="list" id="co-results" style="margin-top:6px"></div><div class="row wrap" style="margin-top:6px;gap:6px"><button class="btn sm ghost" data-act="new-client">${I.plus}New client</button><button class="btn sm ghost" data-act="gift-lookup">${I.search}Gift card balance</button></div></div>
    <div class="card pad"><h3 style="margin-bottom:8px">Closed today</h3>${closed.length ? `<div class="list">${closed.slice(0, 8).map((t) => `<div class="list-row click" data-act="open-ticket" data-id="${t.id}"><div class="grow"><div class="strong">${esc(fullName(clientById(t.clientId)))}</div><div class="small muted ellipsis">${t.lines.map((l) => esc(l.name)).join(', ')}</div></div><div class="col" style="align-items:flex-end;gap:0"><span class="num strong">${money(t.total)}</span><span class="tiny faint">${PAY_LABEL[t.payments[0]?.method] || ''}${t.tip ? ` · tip ${money(t.tip, { whole: true })}` : ''}</span>${t.refunded ? `<span class="badge bad" style="margin-top:2px">Refunded ${money(t.refunded)}</span>` : ''}${t.giftShort ? `<span class="badge bad" style="margin-top:2px">Still owed ${money(t.giftShort)}</span>` : ''}</div></div>`).join('')}</div><div class="row between small" style="padding-top:10px;border-top:1px solid var(--line-2);margin-top:6px"><span class="muted">Today so far</span><span class="num strong">${money(sum(closed, (t) => t.total))} · ${closed.length} tickets</span></div>${(() => { const rs = st().refunds.filter((r) => r.date === today); return rs.length ? `<div class="row between small"><span class="muted">Refunds today</span><span class="num" style="color:var(--bad-ink)">−${money(sum(rs, (r) => r.amount))} · ${rs.length}</span></div>` : ''; })()}<div class="row" style="margin-top:8px"><button class="btn sm" data-act="refunds-list">All refunds</button></div>` : '<div class="small muted">No tickets closed yet today.</div>'}</div></div></div>`;
}
Views.checkout = {
  title: () => S.ui.ticket ? `Checkout · ${fullName(clientById(S.ui.ticket.clientId))}` : 'Checkout',
  sub: () => S.ui.ticket ? (S.ui.ticket.appointmentId ? `${apptTitle(apptById(S.ui.ticket.appointmentId))} with ${staffById(S.ui.ticket.staffId).name.split(' ')[0]}` : 'Walk-in ticket') : isLive() ? 'Tap a client to start a ticket. Cards run on your own terminal; Luster records the payment.' : 'Tap a client to start a ticket. Payments are simulated in this demo.',
  actions: () => S.ui.ticket ? `<button class="btn" data-act="ticket-park">Park ticket</button><button class="btn danger" data-act="ticket-void">Void</button>` : '',
  render() { return S.ui.ticket ? checkoutHtml(S.ui.ticket) : openTicketsHtml(); },
  mount(root) { const q = $('#co-q', root); if (q) { const r = $('#co-results', root); r.innerHTML = ''; } },
};
function checkoutHtml(t) {
  const c = clientById(t.clientId); const tot = ticketTotals(t); const grouped = groupBy(st().services.filter((s) => !s.internal), (s) => s.cat);
  const tab = S.ui.coTab || 'services';
  const catalog = tab === 'services' ? CAT_ORDER.map((k) => `<div class="svc-group"><h3>${CATEGORIES[k].label}</h3><div class="catalog-grid">${(grouped[k] || []).map((s) => `<button class="cat-item" data-act="ticket-add" data-type="service" data-id="${s.id}"><b class="ellipsis">${esc(s.name)}</b><span>${fmtDur(s.dur)} · ${money(s.price, { whole: true })}${t.plan && t.plan.includes.includes(s.id) ? ' · member' : ''}</span></button>`).join('')}</div></div>`).join('')
    : tab === 'retail' ? `<div class="catalog-grid">${st().products.map((p) => `<button class="cat-item" data-act="ticket-add" data-type="product" data-id="${p.id}"><b class="ellipsis">${esc(p.name)}</b><span>${money(p.price, { whole: true })}${t.plan ? ` · member ${money(p.price * (1 - t.plan.retailDiscount), { whole: true })}` : ''} · ${p.stock} in stock${p.stock <= 3 ? ' · low' : ''}</span></button>`).join('')}</div>`
    : `<div class="catalog-grid">${[25, 50, 75, 100, 150, 200].map((v) => `<button class="cat-item" data-act="ticket-add" data-type="gift" data-id="${v}"><b>Gift card ${money(v, { whole: true })}</b><span>Code on the receipt</span></button>`).join('')}<button class="cat-item" data-act="gift-other"><b>Other amount</b><span>$5 to $2,000</span></button></div><div class="small muted" style="margin-top:10px">Each card gets its own code when the ticket closes${isLive() ? ', and works on every iPad in the studio' : ''}.</div>`;
  return `<div class="checkout">
    <div class="catalog"><div class="row wrap"><div class="seg"><button class="btn ${tab === 'services' ? 'on' : ''}" data-act="co-tab" data-id="services">Services</button><button class="btn ${tab === 'retail' ? 'on' : ''}" data-act="co-tab" data-id="retail">Retail</button><button class="btn ${tab === 'gift' ? 'on' : ''}" data-act="co-tab" data-id="gift">Gift cards</button></div></div>${catalog}</div>
    <div class="ticket card pad">
      <div class="row" style="gap:10px;cursor:pointer" data-act="open-client" data-id="${c.id}">${avatar(c)}<div class="grow"><div class="strong">${esc(fullName(c))}</div><div class="small muted">${t.plan ? `${esc(t.plan.name)} member` : `${clientStats(c.id).visits} visits`}${c.cardOnFile ? ` · ${esc(c.cardOnFile.brand)} •••• ${c.cardOnFile.last4}` : ''}</div></div></div>
      ${clientFlags(c).some((f) => f.k === 'allergy') ? `<div class="alert warn" style="margin-top:8px">${I.warn}<div>Allergy: ${esc(c.allergies.join(', '))} — check retail ingredients.</div></div>` : ''}
      <div class="ticket-lines" style="margin-top:10px">${t.lines.length ? t.lines.map((l) => `<div class="ticket-line"><div class="grow"><div class="nm">${esc(l.name)}${l.qty > 1 ? ` × ${l.qty}` : ''}</div><div class="mt">${l.note ? esc(l.note) + ' · ' : ''}${l.type === 'service' ? esc(staffById(l.staffId)?.name.split(' ')[0] || '') : l.type === 'product' ? 'Retail' : 'Gift card'}${l.listPrice && l.listPrice !== l.price ? ` · <s>${money(l.listPrice, { whole: true })}</s>` : ''}</div></div><div class="row"><span class="amt num">${money(l.price * l.qty)}</span><button class="rm" data-act="ticket-rm" data-id="${l.id}" aria-label="Remove">${I.x}</button></div></div>`).join('') : '<div class="small muted" style="padding:10px 0">Empty ticket — add services or retail from the left.</div>'}</div>
      <div class="field" style="margin-top:12px"><label>Discount</label><div class="row wrap" style="gap:6px">${[['none', 'None'], ['pct10', '10%'], ['pct20', '20%'], ['amt10', '$10 off'], ['amt25', '$25 off']].map(([k, l]) => `<button class="chip ${discKey(t) === k ? 'on' : ''}" data-act="ticket-disc" data-k="${k}">${l}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:10px"><label>Tip <span class="faint">· on ${money(tot.tipBase, { whole: true })} of services</span></label><div class="tips">${[[0, 'No tip'], [18, '18%'], [20, '20%'], [25, '25%']].map(([p, l]) => `<button class="btn ${t.tipPct === p ? 'on' : ''}" data-act="ticket-tip" data-p="${p}">${l}${p ? `<span class="tiny faint" style="margin-left:4px">${money(tot.tipBase * p / 100, { whole: true })}</span>` : ''}</button>`).join('')}</div><div class="row" style="margin-top:6px"><input class="input" type="number" min="0" step="1" inputmode="decimal" placeholder="Custom tip $" id="tip-custom" style="max-width:160px" value="${t.tipPct === null && t.tip ? t.tip : ''}" data-on-change="tip-custom"><span class="tiny faint">Tips go 100% to ${esc(staffById(t.staffId).name.split(' ')[0])}</span></div></div>
      <div class="totals"><div class="tr"><span class="muted">Services</span><span class="num">${money(tot.svc)}</span></div>${tot.retail ? `<div class="tr"><span class="muted">Retail &amp; gift cards</span><span class="num">${money(tot.retail)}</span></div>` : ''}${tot.disc ? `<div class="tr"><span class="muted">Discount</span><span class="num">−${money(tot.disc)}</span></div>` : ''}${tot.tax ? `<div class="tr"><span class="muted">Tax (retail ${pct(st().business.taxRate, 2)})</span><span class="num">${money(tot.tax)}</span></div>` : ''}${tot.tip ? `<div class="tr"><span class="muted">Tip</span><span class="num">${money(tot.tip)}</span></div>` : ''}${tot.paid ? `<div class="tr"><span class="muted">Paid so far</span><span class="num">−${money(tot.paid)}</span></div>` : ''}<div class="tr big"><span>${tot.paid ? 'Remaining' : 'Total'}</span><span class="num">${money(tot.due)}</span></div></div>
      <div class="pay-methods" style="margin-top:12px"><button class="pay-method" data-act="pay" data-m="card" ${tot.due <= 0 && t.lines.length ? '' : tot.due <= 0 ? 'disabled' : ''}>${isLive() ? '<b>Card</b><span>Run it on your terminal</span>' : '<b>Tap card</b><span>Reader · Apple Pay · chip</span>'}</button>${isLive() ? '' : `<button class="pay-method" data-act="pay" data-m="card_on_file" ${c.cardOnFile ? '' : 'disabled'}><b>Card on file</b><span>${c.cardOnFile ? `${esc(c.cardOnFile.brand)} •••• ${c.cardOnFile.last4}` : 'None saved'}</span></button>`}<button class="pay-method" data-act="pay" data-m="cash"><b>Cash</b><span>Counts change for you</span></button><button class="pay-method" data-act="pay" data-m="gift"><b>Gift card</b><span>Scan or type code</span></button>${c.storeCredit > 0 ? `<button class="pay-method" data-act="pay" data-m="credit" style="grid-column:1/-1"><b>Store credit · ${money(c.storeCredit)}</b><span>From a previous refund — applies up to the balance</span></button>` : ''}</div>
      ${tot.due <= 0 && t.lines.length ? `<button class="btn primary lg block" style="margin-top:10px" data-act="ticket-close">Complete · ${money(tot.total)}</button>` : `<div class="tiny faint" style="margin-top:10px;text-align:center">Pick a payment to finish. Split by paying part with one method, then the rest with another.</div>`}
    </div></div>`;
}
function discKey(t) { return t.discount.type === 'none' ? 'none' : t.discount.type === 'pct' ? 'pct' + t.discount.value : 'amt' + t.discount.value; }
function startTicket(opts) { S.ui.ticket = newTicket(opts); S.ui.coTab = 'services'; closeDrawer(); App.go('checkout'); }

Modals.terminal = ({ amount }) => ({ title: 'Card reader', body: `<div class="terminal"><div class="card-anim"></div><div class="strong" style="font-size:22px">${money(amount)}</div><div class="muted" id="terminal-msg">Tap, insert or swipe…</div><div class="tiny faint">Demo: this approves itself in a moment. In production this is your Stripe or Square reader.</div></div>`, foot: `<button class="btn" data-act="close-modal">Cancel</button>`, mount() { setTimeout(() => { const m = $('#terminal-msg'); if (!m) return; m.textContent = 'Approved · Visa •••• 4242'; m.style.color = 'var(--good-ink)'; setTimeout(() => { if (!S.ui.ticket) return; addPayment('card', amount, '4242'); }, 650); }, 1500); } });
Modals.cash = ({ amount }) => ({ title: 'Cash', body: `<div class="strong" style="font-size:22px">Due ${money(amount)}</div><div class="field"><label for="cash-tendered">Tendered</label><input class="input" type="number" step="0.01" inputmode="decimal" id="cash-tendered" value="${amount.toFixed(2)}" data-on-input="cash-tendered" data-due="${amount}"></div><div class="row wrap">${[amount, 20, 40, 50, 100].filter((v, i, a) => v >= amount && a.indexOf(v) === i).map((v) => `<button class="chip" data-act="cash-quick" data-v="${v}">${money(v, { whole: v !== amount })}</button>`).join('')}</div><div class="strong" id="cash-change">Change due: ${money(0)}</div>`, foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="cash-done" data-amount="${amount}">Record cash</button>` });
Modals.gift = ({ amount }) => ({ title: 'Gift card', body: `<div class="field"><label for="gift-code">Code</label><input class="input" id="gift-code" placeholder="ABCD-2345" value="${isLive() ? '' : 'GLOW-2048'}" autocapitalize="characters" autocomplete="off" spellcheck="false"></div>${isLive() ? '<div class="small muted">Checked with the cloud first, so a card sold on another iPad works here too.</div>' : `<div class="small muted">Demo cards: ${st().giftCards.filter((g) => giftBalance(g) > 0).slice(0, 4).map((g) => `<b>${esc(g.code)}</b> (${money(giftBalance(g), { whole: giftBalance(g) % 1 === 0 })})`).join(' · ') || 'none left'}</div>`}`, foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="gift-apply" data-amount="${amount}">Apply</button>`, mount(root) { const i = $('#gift-code', root); if (i && !i.value) setTimeout(() => i.focus(), 30); } });
// a gift card that came up short after the sale closed (another iPad spent it first): the rest is taken another way
Modals.shortPay = ({ id }) => { const t = st().tickets.find((x) => x.id === id); const c = t && clientById(t.clientId); if (!t) return { title: 'Ticket', body: '<p class="muted">Not found.</p>', foot: '<button class="btn" data-act="close-modal">Close</button>' };
  return { title: `Collect ${money(t.giftShort)}${c ? ` from ${esc(c.first)}` : ''}`, body: `<p>The gift card on this ticket had already been spent on another iPad, so ${money(t.giftShort)} is still owed. Take it another way and record it here.</p>${isLive() ? '<div class="small muted">Run a card on your terminal first: Luster records it, it doesn\'t charge it.</div>' : ''}`,
    foot: `<button class="btn" data-act="close-modal">Not now</button><button class="btn" data-act="short-paid" data-id="${t.id}" data-m="cash">Paid in cash</button><button class="btn primary" data-act="short-paid" data-id="${t.id}" data-m="card">Paid by card</button>` }; };
Modals.giftAmount = () => ({ title: 'Gift card amount', body: `<div class="field"><label for="gift-amt">Amount</label><input class="input" id="gift-amt" type="number" min="5" max="2000" step="1" inputmode="decimal" placeholder="250"></div>`, foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="gift-other-add">Add to ticket</button>`, mount(root) { setTimeout(() => $('#gift-amt', root)?.focus(), 30); } });
const GIFT_KIND = { redeem: 'Spent', refund: 'Refunded back', void: 'Voided' };
// one card's balance and history, or the cards sold most recently
function giftLookupHtml(code) {
  const g = giftByCode(code);
  if (!g) {
    if (normGift(code).length >= 4) return `<div class="empty" style="padding:14px">No gift card with that code${isLive() && Cloud.status !== 'ok' ? ' on this iPad, and the cloud can\'t be reached to check' : ''}.</div>`;
    const recent = st().giftCards.slice().sort(by((x) => x.date || '')).reverse().slice(0, 6);
    return recent.length ? `<div class="small muted" style="margin:4px 0 6px">Sold most recently</div><div class="list">${recent.map((x) => `<div class="list-row click" data-act="gift-lookup-pick" data-code="${esc(x.code)}"><div class="grow"><div class="strong gift-code sm">${esc(x.code)}</div><div class="tiny faint">${x.date ? fmtDate(x.date, 'short') : ''}${clientById(x.clientId) ? ` · ${esc(fullName(clientById(x.clientId)))}` : ''}</div></div><span class="num">${money(giftBalance(x))} <span class="faint">of ${money(x.amount, { whole: x.amount % 1 === 0 })}</span></span></div>`).join('')}</div>` : '<div class="small muted">No gift cards sold yet.</div>';
  }
  const bal = giftBalance(g); const c = clientById(g.clientId); const uses = giftUsesOf(g).slice().sort(by((u) => (u.date || '') + (u.at || '')));
  return `<div class="row between" style="align-items:flex-end"><div><div class="gift-code">${esc(g.code)}</div><div class="small muted">Sold ${g.date ? fmtDate(g.date, 'long') : ''}${c ? ` to ${esc(fullName(c))}` : ''} · ${money(g.amount)}</div></div><div style="text-align:right"><div class="strong num" style="font-size:22px">${money(bal)}</div><div class="tiny faint">left on it</div></div></div>
    ${uses.length ? `<table class="table" style="margin-top:10px"><tbody>${uses.map((u) => `<tr${u.ticketId ? ` class="click" data-act="open-ticket" data-id="${u.ticketId}"` : ''}><td class="small muted">${u.date ? fmtDate(u.date, 'short') : ''}</td><td class="small">${GIFT_KIND[u.kind] || u.kind}</td><td class="r num">${u.amount > 0 ? '−' : '+'}${money(Math.abs(u.amount))}</td></tr>`).join('')}</tbody></table>` : '<div class="small muted" style="margin-top:8px">Not used yet.</div>'}`;
}
Modals.giftLookup = ({ code = '' } = {}) => {
  const open = st().giftCards.filter((g) => giftBalance(g) > 0.004);
  return { title: 'Gift card balance', body: `<div class="field"><label for="gl-code">Code</label><input class="input" id="gl-code" placeholder="ABCD-2345" value="${esc(code)}" autocapitalize="characters" autocomplete="off" spellcheck="false" data-on-input="gift-lookup-q"></div><div id="gl-result">${giftLookupHtml(code)}</div><div class="small muted" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line-2)">Still to be spent: <b class="num">${money(sum(open, giftBalance))}</b> on ${open.length} card${open.length === 1 ? '' : 's'}</div>`,
    foot: '<button class="btn" data-act="close-modal">Close</button>',
    mount(root) { setTimeout(() => $('#gl-code', root)?.focus(), 30); if (isLive() && Cloud.user) Cloud.sync().then(() => { const i = $('#gl-code'); const r = $('#gl-result'); if (i && r && S.ui.modal && S.ui.modal.kind === 'giftLookup') r.innerHTML = giftLookupHtml(i.value); }, () => {}); } };
};
Modals.receipt = ({ ticketId }) => {
  const t = st().tickets.find((x) => x.id === ticketId); const c = clientById(t.clientId); const next = clientStats(c.id).next;
  const svcIds = t.lines.filter((l) => l.type === 'service').map((l) => l.refId);
  const sold = t.lines.filter((l) => l.type === 'gift' && l.code);
  const giftBox = sold.length ? `<div class="alert info gift-codes">${I.spark}<div class="grow"><b>${sold.length > 1 ? 'Gift card codes' : 'Gift card code'}</b>${sold.map((l) => `<div class="row between" style="margin-top:4px"><span class="gift-code">${esc(l.code)}</span><span class="num strong">${money(l.price * (l.qty || 1))}</span></div>`).join('')}<div class="tiny faint" style="margin-top:4px">Write it on the card or send it to them. Anyone with the code can spend it.</div></div></div>` : '';
  return { title: 'Paid', body: `<div class="confirm-tick">${I.check}</div><div style="text-align:center"><div class="strong" style="font-size:22px">${money(t.total)}</div><div class="muted small">${esc(fullName(c))} · ${PAY_LABEL[t.payments[0]?.method]}${t.payments.length > 1 ? ' + ' + PAY_LABEL[t.payments[1]?.method] : ''}</div></div>${giftBox}${next ? `<div class="alert good">${I.calendar}<div>Already rebooked: ${fmtDate(next.date, 'dow')} at ${fmtTime(next.start)}.</div></div>` : `<div class="alert info">${I.repeat}<div><b>Rebook before they leave.</b> Clients who rebook at checkout come back 2× as often. Same services, 4 weeks out, with ${esc(staffById(t.staffId).name.split(' ')[0])}.</div></div>`}<details><summary class="small muted" style="cursor:pointer">Receipt</summary>${receiptHtml(t, c)}</details>`, foot: `${sold.length ? `<button class="btn" data-act="gift-send" data-id="${t.id}">Send gift code</button>` : ''}<button class="btn" data-act="receipt-send" data-id="${t.id}">${isLive() ? 'Send receipt' : 'Text receipt'}</button>${next ? '' : `<button class="btn primary" data-act="rebook-from-ticket" data-client="${c.id}" data-staff="${t.staffId}" data-svcs="${svcIds.join(',')}">${I.repeat}Rebook 4 weeks out</button>`}<button class="btn ${next ? 'primary' : ''}" data-act="receipt-done">Done</button>` };
};
function addPayment(method, amount, last4, extra = {}) {
  const t = S.ui.ticket; if (!t) return; const { note, ...more } = extra;
  t.payments.push({ method, amount: Math.round(amount * 100) / 100, last4: last4 || null, ...more }); closeModal();
  const tot = ticketTotals(t);
  if (tot.due <= 0.004) { finishTicket(); if (note) toast(note); } else { rerenderContent(); toast(`${money(amount)} ${PAY_LABEL[method]} recorded${note ? ` · ${note}` : ''} · ${money(tot.due)} remaining`); }
}
function finishTicket() {
  const t = S.ui.ticket; const tot = ticketTotals(t);
  const closed = closeTicket({ appointmentId: t.appointmentId, clientId: t.clientId, staffId: t.staffId, date: todayStr(), lines: t.lines.map(({ id, ...l }) => l), discount: tot.disc, tip: tot.tip, tax: tot.tax, total: tot.total, payments: t.payments.length ? t.payments : [{ method: 'card', amount: tot.total, last4: '4242' }] });
  if (st().settings.reminders.rebookNudge === false) { /* no nudge */ }
  S.ui.ticket = null; rerenderContent(); openModal('receipt', { ticketId: closed.id });
}
Object.assign(Actions, {
  'checkout-appt': (el) => { const a = apptById(el.dataset.id); if (a.status === 'booked' || a.status === 'confirmed') setStatus(a.id, 'checkedin'); startTicket({ appointmentId: a.id, clientId: a.clientId }); },
  'checkout-client': (el) => startTicket({ clientId: el.dataset.id }),
  'co-tab': (el) => { S.ui.coTab = el.dataset.id; rerenderContent(); },
  'ticket-add': (el) => {
    const t = S.ui.ticket; const type = el.dataset.type;
    if (type === 'service') { const s = svcById(el.dataset.id); let price = s.price, note = ''; if (t.plan && s.addon) { price = Math.min(price, 15); note = 'Member add-on'; } t.lines.push({ id: uid('l'), type, refId: s.id, name: s.name, price, listPrice: s.price, qty: 1, staffId: t.staffId, note }); }
    else if (type === 'product') { const p = prodById(el.dataset.id); const ex = t.lines.find((l) => l.type === 'product' && l.refId === p.id); if (ex) ex.qty++; else { const disc = t.plan ? t.plan.retailDiscount : 0; t.lines.push({ id: uid('l'), type, refId: p.id, name: p.name, price: Math.round(p.price * (1 - disc) * 100) / 100, listPrice: p.price, qty: 1, staffId: t.staffId, note: disc ? `Member ${Math.round(disc * 100)}% off` : '' }); } }
    else { const v = +el.dataset.id; t.lines.push({ id: uid('l'), type: 'gift', refId: 'gift', name: `Gift card ${money(v, { whole: true })}`, price: v, qty: 1, staffId: t.staffId, note: '' }); }
    rerenderContent();
  },
  'ticket-rm': (el) => { const t = S.ui.ticket; t.lines = t.lines.filter((l) => l.id !== el.dataset.id); rerenderContent(); },
  'ticket-disc': (el) => { const k = el.dataset.k; S.ui.ticket.discount = k === 'none' ? { type: 'none', value: 0 } : k.startsWith('pct') ? { type: 'pct', value: +k.slice(3) } : { type: 'amt', value: +k.slice(3) }; rerenderContent(); },
  'ticket-tip': (el) => { S.ui.ticket.tipPct = +el.dataset.p; S.ui.ticket.tip = 0; rerenderContent(); },
  'change:tip-custom': (el) => { const v = parseFloat(el.value); S.ui.ticket.tipPct = null; S.ui.ticket.tip = isNaN(v) ? 0 : v; rerenderContent(); },
  'ticket-park': () => { S.ui.ticket = null; rerenderContent(); toast('Ticket parked — appointment stays checked in'); },
  'ticket-void': () => confirmModal('Void this ticket?', 'Nothing is charged. The appointment stays on the book.', 'Void', () => { S.ui.ticket = null; rerenderContent(); }, true),
  pay: (el) => { const t = S.ui.ticket; const tot = ticketTotals(t); if (!t.lines.length) return toast('Add something to the ticket first', 'bad'); if (tot.due <= 0) return finishTicket(); const m = el.dataset.m; if (m === 'card' && isLive()) confirmModal(`Record ${money(tot.due)} paid by card?`, 'Run the card on your terminal first. Luster records the payment; it doesn\'t charge the card.', 'Card payment went through', () => addPayment('card', tot.due)); else if (m === 'card') openModal('terminal', { amount: tot.due }); else if (m === 'card_on_file') { const c = clientById(t.clientId); confirmModal(`Charge ${money(tot.due)} to ${c.cardOnFile.brand} •••• ${c.cardOnFile.last4}?`, 'The client gets a text receipt.', 'Charge', () => addPayment('card_on_file', tot.due, c.cardOnFile.last4)); } else if (m === 'cash') openModal('cash', { amount: tot.due }); else if (m === 'gift') openModal('gift', { amount: tot.due }); else if (m === 'credit') { const c = clientById(t.clientId); const use = Math.min(c.storeCredit || 0, tot.due); if (use <= 0) return toast('No store credit', 'bad'); addPayment('credit', use); } },
  'input:cash-tendered': (el) => { const v = parseFloat(el.value) || 0; const due = parseFloat(el.dataset.due); $('#cash-change').textContent = `Change due: ${money(Math.max(0, v - due))}`; },
  'cash-quick': (el) => { const i = $('#cash-tendered'); i.value = (+el.dataset.v).toFixed(2); i.dispatchEvent(new Event('input', { bubbles: true })); },
  'cash-done': (el) => { const due = parseFloat(el.dataset.amount); const v = parseFloat($('#cash-tendered').value) || 0; if (v < due) { addPayment('cash', v); } else addPayment('cash', due); },
  'gift-apply': async (el) => {
    const code = ($('#gift-code') || {}).value || ''; if (!normGift(code)) return toast('Type the code from the card', 'bad');
    const reset = () => { if (el.isConnected) { el.disabled = false; el.textContent = 'Apply'; } };
    if (isLive() && Cloud.user) { el.disabled = true; el.textContent = 'Checking…'; try { await Cloud.sync(); } catch (e) {} reset(); if (!S.ui.ticket) return; }
    const g = giftByCode(code);
    if (!g) return toast(isLive() && Cloud.status !== 'ok' ? 'That card isn\'t on this iPad, and the cloud can\'t be reached to check. Try again once you\'re online.' : 'No gift card with that code', 'bad');
    const t = S.ui.ticket; if (!t) return closeModal();
    const left = Math.round((giftBalance(g) - sum(t.payments.filter((p) => p.cardId === g.id), (p) => p.amount)) * 100) / 100;
    if (left <= 0.004) return toast(`${esc(g.code)} has nothing left on it`, 'bad');
    const use = Math.min(left, parseFloat(el.dataset.amount));
    addPayment('gift', use, g.code.slice(-4), { cardId: g.id, code: g.code, note: `${money(Math.round((left - use) * 100) / 100)} left on ${esc(g.code)}` });
  },
  'gift-other': () => openModal('giftAmount'),
  'short-pay': (el) => openModal('shortPay', { id: el.dataset.id }),
  'short-paid': (el) => {
    const t = st().tickets.find((x) => x.id === el.dataset.id); if (!t || !t.giftShort) return closeModal();
    const amt = t.giftShort; t.payments.push({ method: el.dataset.m, amount: amt, last4: null, late: true }); t.giftShort = 0; t.seeded = false; commit(); closeModal(); rerenderContent();
    toast(`${money(amt)} ${el.dataset.m === 'cash' ? 'cash' : 'card'} recorded on the ticket`);
  },
  'gift-other-add': () => {
    const v = Math.round((parseFloat(($('#gift-amt') || {}).value) || 0) * 100) / 100; if (v < 5 || v > 2000) return toast('Pick an amount from $5 to $2,000', 'bad');
    const t = S.ui.ticket; closeModal(); if (!t) return;
    t.lines.push({ id: uid('l'), type: 'gift', refId: 'gift', name: `Gift card ${money(v, { whole: v % 1 === 0 })}`, price: v, qty: 1, staffId: t.staffId, note: '' }); rerenderContent();
  },
  'gift-lookup': () => openModal('giftLookup', {}),
  'gift-lookup-pick': (el) => { const i = $('#gl-code'); if (i) { i.value = el.dataset.code; $('#gl-result').innerHTML = giftLookupHtml(i.value); } },
  'input:gift-lookup-q': (el) => { const r = $('#gl-result'); if (r) r.innerHTML = giftLookupHtml(el.value); },
  'gift-send': (el) => {
    const t = st().tickets.find((x) => x.id === el.dataset.id); if (!t) return; const c = clientById(t.clientId); if (!c) return toast('No client on this ticket', 'bad');
    const b = st().business; const sold = t.lines.filter((l) => l.type === 'gift' && l.code);
    const body = `Hi ${c.first}, here's your ${b.name} gift card${sold.length > 1 ? 's' : ''}: ${sold.map((l) => `${l.code} (${money(l.price * (l.qty || 1))})`).join(', ')}. Show the code at checkout to use it.${b.phone ? ` Questions? ${fmtPhone(b.phone)}` : ''}`;
    if (isLive()) { closeModal(); return outgoing({ clientId: c.id, kind: 'gift', subject: `Your ${b.name} gift card`, body }); }
    sendMessage(c.id, body, 'gift'); toast('Gift card code texted (simulated)');
  },
  'ticket-close': () => finishTicket(),
  'receipt-done': () => { closeModal(); rerenderContent(); },
  'rebook-from-ticket': (el) => { closeModal(); const date = addDays(todayStr(), 28); S.ui.draft = newDraft({ clientId: el.dataset.client, staffId: el.dataset.staff, date, serviceIds: el.dataset.svcs.split(',').filter(Boolean) }); const slots = freeSlots(S.ui.draft.staffId, date, draftDur(S.ui.draft)); S.ui.draft.start = slots[Math.floor(slots.length / 3)] ?? slots[0] ?? null; openDrawer('appt-form'); },
  'input:co-q': (el) => { const r = $('#co-results'); const q = el.value.trim(); r.innerHTML = q ? searchClients(q, 5).map((c) => `<div class="client-row" data-act="checkout-client" data-id="${c.id}">${avatar(c, 'sm')}<div class="grow"><div class="nm">${esc(fullName(c))}</div><div class="mt">${fmtPhone(c.phone)}</div></div></div>`).join('') : ''; },
});

/* ---- refunds ---- */
const REFUND_REASONS = ['Service issue', 'Product return', 'Allergic reaction', 'Duplicate charge', 'Goodwill', 'Cancelled package', 'Other'];
Modals.refund = ({ id }) => {
  const t = st().tickets.find((x) => x.id === id); const c = clientById(t.clientId); const already = t.refunded || 0; const maxLeft = Math.round((t.total - already) * 100) / 100;
  const orig = t.payments[0]?.method || 'card';
  return { title: `Refund · ${esc(fullName(c))}`, body: `<div class="small muted">Ticket from ${fmtDate(t.date, 'long')} · paid ${money(t.total)} by ${PAY_LABEL[orig] || orig}${already ? ` · ${money(already)} already refunded` : ''}</div>
    <div class="field"><label>What's being refunded</label><div class="col" style="gap:6px">${t.lines.map((l, i) => { const g = l.type === 'gift' && l.cardId ? giftById(l.cardId) : null; const cap = Math.min(l.price * l.qty, g ? giftBalance(g) : Infinity); return `<label class="check" style="justify-content:space-between;border:1px solid var(--line-2);border-radius:var(--r-sm);padding:8px 10px"><span class="row"><input type="checkbox" data-rl="${i}" data-amount="${(l.price * l.qty).toFixed(2)}" data-cap="${cap.toFixed(2)}" data-tax="${l.type === 'product' ? (l.price * l.qty * st().business.taxRate).toFixed(2) : '0'}"${cap <= 0.004 ? ' disabled' : ''}> <span><b>${esc(l.name)}</b>${l.qty > 1 ? ` × ${l.qty}` : ''}<span class="small muted"> · ${l.type === 'service' ? esc(staffById(l.staffId)?.name.split(' ')[0] || '') : l.type === 'product' ? 'retail, tax refunded too' : g ? `${esc(g.code)}, ${cap > 0.004 ? `${money(cap)} not spent yet` : 'already spent'}` : 'gift card'}</span></span></span><span class="row"><input class="input num" type="number" step="0.01" min="0" max="${cap.toFixed(2)}" value="${cap.toFixed(2)}" data-rlamt="${i}" style="width:96px;text-align:right;min-height:30px;padding:4px 8px" aria-label="Amount"></span></label>`; }).join('')}${t.tip ? `<label class="check" style="justify-content:space-between;border:1px solid var(--line-2);border-radius:var(--r-sm);padding:8px 10px"><span class="row"><input type="checkbox" id="rf-tip" data-amount="${t.tip.toFixed(2)}"> <span><b>Tip</b><span class="small muted"> · comes out of ${esc(staffById(t.staffId)?.name.split(' ')[0] || '')}'s payout</span></span></span><span class="num">${money(t.tip)}</span></label>` : ''}</div></div>
    <div class="field-row"><div class="field"><label for="rf-reason">Reason</label><select class="select" id="rf-reason">${REFUND_REASONS.map((r) => `<option>${r}</option>`).join('')}</select></div><div class="field"><label for="rf-method">Refund to</label><select class="select" id="rf-method"><option value="${orig}">${PAY_LABEL[orig] || orig}${t.payments[0]?.last4 ? ` •••• ${t.payments[0].last4}` : ''} (original)</option><option value="credit">Store credit (instant, keeps the money in the studio)</option>${orig !== 'cash' ? '<option value="cash">Cash from the drawer</option>' : ''}</select></div></div>
    <div class="field"><label for="rf-note">Note for the file</label><input class="input" id="rf-note" placeholder="What happened, who approved it"></div>
    <div class="row between" style="padding:10px 12px;background:var(--surface-2);border-radius:var(--r-sm)"><span class="muted">Refund total</span><span class="strong num" id="rf-total" data-max="${maxLeft}">${money(0)}</span></div>
    <div class="tiny faint">Card refunds land in 5–10 business days; the client gets a text receipt. Max ${money(maxLeft)} on this ticket.</div>`,
    foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn danger" data-act="refund-submit" data-id="${t.id}" id="rf-submit" disabled>Refund</button>`,
    mount(root) { const recalc = () => { let tot = 0; for (const cb of $$('[data-rl]', root)) { if (!cb.checked) continue; const i = cb.dataset.rl; const amtEl = $(`[data-rlamt="${i}"]`, root); const full = parseFloat(cb.dataset.amount); let v = Math.min(full, parseFloat(cb.dataset.cap || cb.dataset.amount), Math.max(0, parseFloat(amtEl.value) || 0)); tot += v; if (v >= full - 0.004) tot += parseFloat(cb.dataset.tax || '0'); } const tip = $('#rf-tip', root); if (tip && tip.checked) tot += parseFloat(tip.dataset.amount); const max = parseFloat($('#rf-total', root).dataset.max); tot = Math.min(Math.round(tot * 100) / 100, max); $('#rf-total', root).textContent = money(tot); const b = $('#rf-submit', root); b.disabled = tot <= 0; b.textContent = tot > 0 ? `Refund ${money(tot)}` : 'Refund'; }; const box = $('.modal', root) || root; box.addEventListener('change', recalc); box.addEventListener('input', recalc); } };
};
Modals.refunds = () => { const rs = st().refunds.slice().sort(by((r) => r.at)).reverse().slice(0, 40); return { title: 'Refunds', wide: true, body: rs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Client</th><th>What</th><th>Reason</th><th>To</th><th class="r">Amount</th></tr></thead><tbody>${rs.map((r) => { const c = clientById(r.clientId); return `<tr class="click" data-act="open-ticket" data-id="${r.ticketId}"><td class="small muted">${fmtDate(r.date, 'short')}</td><td class="strong">${esc(fullName(c))}</td><td class="small">${r.lines.map((l) => esc(l.name) + (l.partial ? ' (partial)' : '')).join(', ')}${r.tipRefunded ? ' + tip' : ''}</td><td class="small">${esc(r.reason)}${r.note ? `<div class="tiny faint">${esc(r.note)}</div>` : ''}</td><td class="small">${r.method === 'credit' ? 'Store credit' : PAY_LABEL[r.method] || r.method}</td><td class="r num" style="color:var(--bad-ink)">−${money(r.amount)}</td></tr>`; }).join('')}</tbody></table></div><div class="small muted" style="margin-top:8px">${st().refunds.length} refunds on file · ${money(sum(st().refunds, (r) => r.amount))} total</div>` : '<div class="empty">No refunds yet. Long may it last.</div>', foot: '<button class="btn" data-act="close-modal">Close</button>' }; };
Object.assign(Actions, {
  'refund-open': (el) => openModal('refund', { id: el.dataset.id }),
  'refunds-list': () => openModal('refunds'),
  'refund-submit': (el) => {
    const t = st().tickets.find((x) => x.id === el.dataset.id); const root = $('#modal-root');
    const lines = []; for (const cb of $$('[data-rl]', root)) { if (!cb.checked) continue; const l = t.lines[+cb.dataset.rl]; const full = parseFloat(cb.dataset.amount); const v = Math.min(full, parseFloat(cb.dataset.cap || cb.dataset.amount), Math.max(0, parseFloat($(`[data-rlamt="${cb.dataset.rl}"]`, root).value) || 0)); if (v <= 0) continue; const partial = v < full - 0.004; lines.push({ name: l.name, type: l.type, refId: l.refId, qty: l.qty, amount: Math.round((v + (partial ? 0 : parseFloat(cb.dataset.tax || '0'))) * 100) / 100, partial, ...(l.cardId ? { cardId: l.cardId, code: l.code } : {}) }); }
    const tipEl = $('#rf-tip', root); const tipRefunded = tipEl && tipEl.checked ? parseFloat(tipEl.dataset.amount) : 0;
    if (!lines.length && !tipRefunded) return toast('Pick what to refund', 'bad');
    const max = Math.round((t.total - (t.refunded || 0)) * 100) / 100; const total = sum(lines, (l) => l.amount) + tipRefunded; if (total > max + 0.004) { const scale = max / total; lines.forEach((l) => (l.amount = Math.round(l.amount * scale * 100) / 100)); }
    const method = $('#rf-method', root).value; const reason = $('#rf-reason', root).value; const note = $('#rf-note', root).value.trim();
    const r = refundTicket(t.id, { lines, tipRefunded, method, reason, note });
    const c = clientById(t.clientId); if (!isLive()) sendMessage(c.id, `Hi ${c.first}, we've refunded ${money(r.amount)} ${method === 'credit' ? `to your ${st().business.name} store credit` : method === 'cash' ? 'in cash' : method === 'gift' ? 'to your gift card' : 'to your card (allow 5–10 business days)'}. Receipt: ${bizUrl('/r/' + r.id.slice(-5))}`, 'receipt');
    if (reason === 'Allergic reaction') addNote(c.id, { type: 'caution', text: `Refund for allergic reaction on ${fmtDate(t.date)}: ${lines.map((l) => l.name).join(', ')}. ${note || 'Check product ingredients before next visit.'}`, staffId: 's5' });
    closeModal(); rerenderContent(); if (S.ui.view === 'clients') { const d = $('#client-detail'); if (d) { d.innerHTML = clientDetail(S.ui.clientId); } }
    const cards = lines.filter((l) => l.type === 'gift' && l.cardId).map((l) => giftById(l.cardId)).filter(Boolean);
    toast(`Refunded ${money(r.amount)} · ${method === 'credit' ? 'store credit added' : r.giftBack ? `${money(r.giftBack)} back on the gift card` : PAY_LABEL[method] || method}${cards.map((g) => ` · ${giftBalance(g) > 0.004 ? `${money(giftBalance(g))} left on ${esc(g.code)}` : `${esc(g.code)} voided`}`).join('')}`, 'good', { label: 'Ticket', act: 'open-ticket', attrs: `data-id="${t.id}"` });
  },
});
