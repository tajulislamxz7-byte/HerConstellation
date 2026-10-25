/* Registers the service worker (public pages only; the admin panel never loads this). */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* offline support is optional */ });
  });
}
