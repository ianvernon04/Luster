/* ===== Workspace catalog + generated history, driven by an industry template ===== */
const FIRST = ['Amelia', 'Brooke', 'Camille', 'Destiny', 'Elise', 'Faith', 'Gabrielle', 'Hannah', 'Isabel', 'Jasmine', 'Kiara', 'Lauren', 'Monique', 'Nia', 'Olivia', 'Paige', 'Renee', 'Simone', 'Tiffany', 'Victoria', 'Whitney', 'Alexis', 'Bianca', 'Celeste', 'Danielle', 'Erin', 'Felicia', 'Giselle', 'Haley', 'Imani', 'Jade', 'Kelsey', 'Lindsey', 'Madison', 'Natalie', 'Octavia', 'Priya', 'Rachel', 'Sierra', 'Taylor', 'Vanessa', 'Yolanda', 'Zoe', 'Angela', 'Brittany', 'Chloe', 'Dominique', 'Emily', 'Francesca', 'Grace', 'Heather', 'Ivy', 'Jordan', 'Kristen', 'Leah', 'Maya', 'Nicole', 'Ophelia', 'Peyton', 'Quinn', 'Rosa', 'Sabrina', 'Tara', 'Uma', 'Valerie', 'Willow', 'Ximena', 'Yasmin', 'Zara', 'Marcus', 'Devin', 'Andre', 'Caleb', 'Tyler', 'Jalen'];
const LAST = ['Landry', 'Hebert', 'Broussard', 'Guidry', 'Fontenot', 'Richard', 'LeBlanc', 'Robinson', 'Williams', 'Johnson', 'Jackson', 'Thomas', 'Washington', 'Martin', 'Bergeron', 'Trahan', 'Dupre', 'Melancon', 'Babineaux', 'Carter', 'Simmons', 'Harris', 'Lewis', 'Nguyen', 'Tran', 'Patel', 'Garcia', 'Rodriguez', 'Hernandez', 'Morales', 'Scott', 'Green', 'Baker', 'Adams', 'Mitchell', 'Campbell', 'Roberts', 'Phillips', 'Evans', 'Turner', 'Parker', 'Collins', 'Edwards', 'Stewart', 'Morris', 'Reed', 'Cook', 'Bell', 'Murphy', 'Rivera', 'Cooper', 'Ward', 'Peterson', 'Gray', 'James', 'Watson', 'Brooks', 'Kelly', 'Sanders', 'Price', 'Bennett', 'Wood', 'Barnes', 'Ross', 'Henderson', 'Coleman', 'Jenkins', 'Perry', 'Powell', 'Long', 'Patterson', 'Hughes', 'Flores', 'Butler', 'Simms', 'Foster', 'Gonzales', 'Bryant', 'Alexander', 'Russell', 'Griffin', 'Diaz', 'Hayes'];
const MEN = new Set(['Marcus', 'Devin', 'Andre', 'Caleb', 'Tyler', 'Jalen']);   // first names above that the seed treats as men (no pregnancies; the men's facial)
const SOURCES = ['Instagram', 'Google', 'Referral', 'Walk-in', 'Website', 'TikTok', 'Referral', 'Instagram'];
const EVENTS = ['a wedding', 'graduation', 'family photos', 'a gala', 'vacation', 'an anniversary dinner', 'a reunion'];
const WAITLIST_NOTES = ['Any Saturday morning', 'Flexible on time, prefers the owner', 'Before the 15th (wedding)', 'Evenings after 5 only', 'Wants a cancellation slot this week'];
const SCHEDULES = [{ 2: [540, 1020], 3: [540, 1020], 4: [540, 1020], 5: [540, 1020], 6: [480, 900] }, { 1: [540, 1080], 2: [540, 1080], 3: [540, 1080], 4: [540, 1080], 5: [540, 1080] }, { 2: [600, 1140], 3: [600, 1140], 4: [600, 1140], 5: [600, 1140], 6: [540, 1020] }, { 1: [480, 960], 2: [480, 960], 4: [480, 960], 5: [480, 960], 6: [480, 900] }, { 1: [600, 1080], 3: [600, 1080], 4: [600, 1080], 5: [600, 1140], 6: [540, 1020] }, { 2: [540, 1080], 3: [540, 1080], 5: [540, 1080], 6: [480, 960] }];

/* Builds the catalog for a workspace: the template's services, categories, products and forms with the business's own name, team and address.
   With opts.studio (a pitch link, 32-studios.js) it's that real studio's menu, prices, hours, memberships and team structure instead. */
