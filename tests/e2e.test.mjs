/**
 * KEYCHECK — end-to-end test suite (real Chromium, real DOM events).
 *
 * Run:  node --test tests/e2e.test.mjs
 * Requires: `node scripts/build.mjs` to have been run (the test builds twice:
 * once without advertising and once with a fake AdSense configuration).
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/usr/local/lib/node_modules/playwright'));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4188;
const ADS_PORT = 4189;
const AUTO_PORT = 4190;
const LIVE_PORT = 4191;

let browser;
let server;
let adsServer;
let liveServer;
let autoServer;
let base;
let adsBase;
let liveBase;

const build = (out, forceAds, autoAds, noAds, selfBanner) => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      KEYCHECK_OUT: out,
      KEYCHECK_FORCE_ADS: forceAds ? '1' : '0',
      KEYCHECK_AUTO_ADS: autoAds ? '1' : '0',
      KEYCHECK_NO_ADS: noAds ? '1' : '0',
      KEYCHECK_SELF_BANNER: selfBanner ? '1' : '0'
    },
    stdio: 'pipe'
  });
};

const startServer = (dir, port) =>
  new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), String(port), dir], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    proc.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('dev server')) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
    proc.on('error', reject);
  });

before(async () => {
  // dist      : the real configuration, with the real AdSense units
  // dist-noads: the site as it looks before AdSense is configured
  // dist-ads  : a full set of test units (every placement filled)
  // dist-auto : the same, but with auto ads
  build('dist', false);
  build('dist-noads', false, false, true);
  // dist-ads: fake ad units AND the self-built banner, to test the consent gate
  build('dist-ads', true, false, false, true);
  build('dist-auto', true, '1');
  server = await startServer('dist-noads', PORT);
  adsServer = await startServer('dist-ads', ADS_PORT);
  liveServer = await startServer('dist', LIVE_PORT);
  autoServer = await startServer('dist-auto', AUTO_PORT);
  base = `http://127.0.0.1:${PORT}`;
  adsBase = `http://127.0.0.1:${ADS_PORT}`;
  liveBase = `http://127.0.0.1:${LIVE_PORT}`;
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
  if (adsServer) adsServer.kill();
  if (liveServer) liveServer.kill();
  if (autoServer) autoServer.kill();
});

/** Opens a page and collects console errors / page errors. */
async function open(url, opts = {}) {
  const context = await browser.newContext(opts.context || {});
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  if (opts.initScript) await page.addInitScript(opts.initScript);
  // The stub must be registered BEFORE the navigation: with Google's CMP the
  // ad script is requested on page load, with no click involved.
  if (opts.stubAds) {
    await page.route('**/pagead2.googlesyndication.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed for the test */' })
    );
  }
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  return { page, context, errors, requests };
}

const num = async (page, id) => Number((await page.textContent('#' + id)).replace(/[^0-9.]/g, ''));

