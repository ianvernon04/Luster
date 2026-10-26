/* ===== Hand-off: a live business sends texts and emails from the studio's own phone (until Luster texting is connected) ===== */
// Texting from Luster needs a registered business number, and carriers want the business's EIN for that. Until it's
// connected, Luster never pretends: it writes the message, opens it in Messages or Mail ready to send, and logs it on
// the client's file as handed off. The demo keeps its pretend carrier.
const simulatedCarrier = () => !isLive();
const isAppleTouch = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function smsHref(phone, body) { const d = String(phone || '').replace(/\D/g, ''); const to = d.length === 10 ? `+1${d}` : d ? `+${d}` : ''; return `sms:${to}${isAppleTouch() ? '&' : '?'}body=${encodeURIComponent(body)}`; }
function mailHref(email, subject, body) { return `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body)}`; }
function manageUrl(token) { return `${appBaseUrl()}book/?t=${token}`; }
// copy inside the tap itself (works on iPad Safari), with the async clipboard as a second try; never blocks
function copyText(text, box) {
  let ok = false;
  if (box) { try { box.focus(); box.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; } }
  if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
}
function openHref(href) { const a = document.createElement('a'); a.href = href; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
// The client's own link to cancel or reschedule. New desk bookings get theirs from the database on the first sync.
async function manageLinkFor(a) {
  if (!isLive() || !a || !Cloud.user) return null;
  if (!a.manageToken) { try { await Cloud.sync(); } catch (e) {} }
  if (!a.manageToken) {
    try { const { data } = await Cloud.sb().from('appointments').select('manage_token').eq('id', a.id).maybeSingle(); if (data && data.manage_token) { a.manageToken = data.manage_token; saveState(); } } catch (e) {}
  }
  return a.manageToken ? manageUrl(a.manageToken) : null;
}
// Every message to a client goes through here.
function outgoing({ clientId, body, kind = 'manual', appointmentId = null, subject = '' }) {
  if (simulatedCarrier()) { const m = sendMessage(clientId, body, kind); if (appointmentId) { m.appointmentId = appointmentId; saveState(); } return 'simulated'; }
  openModal('handoff', { clientId, body, msgKind: kind, appointmentId, subject: subject || st().business.name });   // not `kind`: that names the modal
  return 'handoff';
}
const handoffNote = (c) => `<div class="alert info">${I.info}<div>Luster texting isn't connected yet, so this goes out from the studio's phone or email. Either way it's logged on ${esc(c.first || 'the client')}'s file.</div></div>`;
const handoffButtons = (c) => `<button class="btn" data-act="handoff" data-via="copy">Copy</button>${c.email ? '<button class="btn" data-act="handoff" data-via="email">Email</button>' : ''}${c.phone ? '<button class="btn primary" data-act="handoff" data-via="sms">Open in Messages</button>' : ''}`;
Modals.handoff = ({ clientId, body, msgKind: kind }) => {
  const c = clientById(clientId);
  if (!c) return { title: 'Client not found', body: '<p class="small muted">They may have been deleted on another device.</p>', foot: '<button class="btn" data-act="close-modal">Close</button>' };
  return { title: `${esc(KIND_LABEL[kind] || 'Message')} for ${esc(c.first || fullName(c))}`,
    body: `${handoffNote(c)}<div class="field"><label for="ho-body">Message</label><textarea class="textarea" id="ho-body" rows="6">${esc(body)}</textarea></div><div class="small muted">${c.phone ? esc(fmtPhone(c.phone)) : 'No mobile number on file'}${c.email ? ` · ${esc(c.email)}` : ''}</div>`,
    foot: `<button class="btn" data-act="close-modal">Cancel</button>${handoffButtons(c)}` };
};
Object.assign(Actions, {
  // works from the hand-off modal and from the Text-a-client modal (#msg-body)
  handoff: (el) => {
    const m = S.ui.modal || {}; const c = clientById(m.clientId); if (!c) return closeModal();
    const box = $('#ho-body') || $('#msg-body'); const body = ((box && box.value) || m.body || '').trim(); if (!body) return toast('Nothing to send', 'bad');
    const via = el.dataset.via;
    if (via === 'sms') openHref(smsHref(c.phone, body));
    else if (via === 'email') openHref(mailHref(c.email, m.subject || st().business.name, body));
    else copyText(body, box);
    st().messages.push({ id: uid('m_'), clientId: c.id, appointmentId: m.appointmentId || null, channel: via === 'email' ? 'email' : 'sms', kind: m.msgKind || 'manual', body, at: new Date().toISOString(), status: 'handed_off', via, reply: null, seeded: false });
    commit(); closeModal();
    toast(via === 'copy' ? 'Copied. Paste it into a text or an email.' : via === 'email' ? 'Opened in Mail. Tap send there.' : 'Opened in Messages. Tap send there.');
    if (S.ui.view === 'messages') rerenderContent();
  },
  // after a desk booking in a live business: the confirmation goes out by hand, with the client's manage link
  'appt-confirm-send': async (el) => {
    const a = apptById(el.dataset.id); if (!a) return; const c = clientById(a.clientId); if (!c) return;
    const link = await manageLinkFor(a);
    outgoing({ clientId: c.id, appointmentId: a.id, kind: 'confirmation', subject: `You're booked at ${st().business.name}`, body: confirmationText(a, c, link) });
  },
  'appt-remind-send': async (el) => {
    const a = apptById(el.dataset.id); if (!a) return; const c = clientById(a.clientId); if (!c) return;
    const link = await manageLinkFor(a);
    outgoing({ clientId: c.id, appointmentId: a.id, kind: 'reminder', subject: `Reminder: ${st().business.name} ${fmtDate(a.date, 'dow')}`, body: reminderText(a, c, link) });
  },
});
function confirmationText(a, c, link) {
  const who = (staffById(a.staffId) || { name: '' }).name.split(' ')[0]; const b = st().business;
  return `Hi ${c.first}, you're booked at ${b.name}: ${apptTitle(a)}${who ? ` with ${who}` : ''}, ${fmtDate(a.date, 'dow')} at ${fmtTime(a.start)}.${b.address ? ` ${b.address}.` : ''}${link ? `\nChange or cancel: ${link}` : b.phone ? `\nNeed to change it? Call ${fmtPhone(b.phone)}.` : ''}`;
}
function reminderText(a, c, link) {
  const who = (staffById(a.staffId) || { name: '' }).name.split(' ')[0]; const b = st().business; const when = a.date === todayStr() ? 'today' : a.date === addDays(todayStr(), 1) ? 'tomorrow' : fmtDate(a.date, 'dow');
  return `Hi ${c.first}, a reminder from ${b.name}: ${apptTitle(a)}${who ? ` with ${who}` : ''} ${when} at ${fmtTime(a.start)}.${link ? `\nNeed to change it? ${link}` : b.phone ? `\nNeed to change it? Call ${fmtPhone(b.phone)}.` : ''}`;
}
function receiptText(t, c) {
  const b = st().business; const lines = t.lines.map((l) => `${l.name}${l.qty > 1 ? ` x${l.qty}` : ''}  ${money(l.price * l.qty)}`).join('\n');
  return `Thank you, ${c.first}! Your receipt from ${b.name}, ${fmtDate(t.date)}:\n${lines}${t.discount && t.discount.type !== 'none' ? '\nDiscount applied' : ''}${t.tax ? `\nTax  ${money(t.tax)}` : ''}${t.tip ? `\nTip  ${money(t.tip)}` : ''}\nTotal  ${money(t.total)}${(t.payments || []).length ? ` (${t.payments.map((p) => PAY_LABEL[p.method] || p.method).join(' + ')})` : ''}`;
}
// A form for the client to fill in on their own phone (book/?f=…). The database makes the link on the first sync.
async function formLinkFor(f) {
  if (!isLive() || !f || !Cloud.user) return null;
  if (!f.publicToken) { try { await Cloud.sync(); } catch (e) {} }
  if (!f.publicToken) {
    try { const { data } = await Cloud.sb().from('forms').select('public_token').eq('id', f.id).maybeSingle(); if (data && data.public_token) { f.publicToken = data.public_token; saveState(); } } catch (e) {}
  }
  return f.publicToken ? `${appBaseUrl()}book/?f=${f.publicToken}` : null;
}
async function sendFormLink(f) {
  const c = f && clientById(f.clientId); if (!c) return;
  const t = tplById(f.templateId) || { name: 'form' };
  const link = await formLinkFor(f);
  if (!link) return toast("Couldn't get the form's link. Check the connection, or fill it in here on the iPad.", 'bad');
  outgoing({ clientId: c.id, kind: 'form', subject: `${t.name} · ${st().business.name}`, body: `Hi ${c.first}, before your visit please fill in your ${t.name} for ${st().business.name}${t.estMinutes ? ` (about ${t.estMinutes} minutes)` : ''}: ${link}` });
}
