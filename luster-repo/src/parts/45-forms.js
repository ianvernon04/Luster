/* ===== Forms (intake & consent) ===== */
Views.forms = {
  title: () => 'Forms',
  sub() { const sent = st().forms.filter((f) => f.status === 'sent').length; return `${sent} awaiting signature · intake and consent forms attach to the client file the moment they're signed`; },
  actions: () => `<div class="seg">${[['inbox', 'Awaiting'], ['done', 'Signed'], ['templates', 'Templates']].map(([k, l]) => `<button class="btn ${(S.ui.formsTab || 'inbox') === k ? 'on' : ''}" data-act="forms-tab" data-id="${k}">${l}</button>`).join('')}</div>`,
  render() {
    const tab = S.ui.formsTab || 'inbox';
    if (tab === 'templates') return `<div class="auto-grid">${st().formTemplates.map((t) => { const qs = t.fields.filter((f) => f.type !== 'section' && f.type !== 'signature').length; const cond = t.fields.filter((f) => f.showIf).length; return `<div class="card pad"><div class="row between"><div class="strong">${esc(t.name)}</div><span class="badge">${t.kind}</span></div><div class="small muted" style="margin:6px 0 10px">${qs} questions${cond ? ` (${cond} only appear when relevant)` : ''} · ${t.fields.some((f) => f.type === 'signature') ? 'signature required' : 'no signature'}${t.estMinutes ? ` · about ${t.estMinutes} min` : ''}</div>${t.text ? `<div class="consent-text" style="max-height:90px">${esc(t.text)}</div>` : ''}${t.kind === 'intake' ? `<div class="small muted">Sections: ${t.fields.filter((f) => f.type === 'section').map((f) => esc(f.label)).join(' · ')}</div>` : ''}<div class="row" style="margin-top:10px"><button class="btn sm" data-act="form-preview" data-tpl="${t.id}">Preview</button><span class="tiny faint">Sent automatically when a booking needs it</span></div></div>`; }).join('')}</div>`;
    const forms = st().forms.filter((f) => (tab === 'inbox' ? f.status === 'sent' : f.status === 'completed')).sort(by((f) => tab === 'inbox' ? (f.sentAt || '') : (f.date || ''))).reverse();
    if (!forms.length) return `<div class="empty"><span class="serif">${tab === 'inbox' ? 'Inbox zero' : 'Nothing signed yet'}</span>${tab === 'inbox' ? 'Every form that goes out comes back here until it\'s signed.' : ''}</div>`;
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Client</th><th>Form</th><th>${tab === 'inbox' ? 'Sent' : 'Signed'}</th><th>For</th><th></th></tr></thead><tbody>${forms.slice(0, 80).map((f) => { const c = clientById(f.clientId); if (!c) return ''; const t = tplById(f.templateId); const a = f.appointmentId ? apptById(f.appointmentId) : null; return `<tr><td><div class="row" style="cursor:pointer" data-act="open-client" data-id="${c.id}">${avatar(c, 'sm')}<span class="strong">${esc(fullName(c))}</span></div></td><td>${esc(t.name)}</td><td class="small muted">${tab === 'inbox' ? relDate(f.sentAt) : fmtDate(f.date)}</td><td class="small muted">${a ? `${fmtDate(a.date, 'dow')} · ${esc(apptTitle(a))}` : t.kind === 'intake' ? 'First visit' : '—'}</td><td class="r"><div class="row" style="justify-content:flex-end">${tab === 'inbox' ? `<button class="btn sm" data-act="resend-form" data-id="${f.id}">Resend</button><button class="btn sm primary" data-act="fill-form" data-id="${f.id}">Fill now</button>` : `<button class="btn sm" data-act="view-form" data-id="${f.id}">View</button>`}</div></td></tr>`; }).join('')}</tbody></table></div>`;
  },
};
const YESNO = ['Yes', 'No'];
function showIfAttr(f) { return f.showIf ? ` data-showif='${esc(JSON.stringify(f.showIf))}'` : ''; }
function renderFormFields(t, answers = {}, readOnly = false) {
  return t.fields.map((f) => {
    const v = answers[f.id];
    if (f.type === 'section') {
      if (readOnly) return `<div class="form-section"><h3>${esc(f.label)}</h3></div>`;
      return `<div class="form-section"><h3>${esc(f.label)}</h3>${f.desc ? `<p class="small muted">${esc(f.desc)}</p>` : ''}</div>`;
    }
    if (readOnly) {
      if (f.showIf && !showIfMet(f.showIf, answers)) return '';
      if (f.type === 'signature') return `<div class="form-field"><label>${esc(f.label)}</label>${answers.__sig && answers.__sig !== 'seed' ? `<img src="${answers.__sig}" alt="Signature" style="max-height:80px;background:var(--surface-2);border-radius:6px">` : `<div class="serif" style="font-size:24px;color:var(--ink-2)">${esc(answers.__name || 'Signed on file')}</div>`}</div>`;
      const empty = v === undefined || v === '' || (Array.isArray(v) && !v.length);
      return `<div class="form-field ro"><label>${esc(f.label)}</label><div>${Array.isArray(v) ? v.map((x) => `<span class="badge ${/^(Cancer|Accutane|Blood thinners|Pacemaker|Epilepsy|Bleeding)/.test(x) ? 'bad' : ''}">${esc(x)}</span>`).join(' ') : v === true ? `<span class="badge good">${I.check}Agreed</span>` : !empty ? esc(v) : '<span class="faint">—</span>'}</div></div>`;
    }
    const wrap = (inner, extra = '') => `<div class="form-field" data-field="${f.id}"${showIfAttr(f)}${extra}>${inner}${f.hint ? `<div class="tiny faint">${esc(f.hint)}</div>` : ''}</div>`;
    if (f.type === 'choice' || f.type === 'multi') return wrap(`<label>${esc(f.label)}</label><div class="opts">${f.options.map((o) => `<button type="button" class="opt ${Array.isArray(v) ? v.includes(o) : v === o ? 'on' : ''}" data-act="ff-opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`, ` data-type="${f.type}"`);
    if (f.type === 'yesno') return wrap(`<label>${esc(f.label)}</label><div class="opts">${YESNO.map((o) => `<button type="button" class="opt ${v === o ? 'on' : ''}" data-act="ff-opt" data-v="${o}">${o}</button>`).join('')}</div>`, ' data-type="choice"');
    if (f.type === 'text' || f.type === 'phone') return wrap(`<label for="ff-${f.id}">${esc(f.label)}</label><input class="input" id="ff-${f.id}" data-input="${f.id}" value="${esc(v || '')}" placeholder="${esc(f.placeholder || '')}" ${f.type === 'phone' ? 'inputmode="tel"' : ''}>`, ' data-type="text"');
    if (f.type === 'date') return wrap(`<label for="ff-${f.id}">${esc(f.label)}</label><input class="input" type="date" id="ff-${f.id}" data-input="${f.id}" value="${esc(v || '')}" style="max-width:220px">`, ' data-type="text"');
    if (f.type === 'textarea') return wrap(`<label for="ff-${f.id}">${esc(f.label)}</label><textarea class="textarea" id="ff-${f.id}" data-input="${f.id}" style="min-height:64px" placeholder="${esc(f.placeholder || '')}">${esc(v || '')}</textarea>`, ' data-type="text"');
    if (f.type === 'agree') return `<label class="check form-field" data-field="${f.id}" data-type="agree"${showIfAttr(f)}><input type="checkbox" data-input="${f.id}" ${v ? 'checked' : ''}> <span>${esc(f.label)}</span></label>`;
    if (f.type === 'signature') return `<div class="form-field" data-field="${f.id}" data-type="signature"><label>${esc(f.label)} <span class="faint">· sign with a finger or mouse</span></label><canvas class="sig-pad" id="sig-pad" width="600" height="180"></canvas><div class="row"><button type="button" class="btn sm ghost" data-act="sig-clear">Clear</button><span class="tiny faint" id="sig-state">Not signed</span></div></div>`;
    return '';
  }).join('');
}
function showIfMet(cond, answers) {
  const v = answers[cond.field];
  if (cond.equals !== undefined) return v === cond.equals;
  if (cond.includes !== undefined) return Array.isArray(v) ? v.includes(cond.includes) : v === cond.includes;
  if (cond.notIncludes !== undefined) { const arr = Array.isArray(v) ? v : v ? [v] : []; if (cond.nonEmpty && !arr.length) return false; return !arr.includes(cond.notIncludes); }
  return true;
}
/* reads the live answers off the DOM (choices and checkboxes only — enough for every showIf we use) */
function liveAnswers(root) {
  const a = {};
  for (const box of $$('[data-field]', root)) { const id = box.dataset.field; const type = box.dataset.type; if (type === 'multi') a[id] = $$('.opt.on', box).map((b) => b.dataset.v); else if (type === 'choice') a[id] = $('.opt.on', box)?.dataset.v || ''; else if (type === 'agree') a[id] = !!$('input', box)?.checked; else if (type === 'text') a[id] = $('[data-input]', box)?.value || ''; }
  return a;
}
function applyShowIf(root) {
  const a = liveAnswers(root);
  for (const box of $$('[data-showif]', root)) { const cond = JSON.parse(box.dataset.showif); const show = showIfMet(cond, a); box.hidden = !show; box.classList.toggle('cond-on', show); }
}
Modals['form-fill'] = ({ id, preview, tplId }) => {
  const f = id ? st().forms.find((x) => x.id === id) : null; const t = tplById(f ? f.templateId : tplId); const c = f ? clientById(f.clientId) : null;
  const sections = t.fields.filter((x) => x.type === 'section');
  return { title: `${esc(t.name)}${c ? ` · ${esc(fullName(c))}` : ' · preview'}`, wide: t.kind === 'intake', body: `${t.text ? `<div class="consent-text">${esc(t.text)}</div>` : ''}${sections.length ? `<div class="row wrap small muted" style="gap:6px">${sections.map((x) => `<span class="step">${esc(x.label)}</span>`).join('')}<span class="tiny faint">· about ${t.estMinutes || 3} min · questions appear only when they apply</span></div>` : ''}<form id="ff" class="col" style="gap:14px" onsubmit="return false">${renderFormFields(t, f ? prefillIntake(t, c) : {})}</form>`, foot: `<button class="btn" data-act="close-modal">${preview ? 'Close' : 'Later'}</button>${preview ? '' : `<button class="btn primary" data-act="form-submit" data-id="${id}">Sign &amp; save</button>`}`, mount(root) { bindSignaturePad(root); applyShowIf(root); } };
};
function prefillIntake(t, c) { if (t.id !== 'intake' || !c) return {}; return { skin: c.skin, concerns: c.concerns, allergies: c.allergies.length ? c.allergies.map((x) => x.split(' (')[0]) : [], referral: c.source === 'Referral' ? 'Friend or family' : c.source }; }
Modals['form-view'] = ({ id }) => { const f = st().forms.find((x) => x.id === id); const t = tplById(f.templateId); const c = clientById(f.clientId); return { title: `${esc(t.name)} · ${esc(fullName(c))}`, wide: t.kind === 'intake', body: `<div class="small muted">Signed ${fmtDate(f.date, 'long')}${f.appointmentId && apptById(f.appointmentId) ? ` · for ${esc(apptTitle(apptById(f.appointmentId)))}` : ''}</div><div class="col" style="gap:12px">${renderFormFields(t, { ...(f.answers || {}), __sig: f.signature, __name: fullName(c) }, true)}</div>`, foot: `<button class="btn" data-act="close-modal">Close</button>` }; };
function bindSignaturePad(root) {
  const cv = $('#sig-pad', root); if (!cv) return; const ctx = cv.getContext('2d'); let drawing = false; cv.dataset.signed = '0';
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1B2224';
  cv.addEventListener('pointerdown', (e) => { drawing = true; cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
  cv.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); cv.dataset.signed = '1'; const s = $('#sig-state', root); if (s) s.textContent = 'Signed'; });
  const up = () => { drawing = false; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv._clear = () => { ctx.clearRect(0, 0, cv.width, cv.height); cv.dataset.signed = '0'; const s = $('#sig-state', root); if (s) s.textContent = 'Not signed'; };
}
function collectForm(root, t) {
  const answers = {}; let ok = true, missing = '';
  const live = liveAnswers(root);
  const visible = (f) => !f.showIf || showIfMet(f.showIf, live);
  for (const f of t.fields) {
    if (f.type === 'section') continue;
    if (!visible(f)) continue;
    const box = $(`[data-field="${f.id}"]`, root); if (!box) continue;
    if (f.type === 'choice' || f.type === 'multi' || f.type === 'yesno') { const on = $$('.opt.on', box).map((b) => b.dataset.v); answers[f.id] = f.type === 'multi' ? on : on[0] || ''; if (!answers[f.id].length && ok) { ok = false; missing = `Please answer: ${f.label}`; } }
    else if (f.type === 'agree') { const cb = $('input', box); answers[f.id] = !!cb.checked; if (!cb.checked && ok) { ok = false; missing = 'Please tick: ' + f.label; } }
    else if (f.type === 'signature') { const cv = $('#sig-pad', root); if (cv.dataset.signed !== '1' && ok) { ok = false; missing = 'Signature required'; } answers.__sig = cv.dataset.signed === '1' ? cv.toDataURL('image/png') : null; }
    else { const el = $('[data-input]', box); answers[f.id] = el ? el.value.trim() : ''; }
  }
  return { ok, missing, answers };
}
/* Turn a completed intake into the client record: skin, allergies, cautions and the health summary the team sees everywhere. */
function applyIntakeToClient(c, a) {
  const patch = {}; const flags = new Set(c.flags.filter((k) => !FLAGS.some((f) => f.k === k)));
  const cond = a.conditions || [], meds = a.meds || [], procs = a.procedures || [];
  if (cond.includes('Cancer (current or past)')) flags.add('oncology');
  if (cond.includes('Diabetes')) flags.add('diabetes');
  if (cond.includes('Cold sores (herpes simplex)')) flags.add('hsv');
  if (cond.some((x) => x.startsWith('Autoimmune'))) flags.add('autoimmune');
  if (cond.includes('Pacemaker or metal implants') || cond.includes('Epilepsy or seizures')) flags.add('pacemaker');
  if (cond.includes('Bleeding or clotting disorder') || meds.some((x) => x.startsWith('Blood thinners'))) flags.add('thinners');
  if (cond.includes('Keloid or raised scarring')) flags.add('keloid');
  if (a.pregnant === 'Pregnant' || a.pregnant === 'Nursing') flags.add('pregnant');
  if (meds.some((x) => x.startsWith('Accutane'))) flags.add('accutane');
  if (meds.some((x) => x.startsWith('Retinoids')) || (a.routine || []).includes('Retinol or tretinoin')) flags.add('retinoid');
  if (procs.includes('Botox or fillers')) flags.add('botox');
  for (const f of tpl().intake.section.fields) { if (!f.flag) continue; const v = a[f.id]; const hit = Array.isArray(v) ? v.includes(f.flag.when) : v === f.flag.when; if (hit) flags.add(f.flag.k); }
  if ((a.allergies || []).includes('Hair dye (PPD)')) flags.add('ppd'); if ((a.allergies || []).includes('Acrylates (gel or acrylic nails)')) flags.add('acrylate'); if ((a.allergies || []).includes('Adhesives (lash glue, tape)')) flags.add('adhesive');
  if (cond.includes('Blood clots or DVT')) flags.add('dvt'); if (cond.some((x) => x.startsWith('Neuromuscular'))) flags.add('neuro'); if (cond.some((x) => x.startsWith('Recent surgery'))) flags.add('surgery');
  const allergies = (a.allergies || []).filter((x) => x !== 'None known' && x !== 'Seasonal allergies').concat(a.allergies_other ? [a.allergies_other] : []);
  if (allergies.length) flags.add('allergy');
  patch.flags = Array.from(flags); patch.allergies = allergies;
  if (a.skin) patch.skin = a.skin; if (a.concerns?.length) patch.concerns = a.concerns;
  const cancer = cond.includes('Cancer (current or past)') ? { type: a.cancer_type || '', status: a.cancer_status || '', tx: a.cancer_tx || [], radiationArea: a.cancer_radiation_area || '', lymph: a.cancer_lymph || '', port: a.cancer_port || '', effects: a.cancer_effects || [], clearance: a.cancer_clearance || 'Not yet', physician: a.cancer_physician || '' } : null;
  const vertical = {}; for (const f of tpl().intake.section.fields) if (f.id !== 'skin' && f.id !== 'concerns' && a[f.id] !== undefined) vertical[f.id] = a[f.id];
  patch.medical = { ...(c.medical || {}), vertical, conditions: cond, conditionsDetail: a.conditions_detail || '', cancer, meds, medsList: a.meds_list || '', allergies: a.allergies || [], allergiesOther: a.allergies_other || '', pregnancy: a.pregnant || '', procedures: procs, proceduresDate: a.procedures_date || '', trimester: a.trimester || '', sun: a.sun || '', smoke: a.smoke || '', routine: a.routine || [], products: a.products || '', goals: a.goals || '', emergency: { name: a.emergency_name || '', phone: a.emergency_phone || '' }, occupation: a.occupation || '', pressure: a.pressure || '', scent: a.scent || '', chat: a.chat || '', photos: a.photos || '', under18: a.under18 || '', guardian: a.guardian || '', updatedAt: todayStr() };
  const prefBits = [a.pressure ? `${a.pressure} pressure` : '', a.chat === 'Quiet, please' ? 'quiet room' : '', a.scent === 'Yes' ? 'no scents' : ''].filter(Boolean);
  if (!c.prefs && prefBits.length) patch.prefs = prefBits.join(', ');
  return upsertClient(patch, c.id);
}
Object.assign(Actions, {
  'forms-tab': (el) => { S.ui.formsTab = el.dataset.id; rerenderContent(); },
  'fill-form': (el) => { closeDrawer(); openModal('form-fill', { id: el.dataset.id }); },
  'form-preview': (el) => openModal('form-fill', { preview: true, tplId: el.dataset.tpl }),
  'view-form': (el) => openModal('form-view', { id: el.dataset.id }),
  'resend-form': (el) => { const f = st().forms.find((x) => x.id === el.dataset.id); f.sentAt = todayStr(); const c = clientById(f.clientId); sendMessage(c.id, `Hi ${c.first}, quick one before your visit — your ${tplById(f.templateId).name} takes a few minutes: simplyfacials.example/f/${f.id.slice(-5)}`, 'form'); commit(); toast(`Resent to ${fmtPhone(c.phone)} (simulated)`); },
  'send-form': (el) => { sendForm(el.dataset.client, el.dataset.tpl); const d = $('#client-detail'); if (d) d.innerHTML = clientDetail(S.ui.clientId); toast('Form sent by text (simulated)'); },
  'ff-opt': (el) => { const box = el.closest('[data-field]'); if (box.dataset.type === 'multi') { const none = /^None/.test(el.dataset.v); if (none) $$('.opt', box).forEach((b) => b.classList.toggle('on', b === el && !el.classList.contains('on'))); else { el.classList.toggle('on'); $$('.opt', box).forEach((b) => { if (/^None/.test(b.dataset.v)) b.classList.remove('on'); }); } } else { $$('.opt', box).forEach((b) => b.classList.toggle('on', b === el)); } const root = el.closest('form'); if (root) applyShowIf(root); },
  'sig-clear': () => { const cv = $('#sig-pad'); if (cv && cv._clear) cv._clear(); },
  'form-submit': (el) => {
    const f = st().forms.find((x) => x.id === el.dataset.id); const t = tplById(f.templateId); const root = $('#ff');
    const { ok, missing, answers } = collectForm(root, t); if (!ok) { toast(missing, 'bad'); return; }
    const sig = answers.__sig; delete answers.__sig; completeForm(f.id, answers, sig);
    let c = clientById(f.clientId);
    if (t.id === 'intake') c = applyIntakeToClient(c, answers);
    closeModal(); if (S.ui.view === 'forms') rerenderContent(); else if (S.ui.view === 'clients') { const d = $('#client-detail'); if (d) d.innerHTML = clientDetail(S.ui.clientId); } else if (S.ui.view === 'calendar' && S.ui.drawer) renderDrawer(); renderRail();
    const newFlags = clientFlags(c).filter((x) => x.k !== 'allergy').map((x) => x.label);
    toast(`${t.name} signed and filed under ${fullName(c)}${newFlags.length ? ` · cautions: ${newFlags.join(', ')}` : ''}`, newFlags.length ? 'bad' : 'good');
  },
});
document.addEventListener('change', (e) => { const cb = e.target.closest('#ff .form-field[data-type="agree"] input'); if (cb) applyShowIf(cb.closest('form')); });
