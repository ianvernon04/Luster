# Luster — notes for Claude Code sessions

Front-desk software for salons, spas and studios. Local-first web app (vanilla JS, no framework, no bundler) plus a
Supabase backend for live businesses. The repo root is served as-is by GitHub Pages at https://www.nwluster.com, so
**the built `index.html` and `sw.js` at the root are committed**.

## Commands

- Build the deployable app into the repo root: `./src/build-pwa.sh` (also rebuilds `src/index.html`, the claude.ai artifact fragment)
- Test everything (Playwright + PGlite; first time: `npm i --no-save playwright@1.49.1 @electric-sql/pglite@0.2.17 && npx playwright install chromium`):
  ```
  ./src/build-pwa.sh
  node supabase/test/db.test.mjs          # database rules: double-booking, studio isolation, health-file access, rate limits
  node supabase/test/booking.e2e.mjs      # public booking page in a phone browser set to Japan time
  node supabase/test/app.e2e.mjs          # go live from the app, book on a phone, it lands on the iPad; conflicts; 2nd device
  cd src && node test/setup.js && node test/pwa.js && node test/import.js && node test/run.js && node test/ws.js
  ```
- Icons: `cd src && node icons.js` renders every PNG at the root from the vector mark in that file (apple-touch-icon must stay opaque).
- Deploy: push to `main` (Pages publishes in ~1 min). Releases prepared outside the repo arrive through
  `.github/workflows/luster.yml` (template in `ops/luster.yml`): it polls the `releases` table, applies the newest
  release, rebuilds, runs every suite above, and pushes only if all pass. `ops/make-release.sh` packs a release.

## Layout

- `src/parts/` — the app, concatenated in filename order by `src/build.sh`:
  `00-head.html` · `10-styles.css` · `20-markup.html` · `30-util.js` (dates incl. `APP_TZ` business time zone, `zonedToUtc`, icons, rng)
  · `31-templates.js` (`SEED_VERSION`, `FLAGS`, 7 vertical `TEMPLATES`) · `32-seed.js` (demo data) · `32-studios.js` (studio profiles:
  a real studio's menu, prices, hours, memberships, consents and safety rules, opt-in by pitch link `?studio=<id>`; the public demo
  is always the generic menu; profile teams are placeholder names on purpose) · `33-store.js` (state, workspaces,
  IndexedDB, mutations; `commit()` triggers cloud sync) · `34-cloud.js` (Supabase sync for live businesses) · `35-diag.js` (errors
  and sync problems on live iPads → `app_events`, scrubbed of emails/phones) · `40-shell.js` (rail,
  palette, modals, `Actions`) · `41-calendar.js` · `42-clients.js` · `43-checkout.js` · `44-booking.js` · `45-forms.js` · `46-messages.js`
  · `46-import.js` (client import from CSV exports: column matching, dedupe, notes/allergies) · `47-cloud-ui.js` (sign in, password
  reset, go live, booking link, website button kit + QR sign) · `47-handoff.js` (live businesses: texts/emails open in the studio's
  Messages or Mail and are logged as handed off; confirmation, reminder, receipt and form-link wording) · `47-install.js` (setup
  links, install hint) · `48-reports.js` · `49-settings.js` (incl. team hours/services, CSV exports) · `50-app.js` (boot; saves and
  syncs when the app is backgrounded)
- `book/intake.js` — `showIfMet()` and `deriveIntake()`, concatenated into the app first and loaded by the booking page: the iPad
  and the client's phone must derive the same caution flags from the same answers.
- `book/index.html` — the public booking page clients use (`/book/<slug>` via `404.html`, manage link `/book/?t=<token>`, forms
  `/book/?f=<token>`). Talks to Supabase only through the `booking_*` and `form_public_*` functions.