const studioOf = (templateId, id) => (id && STUDIOS[id] && STUDIOS[id].template === templateId ? STUDIOS[id] : null);
function catalogFor(templateId, opts = {}) {
  const T = TEMPLATES[templateId] || TEMPLATES.facial; const d = T.defaults;
  const P = studioOf(T.id, opts.studio); const src = P || T;
  const name = (opts.name || '').trim() || (P ? P.name : d.name); const slug = slugify(name);
  const rng = mulberry32(hashHue(name) + 11);
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const staff = P ? copy(P.staff) : T.staff && !opts.name ? copy(T.staff) : generateStaff(T, opts, rng);
  return {
    templateId, studio: P ? P.id : undefined, workspace: { name, templateId, opts: { ...opts, name } },
    business: { name, tagline: T.label, phone: (opts.phone || '').trim() || (P ? P.phone : d.phone), email: `hello@${slug}.example`, address: (opts.address || '').trim() || (P ? P.address : d.address), slug, taxRate: d.taxRate ?? 0.105, hours: P ? copy(P.hours) : { 0: null, 1: [540, 1080], 2: [540, 1140], 3: [540, 1140], 4: [540, 1140], 5: [540, 1140], 6: [480, 1020] } },
    categories: src.categories.map((c) => ({ ...c })), staff,
    services: src.services.map((s) => copy(s)), products: (P && P.products || T.products).map((p) => ({ ...p })), plans: src.plans.map((p) => ({ ...p, perks: p.perks.slice(), includes: p.includes.slice() })),
    formTemplates: [intakeTemplate(T), ...T.consents.map(copy), ...(P ? P.consents.map(copy) : []), copy(PHOTO_RELEASE)],
    consentFor: { ...src.consentFor },
    copy: P ? { ...T.copy, ...P.copy } : undefined,
    settings: { reminders: { confirmOnBooking: true, sms24h: true, sms2h: true, emailConfirm: true, rebookNudge: true, rebookDays: 28, birthday: true, reviewRequest: false }, booking: { leadMinutes: 60, windowDays: 60, depositRequired: false, cancelHours: 24 } },
  };
}
/* The template as the demo generator sees it: a studio profile brings its own add-on habits, rebooking rhythm, mix of
   caution flags and treatment notes. */
function seedTpl(cat) {
  const T = TEMPLATES[cat.templateId] || TEMPLATES.facial; const P = studioOf(T.id, cat.studio);
  if (!P) return T;
  const s = P.seed || {};
  return { ...T, addonWith: s.addonWith || T.addonWith, gaps: { ...T.gaps, ...(s.gaps || {}) }, flagPool: s.flagPool || T.flagPool, notes: { ...T.notes, ...(s.notes || {}) }, copy: { ...T.copy, ...(P.copy || {}) } };
}
function generateStaff(T, opts, rng) {
  const n = clamp(parseInt(opts.team, 10) || 4, 2, 6); const used = new Set(); const firsts = T.staffFirst || FIRST; const out = [];
  for (let i = 0; i < n; i++) {
    let first, last; do { first = i === 0 && opts.owner ? opts.owner.trim().split(/\s+/)[0] : pick(rng, firsts); last = pick(rng, LAST); } while (used.has(first + last)); used.add(first + last);
    out.push({ id: 's' + (i + 1), name: `${first} ${last}`, role: T.staffRoles[i] || T.staffRoles[T.staffRoles.length - 1], color: STAFF_COLORS[i % STAFF_COLORS.length], bookable: true, days: JSON.parse(JSON.stringify(SCHEDULES[i % SCHEDULES.length])), bio: '', bias: (T.staffBias[i] || T.staffBias[0]).slice() });
  }
  out.push({ id: 's' + (n + 1), name: `${pick(rng, ['Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan'])} ${pick(rng, LAST)}`, role: 'Front Desk', color: '#566068', bookable: false, days: {}, bio: '' });
  return out;
}

