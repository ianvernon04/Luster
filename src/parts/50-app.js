/* ===== Boot ===== */
(async function boot() {
  if (!applySetupLink()) await loadState();   // a setup link may have just created and selected the business itself
  S.ui = defaultUI();
  App.render();
  installHint();
  Cloud.handleAuthRedirect();   // a reset or confirmation link from email
  // "Sign in" on the website (?signin): open the studio's live business from the cloud
  try { if (new URLSearchParams(location.search).has('signin')) { history.replaceState(null, '', location.pathname); if (!isLive() && Cloud.available()) Actions['cloud-from-cloud'](); } } catch (e) {}
  if (isLive()) Cloud.start();
  // leaving the app (home button, app switcher, lock screen): write this device's copy now and push what's waiting,
  // rather than trusting a timer that iOS may never let run
  const flush = () => { saveNow().catch(() => {}); if (isLive() && Cloud.user) Cloud.sync().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else if (isLive() && Cloud.user) Cloud.sync().catch(() => {}); });
  window.addEventListener('pagehide', flush);
  // the clock: keep today's seeded appointments honest and move the now-line
  setInterval(() => {
    refreshTodayStatuses();
    if (S.ui.view === 'calendar' && S.ui.calMode !== 'agenda') {
      const line = $('[data-now]'); if (line) { const col = line.parentElement; const lo = gridStartOf(col); line.style.top = `${(nowMin() - lo) / 15 * SLOT_H}px`; }
    }
    if (!isLive() && todayStr() !== st().seedDay) { refreshSeededActivity(st()); refreshTodayStatuses(); commit(); App.render(); }
  }, 60000);
  // tell the artifact host how to keep state across republishes
  try { window.claude?.hot?.snapshot?.(() => ({ ui: S.ui })); } catch (e) {}
  window.Luster = { get state() { return S.state; }, get ui() { return S.ui; }, App, Actions, Views, TEMPLATES, Cloud, go: (v) => App.go(v), reset: resetDemo, createWorkspace, switchWorkspace, workspaces, save: () => saveNow() };
})();