/* ================================================================== */
describe('keyboard tester', () => {
  test('renders the full 104-key layout and highlights pressed keys', async () => {
    const { page, context, errors } = await open(`${base}/index.html`);
    const keys = await page.locator('.key').count();
    assert.equal(keys, 104, 'the layout must contain 104 keys');

    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.down('a');
    const pressed = await page.getAttribute('[data-code="KeyA"]', 'data-pressed');
    assert.equal(pressed, 'true', 'KeyA must light up while held');
    await page.keyboard.up('a');
    assert.equal(await num(page, 'kb-presses'), 1, 'one press must be counted');
    await context.close();
    assert.deepEqual(errors, []);
  });

  test('counts total presses and unique keys separately', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < 3; i++) await page.keyboard.press('a');
    await page.keyboard.press('b');
    await page.keyboard.press('Enter');

    assert.equal(await num(page, 'kb-presses'), 5, 'total presses');
    assert.equal(await num(page, 'kb-unique'), 3, 'unique keys (a, b, Enter)');
    assert.equal(await num(page, 'kb-total'), 104, 'layout size');
    await context.close();
  });

  test('coverage percentage matches the unique key counter', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    for (const k of ['a', 'b', 'c', 'd']) await page.keyboard.press(k);
    const unique = await num(page, 'kb-unique');
    const coverage = await num(page, 'kb-coverage');
    assert.equal(coverage, Math.round((unique / 104) * 100), 'coverage must be unique/104');
    const width = await page.$eval('#kb-coverage-fill', (el) => el.style.width);
    assert.ok(width && parseFloat(width) > 0, 'the coverage meter must be filled');
    await context.close();
  });

  test('modifier keys are detected and reported as held', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.down('Shift');
    const badges = await page.textContent('#kb-modifiers');
    assert.match(badges, /Shift/, 'the held modifier must be shown');
    await page.keyboard.up('Shift');
    assert.match(await page.textContent('#kb-modifiers'), /none held/);
    await context.close();
  });

  test('browser shortcuts are not counted as test presses', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.down('Control');
    await page.keyboard.press('s');
    await page.keyboard.up('Control');
    assert.equal(await num(page, 'kb-presses'), 1, 'only the Ctrl key itself is counted');
    await context.close();
  });

  test('the reset button clears every counter', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    for (const k of ['a', 'b', 'c']) await page.keyboard.press(k);
    await page.click('#kb-reset');
    assert.equal(await num(page, 'kb-presses'), 0);
    assert.equal(await num(page, 'kb-unique'), 0);
    assert.equal(await num(page, 'kb-coverage'), 0);
    assert.equal(await page.textContent('#kb-last-key'), '—');
    await context.close();
  });

  test('the history strip shows the presses in order', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('x');
    await page.keyboard.press('y');
    const chips = await page.locator('#kb-history .history__chip').allTextContents();
    assert.equal(chips.length, 2, 'two chips for two presses');
    assert.match(chips[0], /Y/i, 'newest press first');
    await context.close();
  });

  test('the three keyboard clusters are aligned row by row', async () => {
    const { page, context } = await open(`${base}/index.html`);
    const box = async (code) => {
      const b = await page.locator(`[data-code="${code}"]`).boundingBox();
      assert.ok(b, `the key ${code} must be rendered`);
      return b;
    };

    // row 2 (number row) and row 6 (modifier row) of the three clusters
    const pairs = [
      ['Digit1', 'Insert', 'NumLock'],
      ['ControlLeft', 'ArrowLeft', 'Numpad0']
    ];
    for (const [main, nav, num] of pairs) {
      const a = await box(main);
      const b = await box(nav);
      const c = await box(num);
      assert.ok(Math.abs(a.y - b.y) <= 1, `${nav} must share the row of ${main} (${a.y} vs ${b.y})`);
      assert.ok(Math.abs(a.y - c.y) <= 1, `${num} must share the row of ${main} (${a.y} vs ${c.y})`);
      assert.ok(Math.abs(a.height - b.height) <= 1, `${nav} must have the same height as ${main}`);
      assert.ok(Math.abs(a.height - c.height) <= 1, `${num} must have the same height as ${main}`);
    }

    // the whole keyboard must have the same height in the three clusters
    const mainBottom = (await box('ControlLeft')).y + (await box('ControlLeft')).height;
    const navBottom = (await box('ArrowLeft')).y + (await box('ArrowLeft')).height;
    const numBottom = (await box('Numpad0')).y + (await box('Numpad0')).height;
    assert.ok(Math.abs(mainBottom - navBottom) <= 1, 'the arrow cluster must end with the main block');
    assert.ok(Math.abs(mainBottom - numBottom) <= 1, 'the numpad must end with the main block');
    await context.close();
  });

  test('a tested key is marked as already tested', async () => {
    const { page, context } = await open(`${base}/index.html`);
    assert.equal(await page.getAttribute('[data-code="KeyA"]', 'data-tested'), null);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('a');
    assert.equal(await page.getAttribute('[data-code="KeyA"]', 'data-tested'), 'true');
    await page.keyboard.press('b');
    assert.equal(await page.getAttribute('[data-code="KeyB"]', 'data-tested'), 'true');
    await context.close();
  });

  test('the held-modifier badge is released when the window loses focus', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.down('Shift');
    assert.match(await page.textContent('#kb-modifiers'), /Shift/);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.match(await page.textContent('#kb-modifiers'), /none held/);
    await page.keyboard.up('Shift');
    await context.close();
  });

  test('keys outside the layout never push the coverage above 100%', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.evaluate(() => {
      for (const code of ['F13', 'F14', 'MediaPlayPause', 'Fn']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      }
    });
    assert.equal(await num(page, 'kb-unique'), 0, 'only keys of the layout count as unique');
    const coverage = await num(page, 'kb-coverage');
    assert.ok(coverage <= 100, `the coverage must never exceed 100% (got ${coverage})`);
    assert.ok((await num(page, 'kb-presses')) >= 4, 'the presses are still counted');
    await context.close();
  });
});

