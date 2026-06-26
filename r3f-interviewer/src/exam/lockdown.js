// "Lite" lockdown for a browser tab (Inspera-style behaviours). A real kiosk lock needs Electron;
// this enforces fullscreen, blocks copy/paste/context-menu, and reports focus-loss violations.
export function startLockdown(onViolation) {
  const handlers = {};
  const block = (e) => { e.preventDefault(); return false; };
  handlers.contextmenu = block; handlers.copy = block; handlers.cut = block; handlers.paste = block;
  handlers.visibilitychange = () => { if (document.hidden) onViolation && onViolation('tab-switch'); };
  handlers.blur = () => onViolation && onViolation('focus-loss');
  document.addEventListener('contextmenu', handlers.contextmenu);
  document.addEventListener('copy', handlers.copy);
  document.addEventListener('cut', handlers.cut);
  document.addEventListener('paste', handlers.paste);
  document.addEventListener('visibilitychange', handlers.visibilitychange);
  window.addEventListener('blur', handlers.blur);
  requestFullscreen();
  return function stop() {
    document.removeEventListener('contextmenu', handlers.contextmenu);
    document.removeEventListener('copy', handlers.copy);
    document.removeEventListener('cut', handlers.cut);
    document.removeEventListener('paste', handlers.paste);
    document.removeEventListener('visibilitychange', handlers.visibilitychange);
    window.removeEventListener('blur', handlers.blur);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  };
}
export function requestFullscreen() { try { const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } catch {} }
