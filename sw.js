/* Service worker: offline shell + last-seen catalog.
   BUMP `VERSION` whenever you deploy changes to the CSS/JS/HTML files listed below,
   so visitors drop the old copies. Admin, auth and download requests are never touched. */
const VERSION = 'v1';
const SHELL = 'shell-' + VERSION;
const DATA = 'data-' + VERSION;
const PRECACHE = ['/', '/offline.html', '/about.html', '/privacy.html', '/disclaimer.html', '/contact.html',
  '/assets/css/style.css', '/assets/js/common.js', '/assets/js/app.js', '/assets/js/page.js', '/assets/js/pwa.js', '/favicon.svg'];
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fetchWithTimeout(req) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}
async function networkFirst(req, cacheName, cacheKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(req);
    if (res.ok) cache.put(cacheKey || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey || req);
    if (hit) return hit;
    throw err;
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                       // external images/APKs: browser handles
  const p = url.pathname;
  if (p === '/sw.js' || p.startsWith('/admin-panel')) return;       // never intercepted

  if (p.startsWith('/api/')) {
    // Only public, read-only data is kept for offline use. Everything else (admin, auth, download) goes straight to the network.
    if (p === '/api/apps' || p === '/api/settings' || p.startsWith('/api/media/')) {
      e.respondWith(networkFirst(req, DATA, url.origin + p));
    }
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const key = p === '/index.html' ? '/' : p;
      try {
        const res = await fetchWithTimeout(req);
        if (res.ok && PRECACHE.includes(key)) (await caches.open(SHELL)).put(key, res.clone());
        return res;
      } catch (err) {
        const cache = await caches.open(SHELL);
        return (await cache.match(key)) || (await cache.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }
  if (p.startsWith('/assets/') || p === '/favicon.svg' || p === '/manifest.webmanifest') e.respondWith(staleWhileRevalidate(req));
});