/* ================================================================== */
describe('mouse tester', () => {
  test('counts left, right and middle clicks separately', async () => {
    const { page, context, errors } = await open(`${base}/index.html`);
    await page.click('#tab-mouse');
    const box = await page.locator('#mouse-area').boundingBox();

    await page.mouse.click(box.x + 40, box.y + 40, { button: 'left' });
    await page.mouse.click(box.x + 60, box.y + 40, { button: 'right' });
    await page.mouse.click(box.x + 80, box.y + 40, { button: 'middle' });

    assert.equal(await num(page, 'ms-left'), 1);
    assert.equal(await num(page, 'ms-right'), 1);
    assert.equal(await num(page, 'ms-middle'), 1);
    assert.equal(await num(page, 'ms-total'), 3);
    await context.close();
    assert.deepEqual(errors, []);
  });

  test('registers scroll wheel events and distance', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.click('#tab-mouse');
    const box = await page.locator('#mouse-area').boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(60);

    assert.ok((await num(page, 'ms-wheel-events')) >= 1, 'wheel events must be counted');
    assert.ok((await num(page, 'ms-scroll-delta')) > 0, 'scroll distance must be counted');
    await context.close();
  });

  test('detects a double click', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.click('#tab-mouse');
    const box = await page.locator('#mouse-area').boundingBox();
    await page.mouse.click(box.x + 50, box.y + 50);
    await page.mouse.click(box.x + 51, box.y + 50);
    await page.waitForTimeout(50);
    assert.equal(await num(page, 'ms-double-clicks'), 1, 'the pair must be detected');
    await context.close();
  });

  test('a triple click counts as a single double click', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.click('#tab-mouse');
    const box = await page.locator('#mouse-area').boundingBox();
    await page.mouse.click(box.x + 50, box.y + 50);
    await page.mouse.click(box.x + 51, box.y + 50);
    await page.mouse.click(box.x + 52, box.y + 50);
    await page.waitForTimeout(50);
    assert.equal(await num(page, 'ms-double-clicks'), 1, 'three clicks are one double click, not two');
    assert.equal(await num(page, 'ms-total'), 3);
    await context.close();
  });

  test('the context menu is only suppressed inside the test area', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.click('#tab-mouse');
    const box = await page.locator('#mouse-area').boundingBox();
    const h1Box = await page.locator('h1').boundingBox();

    await page.evaluate(() => {
      window.__insidePrevented = null;
      window.__outsidePrevented = null;
      document.getElementById('mouse-area').addEventListener('contextmenu', (e) => {
        window.__insidePrevented = e.defaultPrevented;
      });
      document.querySelector('h1').addEventListener('contextmenu', (e) => {
        window.__outsidePrevented = e.defaultPrevented;
      });
    });

    await page.mouse.click(box.x + 30, box.y + 30, { button: 'right' });
    await page.mouse.click(h1Box.x + 10, h1Box.y + 10, { button: 'right' });

    assert.equal(await page.evaluate(() => window.__insidePrevented), true, 'menu blocked inside the area');
    assert.equal(await page.evaluate(() => window.__outsidePrevented), false, 'menu works elsewhere');
    await context.close();
  });

  test('pointer movement updates the coordinates', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.click('#tab-mouse');
    const box = await page.locator('#mouse-area').boundingBox();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.move(box.x + 90, box.y + 70);
    const pos = await page.textContent('#ms-pos');
    assert.match(pos, /\d+, \d+/, 'live coordinates must be displayed');
    assert.ok((await num(page, 'ms-distance')) > 0, 'pointer travel must be counted');
    await context.close();
  });

  test('the reset button clears the mouse counters', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.click('#tab-mouse');
    const box = await page.locator('#mouse-area').boundingBox();
    await page.mouse.click(box.x + 40, box.y + 40);
    await page.click('#ms-reset');
    assert.equal(await num(page, 'ms-total'), 0);
    assert.equal(await num(page, 'ms-left'), 0);
    await context.close();
  });
});

