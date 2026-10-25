/**
 * Generates the raster brand assets (app icons + Open Graph image) from
 * local markup with Playwright. No network access, no external services.
 *
 * Usage: node scripts/generate-assets.mjs
 */
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright may be installed globally in this environment — fall back to it.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/usr/local/lib/node_modules/playwright'));
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(ROOT, 'src', 'assets', 'img');

const faviconSvg = await readFile(path.join(IMG, 'favicon.svg'), 'utf8');

/* ---------------------------------------------------------- app icons */
async function renderIcon(size, file) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:#0d0f12}
      .wrap{width:${size}px;height:${size}px;display:grid;place-items:center}
      svg{width:${size}px;height:${size}px;display:block}
     </style></head><body><div class="wrap">${faviconSvg}</div></body></html>`
  );
  await page.screenshot({ path: path.join(IMG, file), omitBackground: false });
  await browser.close();
  console.log('•', file, `${size}x${size}`);
}

/* ------------------------------------------------------- OG image */
const ogHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @font-face{font-family:sans-serif;src:local("DejaVu Sans"),local("Liberation Sans");}
  *{box-sizing:border-box}
  body{margin:0;width:1200px;height:630px;background:#0d0f12;color:#e9edf2;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
       display:flex;flex-direction:column;justify-content:space-between;padding:64px 72px;
       background-image:radial-gradient(900px 420px at 85% -10%,rgba(53,211,153,.13),transparent 65%),
                        radial-gradient(700px 380px at 5% 110%,rgba(108,155,255,.12),transparent 60%);}
  .brand{display:flex;align-items:center;gap:14px;font-weight:800;letter-spacing:.14em;font-size:24px}
  .mark{width:52px;height:52px;border-radius:14px;background:linear-gradient(140deg,#35d399,#22a97c);
        display:grid;place-items:center;color:#04140d;font-size:19px;font-weight:900}
  h1{font-size:62px;line-height:1.08;letter-spacing:-.03em;margin:0 0 20px;max-width:16ch}
  p{font-size:26px;line-height:1.45;color:#a3adba;margin:0;max-width:24ch}
  .row{display:flex;gap:14px;margin-top:34px}
  .chip{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:9px 18px;font-size:18px;color:#c3ccd8}
  .kb{display:flex;flex-direction:column;gap:7px;margin-top:44px}
  .krow{display:flex;gap:7px}
  .k{width:44px;height:44px;border-radius:9px;background:#232830;border:1px solid rgba(255,255,255,.10)}
  .k.on{background:linear-gradient(180deg,#2bd196,#17a874);border-color:rgba(53,211,153,.9)}
  .k.w{width:62px}.k.w2{width:88px}.k.s{width:30px}
  .side{display:flex;gap:18px;align-items:flex-end}
  .note{font-size:17px;color:#8a94a1}
</style></head><body>
  <div class="side">
    <div>
      <div class="brand"><span class="mark">KC</span><span>KEYCHECK</span></div>
      <h1 style="margin-top:38px">Free Online Keyboard &amp; Mouse Tester</h1>
      <p>Check every key and every button straight from your browser.</p>
      <div class="row">
        <span class="chip">100% local</span>
        <span class="chip">No install</span>
        <span class="chip">Free forever</span>
      </div>
    </div>
    <div>
      <div class="kb">
        <div class="krow"><span class="k"></span><span class="k"></span><span class="k"></span><span class="k on"></span><span class="k"></span><span class="k"></span><span class="k"></span></div>
        <div class="krow"><span class="k"></span><span class="k"></span><span class="k on"></span><span class="k"></span><span class="k"></span><span class="k"></span><span class="k on"></span></div>
        <div class="krow"><span class="k w"></span><span class="k on"></span><span class="k"></span><span class="k"></span><span class="k"></span><span class="k"></span><span class="k"></span></div>
        <div class="krow"><span class="k w2"></span><span class="k on"></span><span class="k"></span><span class="k w2"></span></div>
      </div>
      <p class="note" style="margin-top:18px">keycheck.app</p>
    </div>
  </div>
</body></html>`;

async function renderOg() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(ogHtml);
  await page.screenshot({ path: path.join(IMG, 'og-image.png') });
  await browser.close();
  console.log('• og-image.png 1200x630');
}

await mkdir(IMG, { recursive: true });
await renderIcon(180, 'apple-touch-icon.png');
await renderIcon(192, 'icon-192.png');
await renderIcon(512, 'icon-512.png');
await renderOg();
console.log('done');
