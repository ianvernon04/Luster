# vendor

`supabase-2.45.4.js` — the browser (UMD) build of [@supabase/supabase-js](https://github.com/supabase/supabase-js) 2.45.4,
copied from `node_modules/@supabase/supabase-js/dist/umd/supabase.js`. MIT License, © Supabase.
Served from our own domain so the app has no third-party script at runtime and the service worker can cache it.
To upgrade: copy the new UMD build here under a new versioned name and update `src/build-pwa.sh`.

`qrcode-1.4.4.js` — [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 (`qrcode.js`), MIT License,
© 2009 Kazuhiko Arase. Loaded only when the Online booking settings show the booking QR code.
