import { createRequire } from 'node:module';

// Playwright may be installed globally in this environment — fall back to it.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/usr/local/lib/node_modules/playwright'));
}

const b = await chromium.launch();

/** Simulates a real 728x90 unit: the stub fills the <ins> with the real height. */
async function probe(label, adHeight) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/pagead2.googlesyndication.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stub */' })
  );
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__shifts.push({ v: +e.value.toFixed(4), src: (e.sources || []).map((s) => s.node?.className || s.node?.nodeName).join(',') });
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('http://127.0.0.1:4189/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('keycheck.consent.v1', JSON.stringify({ value: 'granted', date: Date.now() })));
  await page.goto('http://127.0.0.1:4189/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  // emulate the loader: the ad takes the real unit height
  if (adHeight) {
    await page.evaluate((h) => {
      document.querySelectorAll('[data-ad-placement] ins').forEach((el) => {
        el.style.height = h + 'px';
      });
    }, adHeight);
  }
  await page.waitForTimeout(800);
  const out = await page.evaluate(() => {
    const s = document.querySelector('[data-ad-placement="header"]');
    const f = s.querySelector('.ad-slot__frame');
    return {
      slotInline: s.getAttribute('style'),
      slotMinH: getComputedStyle(s).minHeight,
      slotRect: Math.round(s.getBoundingClientRect().height),
      frameRect: Math.round(f.getBoundingClientRect().height),
      totalCLS: +window.__shifts.reduce((a, x) => a + x.v, 0).toFixed(4),
      shifts: window.__shifts.map((x) => ({v:x.v,src:x.src}))
    };
  });
  console.log(`--- ${label} ---`);
  console.log(JSON.stringify(out));
  await ctx.close();
}

await probe('sin anuncio (hueco reservado)', 0);
await probe('unidad 728x90 (90px)', 90);
await probe('unidad 300x250 (250px)', 250);

await b.close();
