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
    }
  };
}

const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));

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
  const canonicalPath = pagePath === 'index.html' ? '/' : `/${pagePath}`;
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
    YEAR: String(new Date().getFullYear()),
    PAGE_TITLE: '',
    PAGE_DESCRIPTION: site.description,
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

log('processing pages');
const htmlFiles = files.filter((f) => /\.html$/i.test(f) && !f.startsWith('partials/'));
for (const rel of htmlFiles) {
  const raw = await readFile(path.join(SRC, rel), 'utf8');
  let html = await resolvePartials(raw);
  html = applyTokens(html, rel);
  html = applyAdReservation(html);

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
    const loc = p.path === 'index.html' ? `${baseUrl}/` : `${baseUrl}/${p.path}`;
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
  `# KEYCHECK ads.txt
# This file is verified by Google AdSense. Replace the placeholder below with the
# exact line shown in your AdSense dashboard (Account > Ads.txt).
${adsenseLine}
`,
  'utf8'
);

log('build complete ->', path.relative(ROOT, DIST));
