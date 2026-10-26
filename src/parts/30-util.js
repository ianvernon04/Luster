/* ===== Utilities ===== */
const T0 = performance.now();
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
const by = (f) => (a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0);
const groupBy = (arr, f) => arr.reduce((m, x) => ((m[f(x)] ||= []).push(x), m), {});
const uniq = (arr) => Array.from(new Set(arr));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const chance = (rng, p) => rng() < p;
const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- dates: 'YYYY-MM-DD' strings, minutes since midnight for times ---- */
const pad2 = (n) => String(n).padStart(2, '0');
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fromDateStr(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
/* A live business runs on its own clock: the iPad in Okinawa shows Baton Rouge's day and time. null = this device's zone. */
let APP_TZ = null;
const _tzFmt = new Map();
function tzParts(date, tz) {
  let f = _tzFmt.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); _tzFmt.set(tz, f); }
  const p = {}; for (const x of f.formatToParts(date)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
/* wall-clock date + minutes in a zone → the actual instant (handles daylight-saving offsets) */
function zonedToUtc(dateStr, min, tz) {
  const [y, m, d] = dateStr.split('-').map(Number); const wall = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  const offsetAt = (t) => { const p = tzParts(new Date(t), tz); const [py, pm, pd] = p.date.split('-').map(Number); return Date.UTC(py, pm - 1, pd, Math.floor(p.min / 60), p.min % 60) - t; };
  let t = wall - offsetAt(wall); const o2 = offsetAt(t); if (wall - o2 !== t) t = wall - o2;
  return new Date(t);
}
function todayStr() { return APP_TZ ? tzParts(new Date(), APP_TZ).date : toDateStr(new Date()); }
function nowMin() { if (APP_TZ) return tzParts(new Date(), APP_TZ).min; const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function addDays(s, n) { const d = fromDateStr(s); d.setDate(d.getDate() + n); return toDateStr(d); }
function diffDays(a, b) { return Math.round((fromDateStr(b) - fromDateStr(a)) / 86400000); }
function dow(s) { return fromDateStr(s).getDay(); } // 0 = Sun
function startOfWeek(s) { const d = fromDateStr(s); d.setDate(d.getDate() - d.getDay()); return toDateStr(d); } // week starts Sunday
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s, style = 'med') {
  const d = fromDateStr(s);
  if (style === 'short') return `${MON[d.getMonth()]} ${d.getDate()}`;
  if (style === 'long') return `${DOW_LONG[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (style === 'dow') return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
  if (style === 'num') return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function relDate(s) {
  const t = todayStr(); const n = diffDays(t, s);
  if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday';
  if (n < 0 && n > -7) return `${-n} days ago`;
  if (n > 0 && n < 7) return `In ${n} days`;
  if (n < 0 && n > -60) return `${Math.round(-n / 7)} wk ago`;
  if (n < 0) return `${Math.round(-n / 30)} mo ago`;
  return fmtDate(s, 'short');
}
function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60; const ap = h >= 12 ? 'pm' : 'am'; const hh = ((h + 11) % 12) + 1;
  return m ? `${hh}:${pad2(m)}${ap}` : `${hh}${ap}`;
}
function fmtRange(start, dur) { return `${fmtTime(start)} – ${fmtTime(start + dur)}`; }
function fmtDur(min) { if (min < 60) return `${min} min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h ${m}m` : `${h} hr`; }
function money(n, opts = {}) {
  const v = Math.round(n * 100) / 100;
  const s = v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: opts.whole ? 0 : 2, maximumFractionDigits: opts.whole ? 0 : 2 });
  return s;
}
function compact(n) { if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (Math.abs(n) >= 1e4) return Math.round(n / 1e3) + 'K'; if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K'; return String(Math.round(n)); }
function pct(n, d = 0) { return `${(n * 100).toFixed(d)}%`; }
function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''); }
function fmtPhone(p) { const d = String(p).replace(/\D/g, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; }
function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime(); const m = Math.round(ms / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; const d = Math.round(h / 24); if (d < 7) return `${d}d ago`; return fmtDate(iso.slice(0, 10), 'short');
}
function overlaps(aStart, aDur, bStart, bDur) { return aStart < bStart + bDur && bStart < aStart + aDur; }

/* ---- color helpers ---- */
const STAFF_COLORS = ['#1E5C68', '#6250d6', '#B23A30', '#A8701A', '#2D7A4F', '#C25E7E', '#2a78d6', '#566068'];
function hashHue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
function avatarStyle(name) { return `background:hsl(${hashHue(name)} 32% 44%)`; }
function placeholderPhoto(seed, kind) {
  // abstract, soft-focus stand-in for a skin photo (no faces, no real people)
  const h = (hashHue(seed) + (kind === 'after' ? 18 : 0)) % 360;
  const s = kind === 'after' ? 34 : 26, l1 = kind === 'after' ? 78 : 70;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'><defs><radialGradient id='g' cx='50%' cy='40%' r='75%'><stop offset='0' stop-color='hsl(${h} ${s}% ${l1}%)'/><stop offset='1' stop-color='hsl(${h} ${s - 6}% ${l1 - 26}%)'/></radialGradient><filter id='b'><feGaussianBlur stdDeviation='18'/></filter></defs><rect width='300' height='400' fill='url(%23g)'/><g filter='url(%23b)' opacity='0.5'><ellipse cx='110' cy='150' rx='70' ry='55' fill='hsl(${(h + 20) % 360} 30% ${l1 - 10}%)'/><ellipse cx='200' cy='260' rx='80' ry='70' fill='hsl(${(h + 340) % 360} 28% ${l1 - 6}%)'/></g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ---- icons (inline SVG, stroke) ---- */
const I = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c3 0 5.5 2 5.5 5"/></svg>',
  checkout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M7 15h3"/></svg>',
  booking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  forms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h5M10 17h5"/></svg>',
  messages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/></svg>',
  members: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4l-5.3 2.8 1.1-5.9L3.5 9.2l5.9-.8z"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M6 16v-5M11 16V7M16 16v-3"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l9.5 16.5H2.5z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4M8 9h8M8 13h5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V8a3 3 0 0 1 3-3h12l-3-3M20 13v3a3 3 0 0 1-3 3H5l3 3"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>',
};

Object.keys(I).forEach((k) => { I[k] = I[k].replace('<svg ', '<svg class="ic" '); });

/* ---- tiny dom helpers ---- */
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function on(root, type, selector, fn) {
  root.addEventListener(type, (e) => { const el = e.target.closest(selector); if (el && root.contains(el)) fn(e, el); });
}
function formValues(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') { if (el.name.endsWith('[]')) { (o[el.name.slice(0, -2)] ||= []); if (el.checked) o[el.name.slice(0, -2)].push(el.value); } else o[el.name] = el.checked; }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  }
  return o;
}
/* Files the studio takes away: a normal download on a computer; on an iPad the share sheet (Save to Files, AirDrop, Mail). */
const csvCell = (v) => { if (v == null) return ''; if (typeof v === 'number') return String(v); let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };   // a name can't smuggle in a spreadsheet formula
function toCsv(rows) { return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }
async function saveFile(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: `${type};charset=utf-8` });
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches && navigator.canShare) {
    try { const file = new File([blob], name, { type: blob.type || type }); if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[data-src="${src}"]`)) return res(); const el = document.createElement('script'); el.src = src; el.dataset.src = src; el.onload = () => res(); el.onerror = () => rej(new Error(`Couldn't load ${src}`)); document.head.appendChild(el); }); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
