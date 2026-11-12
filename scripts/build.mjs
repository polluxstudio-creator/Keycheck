/**
 * KEYCHECK build script — zero dependencies.
 *
 * 1. Copies src/ -> dist/
 * 2. Resolves partials ({{@include name}} and <!-- @include name -->)
 * 3. Replaces configuration tokens ({{TOKEN}})
 * 4. Generates dist/assets/js/site-config.js from config/site.json
 * 5. Generates robots.txt, sitemap.xml and ads.txt
 *
 * The output in dist/ is a plain static site: upload that folder anywhere.
 */
import { readFile, writeFile, mkdir, rm, readdir, stat, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT_DIR = process.env.KEYCHECK_OUT || 'dist';
const DIST = path.join(ROOT, OUT_DIR);
const CONFIG_PATH = path.join(ROOT, 'config', 'site.json');

/* QA switch: build a copy with a fake AdSense configuration to verify the
   advertising code path without touching the real configuration file. */
const FORCE_ADS = process.env.KEYCHECK_FORCE_ADS === '1';

/** AdSense configuration actually used for this build. */
function effectiveAds() {
  // KEYCHECK_NO_ADS=1 builds the site as it looks before AdSense is set up:
  // no ad units, no reservation and no consent banner. The test suite uses
  // it to check the unconfigured behaviour.
  if (process.env.KEYCHECK_NO_ADS === '1') {
    return { ...config.adsense, enabled: false, autoAds: false };
  }
  if (!FORCE_ADS) return config.adsense;
  return {
    ...config.adsense,
    enabled: true,
    publisherId: 'ca-pub-0000000000000000',
    slots: {
      header: '1111111111',
      sidebar: '2222222222',
      belowTester: '3333333333',
      betweenSections: '4444444444'
    },
    autoAds: process.env.KEYCHECK_AUTO_ADS === '1'
  };
}

const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));

// KEYCHECK_SELF_BANNER=1 builds the alternative mode where the site uses its
// own consent banner instead of Google's certified CMP. The test suite uses it
// to check that the ad code is not requested before the visitor decides.
const SELF_BANNER = process.env.KEYCHECK_SELF_BANNER === '1';

/** True when the site relies on Google's certified CMP (and not on our own). */
const USE_GOOGLE_CMP = config.consent?.useGoogleCmp === true && !SELF_BANNER;

const log = (...a) => console.log('•', ...a);

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** Resolve `<!-- @include foo -->` / `{{@include foo}}` partial references. */
async function resolvePartials(content, depth = 0) {
  if (depth > 5) throw new Error('Partial include depth exceeded (circular include?)');
  const includeRe = /(?:<!--\s*@include\s+([\w.-]+)\s*-->|\{\{@include\s+([\w.-]+)\s*\}\})/g;
  const matches = [...content.matchAll(includeRe)];
  if (!matches.length) return content;

  let result = content;
  for (const m of matches) {
    const name = m[1] || m[2];
    const file = path.join(SRC, 'partials', `${name}.html`);
    if (!existsSync(file)) throw new Error(`Unknown partial: ${name}`);
    let partial = await readFile(file, 'utf8');
    partial = await resolvePartials(partial, depth + 1);
    result = result.replace(m[0], partial);
  }
  return result;
}

/** Replace {{TOKEN}} placeholders with real values. */
function applyTokens(content, pagePath) {
  const site = config.site;
  const base = '../'.repeat(pagePath.split('/').length - 1);
  // Las URLs se sirven sin extension: /guides/faq (Cloudflare sirve el
  // fichero guides/faq.html). Asi el canonical coincide con la URL real.
  const cleanPath = pagePath.replace(/\.html$/, '');
  const canonicalPath = pagePath === 'index.html' ? '/' : `/${cleanPath}`;
  const canonical = `${site.url.replace(/\/+$/, '')}${canonicalPath}`;
  const ogImage = `${site.url.replace(/\/+$/, '')}/assets/img/og-image.png`;

  const values = {
    SITE_NAME: site.name,
    SITE_TAGLINE: site.tagline,
    SITE_URL: site.url.replace(/\/+$/, ''),
    SITE_DESCRIPTION: site.description,
    SITE_LOCALE: site.locale,
    THEME_COLOR: site.themeColor,
    TWITTER_HANDLE: site.twitterHandle,
    CONTACT_EMAIL: site.contactEmail,
    CANONICAL: canonical,
    OG_IMAGE: ogImage,
    BASE: base,
    ROOT: base === '' ? '/' : base,
    YEAR: String(new Date().getFullYear()),
    PAGE_TITLE: '',
    PAGE_DESCRIPTION: site.description,
    // Etiqueta de verificacion de propiedad que pide AdSense. No carga ningun
    // script: solo declara la cuenta en el <head> de cada pagina.
    // Google ofrece varias etiquetas para verificar la propiedad. Se ponen
    // todas: "google-adsense-account" es la que busca el verificador de
    // AdSense y "google-adsense-platform-account" la que usa la plataforma
    // para los autoanuncios. Ninguna carga scripts ni cookies.
    // Se ejecuta antes del primer pintado: fija el tema guardado para que la
    // pagina no aparezca un instante en el color contrario.
    THEME_BOOTSTRAP:
      "<script>(function(){try{var t=localStorage.getItem('kc-theme');" +
      "document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');" +
      "}catch(e){document.documentElement.setAttribute('data-theme','light');}})();</script>",
    ADSENSE_META: config.adsense.publisherId
      ? [
          `<meta name="google-adsense-account" content="${config.adsense.publisherId}">`,
          `<meta name="google-adsense-platform-account" content="${config.adsense.publisherId}">`
        ].join('\n')
      : '',
  };

  return content.replace(/\{\{([A-Z0-9_]+)\}\}/g, (full, key) => {
    if (key in values) return values[key];
    return full; // unknown token -> leave visible so it is obvious
  });
}

