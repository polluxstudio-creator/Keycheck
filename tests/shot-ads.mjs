import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/usr/local/lib/node_modules/playwright')); }

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.route('**/pagead2.googlesyndication.com/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/*stub*/' }));
await page.goto('http://127.0.0.1:4189/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: '/workspace/keycheck/shots/consent.png' });
await page.click('[data-consent-accept]');
await page.waitForTimeout(800);
await page.screenshot({ path: '/workspace/keycheck/shots/ads-consented.png' });
await b.close();
console.log('ok');
