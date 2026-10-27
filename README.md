# Luster

Front-desk software for salons, spas and studios: calendar, client files, health intake and consents,
checkout with refunds and store credit, online booking, messaging, reports. One business per
workspace, seven industry templates (facial, hair, lash, nails, massage, med spa, barber).

This repository is also the live app. GitHub Pages serves the root folder, so the build committed
here is what people install.

## Install it as an app

Open https://www.nwluster.com on the device:

- iPhone / iPad (Safari): Share → **Add to Home Screen**. Full-screen, works offline.
- Android (Chrome): menu → **Install app**.
- Mac / Windows (Chrome, Edge): the install icon at the right end of the address bar.

Demo businesses keep all data on the device (IndexedDB) and send nothing anywhere; seeded demo data regenerates
around today's date, and its texting and card reader are pretend. Live businesses sync with Supabase (see Online
booking) and never pretend: until texting and card payments are connected, texts open in the studio phone's Messages
or Mail ready to send (and are logged as sent from the studio), and card payments are taken on the studio's own
terminal and recorded in Luster.

## Personalized install links

Add the business to the link and the app opens straight into it — and keeps it after Add to Home Screen:

```
https://www.nwluster.com/?biz=hair&name=Magnolia%20Hair%20Studio&owner=Renee&team=5
```

`biz` is one of `facial`, `hair`, `lash`, `nails`, `massage`, `medspa`, `barber`; `name`, `owner`, `team` (2–6),
`phone` and `address` are optional. The same link always opens the same business on that device.

Without a link the app opens a made-up example studio (Glow Theory Skin Studio) on the generic facial menu. Luster is
for any studio, so the public demo never shows a real one.

A studio being pitched can get its own link with its real menu, prices, hours, memberships and consent rules
(`src/parts/32-studios.js`). Simply Facials: `https://www.nwluster.com/?studio=simplyfacials` (a setup link with the
exact name, `?biz=facial&name=Simply%20Facials`, opens it too). Its team is made-up people in the studio's real roles;
rename them in Settings → Team on the pitch iPad. Going live from that demo copies the whole menu into the studio's
live business.

## Online booking

A demo becomes a real business from **Settings → Online booking → Put it online**: sign in, pick the booking link,
and the app creates a live copy with the same team, services and hours (no sample clients). Clients book at
`https://www.nwluster.com/book/<link>`; the booking lands on the iPad calendar within seconds, and the client gets a
link to change or cancel. New clients also get a link to the studio's intake form, which they fill in and sign on
their phone; their answers, caution flags and health file reach every iPad. The database makes double-booking
impossible, keeps each studio's data walled off, and logs every time someone opens a health file.

Settings → Online booking also has the studio's website kit: a Book button (code to paste, or point an existing
button at the link), step-by-step for Wix, Squarespace, WordPress, Instagram, Google and Facebook, and a QR code sign
to print for the counter.

### Supabase settings to check once (dashboard → Authentication)

- **URL Configuration**: Site URL `https://www.nwluster.com`; add `https://www.nwluster.com/**` to Redirect URLs.
  Password-reset and confirmation links come back to the app through these.
- **Emails**: account emails (sign-up confirmation, password reset) go out through Resend from `mail.nwluster.com`,
  connected with Resend's Supabase integration (Resend → Settings → Integrations), which fills in Supabase's SMTP
  settings. Supabase's built-in sender only delivers to members of the Supabase organization. The branded templates
  live in `supabase/templates/` (paste into Authentication → Emails → Templates; subjects are in each file's first
  comment). With a working sender, keep **Confirm email** on: the app already handles both the "check your inbox"
  step and the link coming back.

## Update the live app

1. Make the change in `src/parts/` (or `book/`, `supabase/`).
2. Run `./src/build-pwa.sh` — rebuilds `index.html` and `sw.js` at the root with a new cache version.
3. Run the tests (see below), then commit and push to `main`. Pages redeploys in about a minute.
   Installed copies pick the new version up the next time they open with a connection.

Releases can also arrive without anyone touching the repo: the `Luster` GitHub workflow checks for a waiting release
every 10 minutes, applies it, rebuilds, runs every test, and pushes only if they all pass.

## Layout

```
index.html, sw.js            built app (generated — do not edit by hand)
manifest.webmanifest, *.png  static PWA assets
privacy.html, terms.html     the public privacy policy and terms
config.js                    public Supabase URL + key for the app and the booking page
book/index.html              the public booking page (pretty links via 404.html), manage links (?t=) and forms (?f=)
book/intake.js               intake rules shared by the app and the client's phone (caution flags, health summary)
src/parts/                   the app source, concatenated in filename order
src/build.sh, build-pwa.sh   build the artifact fragment / the installable app at the root
src/icons.js                 renders the icon PNGs from one vector mark
src/test/                    Playwright tests: run.js, ws.js (UI), setup.js (links), pwa.js (install), import.js (CSV)
supabase/migrations/         the database: tables, row-level security, booking functions
supabase/templates/          the account emails (confirm sign-up, reset password), as pasted into Supabase
supabase/test/               database + end-to-end tests against an in-process Postgres
vendor/                      supabase-js and the QR code generator, served from our own domain (sources.txt)
ops/                         release packing, vendor fetching, the GitHub workflow template
```

## Run the tests

```
npm i --no-save playwright@1.49.1 @electric-sql/pglite@0.2.17 && npx playwright install chromium
./src/build-pwa.sh
node supabase/test/db.test.mjs && node supabase/test/booking.e2e.mjs && node supabase/test/app.e2e.mjs
cd src && node test/setup.js && node test/pwa.js && node test/import.js && node test/run.js && node test/ws.js
```
