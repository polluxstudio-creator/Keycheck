import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const reqs = [];
const errs = [];
page.on('request', r => reqs.push(r.url()));
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 160)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 160)); });
await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__shifts.push(e.value); })
    .observe({ type: 'layout-shift', buffered: true });
});

await page.goto('https://checkyourkeyboard.com/', { waitUntil: 'load' });
await page.waitForTimeout(800);

console.log('== 1. ESTADO INICIAL ==');
console.log('tema           :', await page.getAttribute('html', 'data-theme'));
console.log('fondo          :', await page.$eval('body', e => getComputedStyle(e).backgroundColor));
console.log('banner consent :', await page.getAttribute('#consent-banner', 'data-open'));
console.log('requests Google:', reqs.filter(u => /googlesyndication|doubleclick|googleads/.test(u)).length, '(debe ser 0 antes de aceptar)');

console.log('\n== 2. TRAS ACEPTAR EL CONSENTIMIENTO ==');
await page.click('[data-consent-accept]');
await page.waitForTimeout(3500);
const googleReqs = reqs.filter(u => /googlesyndication|doubleclick|googleads/.test(u));
console.log('requests Google:', googleReqs.length);
googleReqs.slice(0, 6).forEach(u => console.log('   ->', u.slice(0, 110)));

const units = await page.$$eval('[data-ad-placement]', els => els.map(el => {
  const ins = el.querySelector('ins');
  const iframe = el.querySelector('iframe');
  return {
    placement: el.dataset.adPlacement,
    slot: ins ? ins.dataset.adSlot : null,
    insH: ins ? Math.round(ins.getBoundingClientRect().height) : 0,
    slotH: Math.round(el.getBoundingClientRect().height),
    hasIframe: !!iframe,
    iframeSrc: iframe ? (iframe.src || '').slice(0, 70) : null,
    adStatus: ins ? (ins.dataset.adStatus || '(sin atributo)') : null
  };
}));
console.log('\n== 3. UNIDADES ==');
units.forEach(u => console.log('  ', JSON.stringify(u)));

const cls = await page.evaluate(() => window.__shifts.reduce((a, x) => a + x, 0));
console.log('\n== 4. CALIDAD ==');
console.log('CLS                    :', cls.toFixed(4));
const kb = await page.locator('#kb-root').boundingBox();
const sb = await page.locator('[data-ad-placement="sidebar"]').boundingBox();
const hd = await page.locator('[data-ad-placement="header"]').boundingBox();
const overlap = (a, c) => a && c && a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y;
console.log('sidebar tapa teclado   :', overlap(kb, sb) ? 'SI (mal)' : 'no');
console.log('cabecera tapa teclado  :', overlap(kb, hd) ? 'SI (mal)' : 'no');
console.log('teclado en y           :', Math.round(kb.y), '| alto cabecera:', Math.round(hd.height), '| alto lateral:', Math.round(sb.height));
await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
await page.keyboard.press('z');
console.log('teclado funciona      :', (await page.textContent('#kb-presses')).trim());

console.log('\n== 5. INTERRUPTOR DE TEMA ==');
await page.click('[data-theme-toggle]');
await page.waitForTimeout(250);
console.log('tras clic             :', await page.getAttribute('html', 'data-theme'), '|', await page.$eval('body', e => getComputedStyle(e).backgroundColor));
await page.reload({ waitUntil: 'load' });
console.log('tras recargar         :', await page.getAttribute('html', 'data-theme'));

console.log('\n== 6. ERRORES ==');
console.log(errs.length ? errs.join('\n') : 'ninguno');
await b.close();
