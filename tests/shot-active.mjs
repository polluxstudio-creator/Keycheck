import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/usr/local/lib/node_modules/playwright')); }

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4188/index.html', { waitUntil: 'networkidle' });

// --- teclado: pulsar una serie de teclas
await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
// se evita Tab/Enter/Space: moverian el foco y activarian botones
for (const k of ['a','s','d','f','j','k','l','q','w','e','r','t','y','u','i','o','p','F5','Backspace','ArrowUp','ArrowDown','Escape','Home','End','PageUp','PageDown','Insert','Delete','CapsLock','NumLock']) {
  await page.keyboard.press(k);
}
await page.keyboard.down('Shift');
await page.evaluate(() => window.scrollTo(0, 0));   // End/PageDown han desplazado la pagina
await page.waitForTimeout(150);
await page.screenshot({ path: '/workspace/keycheck/shots/active-keyboard.png' });
await page.keyboard.up('Shift');

// --- raton: mover, clicar y hacer scroll
await page.click('#tab-mouse');
const box = await page.locator('#mouse-area').boundingBox();
await page.mouse.move(box.x + 120, box.y + 160);
for (const [dx, dy] of [[80,-60],[70,40],[-50,60],[60,-40],[40,30],[-30,-20]]) {
  await page.mouse.move(box.x + 120 + dx, box.y + 160 + dy, { steps: 12 });
}
await page.mouse.click(box.x + 200, box.y + 120);
await page.mouse.click(box.x + 200, box.y + 120);
await page.mouse.wheel(0, 240);
await page.waitForTimeout(200);
await page.screenshot({ path: '/workspace/keycheck/shots/active-mouse.png' });
await b.close();
console.log('ok');
