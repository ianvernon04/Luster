// Renders the app icons from one vector mark. Run from src/:  node icons.js   (needs playwright)
// apple-touch-icon must be an opaque full-bleed square (iOS rounds it; transparent corners turn black).
// maskable icons: full-bleed, artwork inside the central 80% safe zone. "any" icons: rounded square, transparent corners.
const { chromium } = require('playwright'); const path = require('path');
const OUT = path.join(__dirname, '..');
function svg(size, { rounded }) {
  const r = rounded ? Math.round(size * 0.22) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B7F8E"/><stop offset="1" stop-color="#143F48"/></linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.14"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DDEFF2"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${r}" fill="url(#sheen)"/>
  <!-- the L: one stroke, rounded, with a gentle lift at the end of the base -->
  <path d="M178 128 V372 Q178 384 190 384 H330 Q352 384 362 366" fill="none" stroke="url(#mark)" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- the luster: one four-point sparkle, offset high right, plus a small echo -->
  <path d="M352 118 C356 150 366 160 398 164 C366 168 356 178 352 210 C348 178 338 168 306 164 C338 160 348 150 352 118 Z" fill="#FFFFFF"/>
  <path d="M412 228 C413.5 239 417 242.5 428 244 C417 245.5 413.5 249 412 260 C410.5 249 407 245.5 396 244 C407 242.5 410.5 239 412 228 Z" fill="#FFFFFF" opacity="0.85"/>
</svg>`;
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const page = await browser.newPage();
  const jobs = [
    ['icon-512.png', 512, { rounded: true }], ['icon-192.png', 192, { rounded: true }],
    ['icon-maskable-512.png', 512, { rounded: false }], ['icon-maskable-192.png', 192, { rounded: false }],
    ['apple-touch-icon.png', 180, { rounded: false }],
  ];
  for (const [file, size, opts] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, opts)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', file);
  }
  await browser.close();
})();
