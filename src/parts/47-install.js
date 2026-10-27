/* ===== Install: personalized setup links, per-link manifest, install hint ===== */
/* A setup link opens straight into one business and the installed app keeps it:
     ?biz=hair&name=Magnolia%20Hair%20Studio&owner=Renee&team=5[&phone=…&address=…]
   biz = a TEMPLATES id. The params stay in the URL on purpose: iOS installs the page URL as the start URL and
   Chrome reads the start_url we put in the manifest below, so first launch of the installed app sees them too. */
/* A studio's pitch link opens its real menu (32-studios.js): ?studio=simplyfacials, or a setup link with the studio's exact name. */
function setupFromUrl() {
  let q; try { q = new URLSearchParams(location.search); } catch (e) { return null; }
  const take = (k, n) => (q.get(k) || '').trim().slice(0, n);
  let studio = take('studio', 32).toLowerCase(); if (!STUDIOS[studio]) studio = '';
  const biz = studio ? STUDIOS[studio].template : take('biz', 16).toLowerCase(); if (!TEMPLATES[biz]) return null;
  const s = { biz, studio, name: take('name', 48), owner: take('owner', 24), team: take('team', 2), phone: take('phone', 24), address: take('address', 80) };
  if (!s.studio && s.name && !s.owner && !s.team) { const p = Object.values(STUDIOS).find((x) => x.template === biz && slugify(x.name) === slugify(s.name)); if (p) s.studio = p.id; }
  return s;
}
const setupKeyOf = (s) => (s.studio ? `studio:${s.studio}` : `${s.biz}:${slugify(s.name || TEMPLATES[s.biz].defaults.name)}`);
/* Runs before loadState(). Returns true when it created the workspace itself (S.state is then already set). */
function applySetupLink() {
  const s = setupFromUrl(); if (!s) return false;
  const key = setupKeyOf(s); const existing = loadIndex();
  const isDefault = !s.studio && s.biz === 'facial' && !s.owner && slugify(s.name || TEMPLATES.facial.defaults.name) === slugify(TEMPLATES.facial.defaults.name);
  const hit = existing ? existing.find((w) => w.setupKey === key || (isDefault && isExampleWs(w)) || (s.studio && !w.live && w.opts && w.opts.studio === s.studio)) : null;
  if (hit) { try { localStorage.setItem(WS_CUR_KEY, hit.id); } catch (e) {} return false; }   // the link always opens that business
  if (isDefault) return false;                                                                 // the normal boot seeds the example business
  if (!existing) S.wsIndex = [];                                                               // a personalized install starts with just that business
  const ws = createWorkspace(s.biz, { name: s.name, owner: s.owner, team: s.team, phone: s.phone, address: s.address, ...(s.studio ? { studio: s.studio } : {}) });
  ws.setupKey = key; saveIndex(workspaces());
  return true;
}
/* With a setup link, hand the browser a manifest whose start_url is this exact URL (absolute URLs: data: manifests have no base). */
(function personalizeManifest() {
  try {
    const link = document.querySelector('link[rel="manifest"]'); if (!link || !setupFromUrl()) return;
    const here = new URL(location.href); here.hash = '';
    const abs = (p) => new URL(p, location.href).href;
    const icon = (f, sizes, purpose) => ({ src: abs(f), sizes, type: 'image/png', ...(purpose ? { purpose } : {}) });
    const m = { name: 'Luster', short_name: 'Luster', description: 'Front-desk software for salons, spas and studios.', id: here.href, start_url: here.href, scope: abs('./'), display: 'standalone', orientation: 'any', background_color: '#F3F2ED', theme_color: '#1E5C68',
      icons: [icon('icon-192.png', '192x192'), icon('icon-512.png', '512x512'), icon('icon-maskable-192.png', '192x192', 'maskable'), icon('icon-maskable-512.png', '512x512', 'maskable')] };
    link.setAttribute('href', 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(m)));
  } catch (e) {}
})();

/* Install hint: iOS never prompts, so say how; Chrome/Edge get a real Install button once the browser offers one. */
const IS_STANDALONE = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
function installHint() {
  try {
    if (window.top !== window.self || !/^https?:$/.test(location.protocol) || IS_STANDALONE()) return;
    if (localStorage.getItem('luster.installHint') === 'off') return;
  } catch (e) { return; }
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const shareGlyph = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
  let deferred = null, el = null;
  const dismiss = () => { if (el) { el.remove(); el = null; } try { localStorage.setItem('luster.installHint', 'off'); } catch (e) {} };
  const show = (html, button) => {
    if (el) el.remove();
    el = document.createElement('div'); el.className = 'install-hint'; el.setAttribute('role', 'status');
    el.innerHTML = `<div class="install-hint-text">${html}</div>${button ? `<button class="btn primary sm" data-install>${button}</button>` : ''}<button class="btn ghost sm" data-install-dismiss aria-label="Dismiss">${I.x}</button>`;
    el.querySelector('[data-install-dismiss]').addEventListener('click', dismiss);
    const b = el.querySelector('[data-install]'); if (b) b.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; if (r && r.outcome === 'accepted') dismiss(); });
    document.body.appendChild(el);
  };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show('<b>Install Luster</b> — opens like an app, works offline.', 'Install'); });
  window.addEventListener('appinstalled', () => { if (el) { el.remove(); el = null; } });
  if (iOS) setTimeout(() => { if (!el) show(`<b>Install Luster</b> — tap Share ${shareGlyph} then <b>Add to Home Screen</b>.`); }, 1500);
}
