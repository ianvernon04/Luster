# Luster

Front-desk software for salons, spas and studios: calendar, client files, health intake and consents,
checkout with refunds and store credit, online booking, messaging, reports. One business per
workspace, seven industry templates (facial, hair, lash, nails, massage, med spa, barber).

This repository is also the live app. GitHub Pages serves the root folder, so the build committed
here is what people install.

## Install it as an app

Open the Pages URL for this repo (Settings → Pages shows it; for `ianvernon04/luster` it is
`https://ianvernon04.github.io/luster/`) on the device:

- iPhone / iPad (Safari): Share → **Add to Home Screen**. Full-screen, works offline.
- Android (Chrome): menu → **Install app**.
- Mac / Windows (Chrome, Edge): the install icon at the right end of the address bar.

Demo build: all data stays on the device (IndexedDB). Nothing is sent anywhere. Payments and texting are
simulated. Seeded demo data regenerates around today's date; anything you create yourself is kept.

## Update the live app

1. Make the change in `src/parts/`.
2. Run `./src/build-pwa.sh` — rebuilds `index.html` and `sw.js` at the root with a new cache version.
3. Commit and push to `main`. Pages redeploys in about a minute. Installed copies pick the new
   version up the next time they open with a connection.

No build step runs on GitHub: what is committed at the root is what gets served.

## Layout

```
index.html, sw.js            built app (generated — do not edit by hand)
manifest.webmanifest, *.png  static PWA assets
src/parts/                   the source, concatenated in filename order
src/build.sh                 parts → src/index.html (fragment) + src/test/page.html (standalone page)
src/build-pwa.sh             full installable build → repo root
src/test/run.js, ws.js       Playwright smoke tests (screenshots land in src/test/shots/)
```

## Run the tests

```
cd src && ./build.sh
npm i playwright@1.63.0 && npx playwright install chromium
node test/run.js && node test/ws.js
```