function generateClients(rng, cat) {
  const T = seedTpl(cat); const clients = []; const used = new Set(); const today = todayStr();
  const firsts = T.clientFirst || FIRST; const cf = T.clientFields;
  for (let i = 0; i < 420; i++) {
    let first, last, key;
    do { first = pick(rng, firsts); last = pick(rng, LAST); key = first + last; } while (used.has(key));
    used.add(key);
    const freq = pick(rng, [1, 1, 2, 2, 2, 3, 3, 4, 5]);
    const ageYears = rint(rng, 19, 68);
    const dob = new Date(); dob.setFullYear(dob.getFullYear() - ageYears); dob.setMonth(rint(rng, 0, 11)); dob.setDate(rint(rng, 1, 28));
    const createdDaysAgo = chance(rng, 0.1) ? rint(rng, 1, 45) : rint(rng, 60, 760);
    const skin = pick(rng, cf.typeOptions);
    const concerns = uniq([pick(rng, cf.concernOptions), chance(rng, 0.6) ? pick(rng, cf.concernOptions) : null, chance(rng, 0.25) ? pick(rng, cf.concernOptions) : null].filter(Boolean));
    const allergies = chance(rng, 0.14) ? [pick(rng, T.allergyPool)] : [];
    const flags = [];
    for (const [k, p] of T.flagPool) if (chance(rng, p) && !(k === 'pregnant' && MEN.has(first))) { flags.push(k); if (flags.length >= 2) break; }
    const medical = seedMedical(rng, flags, allergies, T);
    if (allergies.length) flags.push('allergy');
    const planMix = cat.plans.length > 2 ? [0, 0, 0, 0, 1, 1, ...cat.plans.slice(2).map((p, i) => i + 2)] : [0, 0, 0, Math.min(1, cat.plans.length - 1)];   // the first plan is the popular one
    const member = chance(rng, 0.24) ? cat.plans[pick(rng, planMix)].id : null;
    const memberSince = member ? addDays(today, -rint(rng, 20, Math.max(21, createdDaysAgo - 10))) : null;
    const priorVisits = createdDaysAgo > 120 ? Math.round((createdDaysAgo - 90) / 365 * (freq * 4 + 2)) : 0;
    const priorSpend = priorVisits ? priorVisits * (70 + freq * 12) + rint(rng, 0, 120) : 0;
    clients.push({
      id: 'c' + String(i + 1).padStart(3, '0'), first, last, phone: `225555${String(100 + ((i * 37) % 900)).padStart(4, '0')}`,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, '')}@example.com`, dob: toDateStr(dob), skin, concerns, allergies, flags,
      source: pick(rng, SOURCES), createdAt: addDays(today, -createdDaysAgo), freq, membershipId: member, memberSince, memberStatus: member ? (chance(rng, 0.9) ? 'active' : 'past_due') : null,
      vip: freq >= 4 && chance(rng, 0.6), priorVisits, priorSpend, seeded: true, medical, storeCredit: 0, prefs: chance(rng, 0.3) ? pick(rng, T.copy.prefs) : '',
      cardOnFile: chance(rng, 0.55) ? { brand: pick(rng, ['Visa', 'Mastercard', 'Amex', 'Visa', 'Discover']), last4: String(rint(rng, 1000, 9999)) } : null,
    });
  }
  return clients;
}

/* A plausible health-history record consistent with the client's flags (what a completed intake would have produced). */
function seedMedical(rng, flags, allergies, T) {
  const has = (k) => flags.includes(k);
  const conditions = [];
  if (has('oncology')) conditions.push('Cancer (current or past)'); if (has('diabetes')) conditions.push('Diabetes'); if (has('hsv')) conditions.push('Cold sores (herpes simplex)'); if (has('autoimmune')) conditions.push('Autoimmune disorder (lupus, RA, MS…)'); if (has('pacemaker')) conditions.push(pick(rng, ['Pacemaker or metal implants', 'Epilepsy or seizures'])); if (has('thinners')) conditions.push('Bleeding or clotting disorder'); if (has('keloid')) conditions.push('Keloid or raised scarring'); if (has('dvt')) conditions.push('Blood clots or DVT'); if (has('neuro')) conditions.push('Neuromuscular disorder (MG, ALS…)'); if (has('surgery')) conditions.push('Recent surgery (last 6 months)'); if (has('cold')) conditions.push(COLD_CONDITION);
  if (chance(rng, 0.08)) conditions.push(pick(rng, ['Thyroid condition', 'Asthma', 'Rosacea', 'Eczema, psoriasis or dermatitis', 'Heart condition or high blood pressure']));
  if (!conditions.length) conditions.push('None of these');
  const meds = [];
  if (has('accutane')) meds.push('Accutane / isotretinoin (last 12 months)'); if (has('retinoid')) meds.push('Retinoids (tretinoin, retinol, adapalene)'); if (has('thinners')) meds.push('Blood thinners (aspirin, warfarin, Eliquis…)'); if (has('autoimmune') && chance(rng, 0.6)) meds.push('Immunosuppressants'); if (chance(rng, 0.2)) meds.push('Hormone therapy or birth control');
  if (!meds.length) meds.push('None of these');
  const cancer = has('oncology') ? { type: pick(rng, ['Breast', 'Thyroid', 'Skin (basal cell)', 'Lymphoma', 'Colon', 'Prostate', 'Ovarian']), status: pick(rng, ['In treatment now', 'Finished within the last 12 months', 'In remission over a year', 'In remission over a year']), tx: pick(rng, [['Surgery', 'Chemotherapy'], ['Surgery', 'Radiation'], ['Chemotherapy', 'Radiation', 'Hormone therapy'], ['Surgery'], ['Immunotherapy']]), radiationArea: '', lymph: pick(rng, ['No', 'Left side', 'Right side', 'No']), port: chance(rng, 0.3) ? 'Yes' : 'No', effects: pick(rng, [['Skin sensitivity or dryness'], ['Fatigue', 'Skin sensitivity or dryness'], ['Numbness or tingling (neuropathy)'], ['None right now']]), clearance: pick(rng, ['Yes, letter on file', 'Yes, letter on file', 'Yes, I will bring it', 'Not yet']), physician: `Dr. ${pick(rng, ['Patel', 'Marchand', 'Okafor', 'Guidry', 'Lin'])} · (225) 555-01${rint(rng, 10, 99)}` } : null;
  if (cancer && cancer.tx.includes('Radiation')) cancer.radiationArea = pick(rng, ['Left chest', 'Right chest', 'Neck', 'Face', 'Pelvis']);
  // vertical section answers
  const vertical = {};
  for (const f of T.intake.section.fields) {
    if (f.id === 'skin' || f.id === 'concerns') continue;
    if (f.flag) { vertical[f.id] = has(f.flag.k) ? f.flag.when : (f.type === 'yesno' ? 'No' : ''); continue; }
    if (f.type === 'choice') vertical[f.id] = pick(rng, f.options); else if (f.type === 'yesno') vertical[f.id] = chance(rng, 0.25) ? 'Yes' : 'No'; else if (f.type === 'multi') vertical[f.id] = uniq([pick(rng, f.options), chance(rng, 0.4) ? pick(rng, f.options) : null].filter(Boolean)); else if (f.type === 'textarea' || f.type === 'text') vertical[f.id] = chance(rng, 0.3) ? pick(rng, ['None', 'Old shoulder injury, right side', 'Nothing major', 'Knee surgery 2024', 'Tension headaches']) : '';
  }
  if (T.id === 'medspa' || T.id === 'facial') vertical.fitz = pick(rng, FITZ.slice(1));
  return {
    conditions, cancer, meds, medsList: meds[0] === 'None of these' ? pick(rng, ['None', 'Multivitamin, fish oil', 'Zyrtec in spring', 'None']) : pick(rng, ['See above', 'Metformin 500mg, lisinopril', 'Eliquis 5mg', 'Levothyroxine']),
    allergies: allergies.length ? allergies : ['None known'], pregnancy: has('pregnant') ? pick(rng, ['Pregnant', 'Nursing']) : 'Not applicable', trimester: has('pregnant') ? pick(rng, ['Second', 'Third']) : '',
    procedures: has('botox') ? ['Botox or fillers'] : ['None of these'], vertical,
    sun: pick(rng, ['Every day', 'Sometimes', 'Sometimes', 'Never']), smoke: chance(rng, 0.12) ? 'Yes' : 'No',
    emergency: { name: pick(rng, ['Mom', 'Husband', 'Wife', 'Partner', 'Sister', 'Dad', 'Roommate']) + ' · ' + pick(rng, FIRST) + ' ' + pick(rng, LAST), phone: `(225) 555-0${rint(rng, 100, 199)}` },
    occupation: pick(rng, ['Nurse', 'Teacher', 'Realtor', 'LSU student', 'Hairstylist', 'Accountant', 'Stay-at-home parent', 'Software developer', 'Pharmacist', 'Retired', 'Air Force', 'Attorney', 'Welder', 'Sales']),
    pressure: pick(rng, ['Light', 'Medium', 'Medium', 'Firm']), scent: chance(rng, 0.15) ? 'Yes' : 'No', chat: pick(rng, ['Chat with me', 'Quiet, please', 'Either', 'Either']), photos: pick(rng, ['Yes, for my file only', 'Yes, and you may share them without my name', 'Yes, for my file only', 'No photos']),
    routine: uniq([pick(rng, T.intake.routineOptions), chance(rng, 0.5) ? pick(rng, T.intake.routineOptions) : null].filter(Boolean)), products: pick(rng, ['Whatever is on sale', 'Drugstore brands', 'Bought the studio\'s kit last time', 'Not much', 'Professional line from here']),
  };
}
function intakeAnswersFor(c, rng, T) {
  const m = c.medical || seedMedical(rng, c.flags, c.allergies, T);
  const a = { emergency_name: m.emergency.name, emergency_phone: m.emergency.phone, occupation: m.occupation, referral: pick(rng, ['Instagram', 'Google', 'Friend or family', 'TikTok', 'Website', 'Walked by']),
    conditions: m.conditions, conditions_detail: '', meds: m.meds, meds_list: m.medsList, allergies: m.allergies, allergies_other: '', pregnant: m.pregnancy, trimester: m.trimester, procedures: m.procedures, skin: c.skin, concerns: c.concerns, ...m.vertical, sun: m.sun, smoke: m.smoke,
    routine: m.routine, products: m.products, goals: pick(rng, ['Clearer skin before my wedding', 'Just want to relax', 'Look like me, but rested', 'Keep it healthy as I age', 'Fix what the last place did', 'Feel like myself again']), pressure: m.pressure, scent: m.scent, chat: m.chat, photos: m.photos, under18: 'No', accurate: true, notify: true, policy: true };
  if (m.cancer) Object.assign(a, { cancer_type: m.cancer.type, cancer_status: m.cancer.status, cancer_tx: m.cancer.tx, cancer_radiation_area: m.cancer.radiationArea, cancer_lymph: m.cancer.lymph, cancer_port: m.cancer.port, cancer_effects: m.cancer.effects, cancer_clearance: m.cancer.clearance, cancer_physician: m.cancer.physician });
  if (m.procedures[0] !== 'None of these') a.procedures_date = addDays(todayStr(), -rint(rng, 3, 20));
  return a;
}
// like pick(), but a service can be more popular than its neighbours (seedWeight); unweighted lists pick exactly as pick() does
function wpick(rng, arr) { const w = (s) => s.seedWeight || 1; let x = rng() * sum(arr, w); for (const s of arr) { x -= w(s); if (x < 0) return s; } return arr[arr.length - 1]; }
function weightedClientPicker(rng, clients) { const pool = []; clients.forEach((c) => { for (let k = 0; k < c.freq; k++) pool.push(c); }); return () => pick(rng, pool); }

/* Generates appointments, tickets, refunds, notes, photos, forms, messages and a waitlist for the window around `today`. Runs at first load and whenever the calendar day changes. */
function generateActivity(cat, clients, today, rng, existing = []) {
  const T = seedTpl(cat);
  const existingBy = {}; for (const e of existing) { if (e.status === 'cancelled') continue; (existingBy[e.date + '|' + e.staffId] ||= []).push(e); }
  const svcById = Object.fromEntries(cat.services.map((s) => [s.id, s]));
  const mains = cat.services.filter((s) => !s.addon && !s.noAuto && !s.noSeed && s.price > 0);
  const addons = cat.services.filter((s) => s.addon);
  const pickClient = weightedClientPicker(rng, clients);
  // the demo studio follows its own safety rules: nobody is booked into a service their caution flags rule out, and a
  // service made for flagged clients (RESTORE) mostly goes to them
  const unsafe = (c, s) => (T.contra || []).some((r) => r.level === 'bad' && c.flags.includes(r.flag) && (r.services.includes(s.id) || r.cats.includes(s.cat)));
  const meantFor = {}; const poolFor = (s) => (meantFor[s.id] ||= s.seedFor === 'men' ? clients.filter((c) => MEN.has(c.first)) : clients.filter((c) => c.flags.some((f) => s.forFlags.includes(f))));
  const appts = [], tickets = [], notes = [], photos = [], forms = [], messages = [], waitlist = [], refunds = [];
  let n = 0;
  const byCat = groupBy(mains, (s) => s.cat);
  const now = nowMin(); const clientLastVisit = {}; const lastAppt = {};
  const gapFor = (c) => (T.gaps && T.gaps[c]) || 21;

  for (let off = -HISTORY_DAYS; off <= 21; off++) {
    const date = addDays(today, off); const wd = dow(date);
    const busy = wd === 6 ? 1.25 : wd === 5 ? 1.1 : wd === 1 ? 0.8 : 1;
    const takenToday = new Set();
    for (const st of cat.staff) {
      const hrs = st.days[wd]; if (!st.bookable || !hrs) continue;
      const target = Math.round(rint(rng, 4, 7) * busy);
      let cursor = hrs[0] + pick(rng, [0, 0, 15, 30, 45]); let count = 0;
      while (count < target && cursor < hrs[1] - 30) {
        const bias = st.bias && st.bias.length ? st.bias : CAT_ORDER.slice(0, 2);
        const can = (s) => !st.skills || st.skills.includes(s.id);
        const c = pick(rng, bias); const pool = (byCat[c] || mains).filter(can); const svc = wpick(rng, pool.length ? pool : mains.filter(can).length ? mains.filter(can) : mains);
        const items = [{ serviceId: svc.id, price: svc.price, dur: svc.dur }];
        const addPool = addons.filter(can);
        if ((T.addonWith || []).includes(svc.cat) && addPool.length && chance(rng, 0.35)) { const a = pick(rng, addPool); items.push({ serviceId: a.id, price: a.price, dur: a.dur }); }
        const dur = sum(items, (i) => i.dur);
        if (cursor + dur > hrs[1]) break;
        const ex = existingBy[date + '|' + st.id]; if (ex && ex.some((e) => overlaps(cursor, dur, e.start, e.dur))) { cursor += 15; continue; }
        let client = null;
        const strict = svc.seedFor === 'men'; const meant = svc.forFlags || strict ? poolFor(svc) : null;
        for (let tries = 0; tries < 40; tries++) {
          const cand = meant && meant.length && (strict || (tries < 12 && chance(rng, 0.75))) ? pick(rng, meant) : pickClient(); if (takenToday.has(cand.id)) continue;
          if (strict && !MEN.has(cand.first)) continue;
          if (unsafe(cand, svc)) continue;
          const last = lastAppt[cand.id];
          if (last && diffDays(last, date) < Math.min(gapFor(svc.cat), 28)) continue;
          if (off > 0 && last && last > today) continue;
          if (cand.createdAt > date) continue;
          client = cand; break;
        }
        if (!client) { cursor += 30; continue; }
        takenToday.add(client.id); lastAppt[client.id] = date;
        let status;
        if (off < 0) status = chance(rng, 0.045) ? 'noshow' : chance(rng, 0.04) ? 'cancelled' : 'completed';
        else if (off === 0) status = cursor + dur <= now ? 'completed' : cursor <= now ? 'inservice' : cursor - 20 <= now ? 'checkedin' : chance(rng, 0.7) ? 'confirmed' : 'booked';
        else status = off <= 2 ? (chance(rng, 0.75) ? 'confirmed' : 'booked') : (chance(rng, 0.4) ? 'confirmed' : 'booked');
        const id = 'a' + (++n);
        const createdAt = addDays(date, -rint(rng, 1, 35));
        appts.push({ id, clientId: client.id, staffId: st.id, date, start: cursor, items, dur, status, notes: chance(rng, 0.12) ? pick(rng, ['First visit — came from Instagram', 'Running late, texted', 'Birthday month!', 'Requested extra time for consult', 'Bringing a friend (walk-in?)', 'Wants to talk about a membership']) : '', source: chance(rng, 0.55) ? 'online' : 'front_desk', createdAt, seeded: true });
        if (off <= 0 && status === 'completed') clientLastVisit[client.id] = date;
        cursor += dur + pick(rng, [0, 0, 15, 15, 30]);
        count++;
      }
    }
  }

  // tickets
  const prodPool = cat.products;
  for (const a of appts) {
    if (a.status !== 'completed') continue;
    const client = clients.find((c) => c.id === a.clientId);
    const plan = client.membershipId ? cat.plans.find((p) => p.id === client.membershipId) : null;
    const lines = a.items.map((it) => {
      const s = svcById[it.serviceId];
      const covered = plan && plan.includes.includes(s.id) && !s.addon && chance(rng, 0.8);
      return { type: 'service', refId: s.id, name: s.name, price: covered ? 0 : it.price, qty: 1, staffId: a.staffId, note: covered ? `${plan.name} visit` : (plan && s.addon ? 'Member add-on' : '') };
    });
    lines.forEach((l) => { if (l.note === 'Member add-on') l.price = Math.min(l.price, 15); });
    if (chance(rng, 0.24)) { const p = pick(rng, prodPool); const disc = plan ? plan.retailDiscount : 0; lines.push({ type: 'product', refId: p.id, name: p.name, price: Math.round(p.price * (1 - disc) * 100) / 100, qty: 1, staffId: a.staffId, note: disc ? `Member ${Math.round(disc * 100)}% off` : '' }); }
    if (chance(rng, 0.08)) { const p = pick(rng, prodPool); lines.push({ type: 'product', refId: p.id, name: p.name, price: p.price, qty: 1, staffId: a.staffId, note: '' }); }
    const svcSub = sum(lines.filter((l) => l.type === 'service'), (l) => l.price * l.qty);
    const prodSub = sum(lines.filter((l) => l.type === 'product'), (l) => l.price * l.qty);
    const discount = chance(rng, 0.07) ? (chance(rng, 0.5) ? 10 : Math.round(svcSub * 0.1)) : 0;
    const tipBase = Math.max(svcSub, plan ? 70 : 0);
    const tip = chance(rng, 0.7) ? Math.round(tipBase * pick(rng, [0.15, 0.18, 0.2, 0.2, 0.22, 0.25])) : 0;
    const tax = Math.round(prodSub * cat.business.taxRate * 100) / 100;
    const total = Math.round((svcSub + prodSub - discount + tax + tip) * 100) / 100;
    const method = pick(rng, ['card', 'card', 'card', 'card', 'card', 'card_on_file', 'card_on_file', 'cash', 'gift', 'card']);
    const closed = fromDateStr(a.date); closed.setMinutes(a.start + a.dur + rint(rng, 2, 9));
    tickets.push({ id: 't' + a.id.slice(1), appointmentId: a.id, clientId: a.clientId, staffId: a.staffId, date: a.date, lines, discount, tip, tax, total, payments: [{ method, amount: total, last4: method.startsWith('card') ? (client.cardOnFile?.last4 || String(rint(rng, 1000, 9999))) : null }], closedAt: closed.toISOString(), seeded: true });
    a.ticketId = 't' + a.id.slice(1);
  }

  // refunds
  for (const t of tickets) {
    if (t.date >= today || !chance(rng, 0.012)) continue;
    const prod = t.lines.find((l) => l.type === 'product'); const svcL = t.lines.find((l) => l.type === 'service' && l.price > 0);
    const line = prod && chance(rng, 0.6) ? prod : svcL; if (!line) continue;
    const partial = line.type === 'service' && chance(rng, 0.5);
    const amt = partial ? Math.round(line.price * 0.5 * 100) / 100 : Math.round((line.price * line.qty + (line.type === 'product' ? line.price * line.qty * cat.business.taxRate : 0)) * 100) / 100;
    const reason = line.type === 'product' ? pick(rng, ['Product return', 'Product return', 'Allergic reaction']) : pick(rng, ['Service issue', 'Goodwill', 'Duplicate charge']);
    const method = chance(rng, 0.75) ? t.payments[0].method : 'credit';
    const rd = addDays(t.date, rint(rng, 0, 6)); if (rd > today) continue;
    const r = { id: 'r' + t.id.slice(1), ticketId: t.id, clientId: t.clientId, staffId: cat.staff[cat.staff.length - 1].id, date: rd, lines: [{ name: line.name, type: line.type, refId: line.refId, qty: line.qty, amount: amt, partial }], amount: amt, tipRefunded: 0, method, reason, note: reason === 'Allergic reaction' ? 'Reaction noted on file' : '', at: new Date(fromDateStr(rd).getTime() + rint(rng, 600, 1020) * 60000).toISOString(), seeded: true };
    refunds.push(r); t.refunded = amt; t.refundIds = [r.id];
    if (method === 'credit') { const cl = clients.find((c) => c.id === t.clientId); if (cl) cl.storeCredit = Math.round(((cl.storeCredit || 0) + amt) * 100) / 100; }
  }

  // notes
  let ni = 0; const NT = T.notes;
  for (const a of appts) {
    if (a.status !== 'completed' || !chance(rng, 0.55)) continue;
    const client = clients.find((c) => c.id === a.clientId);
    const main = svcById[a.items[0].serviceId];
    const pool = NT[main.cat] || NT[CAT_ORDER[0]] || Object.values(NT)[0];
    const text = pick(rng, pool).replace('{type}', String(client.skin).toLowerCase()).replace('{product}', pick(rng, prodPool).name).replace('{event}', pick(rng, EVENTS));
    notes.push({ id: 'n' + (++ni), clientId: a.clientId, appointmentId: a.id, staffId: a.staffId, date: a.date, type: 'treatment', text, seeded: true });
    if (chance(rng, 0.18) && NT.plan) notes.push({ id: 'n' + (++ni), clientId: a.clientId, appointmentId: a.id, staffId: a.staffId, date: a.date, type: 'plan', text: pick(rng, NT.plan).replace('{event}', pick(rng, EVENTS)), seeded: true });
    if (chance(rng, 0.12) && NT.retail) notes.push({ id: 'n' + (++ni), clientId: a.clientId, appointmentId: a.id, staffId: a.staffId, date: a.date, type: 'retail', text: pick(rng, NT.retail).replace('{product}', pick(rng, prodPool).name), seeded: true });
  }
  for (const c of clients) {
    const f = c.flags.find((k) => k !== 'allergy'); if (!f) continue;
    const fl = FLAGS.find((x) => x.k === f); if (!fl) continue;
    notes.push({ id: 'n' + (++ni), clientId: c.id, appointmentId: null, staffId: cat.staff[0].id, date: addDays(today, -rint(rng, 5, 60)), type: 'caution', text: `${fl.label}: ${fl.note}`, seeded: true });
  }

  // photos
  let pi = 0;
  const visitsByClient = groupBy(appts.filter((a) => a.status === 'completed'), (a) => a.clientId);
  for (const [cid, vs] of Object.entries(visitsByClient)) {
    if (vs.length < 2 || !chance(rng, 0.45)) continue;
    const sorted = vs.slice().sort(by((a) => a.date));
    const pairs = Math.min(sorted.length - 1, chance(rng, 0.3) ? 2 : 1);
    for (let k = 0; k < pairs; k++) {
      const v = sorted[k]; const area = pick(rng, T.photoAreas);
      photos.push({ id: 'p' + (++pi), clientId: cid, appointmentId: v.id, date: v.date, kind: 'before', area, src: null, seeded: true });
      photos.push({ id: 'p' + (++pi), clientId: cid, appointmentId: v.id, date: v.date, kind: 'after', area, src: null, seeded: true });
    }
  }

  // forms
  let fi = 0; const firstVisit = {};
  appts.slice().sort(by((a) => a.date + pad2(Math.floor(a.start / 60)))).forEach((a) => { if (!firstVisit[a.clientId]) firstVisit[a.clientId] = a; });
  for (const c of clients) {
    const fv = firstVisit[c.id];
    const intakeDate = c.createdAt < today ? c.createdAt : (fv ? fv.date : today);
    const future = (fv && fv.date > today) || (!fv && diffDays(c.createdAt, today) <= 14);
    if (future && chance(rng, 0.6)) forms.push({ id: 'f' + (++fi), clientId: c.id, templateId: 'intake', status: 'sent', sentAt: addDays(today, -1), date: null, answers: null, seeded: true });
    else forms.push({ id: 'f' + (++fi), clientId: c.id, templateId: 'intake', status: 'completed', date: intakeDate, answers: intakeAnswersFor(c, rng, T), signature: 'seed', seeded: true });
  }
  const consentDone = {};
  for (const a of appts) {
    for (const it of a.items) {
      const tpl = cat.consentFor[it.serviceId]; if (!tpl) continue;
      const key = a.clientId + '|' + tpl; if (consentDone[key] && a.date <= today) continue;
      if (a.date <= today) { forms.push({ id: 'f' + (++fi), clientId: a.clientId, templateId: tpl, status: 'completed', date: a.date, answers: { ack1: true, ack2: true, ack3: true }, signature: 'seed', appointmentId: a.id, seeded: true }); consentDone[key] = true; }
      else if (!consentDone[key]) { const done = chance(rng, 0.5); forms.push({ id: 'f' + (++fi), clientId: a.clientId, templateId: tpl, status: done ? 'completed' : 'sent', sentAt: addDays(today, -1), date: done ? addDays(today, -1) : null, answers: done ? { ack1: true, ack2: true, ack3: true } : null, appointmentId: a.id, seeded: true }); consentDone[key] = true; }
      break;
    }
  }
  uniq(photos.map((p) => p.clientId)).forEach((cid) => { if (chance(rng, 0.8)) forms.push({ id: 'f' + (++fi), clientId: cid, templateId: 'photo', status: 'completed', date: photos.find((p) => p.clientId === cid).date, answers: { use: pick(rng, ['My file only', 'Studio portfolio (no name)', 'My file only']) }, signature: 'seed', seeded: true }); });

  // messages
  let mi = 0; const biz = cat.business.name; const url = `${cat.business.slug}.example`;
  const staffFirst = (id) => cat.staff.find((s) => s.id === id).name.split(' ')[0];
  const iso = (date, min) => { const d = fromDateStr(date); d.setMinutes(min); return d.toISOString(); };
  for (const a of appts) {
    const client = clients.find((c) => c.id === a.clientId);
    const svc = svcById[a.items[0].serviceId].name;
    const d = diffDays(today, a.date);
    if (d >= -1 && d <= 1 && a.status !== 'cancelled') {
      const replied = ['confirmed', 'checkedin', 'inservice', 'completed'].includes(a.status);
      messages.push({ id: 'm' + (++mi), clientId: a.clientId, appointmentId: a.id, channel: 'sms', kind: 'reminder', body: `Hi ${client.first}, reminder: ${svc} with ${staffFirst(a.staffId)} tomorrow at ${fmtTime(a.start)} at ${biz}. Reply C to confirm or R to reschedule.`, at: iso(addDays(a.date, -1), 600), status: 'delivered', reply: replied && chance(rng, 0.6) ? pick(rng, ['C', 'C', 'Confirmed, see you then!', 'C 🙂', 'c']) : null, seeded: true });
      if (d === 0 && a.start - 120 <= now) messages.push({ id: 'm' + (++mi), clientId: a.clientId, appointmentId: a.id, channel: 'sms', kind: 'reminder', body: `See you at ${fmtTime(a.start)} today, ${client.first}! Park in the back lot.`, at: iso(a.date, a.start - 120), status: 'delivered', reply: null, seeded: true });
    }
    if (d > 0 && diffDays(a.createdAt, today) <= 2) messages.push({ id: 'm' + (++mi), clientId: a.clientId, appointmentId: a.id, channel: a.source === 'online' ? 'email' : 'sms', kind: 'confirmation', body: `You're booked: ${svc} with ${staffFirst(a.staffId)} on ${fmtDate(a.date, 'dow')} at ${fmtTime(a.start)}. Need to change it? Reply to this message.`, at: iso(a.createdAt > today ? today : a.createdAt, rint(rng, 540, 1080)), status: 'delivered', reply: null, seeded: true });
  }
  const lapsed = clients.filter((c) => c.freq >= 3 && (!clientLastVisit[c.id] || diffDays(clientLastVisit[c.id], today) > 28)).slice(0, 6);
  lapsed.forEach((c, i) => messages.push({ id: 'm' + (++mi), clientId: c.id, channel: 'sms', kind: 'rebook', body: `Hi ${c.first}, ${T.copy.rebook} Book in two taps: ${url}/book`, at: iso(addDays(today, -i), 660), status: 'delivered', reply: i === 1 ? 'Yes! Booking now' : null, seeded: true }));
  messages.push({ id: 'm' + (++mi), clientId: clients[7].id, channel: 'sms', kind: 'birthday', body: `Happy birthday, ${clients[7].first}! 🎂 Enjoy ${T.copy.birthdayPerk} this month.`, at: iso(today, 540), status: 'delivered', reply: 'Aww thank you!!', seeded: true });
  messages.push({ id: 'm' + (++mi), clientId: clients[12].id, channel: 'sms', kind: 'manual', body: `Hi ${clients[12].first}, ${staffFirst(cat.staff[0].id)} here. Your ${prodPool[1].name} came in — want me to hold it at the desk for your next visit?`, at: iso(addDays(today, -1), 870), status: 'delivered', reply: 'Yes please!', seeded: true });

  // waitlist
  const wlSvcs = mains.slice(0, 5);
  clients.filter((c) => c.freq >= 2).slice(20, 25).forEach((c, i) => waitlist.push({ id: 'w' + (i + 1), clientId: c.id, serviceId: pick(rng, wlSvcs).id, staffId: chance(rng, 0.5) ? cat.staff[i % Math.max(1, cat.staff.length - 1)].id : null, note: WAITLIST_NOTES[i % WAITLIST_NOTES.length], addedAt: addDays(today, -rint(rng, 0, 6)), seeded: true }));

  return { appts, tickets, notes, photos, forms, messages, waitlist, refunds };
}