- `privacy.html`, `terms.html` — public pages (the service worker never caches them as the app shell).
- `welcome/` — the website. A first visit to the root from a plain link lands there: the root `index.html` (its head, written by
  `build-pwa.sh`) redirects when there's no query string or hash, the app isn't installed, and the device has never opened the app
  (`luster.ws.index`). Setup/pitch links, `?demo` (the website's "Try it yourself"), `?signin` (opens sign-in; `50-app.js`), email
  links and installed iPads go straight to the app. "Request a demo" posts to `request_demo()`; requests land in `demo_requests`,
  which only the Supabase dashboard can read. Its app pictures are screenshots of the real app: `node ops/site-shots.mjs`, then
  `python3 ops/site-images.py`, then `node ops/site-og.mjs` (link preview). Its photographs are free Unsplash photos of studios
  (sources in `welcome/img/credits.txt`) plus Ian's own, cropped by `ops/site-photos.py` (which drops photo metadata such as GPS).
  Stock photos set the mood only: never put a name, quote or "our studios" caption on one; real customers' photos need their
  written OK. The site says only what Luster does today.
- `supabase/migrations/` — the database. `supabase/test/` — PGlite harness that imitates Supabase (`harness.mjs`), a stand-in for
  Supabase's HTTP API (`server.mjs`: PostgREST tables + RPC, password auth), fixtures, and the suites above.
- `config.js` — public Supabase URL + anon key (safe to publish; RLS decides what the key can do). `vendor/` — supabase-js UMD build
  and qrcode-generator, both listed in `vendor/sources.txt`; releases leave them out and `ops/fetch-vendor.sh` puts them back from npm.
- `ops/` — release tooling and the workflow template.

## How live businesses work (read before touching 33-store.js or 34-cloud.js)

- Demo workspaces are local-only and seeded. A live workspace (`S.state.live`) mirrors one `businesses` row.
- Template staff/service ids (`s1`, `sv_peel`) stay as local ids so safety rules keep working; the cloud stores them in `key`, and
  `live.ids` maps key → uuid. Clients and appointments use uuids everywhere (`newId()`).
- Sync = pull (catalog, menu sections and form templates on full syncs; clients/appointments since `lastPull` minus a 2-minute overlap)
  then push (every record whose mapped row hash differs from `live.synced[id]`). Edits made while offline simply push later. Realtime
  triggers a sync; polling is the fallback. Each form template in the cloud lists the services that need it signed (`definition.services`),
  so a second iPad asks for the same consents as the first.
- The database refuses double-bookings (exclusion constraint). A refused push rolls the iPad back and shows a toast (`Cloud.refused`).
- Live calendars run on the business time zone (`APP_TZ`), not the device's: the owner may be in Okinawa while the studio is in Baton Rouge.
- In the cloud: business, team, hours, services, clients (deleted = `deleted_at` via `delete_client`, which also cancels their
  upcoming visits), appointments, notes (soft-deleted), form templates, forms (each freezes its questions in `definition` and has a
  `public_token` link), signed answers, health files, tickets, refunds, support events. Health files and signed answers are written
  by anyone on the team but read only by owners/managers/providers, fetched on demand, and every read is logged. Allergen names
  ride on the client row (`profile.allergies`): the front desk needs them. Still device-only: photos (next: Supabase Storage),
  products/stock, memberships, messages, waitlist.
- Gift cards: a card row (`gift_cards`: code, amount) plus an append-only ledger (`gift_card_uses`: redeem, refund = negative,
  void). The database works out `balance_cents` from the ledger, never takes it from a device, and refuses a use that would take
  a card below zero (23514); the iPad then drops that use, marks the ticket `giftShort` (the payment `declined`) and tells the
  desk, who records the rest from the ticket. Uses are written when the ticket closes, never when the payment is applied, so a
  voided ticket spends nothing. Balances on the iPad are `giftBalance(card)` = amount minus its ledger. Codes are 8 characters
  without 0/O/1/I (`newGiftCode`); `normGift` matches them however they're typed.
- Intake on the phone: `booking_create` returns `intake_token` for clients without a completed intake (`intake_link_for`); the
  phone renders the frozen definition, derives flags with `deriveIntake`, and `form_public_submit` files answers + signature,
  ADDS caution flags (never removes them) and merges the health file. Devices notice via `health_index(p_business, p_since)`.
- A live business never simulates: no pretend texts, confirmations, card reader, card on file, membership charges or deposits.
  Anything that would "send" goes through `outgoing()` in `47-handoff.js`. Keep it that way when adding features.

## Conventions

- Migrations: the first four in `supabase/migrations/` were applied to production (project `rndipfzcdirenvarddws`, US East) on
  2026-10-26 by pasting them into the SQL editor; `20261027000005_gift_cards.sql` goes in with the gift card release (its SQL file
  runs the migration before queuing the release), and `20261027000006_demo_requests.sql` with the website release. Never edit an
  applied migration; add a new file. A release whose app needs a new migration ships both in one SQL file, migration first.
- Releases: build on the tag of the last deployed release (`live-*`), pack with `ops/make-release.sh`, and deliver it as an INSERT into
  `releases` (pasted into the SQL editor; this sandbox can't reach supabase.co). The workflow reports the result back on the row.
- Luster is made by New World Logic LLC (Louisiana); the terms, privacy page and emails name it. Account emails go
  through Resend (`mail.nwluster.com`); templates in `supabase/templates/`, pasted into the dashboard by hand. Any new
  service that touches personal data gets added to the privacy page's list of providers.
- Luster is for any studio. Nothing studio-specific goes in templates, the legal pages, emails or the booking page; a studio's own
  menu lives in a profile (`32-studios.js`), reached only through its pitch link, holding only what the studio publishes itself, with
  placeholder staff names (the demo invents bookings and revenue per provider).
- Bump `SEED_VERSION` only for demo-data shape changes, or upgrade the old shape on load instead (`normalizeGifts` does that, so
  pitch iPads keep their edits); live workspaces are never reseeded (key `luster.live.<id>`).
- Keep everything relative (`./`): the app runs at the domain root, under `/luster/` in tests, and inside the claude.ai artifact.
- Vertical-specific content lives in `TEMPLATES`; views read `tpl()`.
- Safety first: services vs. client health go through `contraindications()` and the flag system. Client matching on the booking page
  requires the same first name plus phone or email; near-matches get a separate file tagged `possible_duplicate`.
- Every new table: RLS on, policies by `is_member()` / `has_role()`, and a test in `supabase/test/db.test.mjs`.
- No third-party scripts at runtime. Google Fonts is the only cross-origin request besides Supabase.
