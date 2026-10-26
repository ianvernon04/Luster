/* Shared by the Luster app (built into index.html) and the client's phone (book/?f=…): when a form question shows, and
   what a completed intake means for the client's file — caution flags, allergies and the health summary the team sees.
   Pure functions, no DOM, no app state, so both sides reach the same answer from the same form. */
function showIfMet(cond, answers) {
  const v = answers[cond.field];
  if (cond.equals !== undefined) return v === cond.equals;
  if (cond.includes !== undefined) return Array.isArray(v) ? v.includes(cond.includes) : v === cond.includes;
  if (cond.notIncludes !== undefined) { const arr = Array.isArray(v) ? v : v ? [v] : []; if (cond.nonEmpty && !arr.length) return false; return !arr.includes(cond.notIncludes); }
  return true;
}
// a = the intake answers; verticalFields = the business type's own intake questions (some carry { flag: { k, when } });
// today = the studio's date (YYYY-MM-DD). Returns what goes on the client's file.
function deriveIntake(a, verticalFields, today) {
  const flags = new Set();
  const cond = a.conditions || [], meds = a.meds || [], procs = a.procedures || [], alg = a.allergies || [];
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
  for (const f of verticalFields || []) { if (!f.flag) continue; const v = a[f.id]; const hit = Array.isArray(v) ? v.includes(f.flag.when) : v === f.flag.when; if (hit) flags.add(f.flag.k); }
  if (alg.includes('Hair dye (PPD)')) flags.add('ppd'); if (alg.includes('Acrylates (gel or acrylic nails)')) flags.add('acrylate'); if (alg.includes('Adhesives (lash glue, tape)')) flags.add('adhesive');
  if (cond.includes('Blood clots or DVT')) flags.add('dvt'); if (cond.some((x) => x.startsWith('Neuromuscular'))) flags.add('neuro'); if (cond.some((x) => x.startsWith('Recent surgery'))) flags.add('surgery');
  const allergies = alg.filter((x) => x !== 'None known' && x !== 'Seasonal allergies').concat(a.allergies_other ? [a.allergies_other] : []);
  if (allergies.length) flags.add('allergy');
  const cancer = cond.includes('Cancer (current or past)') ? { type: a.cancer_type || '', status: a.cancer_status || '', tx: a.cancer_tx || [], radiationArea: a.cancer_radiation_area || '', lymph: a.cancer_lymph || '', port: a.cancer_port || '', effects: a.cancer_effects || [], clearance: a.cancer_clearance || 'Not yet', physician: a.cancer_physician || '' } : null;
  const vertical = {}; for (const f of verticalFields || []) if (f.id !== 'skin' && f.id !== 'concerns' && a[f.id] !== undefined) vertical[f.id] = a[f.id];
  const medical = { vertical, conditions: cond, conditionsDetail: a.conditions_detail || '', cancer, meds, medsList: a.meds_list || '', allergies: alg, allergiesOther: a.allergies_other || '', pregnancy: a.pregnant || '', procedures: procs, proceduresDate: a.procedures_date || '', trimester: a.trimester || '', sun: a.sun || '', smoke: a.smoke || '', routine: a.routine || [], products: a.products || '', goals: a.goals || '', emergency: { name: a.emergency_name || '', phone: a.emergency_phone || '' }, occupation: a.occupation || '', pressure: a.pressure || '', scent: a.scent || '', chat: a.chat || '', photos: a.photos || '', under18: a.under18 || '', guardian: a.guardian || '', updatedAt: today };
  const prefs = [a.pressure ? `${a.pressure} pressure` : '', a.chat === 'Quiet, please' ? 'quiet room' : '', a.scent === 'Yes' ? 'no scents' : ''].filter(Boolean).join(', ');
  return { flags: Array.from(flags), allergies, skin: a.skin || '', concerns: a.concerns || [], medical, prefs };
}
if (typeof module !== 'undefined') module.exports = { showIfMet, deriveIntake };
