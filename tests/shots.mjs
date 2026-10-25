import { createRequire } from 'node:module';

// Playwright may be installed globally in this environment — fall back to it.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/usr/local/lib/node_modules/playwright'));
}

const browser = await chromium.launch();
const shots = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'mobile', width: 390, height: 844 }
];

for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4188/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/workspace/keycheck/shots/${s.name}-top.png` });
  if (s.name === 'desktop') {
    await page.click('#tab-mouse');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `/workspace/keycheck/shots/desktop-mouse.png` });
  }
  await ctx.close();
}
await browser.close();
console.log('screenshots done');
