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
<script>
// A first visit from a plain link (an Instagram bio, a typed address) sees what Luster is first. Setup and pitch links
// (?biz=, ?studio=, ?demo, ?signin), sign-in links (#...), the installed app, and anyone who has opened the app here before
// go straight in. The tags Instagram, Facebook and mail apps add to links (utm_..., fbclid, ...) are not app links: the utm_
// tags and ref ride along to the website, which files them with a demo request; the rest are dropped.
// (No dollar signs or backticks in here: this is an unquoted heredoc.)
(function () { try {
  var app = ' demo signin studio biz code token_hash type error error_code error_description access_token ', keep = [], site = true;
  location.search.slice(1).split('&').forEach(function (kv) { if (!kv) return; var k = decodeURIComponent(kv.split('=')[0].replace(/\+/g, ' '));
    if (app.indexOf(' ' + k + ' ') >= 0) site = false; else if (k.indexOf('utm_') === 0 || k === 'ref') keep.push(kv); });
  if (!site || location.hash || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone || localStorage.getItem('luster.ws.index')) return;
  location.replace('welcome/' + (keep.length ? '?' + keep.join('&') : ''));
} catch (e) {} })();
</script>
<meta name="theme-color" content="#1E5C68" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111516" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Luster">
<meta name="description" content="Front-desk software for salons, spas and studios.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Luster">
<meta property="og:title" content="Luster: the front desk that reads the intake form for you">
<meta property="og:description" content="Booking, health intake, consents, checkout and gift cards for salons, spas and studios. See the live demo.">
<meta property="og:url" content="https://www.nwluster.com/">
<meta property="og:image" content="https://www.nwluster.com/welcome/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="luster-build" content="$HASH $BUILT">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<script src="config.js"></script>
<script src="vendor/supabase-2.45.4.js"></script>
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
SW
echo "built $OUT/index.html ($(wc -c < "$OUT/index.html") bytes) — build $HASH"