/* ================================================================== */
describe('interface', () => {
  test('the tab switcher moves between both testers', async () => {
    const { page, context } = await open(`${base}/index.html`);
    assert.equal(await page.isVisible('#panel-keyboard'), true);
    assert.equal(await page.isVisible('#panel-mouse'), false);

    await page.click('#tab-mouse');
    assert.equal(await page.isVisible('#panel-mouse'), true);
    assert.equal(await page.isVisible('#panel-keyboard'), false);
    assert.equal(await page.getAttribute('#tab-mouse', 'aria-selected'), 'true');
    await context.close();
  });

  test('is responsive from 360px to 1440px without horizontal overflow', async () => {
    for (const width of [360, 768, 1440]) {
      const { page, context } = await open(`${base}/index.html`, {
        context: { viewport: { width, height: 900 } }
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      assert.ok(overflow <= 1, `no page-level horizontal overflow at ${width}px (got ${overflow}px)`);

      const keyboardVisible = await page.isVisible('#kb-root');
      assert.ok(keyboardVisible, `the keyboard must stay visible at ${width}px`);

      // the keyboard itself stays usable: it scrolls inside its own container
      const shell = await page.locator('.kb-shell').boundingBox();
      assert.ok(shell.width <= width, 'the keyboard container fits the viewport');
      await context.close();
    }
  });

  test('the keyboard keeps working on a small screen', async () => {
    const { page, context } = await open(`${base}/index.html`, {
      context: { viewport: { width: 360, height: 740 } }
    });
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('q');
    assert.equal(await num(page, 'kb-presses'), 1);
    await context.close();
  });

  test('keyboard navigation reaches the tabs and the reset button', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.locator('#tab-keyboard').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getAttribute('#tab-mouse', 'aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.getAttribute('#tab-keyboard', 'aria-selected'), 'true');
    await context.close();
  });

  test('the skip link is the first focusable element', async () => {
    const { page, context } = await open(`${base}/index.html`);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement.className);
    assert.match(focused, /skip-link/);
    await context.close();
  });
});

/* ================================================================== */
describe('advertising', () => {
  test('no ad markup and no Google request when the configuration is empty', async () => {
    const { page, context, requests } = await open(`${base}/index.html`);
    const filled = await page.$$eval('[data-ad-placement]', (els) =>
      els.filter((el) => el.children.length > 0).length
    );
    assert.equal(filled, 0, 'no ad slot may be filled without a configuration');

    const google = requests.filter((u) => /googlesyndication|doubleclick|googleadservices/.test(u));
    assert.equal(google.length, 0, 'no request may be made to Google');
    await context.close();
  });

  test('the consent banner is hidden while advertising is disabled', async () => {
    const { page, context } = await open(`${base}/index.html`);
    assert.equal(await page.getAttribute('#consent-banner', 'data-open'), 'false');
    await context.close();
  });

  test('with a configuration the ad units are rendered and isolated', async () => {
    const { page, context, errors, requests } = await open(`${adsBase}/index.html`);
    // The AdSense script is stubbed so the test never contacts Google.
    await page.route('**/pagead2.googlesyndication.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed for the test */' })
    );

    await page.click('[data-consent-accept]');
    await page.waitForTimeout(500);

    const scriptRequests = requests.filter((u) => u.includes('pagead2.googlesyndication.com'));
    assert.equal(scriptRequests.length, 1, 'the AdSense script must be requested exactly once');
    assert.match(scriptRequests[0], /client=ca-pub-0000000000000000/, 'the publisher id must be sent');

    const ins = await page.$$eval('[data-ad-placement] ins', (els) =>
      els.map((el) => ({
        client: el.dataset.adClient,
        slot: el.dataset.adSlot,
        parent: el.closest('[data-ad-placement]').dataset.adPlacement
      }))
    );
    assert.ok(ins.length >= 3, `expected several ad units, got ${ins.length}`);
    for (const unit of ins) {
      assert.equal(unit.client, 'ca-pub-0000000000000000', 'the publisher id must come from the config');
      assert.ok(unit.slot && unit.slot.length > 0, 'the slot id must come from the config');
    }

    // the keyboard must not be covered by an ad
    const kbBox = await page.locator('#kb-root').boundingBox();
    for (const unit of ins) {
      const box = await page.locator(`[data-ad-placement="${unit.parent}"]`).boundingBox();
      const overlaps =
        kbBox &&
        box &&
        kbBox.x < box.x + box.width &&
        kbBox.x + kbBox.width > box.x &&
        kbBox.y < box.y + box.height &&
        kbBox.y + kbBox.height > box.y;
      assert.ok(!overlaps, `the ad unit "${unit.parent}" must not overlap the keyboard`);
    }

    // the tester still works with ads on the page
    await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('z');
    assert.equal(await num(page, 'kb-presses'), 1);
    await context.close();
    assert.deepEqual(errors, []);
  });

  test('the production build serves exactly the ad units of the configuration', async () => {
    const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config', 'site.json'), 'utf8'));
    const { page, context } = await open(`${liveBase}/index.html`, { stubAds: true });
    // the production build uses Google's CMP: nothing has to be clicked
    await page.waitForTimeout(700);

    const ins = await page.$$eval('[data-ad-placement] ins', (els) =>
      els.map((el) => ({
        client: el.dataset.adClient,
        slot: el.dataset.adSlot,
        placement: el.closest('[data-ad-placement]').dataset.adPlacement
      }))
    );
    assert.ok(ins.length > 0, 'the production build must render its ad units');
    for (const unit of ins) {
      assert.equal(unit.client, cfg.adsense.publisherId, 'the publisher id must be the configured one');
      assert.equal(unit.slot, cfg.adsense.slots[unit.placement],
        `the ${unit.placement} unit must use its own slot id`);
    }
    // every configured placement must be served and no other one
    const configured = Object.entries(cfg.adsense.slots)
      .filter(([, id]) => id && String(id).trim())
      .map(([placement]) => placement);
    assert.deepEqual(ins.map((u) => u.placement).sort(), configured.sort(),
      'only the configured placements may be served');
    await context.close();
  });

  test('with Google CMP the ad script loads without asking and our banner stays hidden', async () => {
    const { page, context, requests } = await open(`${liveBase}/index.html`, { stubAds: true });
    await page.waitForTimeout(700);

    // Google's own crawler never clicks a banner: the script must load anyway
    const script = requests.filter((u) => u.includes('pagead2.googlesyndication.com'));
    assert.ok(script.length >= 1, 'the AdSense script must load without a consent decision');
    assert.match(script[0], /client=ca-pub-/, 'the script must carry the publisher id');

    // our own banner must not be shown
    assert.equal(await page.getAttribute('#consent-banner', 'data-open'), 'false',
      'our banner must stay hidden when Google manages the consent');

    // the ad units are rendered
    const units = await page.$$eval('[data-ad-placement] ins', (els) => els.length);
    assert.ok(units >= 1, 'the ad units must be rendered');
    await context.close();
  });

  test('the ad space is reserved in the markup and no request is made before consent', async () => {
    const { page, context, requests } = await open(`${adsBase}/index.html`);

    // the expected reservation comes from the configuration file
    const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config', 'site.json'), 'utf8'));
    const expected = `${cfg.adsense.reserveHeight.header}px`;

    const reserved = await page.$eval('[data-ad-placement="header"]', (el) => ({
      cls: el.className,
      minHeight: getComputedStyle(el).minHeight,
      height: Math.round(el.getBoundingClientRect().height),
      hasLabel: !!el.querySelector('.ad-slot__label')
    }));
    assert.match(reserved.cls, /ad-slot--reserved/, 'the slot must be reserved in the markup');
    // placements without an ad unit of their own must stay empty (no box)
    for (const empty of await page.$$eval('[data-ad-placement]', (els) =>
      els.filter((e) => !e.className.includes('ad-slot--reserved')).map((e) => e.dataset.adPlacement))) {
      const slot = (cfg.adsense.slots || {})[empty];
      assert.ok(!slot || !String(slot).trim(),
        `the ${empty} placement has no ad unit and must not reserve any space`);
    }
    assert.equal(reserved.minHeight, expected, 'the reserved height must come from the configuration');
    assert.ok(reserved.height >= parseInt(expected, 10), 'the reserved space must be visible from the first paint');
    assert.ok(reserved.hasLabel, 'the Advertisement label must be part of the reserved slot');

    const google = requests.filter((u) => /googlesyndication|doubleclick|googleadservices/.test(u));
    assert.equal(google.length, 0, 'no request may be made to Google before the consent decision');
    await context.close();
  });

  test('the header unit asks for a banner and the reserved space covers it', async () => {
    const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config', 'site.json'), 'utf8'));
    const { page, context } = await open(`${liveBase}/index.html`, { stubAds: true });
    await page.waitForTimeout(700);

    const header = await page.$eval('[data-ad-placement="header"] ins', (el) => ({
      format: el.dataset.adFormat,
      slot: el.dataset.adSlot
    }));
    assert.equal(header.format, 'horizontal',
      'the header unit must ask for a banner: with "auto" Google serves 300x250 rectangles');
    assert.ok(header.slot, 'the header unit must carry its slot id');

    // the tallest banner Google can return is 320x100; the reserved height
    // must fit it plus the label and the frame padding.
    const reserved = cfg.adsense.reserveHeight.header;
    assert.ok(reserved >= 100 + 45, `the reserved height (${reserved}px) must fit a 320x100 banner`);

    // the sidebar stays responsive: inside a 300px column Google picks a
    // 300x250 or a 300x600, and the reserved height covers the tallest one
    const sidebar = await page.$eval('[data-ad-placement="sidebar"] ins', (el) => el.dataset.adFormat);
    assert.equal(sidebar, 'auto', 'the sidebar unit stays responsive');
    const sidebarReserved = cfg.adsense.reserveHeight.sidebar;
    assert.ok(sidebarReserved >= 600 + 45,
      `the reserved height (${sidebarReserved}px) must fit a 300x600 unit`);
    await context.close();
  });

  test('the layout does not jump when the ad arrives', async () => {
    const { page, context } = await open(`${liveBase}/index.html`, {
      stubAds: true,
      initScript: () => {
        window.__shifts = [];
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__shifts.push(e.value);
        }).observe({ type: 'layout-shift', buffered: true });
      }
    });
    await page.waitForTimeout(700);
    // simulate the real height of a 728x90 unit
    await page.evaluate(() => {
      document.querySelectorAll('[data-ad-placement] ins').forEach((el) => {
        el.style.height = '90px';
      });
    });
    await page.waitForTimeout(600);

    const cls = await page.evaluate(() => window.__shifts.reduce((a, b) => a + b, 0));
    assert.ok(cls < 0.05, `the layout shift must stay low (got ${cls})`);
    await context.close();
  });

  test('auto ads enable page level ads instead of the manual units', async () => {
    // build variant with autoAds on
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], {
      cwd: ROOT,
      env: { ...process.env, KEYCHECK_OUT: 'dist-auto', KEYCHECK_FORCE_ADS: '1', KEYCHECK_AUTO_ADS: '1' },
      stdio: 'pipe'
    });
    const { page, context, requests } = await open(`http://127.0.0.1:${AUTO_PORT}/index.html`, {
      stubAds: true
    });
    await page.waitForTimeout(700);

    const pushed = await page.evaluate(() => (window.adsbygoogle || []).map((a) => a.enable_page_level_ads));
    assert.ok(pushed.includes(true), 'the auto ads payload must be queued');
    assert.equal(requests.filter((u) => u.includes('googlesyndication')).length, 1, 'the script is requested once');
    await context.close();
  });

  test('the sidebar unit is not rendered on small screens', async () => {
    const { page, context } = await open(`${liveBase}/index.html`, {
      stubAds: true,
      context: { viewport: { width: 480, height: 900 } }
    });
    await page.waitForTimeout(700);
    const sidebar = await page.$$eval('[data-ad-placement="sidebar"] ins', (els) => els.length);
    assert.equal(sidebar, 0, 'the vertical unit must not be injected below 1024px');
    await context.close();
  });
});