function buildInitialState(templateId = 'facial', opts = {}) {
  const cat = catalogFor(templateId, opts);
  syncCategories(cat.categories);
  const clients = generateClients(mulberry32(20261022), cat);
  const today = todayStr();
  const act = generateActivity(cat, clients, today, mulberry32(777));
  return { version: SEED_VERSION, seedDay: today, ...cat, clients, appointments: act.appts, tickets: act.tickets, notes: act.notes, photos: act.photos, forms: act.forms, messages: act.messages, waitlist: act.waitlist, refunds: act.refunds, giftCards: [{ code: 'GLOW-2048', balance: 100 }, { code: 'GLOW-7731', balance: 45 }] };
}
/* Re-generates only the seeded activity so the demo always looks live today; everything the user created or edited is kept. */
function refreshSeededActivity(state) {
  const today = todayStr();
  if (state.seedDay === today) return false;
  const seededClients = state.clients.filter((c) => c.seeded);
  for (const c of seededClients) c.storeCredit = Math.max(0, (c.storeCredit || 0) - sum((state.refunds || []).filter((r) => r.seeded && r.clientId === c.id && r.method === 'credit'), (r) => r.amount));
  const act = generateActivity(state, seededClients, today, mulberry32(777), state.appointments.filter((a) => !a.seeded));
  const keep = (arr) => (arr || []).filter((x) => !x.seeded);
  state.appointments = keep(state.appointments).concat(act.appts);
  state.tickets = keep(state.tickets).concat(act.tickets);
  state.notes = keep(state.notes).concat(act.notes);
  state.photos = keep(state.photos).concat(act.photos);
  state.forms = keep(state.forms).concat(act.forms);
  state.messages = keep(state.messages).concat(act.messages);
  state.waitlist = keep(state.waitlist).concat(act.waitlist);
  state.refunds = keep(state.refunds).concat(act.refunds);
  state.seedDay = today;
  return true;
}
