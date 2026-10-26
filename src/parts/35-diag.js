/* ===== Remote support: problems on a live studio's iPad reach Luster support ===== */
// Script errors and sync problems are sent (scrubbed of emails and phone numbers, the same problem once per 10
// minutes, at most 30 a session) to app_events, so a problem in Baton Rouge can be seen and fixed from anywhere.
const Diag = {
  seen: new Map(), left: 30,
  build() { const m = document.querySelector('meta[name="luster-build"]'); return m ? m.content.split(' ')[0] : 'dev'; },
  device() { let standalone = false; try { standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) {} return `${navigator.userAgent.slice(0, 170)}${standalone ? ' · installed' : ''}`; },
  scrub(s) { return String(s == null ? '' : s).replace(/[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi, '[email]').replace(/(^|\D)((\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?!\d)/g, '$1[phone]'); },   // no lookbehind: older iPads can't parse it
  report(kind, message, detail = {}) {
    try {
      if (!isLive() || !Cloud.user || this.left <= 0) return false;
      const msg = this.scrub(message).slice(0, 500); const key = `${kind}|${msg}`; const now = Date.now();
      if (this.seen.has(key) && now - this.seen.get(key) < 10 * 60000) return false;
      this.seen.set(key, now); this.left--;
      const d = {}; for (const [k, v] of Object.entries(detail || {})) d[k] = typeof v === 'string' ? this.scrub(v).slice(0, 1500) : v;
      Cloud.sb().rpc('log_app_event', { p_business: st().live.businessId, p_kind: kind, p_message: msg, p_detail: { ...d, view: S.ui && S.ui.view, online: navigator.onLine },
        p_device: this.device(), p_build: this.build() }).then(() => {}, () => {});
      return true;
    } catch (e) { return false; }
  },
};
window.addEventListener('error', (e) => { if (!e || !e.message) return; Diag.report('error', e.message, { at: `${String(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`, stack: e.error && e.error.stack ? String(e.error.stack) : '' }); });
window.addEventListener('unhandledrejection', (e) => { const r = (e && e.reason) || {}; Diag.report('error', `Unhandled: ${r.message || String(r)}`, { stack: r.stack ? String(r.stack) : '' }); });