/* ================================================================== */
describe('pages, SEO and accessibility', () => {
  const pages = [
    ['/', 'Free Online Keyboard & Mouse Tester'],
    ['/guides/diagnostico', 'Keyboard & Mouse Diagnostics Guide'],
    ['/guides/faq', 'Frequently Asked Questions'],
    ['/about', 'About'],
    ['/contact', 'Contact'],
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Use']
  ];

  for (const [pathname, expected] of pages) {
    test(`${pathname} loads without errors and has the expected title`, async () => {
      const { page, context, errors } = await open(`${base}${pathname}`);
      const title = await page.title();
      assert.match(title, new RegExp(expected.split(' ')[0]));
      assert.ok(title.length > 10 && title.length < 120, 'the title must be a sensible length');

      const h1 = await page.locator('h1').count();
      assert.equal(h1, 1, 'exactly one h1 per page');

      const canonical = await page.getAttribute('link[rel="canonical"]', 'href');
      assert.ok(canonical && canonical.startsWith('http'), 'the canonical URL must be absolute');
      assert.ok(!canonical.endsWith('.html'), 'the canonical must not carry the .html extension');
      assert.ok(
        canonical.replace(/\/$/, '') === 'https://checkyourkeyboard.com' + pathname.replace(/\/$/, ''),
        `the canonical must match the real URL (${canonical} vs ${pathname})`
      );
      assert.equal(await page.getAttribute('meta[name="description"]', 'content').then((c) => c.length > 60), true);
      await context.close();
      assert.deepEqual(errors, [], `no console errors on ${pathname}`);
    });
  }

  test('the guides are linked from the main page', async () => {
    const { page, context } = await open(`${base}/index.html`);
    const hrefs = await page.$$eval('a[href]', (els) => els.map((e) => e.getAttribute('href')));
    assert.ok(hrefs.some((h) => h.includes('guides/diagnostico')));
    assert.ok(hrefs.some((h) => h.includes('guides/faq')));
    assert.ok(hrefs.some((h) => h.includes('privacy')));
    assert.ok(hrefs.some((h) => h.includes('terms')));
    assert.ok(
      hrefs.every((h) => !h.endsWith('.html')),
      'los enlaces internos no deben llevar .html (las URLs se sirven sin extension)'
    );
    await context.close();
  });

  test('robots.txt, sitemap.xml and ads.txt are generated', async () => {
    const { page, context } = await open(`${base}/robots.txt`);
    const robots = await page.textContent('body');
    assert.match(robots, /User-agent: \*/);
    assert.match(robots, /Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
    await context.close();

    const { page: p2, context: c2 } = await open(`${base}/sitemap.xml`);
    const sitemap = await p2.textContent('body');
    assert.match(sitemap, /<urlset/);
    assert.match(sitemap, /<loc>https?:\/\/[^<]+<\/loc>/);
    const locCount = (sitemap.match(/<loc>/g) || []).length;
    assert.ok(locCount >= 7, `the sitemap must list every page (found ${locCount})`);
    await c2.close();

    const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config', 'site.json'), 'utf8'));
    const pub = cfg.adsense.publisherId;
    const { page: p3, context: c3 } = await open(`${base}/ads.txt`);
    const ads = await p3.textContent('body');
    const activeLine = ads
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (pub) {
      const expected = `google.com, pub-${pub.replace(/^ca-pub-/, '')}, DIRECT, f08c47fec0942fa0`;
      assert.deepEqual(activeLine, [expected], 'ads.txt must publish the line of the configured publisher');
    } else {
      assert.deepEqual(activeLine, [], 'no publisher line may be active before AdSense is configured');
    }
    await c3.close();
  });

  test('the theme switch works, is remembered and never breaks the layout', async () => {
    const { page, context, errors } = await open(`${base}/index.html`);

    // the site is light by default
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light', 'the default theme must be light');

    const bg = async () => page.$eval('body', (el) => getComputedStyle(el).backgroundColor);
    assert.equal(await bg(), 'rgb(244, 246, 248)', 'the light background must be applied');

    // switch to dark
    await page.click('[data-theme-toggle]');
    await page.waitForTimeout(120);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark', 'the toggle must switch the theme');
    assert.equal(await bg(), 'rgb(13, 15, 18)', 'the dark background must be applied');
    assert.equal(await page.getAttribute('[data-theme-toggle]', 'aria-pressed'), 'true');
    // the label always names the theme it switches to
    assert.match(await page.getAttribute('[data-theme-toggle]', 'aria-label'), /light theme/i);

    // the choice survives a reload
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark', 'the theme must be remembered');

    // and back to light
    await page.click('[data-theme-toggle]');
    await page.waitForTimeout(120);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
    assert.equal(await page.getAttribute('[data-theme-toggle]', 'aria-pressed'), 'false');
    assert.match(await page.getAttribute('[data-theme-toggle]', 'aria-label'), /dark theme/i);

    // the tester still works in both themes
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.locator('#panel-keyboard').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('m');
      const presses = await num(page, 'kb-presses');
      assert.ok(presses >= 1, `the keyboard must work in the ${theme} theme`);
    }

    // no horizontal overflow in either theme
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `the ${theme} theme must not overflow horizontally`);
    }
    await context.close();
    assert.deepEqual(errors, []);
  });

  test('the only publisher id in the markup is the configured one', async () => {
    const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config', 'site.json'), 'utf8'));
    const configured = cfg.adsense.publisherId;
    const { page, context } = await open(`${base}/index.html`);
    const html = await page.content();
    const ids = [...new Set(html.match(/ca-pub-\d+/g) || [])];
    const expected = configured ? [configured] : [];
    assert.deepEqual(ids, expected, 'the markup may only reference the configured publisher id');
    if (configured) {
      const meta = await page.getAttribute('meta[name="google-adsense-account"]', 'content');
      assert.equal(meta, configured, 'the verification meta tag must carry the publisher id');
      const meta2 = await page.getAttribute('meta[name="google-adsense-platform-account"]', 'content');
      assert.equal(meta2, configured, 'the platform verification tag must carry the publisher id');
      // the verification tag must not load any advertising script
      const scripts = await page.$$eval('script[src]', (els) => els.map((e) => e.src));
      assert.ok(
        !scripts.some((s) => s.includes('googlesyndication')),
        'the verification tag must not load the ads script (consent comes first)'
      );
    }
    await context.close();
  });

  test('interactive elements have accessible names', async () => {
    const { page, context } = await open(`${base}/index.html`);
    const unnamed = await page.$$eval('button, a[href]', (els) =>
      els
        .filter((el) => {
          const text = (el.textContent || '').trim();
          const label = el.getAttribute('aria-label');
          return !text && !label;
        })
        .map((el) => el.outerHTML.slice(0, 80))
    );
    assert.deepEqual(unnamed, [], 'every button and link needs an accessible name');
    await context.close();
  });

  test('the privacy policy states that keystrokes stay local', async () => {
    const { page, context } = await open(`${base}/privacy.html`);
    const text = await page.textContent('body');
    assert.match(text, /never (sent|transmitted|uploaded)/i);
    assert.match(text, /AdSense/i);
    await context.close();
  });
});
