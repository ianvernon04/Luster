/* Luster service worker — build 32033e2659 (2026-10-27T09:57Z) */
const CACHE = 'luster-32033e2659';
const ASSETS = ['./', './index.html', './config.js', './vendor/supabase-2.45.4.js', './vendor/qrcode-1.4.4.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                        // Supabase, fonts: straight to the network
  const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (/^(book|supabase|src|welcome)\//.test(rel) || rel === '404.html') return;  // the booking page and the website are never served from this cache
  const shell = rel === '' || rel === 'index.html';
  if (req.mode === 'navigate' && !shell) return;                     // other pages on the site (privacy, terms): network as usual
  const fresh = shell || rel === 'config.js';
  if (fresh) {
    // network first, so a new deploy (or new settings) shows up on the next launch; cached copy when offline
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then((c) => c.put(rel === 'config.js' ? './config.js' : './index.html', copy)); return res; })
      .catch(() => caches.match(rel === 'config.js' ? './config.js' : './index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
});
