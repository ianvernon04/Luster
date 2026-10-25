# Luster — notes for Claude Code sessions

Single-file, local-first web app (vanilla JS, no framework, no build tooling beyond bash). The repo root is
deployed as-is by GitHub Pages, so **the built `index.html` and `sw.js` at the root are committed**.

## Commands

- Build the artifact fragment + standalone test page: `cd src && ./build.sh`
- Build the deployable PWA into the repo root: `./src/build-pwa.sh` (runs build.sh first)
- Tests (Playwright, headless Chromium): `cd src && ./build-pwa.sh && node test/run.js && node test/ws.js && node test/setup.js && node test/pwa.js`
  - `run.js`/`ws.js` walk the UI; `setup.js` covers personalized setup links; `pwa.js` serves the root under `/luster/` and checks manifest, service worker, offline reload and the install hint
  - First time: `npm i playwright@1.63.0 && npx playwright install chromium`
  - Tests fix the clock at 10:30 local; checkout/refund tests need a day the seeded staff work (Mon–Sat).
- Icons: `cd src && node icons.js` renders every PNG at the root from the vector mark in that file (apple-touch-icon must stay opaque).
- Deploy: `./src/build-pwa.sh && git add -A && git commit -m "…" && git push origin main` → live at https://www.nwluster.com in ~1 min.
  Always rebuild before committing so root `index.html`/`sw.js` match `src/parts/`.

## Where things live (src/parts/, concatenated in filename order)

- `00-head.html` title/fonts · `10-styles.css` tokens + components · `20-markup.html` shell markup
- `30-util.js` dates, money, ids, `I` icon set (`.ic` class), mulberry32 rng
- `31-templates.js` `SEED_VERSION`, `FLAGS` (caution flags), `TEMPLATES` (7 verticals: services, staff
  roles, intake sections, consents, `contra` rules, copy), `intakeTemplate()`, `consent()`
- `32-seed.js` deterministic demo data: `catalogFor`, `generateClients`, `generateActivity`,
  `buildInitialState`, `refreshSeededActivity` (regenerates seeded records daily, keeps user-created ones)
- `33-store.js` state `S`, workspaces (IndexedDB `luster-db` KV, index in localStorage), `KV`, `PhotoDB`,
  `contraindications()`, appointments/tickets/refunds/store-credit mutations, `freeSlots`, `nextOpenDay`
- `40-shell.js` rail, palette, modals (workspaces, new-business wizard), global `Actions`
- `41-calendar.js` day/week grid (`SLOT_H`), drag-reschedule, appointment drawer, booking draft
- `42-clients.js` client list + file (tabs incl. Health), ticket/receipt modals
- `43-checkout.js` checkout, pay methods incl. store credit, refund modal
- `44-booking.js` client-facing booking · `45-forms.js` intake/consents, `showIf`, `applyIntakeToClient`
- `46-messages.js` · `47-install.js` setup links (`?biz=hair&name=…&owner=…&team=…` creates/selects the business at boot,
  per-link data: manifest so the installed app relaunches with the link), install hint · `48-reports.js` (dataviz: 5-slot
  palette, single axis) · `49-settings.js` · `50-app.js` boot

## Conventions

- Bump `SEED_VERSION` in `31-templates.js` whenever the seeded state shape changes; old workspaces reseed.
- Keep everything relative (`./`): the app is served from a subpath (`/luster/`) and from the claude.ai artifact.
- The artifact version on claude.ai takes `src/index.html` (the fragment, no doctype/head/body) — the host
  wraps it. The PWA takes the full document from `build-pwa.sh`.
- Vertical-specific content belongs in `TEMPLATES`, never hard-coded in views; views read `tpl()`.
- Safety first: anything that touches services vs. client health goes through `contraindications()` and the
  flag system, surfaced in the appointment drawer, booking draft and Health tab.
- No external scripts. Google Fonts is the only cross-origin request.
