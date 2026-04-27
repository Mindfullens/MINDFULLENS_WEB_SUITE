import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function p(rel) {
  return path.join(root, rel);
}
function readText(rel) {
  return fs.readFileSync(p(rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(p(rel));
}

assert.ok(exists('public/_redirects'), 'public/_redirects');
const redirects = readText('public/_redirects');
assert.match(redirects, /\/index\.html/, '_redirects wskazuje index.html');
assert.match(redirects, /\b200\b/, '_redirects 200 (SPA)');

const vercel = JSON.parse(readText('vercel.json'));
assert.ok(Array.isArray(vercel.rewrites) && vercel.rewrites.length > 0, 'vercel.json rewrites');
assert.equal(vercel.rewrites[0].destination, '/index.html', 'Vercel → index.html');
assert.ok(Array.isArray(vercel.headers) && vercel.headers.length > 0, 'vercel.json: headers');
const vercelHeaderList = vercel.headers[0].headers;
assert.ok(Array.isArray(vercelHeaderList) && vercelHeaderList.length > 0, 'vercel.json: header entries');

assert.ok(exists('netlify.toml'), 'netlify.toml');
const netlify = readText('netlify.toml');
assert.match(netlify, /publish\s*=\s*["']dist["']/, 'netlify publish = dist');

assert.ok(exists('public/_headers'), 'public/_headers');
const deployHeaders = readText('public/_headers');
assert.match(deployHeaders, /\/\*/, '_headers: /* (lub inny path) start');

/**
 * Wyciąga pary nagłówków z pliku _headers (Netlify/CF): komentarze, ścieżki `/*`…,
 * wiersze tylko z URL (np. `https:`…) są pomijane. Brak duplikatu w pliku względem Vercel
 * łapie m.in. nadmiarową linię w public/_headers.
 */
function listHeaderPairsFromUnderscoreHeaders(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.includes(':')) {
      continue;
    }
    const t = raw.trim();
    if (!t || t.startsWith('#')) {
      continue;
    }
    const idx = t.indexOf(':');
    const key = t.slice(0, idx).trim();
    const value = t.slice(idx + 1).trim();
    if (!key) {
      continue;
    }
    if (key === 'http' || key === 'https') {
      continue;
    }
    if (key.startsWith('/')) {
      continue;
    }
    out.push([key, value]);
  }
  return out;
}

function sortHeaderPairs(pairs) {
  return [...pairs].sort((a, b) => a[0].localeCompare(b[0], 'en') || a[1].localeCompare(b[1], 'en'));
}

const fromVercel = sortHeaderPairs(vercelHeaderList.map((h) => [h.key, h.value]));
const fromFile = sortHeaderPairs(listHeaderPairsFromUnderscoreHeaders(deployHeaders));
assert.deepEqual(
  fromFile,
  fromVercel,
  'public/_headers i vercel.json muszą definiować ten sam zestaw nagłówków (liczba + pary key/value)',
);

const pagesWf = '.github/workflows/pages.yml';
if (exists(pagesWf)) {
  const ghp = readText(pagesWf);
  assert.match(ghp, /VITE_BASE/, 'pages workflow ustawia VITE_BASE');
  assert.match(ghp, /upload-pages-artifact/, 'pages workflow: artifact');
}

assert.ok(exists('index.html'), 'index.html (root)');
const indexHtml = readText('index.html');
assert.match(indexHtml, /<html[^>]*\blang="pl"/, 'index: html lang=pl (dostępność, SEO)');
assert.match(
  indexHtml,
  /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/,
  'index: preconnect fonts.googleapis.com (Outfit itd. w Film Lab + static)',
);
assert.match(
  indexHtml,
  /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/,
  'index: preconnect fonts.gstatic + crossorigin (font fetch)',
);
assert.match(
  indexHtml,
  /<link rel="canonical" href="https:\/\/mindfullens\.pl\/" \/>/,
  'index: link rel=canonical (kanoniczna domena, SEO)',
);
assert.match(
  indexHtml,
  /property="og:url"\s+content="https:\/\/mindfullens\.pl\/"/,
  'index: og:url (Open Graph, kanoniczny adres)',
);
assert.match(indexHtml, /type="application\/ld\+json"/, 'index: JSON-LD script (schema.org)');
assert.match(
  indexHtml,
  /"@context"\s*:\s*"https:\/\/schema\.org"/,
  'index: JSON-LD @context',
);
assert.match(
  indexHtml,
  /"@type"\s*:\s*"WebApplication"/,
  'index: JSON-LD WebApplication',
);
assert.match(
  indexHtml,
  /"url"\s*:\s*"https:\/\/mindfullens\.pl\/"/,
  'index: JSON-LD url (kanoniczna domena)',
);
assert.match(
  indexHtml,
  /class="ml-skip-link"[^>]*href=["']#root["']/,
  'index: skip link do #root (a11y)',
);
assert.match(indexHtml, /\bid="root"[^>]*role="main"/, 'index: #root role=main');
assert.match(indexHtml, /name="description"/, 'index: meta description');
assert.match(
  indexHtml,
  /name="robots"[\s\S]*?content="index,\s*follow,\s*max-image-preview:large,\s*max-video-preview:\s*-1,\s*max-snippet:\s*-1"/i,
  'index: robots (index+follow, Google image+video+snippet)',
);
assert.match(
  indexHtml,
  /name="format-detection"[\s\S]*?content="telephone=no,\s*date=no,\s*address=no,\s*email=no"/i,
  'index: format-detection (iOS, bez auto-linków tel/data/adres/e-mail w tekście)',
);
assert.match(indexHtml, /property="og:title"/, 'index: og:title');
assert.match(
  indexHtml,
  /property="og:locale"\s+content="pl_PL"/,
  'index: og:locale pl_PL',
);
assert.match(
  indexHtml,
  /property="og:site_name"\s+content="Mindfullens Film Lab"/,
  'index: og:site_name',
);
assert.match(
  indexHtml,
  /property="og:image"\s+content="https:\/\/mindfullens\.pl\/favicon\.svg"/,
  'index: og:image (bezwzględny URL; crawlersy społecznościowe)',
);
assert.match(
  indexHtml,
  /property="og:image:alt"\s+content="Mindfullens Film Lab"/,
  'index: og:image:alt',
);
assert.match(
  indexHtml,
  /property="og:image:type"\s+content="image\/svg\+xml"/,
  'index: og:image:type (SVG)',
);
assert.match(
  indexHtml,
  /name="twitter:title"\s+content="Mindfullens Film Lab"/,
  'index: twitter:title',
);
assert.match(
  indexHtml,
  /name="twitter:image"\s+content="https:\/\/mindfullens\.pl\/favicon\.svg"/,
  'index: twitter:image (bezwzględny URL)',
);
assert.match(
  indexHtml,
  /name="twitter:description"[\s\S]*?content="Symulacja klisz i profili w przeglądarce \(Vite, React\)\."/,
  'index: twitter:description (jak og:description)',
);
assert.match(indexHtml, /name="theme-color"/, 'index: theme-color');
assert.match(
  indexHtml,
  /name="msapplication-TileColor"\s+content="#111111"/i,
  'index: msapplication-TileColor (Windows / kafel)',
);
assert.match(
  indexHtml,
  /name="color-scheme"\s+content="dark"/i,
  'index: color-scheme dark (UI/scroll/UA)',
);
assert.match(
  indexHtml,
  /name="application-name"\s+content="Film Lab"/i,
  'index: application-name (PWA/Chrome, Windows)',
);
assert.match(
  indexHtml,
  /name="apple-mobile-web-app-capable"\s+content="yes"/i,
  'index: apple web app capable (iOS skrót)',
);
assert.match(
  indexHtml,
  /name="apple-mobile-web-app-title"\s+content="Film Lab"/i,
  'index: apple web app title',
);
assert.match(
  indexHtml,
  /name="apple-mobile-web-app-status-bar-style"\s+content="black"/i,
  'index: apple status bar (dark chrome)',
);
assert.match(
  indexHtml,
  /rel="icon"[^>]+href="\/favicon\.svg"/,
  'index: link favicon.svg',
);
assert.match(
  indexHtml,
  /rel="apple-touch-icon"[^>]+href="\/favicon\.svg"[^>]+type="image\/svg\+xml"/,
  'index: apple-touch-icon + type=image/svg+xml',
);
assert.match(
  indexHtml,
  /<script[^>]+type="module"[^>]+fetchpriority="high"/,
  'index: entry script fetchpriority=high (SPA)',
);
assert.match(
  indexHtml,
  /rel="manifest"[^>]+href="\/manifest\.webmanifest"/,
  'index: link manifest (PWA light)',
);

assert.ok(exists('public/favicon.svg'), 'public/favicon.svg');
const favicon = readText('public/favicon.svg');
assert.match(favicon, /<svg/i, 'favicon.svg: SVG');
assert.match(favicon, /xmlns="http:\/\/www.w3.org\/2000\/svg"/, 'favicon: xmlns');

assert.ok(exists('public/manifest.webmanifest'), 'public/manifest.webmanifest');
const webmanifest = JSON.parse(readText('public/manifest.webmanifest'));
assert.equal(
  webmanifest.id,
  'https://mindfullens.pl/',
  'manifest: id (tożsamość PWA, zgodna z kanoniczną domeną)',
);
assert.equal(webmanifest.name, 'Mindfullens Film Lab', 'manifest: name');
assert.equal(
  webmanifest.prefer_related_applications,
  false,
  'manifest: prefer PWA w przeglądarce (gdy brak store related)',
);
assert.equal(
  webmanifest.launch_handler?.client_mode,
  'navigate-existing',
  'manifest: launch_handler (ponowne uruchomienie PWA → istniejące okno, SPA)',
);
assert.equal(webmanifest.lang, 'pl', 'manifest: lang (BCP 47, jak html lang)');
assert.equal(webmanifest.dir, 'ltr', 'manifest: dir');
assert.deepEqual(
  webmanifest.categories,
  ['multimedia', 'photo'],
  'manifest: categories (katalogi PWA / sklepy)',
);
assert.equal(webmanifest.theme_color, '#111111', 'manifest: theme_color');
assert.equal(webmanifest.start_url, './', 'manifest: start_url (relative, project page)');
assert.equal(webmanifest.scope, './', 'manifest: scope (jak start_url, PWA nawigacja)');
{
  const expectShortcutUrls = [
    './film-lab',
    './live',
    './matcher',
    './timemachine',
    './ciemnia',
    './analog-signature',
    './landing',
  ];
  assert.ok(
    Array.isArray(webmanifest.shortcuts) && webmanifest.shortcuts.length >= expectShortcutUrls.length,
    'manifest: shortcuts (Chromium, narzędzia SPA)',
  );
  const byShortcutUrl = Object.fromEntries(webmanifest.shortcuts.map((s) => [s.url, s]));
  for (const u of expectShortcutUrls) {
    assert.ok(byShortcutUrl[u], `manifest: shortcut → ${u}`);
    assert.equal(
      byShortcutUrl[u].icons[0].src,
      '/favicon.svg',
      `manifest: shortcut icon (${u})`,
    );
  }
}

assert.ok(exists('public/.well-known/security.txt'), 'public/.well-known/security.txt');
const securityTxt = readText('public/.well-known/security.txt');
assert.match(securityTxt, /^Contact:\s*/m, 'security.txt: Contact (RFC 9116)');
assert.match(securityTxt, /mindfullens\.pl/i, 'security.txt: Contact (domena)');

assert.ok(exists('public/robots.txt'), 'public/robots.txt');
const robots = readText('public/robots.txt');
assert.match(robots, /User-agent:\s*\*/i, 'robots: User-agent');
assert.match(robots, /Allow:\s*\//, 'robots: Allow /');
assert.match(
  robots,
  /^Sitemap:\s*https:\/\/mindfullens\.pl\/sitemap\.xml\s*$/m,
  'robots: Sitemap (kanoniczna domena + ścieżka sitemapy)',
);

assert.ok(exists('public/sitemap.xml'), 'public/sitemap.xml');
const sitemap = readText('public/sitemap.xml');
assert.match(
  sitemap,
  /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/,
  'sitemap: xmlns 0.9',
);
const sitemapLocs = sitemap.match(
  /<loc>(https:\/\/mindfullens\.pl[^<]*)<\/loc>/g,
) ?? [];
assert.equal(sitemapLocs.length, 8, 'sitemap: 8 wpisów (główne trasy SPA + landing)');
const expectPaths = new Set([
  'https://mindfullens.pl/',
  'https://mindfullens.pl/landing',
  'https://mindfullens.pl/film-lab',
  'https://mindfullens.pl/matcher',
  'https://mindfullens.pl/timemachine',
  'https://mindfullens.pl/live',
  'https://mindfullens.pl/ciemnia',
  'https://mindfullens.pl/analog-signature',
]);
const gotLocs = new Set(
  sitemapLocs.map((x) => x.replace(/^<loc>/, '').replace(/<\/loc>$/, '')),
);
assert.deepEqual(gotLocs, expectPaths, 'sitemap: <loc> zgadzają się z trasami App.jsx + strona główna');

process.stdout.write('PASS static-deploy-assets\n');
