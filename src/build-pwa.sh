#!/usr/bin/env bash
# Builds the installable (PWA) app into the repo root — the folder GitHub Pages serves.
#   ./src/build-pwa.sh            → writes ../index.html and ../sw.js (next to the icons + manifest)
#   ./src/build-pwa.sh some/dir   → writes there instead
# Everything else at the root (manifest.webmanifest, icons) is static and committed as-is.
set -euo pipefail
cd "$(dirname "$0")"
./build.sh >/dev/null                      # parts/* → index.html (artifact fragment) + test/page.html
OUT="${1:-..}"; mkdir -p "$OUT"
HASH=$(sha1sum index.html | cut -c1-10)   # content hash → new service-worker cache on every change
BUILT=$(date -u +%Y-%m-%dT%H:%MZ)
{
  cat <<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1E5C68" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111516" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Luster">
<meta name="description" content="Front-desk software for salons, spas and studios. Demo build.">
<meta name="luster-build" content="$HASH $BUILT">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
HTML
  cat index.html
  cat <<HTML
<script>
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); }); }
</script>
</body>
</html>
HTML
} > "$OUT/index.html"
cat > "$OUT/sw.js" <<SW
/* Luster service worker — build $HASH ($BUILT) */
const CACHE = 'luster-$HASH';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts etc. go straight to the network
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    // network first so a new deploy shows up on the next launch; cached copy when offline
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
});
SW
echo "built $OUT/index.html ($(wc -c < "$OUT/index.html") bytes) — build $HASH"
