/* ===== Cloud screens: sign in, go live, booking link, open a business on another device ===== */
const US_ZONES = [['America/Chicago', 'Central (Baton Rouge)'], ['America/New_York', 'Eastern'], ['America/Denver', 'Mountain'], ['America/Phoenix', 'Arizona'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii']];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const shortLink = (slug) => bookingUrl(slug).replace(/^https?:\/\//, '');

function cloudCardHtml() {
  if (!Cloud.available()) return `<div class="card pad small muted" style="max-width:640px">Online booking goes live from the installed app at www.nwluster.com.</div>`;
  if (isLive()) {
    const L = st().live;
    return `<div class="card pad col" style="gap:10px;max-width:640px">
      <div class="row between wrap"><div><div class="eyebrow">Your booking link</div><div class="strong" id="bk-link" style="word-break:break-all">${esc(shortLink(L.slug))}</div></div>${cloudStatusHtml()}</div>
      <div class="row wrap"><button class="btn primary sm" data-act="cloud-copy">Copy link</button><button class="btn sm" data-act="cloud-open">Open</button>${navigator.share ? '<button class="btn sm" data-act="cloud-share">Share</button>' : ''}<button class="btn sm" data-act="cloud-sync">Sync now</button></div>
      <div class="small muted">Put this link on your website's Book button, your Instagram bio and your Google profile. Bookings land on this calendar within seconds.</div>
      <div class="small faint row wrap">${Cloud.user ? `Signed in as ${esc(Cloud.user.email || '')}` : 'Signed out'} <button class="btn ghost sm" data-act="${Cloud.user ? 'cloud-signout' : 'cloud-resume'}">${Cloud.user ? 'Sign out' : 'Sign in'}</button></div>
    </div>`;
  }
  return `<div class="card pad col" style="gap:8px;max-width:640px">
    <div class="eyebrow">Take real bookings</div><div class="strong">Put ${esc(st().business.name)} online</div>
    <div class="small muted">Makes a live copy of this business with the same team, services and hours, and no sample clients, plus a booking link clients can use today. This demo stays as it is.</div>
    <div><button class="btn primary" data-act="cloud-golive">${I.booking}Put it online</button></div></div>`;
}

// after opening a reset link from the email: this device is signed in for that one purpose
/* "Book now" on the studio's own website, Instagram and Google, and a QR code for the counter */
const WEB_COLORS = ['#1E5C68', '#1B2224', '#B76E79', '#6B7F5E', '#A8875A', '#5B4B8A'];
function webButtonCode(url, color) { return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${color};color:#ffffff;font:600 16px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-decoration:none;letter-spacing:.01em">Book now</a>`; }
const WEB_STEPS = [
  ['Wix', ['In the Wix Editor, click your Book button (or add one: Add → Button).', 'Click the link icon, choose Web Address and paste your booking link.', 'Set it to open in a new window, then Publish.']],
  ['Squarespace', ['Edit the page and click your button block (or add one).', 'Paste your booking link as the button\'s link and turn on "Open in new tab".', 'Save, then publish.']],
  ['WordPress', ['Edit the page and select your Button block (or add one).', 'Click the link icon, paste your booking link and turn on "Open in new tab".', 'Update the page.']],
  ['Any other site', ['Paste the button code wherever your site takes HTML (an "Embed", "Custom code" or "HTML" block).', 'Or point any existing button or menu link at your booking link.']],
  ['Instagram', ['Edit profile → Links → Add external link.', 'Paste your booking link and call it "Book now".']],
  ['Google Business Profile', ['Search your studio\'s name on Google and choose "Edit profile".', 'Under bookings or appointment links, add your booking link and save.']],
  ['Facebook page', ['Click your page\'s action button and choose to edit it.', 'Pick "Book now" → link to a website, paste your booking link, and save.']],
];
function webKitHtml() {
  const url = bookingUrl(st().live.slug); const color = S.ui.webColor || WEB_COLORS[0];
  return `<div class="card pad col" style="gap:12px;max-width:640px">
    <div><div class="eyebrow">Your website's Book button</div><div class="small muted" style="margin-top:4px">Point the button you already have at your booking link, or paste this one where your site takes HTML. Clients book in about two minutes, and it lands on this calendar.</div></div>
    <div class="row wrap" style="gap:14px;align-items:center"><div style="padding:16px 20px;border-radius:12px;background:var(--surface-2)" id="web-preview">${webButtonCode(url, color)}</div>
      <div class="col" style="gap:8px"><div class="color-swatches" style="flex-wrap:wrap">${WEB_COLORS.map((c) => `<button class="color-swatch ${c === color ? 'on' : ''}" style="background:${c}" data-act="web-color" data-c="${c}" aria-label="Button color"></button>`).join('')}</div>
      <div class="row wrap"><button class="btn sm primary" data-act="web-copy-code">Copy button code</button><button class="btn sm" data-act="cloud-copy">Copy link</button></div></div></div>
    <div class="col" style="gap:2px">${WEB_STEPS.map(([name, steps]) => `<details class="staff-more"><summary class="small strong">${esc(name)}</summary><ol class="small muted" style="margin:6px 0 8px;padding-left:20px">${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>`).join('')}</div>
  </div>
  <div style="height:12px"></div>
  <div class="card pad row wrap" style="gap:16px;max-width:640px;align-items:center">
    <div id="qr-box" style="width:132px;height:132px;flex:none;border-radius:10px;background:#fff;display:grid;place-items:center"><span class="tiny faint">QR code…</span></div>
    <div class="col grow" style="gap:6px;min-width:200px"><div class="strong">A QR code for the studio</div><div class="small muted">Print it for the front desk, a mirror or the back of a receipt: clients scan it to book their next visit.</div><div class="row wrap"><button class="btn sm" data-act="qr-sign">${I.dl}Download a sign</button><button class="btn sm" data-act="qr-png">${I.dl}QR code only</button></div></div>
  </div>`;
}
function bookingQr() { if (!window.qrcode) return null; const q = window.qrcode(0, 'M'); q.addData(bookingUrl(st().live.slug)); q.make(); return q; }
function qrSvg(q, px) { const n = q.getModuleCount(), m = 2, size = n + m * 2; let d = ''; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m},${r + m}h1v1h-1z`; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR code for your booking link"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`; }
async function drawBookingQr(box) {
  try { await loadScript('vendor/qrcode-1.4.4.js'); const q = bookingQr(); if (q && box.isConnected) box.innerHTML = qrSvg(q, 124); }
  catch (e) { if (box.isConnected) box.innerHTML = '<span class="tiny faint" style="padding:8px;text-align:center">The QR code needs a connection the first time.</span>'; }
}
// print-ready PNG: the code alone, or a 5×7 sign (1500×2100) with the studio's name and link, centred on the page
function qrCanvas(q, sign) {
  const n = q.getModuleCount();
  const cell = sign ? Math.floor(900 / n) : 24; const code = n * cell; const quiet = 4 * cell;
  const W = sign ? 1500 : code + quiet * 2, H = sign ? 2100 : code + quiet * 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  let top = quiet;
  if (sign) {
    const block = 120 + 150 + 110 + code + 150;   // name, line, gap, code, link
    const y = Math.round((H - block) / 2); top = y + 120 + 150 + 110 - 40;
    g.textAlign = 'center'; g.fillStyle = '#1B2224';
    g.font = '400 112px "Instrument Serif", Georgia, serif'; g.fillText(st().business.name, W / 2, y + 100, W - 160);
    g.font = '600 64px "Instrument Sans", system-ui, sans-serif'; g.fillText('Scan to book your next visit', W / 2, y + 250, W - 160);
    g.font = '500 44px "Instrument Sans", system-ui, sans-serif'; g.fillStyle = '#566068'; g.fillText(shortLink(st().live.slug), W / 2, top + code + 120, W - 160);
  }
  const x0 = Math.round((W - code) / 2);
  g.fillStyle = '#111'; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(x0 + c * cell, top + r * cell, cell, cell);
  return cv;
}
function canvasBlob(cv) { const d = atob(cv.toDataURL('image/png').split(',')[1]); const u8 = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) u8[i] = d.charCodeAt(i); return new Blob([u8], { type: 'image/png' }); }
Modals.webCode = ({ code }) => ({ title: 'Button code', body: `<div class="small muted">Copy this and paste it where your website takes HTML.</div><textarea class="textarea" id="web-code" rows="6" readonly style="font:12px/1.4 ui-monospace,Menlo,monospace">${esc(code)}</textarea>`, foot: '<button class="btn primary" data-act="close-modal">Done</button>', mount: (root) => { const t = $('#web-code', root); if (t) { t.focus(); t.select(); } } });
Object.assign(Actions, {
  'web-color': (el) => { S.ui.webColor = el.dataset.c; rerenderContent(); },
  'web-copy-code': () => {
    const code = webButtonCode(bookingUrl(st().live.slug), S.ui.webColor || WEB_COLORS[0]);
    openModal('webCode', { code });   // shown and selected, so it works even where the clipboard is blocked
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    if (ok) toast('Button code copied');
  },
  'qr-png': () => { const q = bookingQr(); if (!q) return toast('One moment: the QR code is still loading.', 'bad'); saveFile(`${st().live.slug}-booking-qr.png`, canvasBlob(qrCanvas(q, false)), 'image/png'); },
  'qr-sign': () => { const q = bookingQr(); if (!q) return toast('One moment: the QR code is still loading.', 'bad'); saveFile(`${st().live.slug}-booking-sign.png`, canvasBlob(qrCanvas(q, true)), 'image/png'); },
});
Modals.newPassword = (m) => ({ title: 'Choose a new password', body: `<form id="np" class="col" style="gap:12px" onsubmit="return false"><div class="small muted">You opened a password reset link. Pick a new password for your Luster account.</div><div class="field"><label for="np-pass">New password</label><input class="input" id="np-pass" name="password" type="password" autocomplete="new-password"><div class="hint">At least 8 characters.</div></div><div class="field"><label for="np-pass2">Same again</label><input class="input" id="np-pass2" name="password2" type="password" autocomplete="new-password"></div>${m.error ? `<div class="alert bad">${I.warn}<div>${esc(m.error)}</div></div>` : ''}</form>`,
  foot: `<button class="btn" data-act="close-modal">Later</button><button class="btn primary" data-act="np-submit" ${m.busy ? 'disabled' : ''}>${m.busy ? 'Saving…' : 'Save password'}</button>`,
  mount: () => requestAnimationFrame(() => { if (!$('#modal-root').contains(document.activeElement)) $('#np-pass')?.focus(); }) });
Modals.cloudAuth = (m) => {
  const reset = m.mode === 'reset'; const signin = m.mode !== 'signup' && !reset;
  return {
    title: reset ? 'Reset your password' : signin ? 'Sign in to Luster' : 'Create your Luster account',
    body: `<form id="cloud-auth" class="col" style="gap:12px" onsubmit="return false">
      <div class="small muted">${reset ? 'We\'ll email you a link. Open it on this iPad to choose a new password.' : `Your account keeps this business backed up in the cloud and lets clients book online. Use your business email.${signin ? '' : ` By creating an account you agree to the <a href="./terms.html" target="_blank" rel="noopener">terms</a> and <a href="./privacy.html" target="_blank" rel="noopener">privacy policy</a>.`}`}</div>
      <div class="field"><label for="ca-email">Email</label><input class="input" id="ca-email" name="email" type="email" inputmode="email" autocomplete="email" value="${esc(m.email || '')}"></div>
      ${reset ? '' : `<div class="field"><label for="ca-pass">Password</label><input class="input" id="ca-pass" name="password" type="password" autocomplete="${signin ? 'current-password' : 'new-password'}">${signin ? '<button type="button" class="btn ghost sm" data-act="cloud-auth-forgot" style="align-self:flex-start;margin-top:2px">Forgot password?</button>' : '<div class="hint">At least 8 characters.</div>'}</div>`}
      ${m.error ? `<div class="alert bad">${I.warn}<div>${esc(m.error)}</div></div>` : ''}${m.info ? `<div class="alert info">${I.mail}<div>${esc(m.info)}</div></div>` : ''}
    </form>`,
    foot: reset ? `<button class="btn ghost" data-act="cloud-auth-back">Back to sign in</button><button class="btn primary" data-act="cloud-auth-reset" ${m.busy ? 'disabled' : ''}>${m.busy ? 'Sending…' : 'Send reset link'}</button>`
      : `<button class="btn ghost" data-act="cloud-auth-mode">${signin ? 'New here? Create an account' : 'Have an account? Sign in'}</button><button class="btn primary" data-act="cloud-auth-submit" ${m.busy ? 'disabled' : ''}>${m.busy ? 'One moment…' : signin ? 'Sign in' : 'Create account'}</button>`,
    // focus the first empty field once, and never pull focus away from a field someone is already typing in
    mount: () => requestAnimationFrame(() => { const root = $('#modal-root'); if (root.contains(document.activeElement)) return; const e = $('#ca-email'); (e && !e.value ? e : $('#ca-pass'))?.focus(); }),
  };
};
Modals.goLive = (m) => {
  const b = st().business; const v = m.values || { name: b.name, slug: bookingSlug(b.name), phone: b.phone || '', address: b.address || '', tz: 'America/Chicago' };
  return {
    title: `Put ${esc(v.name || b.name)} online`,
    body: `<form id="golive" class="col" style="gap:12px" onsubmit="return false">
      <div class="field"><label for="gl-name">Business name</label><input class="input" id="gl-name" name="name" value="${esc(v.name)}" autocomplete="organization"></div>
      <div class="field"><label for="gl-slug">Booking link</label><div class="row" style="gap:6px"><span class="small muted" style="white-space:nowrap">${esc(shortLink('').replace(/\/$/, ''))}/</span><input class="input" id="gl-slug" name="slug" value="${esc(v.slug)}" autocapitalize="off" autocomplete="off" spellcheck="false"></div><div class="hint">Lowercase letters, numbers and dashes. This is the link clients tap.</div></div>
      <div class="field-row"><div class="field"><label for="gl-phone">Phone</label><input class="input" id="gl-phone" name="phone" type="tel" value="${esc(v.phone)}"></div>
      <div class="field"><label for="gl-tz">Time zone</label><select class="select" id="gl-tz" name="tz">${US_ZONES.map(([z, l]) => `<option value="${z}" ${v.tz === z ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><label for="gl-addr">Address</label><input class="input" id="gl-addr" name="address" value="${esc(v.address)}" autocomplete="street-address"></div>
      <div class="alert info">${I.info}<div>This creates a live copy with your team, services, hours and booking rules, and no sample clients. The calendar runs on the business's time zone wherever this iPad is.</div></div>
      ${m.error ? `<div class="alert bad">${I.warn}<div>${esc(m.error)}</div></div>` : ''}
    </form>`,
    foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="golive-submit" ${m.busy ? 'disabled' : ''}>${m.busy ? 'Setting up…' : 'Put it online'}</button>`,
  };
};
Modals.goLiveDone = (m) => ({
  title: `${esc(m.name)} is live`,
  body: `<div class="col" style="gap:12px"><div class="small muted">Clients can book at:</div><div class="card pad strong" style="word-break:break-all">${esc(shortLink(m.slug))}</div>
    <div class="small muted">Book something on your phone to try it. It shows up on this calendar within seconds.</div></div>`,
  foot: `<button class="btn" data-act="cloud-copy">Copy link</button><button class="btn" data-act="cloud-open">Open it</button><button class="btn primary" data-act="close-modal">Done</button>`,
});
Modals.openFromCloud = (m) => ({
  title: 'Your live businesses',
  body: m.loading ? '<div class="small muted">Loading…</div>' : m.error ? `<div class="alert bad">${I.warn}<div>${esc(m.error)}</div></div>`
    : (m.list || []).length ? `<div class="list">${m.list.map((b) => { const here = workspaces().some((w) => w.id === b.id); return `<div class="ws-row"><div class="ws-mark" style="background:hsl(${hashHue(b.name)} 32% 44%)">${esc(b.name[0])}</div><div class="grow"><div class="strong">${esc(b.name)}</div><div class="small muted">${esc(shortLink(b.slug))}</div></div>${here ? '<span class="badge">On this device</span>' : `<button class="btn sm primary" data-act="cloud-open-biz" data-id="${b.id}">Open</button>`}</div>`; }).join('')}</div>`
    : '<div class="small muted">No live businesses on this account yet.</div>',
  foot: '<button class="btn" data-act="close-modal">Close</button>',
});

async function needAccount(next) {
  await Cloud.refreshUser();
  if (Cloud.user) return true;
  openModal('cloudAuth', { mode: 'signin', next }); return false;
}
Object.assign(Actions, {
  'cloud-golive': async () => { closePalette(); if (await needAccount('golive')) openModal('goLive'); },
  'cloud-resume': async () => { if (await needAccount('resume')) { Cloud.start(); rerenderContent(); } },
  'cloud-from-cloud': async () => { if (!(await needAccount('open'))) return; openModal('openFromCloud', { loading: true }); try { const list = await Cloud.myBusinesses(); openModal('openFromCloud', { list }); } catch (e) { openModal('openFromCloud', { error: e.message }); } },
  'cloud-auth-forgot': () => { const m = S.ui.modal; const v = formValues($('#cloud-auth')); openModal('cloudAuth', { ...m, email: v.email || m.email || '', mode: 'reset', error: '', info: '' }); },
  'cloud-auth-back': () => { const m = S.ui.modal; const v = formValues($('#cloud-auth')); openModal('cloudAuth', { ...m, email: v.email || m.email || '', mode: 'signin', error: '', info: '' }); },
  'cloud-auth-reset': async () => {
    const m = S.ui.modal; const v = formValues($('#cloud-auth')); const email = (v.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return openModal('cloudAuth', { ...m, email, error: 'Enter your email address.' });
    openModal('cloudAuth', { ...m, email, busy: true, error: '', info: '' });
    try { await Cloud.resetPassword(email); openModal('cloudAuth', { ...m, email, busy: false, info: `If ${email} has a Luster account, a reset link is on its way. Open it on this iPad.` }); }
    catch (e) { openModal('cloudAuth', { ...m, email, busy: false, error: e.message }); }
  },
  'np-submit': async () => {
    const v = formValues($('#np')); const pw = v.password || '';
    if (pw.length < 8) return openModal('newPassword', { error: 'Use at least 8 characters.' });
    if (pw !== v.password2) return openModal('newPassword', { error: "Those two don't match." });
    openModal('newPassword', { busy: true });
    try { await Cloud.setPassword(pw); closeModal(); toast("Password changed. You're signed in on this iPad."); if (isLive()) Cloud.start(); renderRail(); }
    catch (e) { openModal('newPassword', { error: e.message }); }
  },
  'cloud-auth-mode': () => { const m = S.ui.modal; const v = formValues($('#cloud-auth')); openModal('cloudAuth', { ...m, email: v.email || m.email || '', mode: m.mode === 'signup' ? 'signin' : 'signup', error: '', info: '' }); },
  'cloud-auth-submit': async () => {
    const m = S.ui.modal; const v = formValues($('#cloud-auth'));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email || '')) return openModal('cloudAuth', { ...m, email: v.email, error: 'Enter your email address.' });
    if (m.mode === 'signup' && (v.password || '').length < 8) return openModal('cloudAuth', { ...m, email: v.email, error: 'Use at least 8 characters for the password.' });
    openModal('cloudAuth', { ...m, email: v.email, busy: true, error: '' });
    try {
      if (m.mode === 'signup') {
        const r = await Cloud.signUp(v.email, v.password);
        if (r.needsConfirm) return openModal('cloudAuth', { ...m, mode: 'signin', email: v.email, busy: false, info: `We sent a confirmation link to ${v.email}. Tap it, then come back here and sign in.` });
      } else await Cloud.signIn(v.email, v.password);
      closeModal();
      if (m.next === 'golive') openModal('goLive');
      else if (m.next === 'open') Actions['cloud-from-cloud']();
      else if (m.next === 'resume') { Cloud.start(); rerenderContent(); }
      toast('Signed in');
    } catch (e) { openModal('cloudAuth', { ...m, email: v.email, busy: false, error: e.message }); }
  },
  'golive-submit': async () => {
    const m = S.ui.modal; const f = formValues($('#golive'));
    const values = { name: (f.name || '').trim(), slug: (f.slug || '').trim().toLowerCase(), phone: (f.phone || '').trim(), address: (f.address || '').trim(), tz: f.tz || 'America/Chicago' };
    if (!values.name) return openModal('goLive', { ...m, values, error: 'Add the business name.' });
    if (!SLUG_RE.test(values.slug)) return openModal('goLive', { ...m, values, error: 'The booking link needs 2–40 lowercase letters, numbers or dashes, starting with a letter or number.' });
    openModal('goLive', { ...m, values, busy: true, error: '' });
    try {
      await Cloud.goLive({ name: values.name, slug: values.slug, phone: values.phone, address: values.address, timezone: values.tz });
      S.ui = defaultUI(); App.go('calendar');
      openModal('goLiveDone', { name: values.name, slug: values.slug });
      Cloud.start();
    } catch (e) { openModal('goLive', { ...m, values, busy: false, error: /taken/i.test(e.message) ? 'That booking link is taken. Try another.' : e.message }); }
  },
  'cloud-copy': async () => { const url = bookingUrl(st().live.slug); try { await navigator.clipboard.writeText(url); toast('Booking link copied'); } catch (e) { toast(esc(url)); } },
  'cloud-open': () => { window.open(bookingUrl(st().live.slug), '_blank', 'noopener'); },
  'cloud-share': async () => { try { await navigator.share({ title: `Book at ${st().business.name}`, url: bookingUrl(st().live.slug) }); } catch (e) {} },
  'cloud-sync': async () => { await Cloud.sync({ full: true }); toast(Cloud.status === 'ok' ? 'Up to date' : `Sync: ${esc(Cloud.lastError || Cloud.status)}`, Cloud.status === 'ok' ? 'good' : 'bad'); rerenderContent(); },
  'cloud-signout': () => confirmModal('Sign out?', 'This iPad keeps its copy of the calendar, but stops syncing until someone signs in again.', 'Sign out', async () => { await Cloud.signOut(); Cloud.setStatus('signedout'); rerenderContent(); renderRail(); }),
  'cloud-open-biz': async (el) => {
    const id = el.dataset.id; const list = (S.ui.modal && S.ui.modal.list) || []; const b = list.find((x) => x.id === id); if (!b) return;
    const idx = workspaces(); idx.push({ id: b.id, name: b.name, templateId: b.template_id || 'facial', live: { businessId: b.id, slug: b.slug, timezone: b.timezone }, opts: {}, createdAt: todayStr() }); saveIndex(idx);
    closeModal(); await switchWorkspace(b.id); S.ui = defaultUI(); App.go('calendar'); toast(`Opened ${esc(b.name)}. Syncing…`);
  },
});
