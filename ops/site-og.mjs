// The link preview image (welcome/og.jpg, 1200x630) that iMessage, Instagram and Facebook show for nwluster.com.
//   node ops/site-og.mjs        (after ops/site-images.py; LUSTER_FONTS as in ops/site-shots.mjs)
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const img = (f) => 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'welcome', 'img', f)).toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=Instrument+Serif:ital@0;1&display=block">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { background: #F6F4EE; font-family: "Instrument Sans", system-ui, sans-serif; color: #1B2224; position: relative; }
  body::before { content: ""; position: absolute; inset: 0; background: radial-gradient(420px 320px at 86% 30%, rgba(109,186,197,.32), transparent 70%), radial-gradient(360px 280px at 70% 92%, rgba(244,196,160,.36), transparent 70%); }
  .text { position: absolute; left: 72px; top: 70px; width: 540px; }
  .brand { display: flex; align-items: center; gap: 14px; font-family: "Instrument Serif", Georgia, serif; font-size: 40px; }
  .brand svg { width: 52px; height: 52px; }
  h1 { font-family: "Instrument Serif", Georgia, serif; font-weight: 400; font-size: 70px; line-height: .98; letter-spacing: -.02em; margin: 40px 0 24px; }
  h1 em { color: #1E5C68; }
  p { font-size: 24px; line-height: 1.4; color: #4F5A61; margin: 0; }
  .url { position: absolute; left: 72px; bottom: 56px; font-size: 22px; font-weight: 600; color: #1E5C68; }
  .ipad { position: absolute; left: 690px; top: 92px; width: 620px; border-radius: 18px; overflow: hidden; border: 1px solid #E4E0D6; box-shadow: 0 30px 70px rgba(27,34,36,.18); }
  .phone { position: absolute; left: 650px; top: 260px; width: 184px; border-radius: 26px; overflow: hidden; border: 7px solid #1B2224; box-shadow: 0 30px 70px rgba(27,34,36,.22); }
  img { display: block; width: 100%; }
</style></head><body>
<div class="text">
  <div class="brand"><svg viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B7F8E"/><stop offset="1" stop-color="#143F48"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><path d="M178 128 V372 Q178 384 190 384 H330 Q352 384 362 366" fill="none" stroke="#fff" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/><path d="M352 118 C356 150 366 160 398 164 C366 168 356 178 352 210 C348 178 338 168 306 164 C338 160 348 150 352 118 Z" fill="#fff"/></svg>Luster</div>
  <h1>The front desk that <em>reads the intake form</em> for you.</h1>
  <p>Booking, health intake, consents, checkout and gift cards for salons, spas and studios.</p>
</div>
<div class="url">nwluster.com</div>
<div class="ipad"><img src="${img('hero-ipad.webp')}"></div>
<div class="phone"><img src="${img('step-intake.webp')}"></div>
</body></html>`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const dir = process.env.LUSTER_FONTS;
if (dir) {   // same font stand-in as ops/site-shots.mjs
  const files = {}; for (const pkg of fs.readdirSync(dir)) { const d = path.join(dir, pkg, 'package', 'files'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (/-latin-\d+-(normal|italic)\.woff2$/.test(f)) files[f] = path.join(d, f); }
  const css = Object.keys(files).map((f) => { const [, w, s] = f.match(/-latin-(\d+)-(normal|italic)\.woff2$/); return `@font-face{font-family:'${f.startsWith('instrument-serif') ? 'Instrument Serif' : 'Instrument Sans'}';font-style:${s};font-weight:${w};font-display:block;src:url(https://fonts.gstatic.com/luster/${f}) format('woff2')}`; }).join('\n');
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => { const f = r.request().url().split('/').pop(); return files[f] ? r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(files[f]) }) : r.abort(); });
}
const p = await ctx.newPage(); await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: path.join(root, 'welcome', 'og.jpg'), type: 'jpeg', quality: 80 });
await browser.close();
console.log('welcome/og.jpg', fs.statSync(path.join(root, 'welcome', 'og.jpg')).size, 'bytes');