/**
 * Reserves the ad space directly in the markup when advertising is fully
 * configured. The reservation then exists from the very first paint, so the
 * page never jumps when the ad arrives (or when the visitor answers the
 * consent banner). Without a real configuration nothing is reserved and the
 * slots stay completely empty and invisible.
 */
function applyAdReservation(content) {
  const ads = effectiveAds();
  const publisherOk = typeof ads.publisherId === 'string' && /^ca-pub-\d{6,20}$/.test(ads.publisherId.trim());
  const reserve = ads.enabled && publisherOk;

  return content.replace(
    /<div class="ad-slot([^"]*)" data-ad-placement="([a-zA-Z]+)"([^>]*)><\/div>/g,
    (match, extraClasses, placement, rest) => {
      if (!reserve) return match;
      // A placement without its own ad unit must not leave an empty labelled
      // box behind: only the units that really exist are reserved.
      const slotId = (ads.slots || {})[placement];
      if (typeof slotId !== 'string' || !slotId.trim()) return match;
      const height = (ads.reserveHeight || {})[placement];
      if (!height) return match;
      const label = ads.label || 'Advertisement';
      return (
        `<div class="ad-slot${extraClasses} ad-slot--reserved" data-ad-placement="${placement}"${rest}` +
        ` style="--ad-reserve:${height}px">` +
        `<span class="ad-slot__label">${label}</span>` +
        `</div>`
      );
    }
  );
}

/* ------------------------------------------------------------------ */
/* build                                                               */
/* ------------------------------------------------------------------ */

log('cleaning dist/');
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

log('copying static assets');
const files = await walk(SRC);
for (const rel of files) {
  if (rel.startsWith('partials/')) continue; // partials are compiled into the pages
  const from = path.join(SRC, rel);
  const to = path.join(DIST, rel);
  await mkdir(path.dirname(to), { recursive: true });
  if (/\.(html)$/i.test(rel)) continue; // handled below
  await copyFile(from, to);
}

// Files under static/ are copied verbatim: no tokens, no partials and they
// never reach the sitemap. Used for the verification files Google asks to
// host at the root of the domain (e.g. google-site-verification-*.html).
log('copying static files');
const STATIC_DIR = path.join(ROOT, 'static');
if (existsSync(STATIC_DIR)) {
  for (const rel of await walk(STATIC_DIR)) {
    const from = path.join(STATIC_DIR, rel);
    const to = path.join(DIST, rel);
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
  }
}

/**
 * Inserts the Google certified CMP (consent management platform) scripts in
 * the <head> of every page.
 *
 * Publishing the message in AdSense is NOT enough: Google does not inject the
 * CMP by itself. The publisher has to add the tag, otherwise the consent
 * message never reaches the visitor and the review cannot confirm that consent
 * management is really in place. The snippet comes straight from the AdSense
 * console and has two parts:
 *
 *   1. the runtime that shows the message (the publisher id is the numeric
 *      part of ca-pub-XXXXXXXX, without the prefix);
 *   2. a hidden "googlefcPresent" iframe that tells the ads script a CMP is
 *      already on the page, so it does not request a second one.
 */
