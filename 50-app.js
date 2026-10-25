/* ===== Boot ===== */
(async function boot() {
  if (!applySetupLink()) await loadState();   // a setup link may have just created and selected the business itself
  S.ui = defaultUI();
  App.render();
  installHint();
  // the clock: keep today's seeded appointments honest and move the now-line
  setInterval(() => {
    refreshTodayStatuses();
    if (S.ui.view === 'calendar' && S.ui.calMode !== 'agenda') {
      const line = $('[data-now]'); if (line) { const col = line.parentElement; const lo = gridStartOf(col); line.style.top = `${(nowMin() - lo) / 15 * SLOT_H}px`; }
    }
    if (todayStr() !== st().seedDay) { refreshSeededActivity(st()); refreshTodayStatuses(); commit(); App.render(); }
  }, 60000);
  // tell the artifact host how to keep state across republishes
  try { window.claude?.hot?.snapshot?.(() => ({ ui: S.ui })); } catch (e) {}
  window.Luster = { get state() { return S.state; }, get ui() { return S.ui; }, App, Actions, Views, TEMPLATES, go: (v) => App.go(v), reset: resetDemo, createWorkspace, switchWorkspace, workspaces, save: () => saveNow() };
})();