function applyCmpScripts(content) {
  const ads = effectiveAds();
  if (!ads.enabled) return content;
  if (!USE_GOOGLE_CMP) return content;
  // The QA build (KEYCHECK_FORCE_ADS=1) uses a placeholder publisher id that
  // does not exist, so there is no CMP to load there.
  if (FORCE_ADS) return content;
  const publisherId = String(ads.publisherId || '').trim();
  if (!/^ca-pub-\d{6,20}$/.test(publisherId)) return content;
  if (content.includes('fundingchoicesmessages.google.com')) return content; // already there

  const numericId = publisherId.replace(/^ca-pub-/, '');
  const scripts =
    `<script async src="https://fundingchoicesmessages.google.com/i/pub-${numericId}?ers=1"></script>\n` +
    `<script>(function(){function signalGooglefcPresent(){if(!window.frames['googlefcPresent']){` +
    `if(document.body){const iframe=document.createElement('iframe');` +
    `iframe.style='width: 0; height: 0; border: none; z-index: -1000; left: -1000px; top: -1000px;';` +
    `iframe.style.display='none';iframe.name='googlefcPresent';document.body.appendChild(iframe);}` +
    `else{setTimeout(signalGooglefcPresent,0);}}}` +
    `signalGooglefcPresent();})();</script>`;

  // Right before </head>: the runtime must be in the head, the marker can live
  // in the body, but keeping both together matches the official snippet.
  return content.replace('</head>', `${scripts}\n</head>`);
}

log('processing pages');
const htmlFiles = files.filter((f) => /\.html$/i.test(f) && !f.startsWith('partials/'));
for (const rel of htmlFiles) {
  const raw = await readFile(path.join(SRC, rel), 'utf8');
  let html = await resolvePartials(raw);
  html = applyTokens(html, rel);
  html = applyAdReservation(html);
  html = applyCmpScripts(html);

  // Per-page title / description come from the <title> and <meta name="description">
  // placeholders; the PAGE_TITLE / PAGE_DESCRIPTION tokens are filled from config
  // when a page does not define its own explicit values.
  const outPath = path.join(DIST, rel);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');
}
log(`  ${htmlFiles.length} pages written`);

/* -------------------------------------------------------------- */
/* runtime configuration (consumed by adsense.js / consent.js)     */
/* -------------------------------------------------------------- */
const runtimeConfig = {
  site: config.site,
  consent: config.consent,
  adsense: config.adsense,
};

runtimeConfig.adsense = effectiveAds();

// KEYCHECK_SELF_BANNER=1 builds the alternative mode where the site uses its
// own consent banner instead of Google's certified CMP. The test suite uses it
// to check that the ad code is not requested before the visitor decides.
if (!USE_GOOGLE_CMP) {
  runtimeConfig.consent = { ...config.consent, useGoogleCmp: false };
}

await mkdir(path.join(DIST, 'assets', 'js'), { recursive: true });
await writeFile(
  path.join(DIST, 'assets', 'js', 'site-config.js'),
  `/* Generated by scripts/build.mjs — edit config/site.json instead. */\n` +
    `window.KEYCHECK_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`,
  'utf8'
);

/* -------------------------------------------------------------- */
/* robots.txt                                                         */
/* -------------------------------------------------------------- */
const baseUrl = config.site.url.replace(/\/+$/, '');
await writeFile(
  path.join(DIST, 'robots.txt'),
  `# KEYCHECK — ${config.site.tagline}
User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`,
  'utf8'
);

/* -------------------------------------------------------------- */
/* sitemap.xml                                                        */
/* -------------------------------------------------------------- */
const today = new Date().toISOString().slice(0, 10);
const urls = config.seo.pages
  .map((p) => {
    const cleanPath = p.path.replace(/\.html$/, '');
    const loc = p.path === 'index.html' ? `${baseUrl}/` : `${baseUrl}/${cleanPath}`;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`;
  })
  .join('\n');

await writeFile(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
  'utf8'
);

/* -------------------------------------------------------------- */
/* .nojekyll — sirve dist/ tal cual en GitHub Pages               */
/* -------------------------------------------------------------- */
await writeFile(path.join(DIST, '.nojekyll'), '', 'utf8');

/* -------------------------------------------------------------- */
/* ads.txt — real AdSense line is added by the publisher account.  */
/* -------------------------------------------------------------- */
const adsenseLine = config.adsense.publisherId
  ? `google.com, ${config.adsense.publisherId.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`
  : '# TODO: paste the line from your AdSense > Ads.txt overview here (it starts with "google.com").';

await writeFile(
  path.join(DIST, 'ads.txt'),
  `# KEYCHECK — authorized sellers for Google AdSense
${adsenseLine}
`,
  'utf8'
);

log('build complete ->', path.relative(ROOT, DIST));
