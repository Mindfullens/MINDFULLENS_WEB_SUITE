import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Po `vite build`: upewnia się, że plugin GHP i `public/` (m.in. `_redirects`, `_headers`, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `.well-known/security.txt`) trafiły do `dist/`
 * i że te pliki są bajtowo identyczne z `public/` (Vite nie powinien ich modyfikować).
 * Dla `dist/index.html` — lekki smoke: tag modułu Vite i katalog `assets/`.
 * Katalog `dist/assets/` musi zawierać co najmniej jeden plik .js i .css (prawdziwy build).
 * Odpalane z `postbuild` (patrz `package.json`).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
/** Kopiowane 1:1 z `public/` — muszą być bajtowo identyczne w `dist/`. */
const publicCopyNames = [
  '_redirects',
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'favicon.svg',
  'manifest.webmanifest',
  '.well-known/security.txt',
];
const need = ['index.html', '404.html', ...publicCopyNames];

for (const name of need) {
  const f = path.join(dist, name);
  if (!fs.existsSync(f)) {
    process.stderr.write(`[test-dist-outputs] brak: dist/${name} (Vite miał skopiować public; 404 = plugin)\n`);
    process.exit(1);
  }
}

const publicDir = path.join(root, 'public');
for (const name of publicCopyNames) {
  const pub = path.join(publicDir, name);
  const out = path.join(dist, name);
  assert.equal(
    Buffer.compare(fs.readFileSync(pub), fs.readFileSync(out)),
    0,
    `dist/${name} musi być bajtowo identyczne z public/${name} (kopia Vite)`,
  );
}

const indexPath = path.join(dist, 'index.html');
const notFoundPath = path.join(dist, '404.html');
const indexBuf = fs.readFileSync(indexPath);
const notFoundBuf = fs.readFileSync(notFoundPath);
const indexHtml = indexBuf.toString('utf8');
assert.match(
  indexHtml,
  /<html[^>]*\blang="pl"/,
  'dist/index.html: html lang=pl (jak w źródłowym index.html)',
);
assert.match(
  indexHtml,
  /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/,
  'dist/index.html: preconnect fonts.googleapis.com',
);
assert.match(
  indexHtml,
  /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/,
  'dist/index.html: preconnect fonts.gstatic',
);
assert.match(
  indexHtml,
  /<link rel="canonical" href="https:\/\/mindfullens\.pl\/" \/>/,
  'dist/index.html: link rel=canonical',
);
assert.match(
  indexHtml,
  /property="og:url"\s+content="https:\/\/mindfullens\.pl\/"/,
  'dist/index.html: og:url',
);
assert.match(indexHtml, /type="application\/ld\+json"/, 'dist/index.html: JSON-LD');
assert.match(
  indexHtml,
  /"@type"\s*:\s*"WebApplication"/,
  'dist/index.html: JSON-LD @type',
);
assert.match(
  indexHtml,
  /"url"\s*:\s*"https:\/\/mindfullens\.pl\/"/,
  'dist/index.html: JSON-LD url',
);
assert.match(
  indexHtml,
  /class="ml-skip-link"[^>]*href=["']#root["']/,
  'dist/index.html: skip link (a11y)',
);
assert.match(
  indexHtml,
  /name="color-scheme"\s+content="dark"/i,
  'dist/index.html: color-scheme dark',
);
assert.match(
  indexHtml,
  /name="application-name"\s+content="Film Lab"/i,
  'dist/index.html: application-name',
);
assert.match(
  indexHtml,
  /name="format-detection"[\s\S]*?content="telephone=no,\s*date=no,\s*address=no,\s*email=no"/i,
  'dist/index.html: format-detection (iOS)',
);
assert.match(
  indexHtml,
  /name="robots"[\s\S]*?content="index,\s*follow,\s*max-image-preview:large,\s*max-video-preview:\s*-1,\s*max-snippet:\s*-1"/i,
  'dist/index.html: robots (SEO)',
);
assert.match(
  indexHtml,
  /name="msapplication-TileColor"\s+content="#111111"/i,
  'dist/index.html: msapplication-TileColor',
);
assert.ok(
  /name="mobile-web-app-capable"\s+content="yes"/i.test(indexHtml) ||
    /name="apple-mobile-web-app-capable"\s+content="yes"/i.test(indexHtml),
  'dist/index.html: web app capable (mobile-web-app-capable lub legacy apple-mobile)',
);
assert.match(
  indexHtml,
  /name="apple-mobile-web-app-title"\s+content="Film Lab"/i,
  'dist/index.html: apple web app title',
);
assert.match(
  indexHtml,
  /name="apple-mobile-web-app-status-bar-style"\s+content="black"/i,
  'dist/index.html: apple status bar',
);
assert.match(
  indexHtml,
  /rel="apple-touch-icon"[^>]+href="[^"]*favicon\.svg"[^>]+type="image\/svg\+xml"/,
  'dist/index.html: apple-touch-icon + type',
);
assert.match(indexHtml, /\bid="root"[^>]*role="main"/, 'dist/index.html: #root role=main');
assert.match(
  indexHtml,
  /property="og:locale"\s+content="pl_PL"/,
  'dist/index.html: og:locale',
);
assert.match(
  indexHtml,
  /property="og:site_name"\s+content="Mindfullens Film Lab"/,
  'dist/index.html: og:site_name',
);
assert.match(
  indexHtml,
  /property="og:image"[^>]+content="[^"]*favicon\.svg"/,
  'dist/index.html: og:image',
);
assert.match(
  indexHtml,
  /property="og:image:alt"\s+content="Mindfullens Film Lab"/,
  'dist/index.html: og:image:alt',
);
assert.match(
  indexHtml,
  /property="og:image:type"\s+content="image\/svg\+xml"/,
  'dist/index.html: og:image:type',
);
assert.match(
  indexHtml,
  /name="twitter:title"\s+content="Mindfullens Film Lab"/,
  'dist/index.html: twitter:title',
);
assert.match(
  indexHtml,
  /name="twitter:image"[^>]+content="[^"]*favicon\.svg"/,
  'dist/index.html: twitter:image',
);
assert.match(
  indexHtml,
  /name="twitter:description"[\s\S]*?content="Symulacja klisz i profili w przeglądarce \(Vite, React\)\."/,
  'dist/index.html: twitter:description',
);
assert.match(
  indexHtml,
  /rel="manifest"[^>]+href="[^"]*manifest\.webmanifest"/,
  'dist/index.html: link manifest (base może dodać prefix ścieżki)',
);
assert.match(
  indexHtml,
  /type=["']module["']/,
  'dist/index.html: oczekiwany główny <script type="module"> (Vite)',
);
assert.match(
  indexHtml,
  /<script[^>]+type="module"[^>]+fetchpriority="high"/,
  'dist/index.html: entry module fetchpriority=high (plugin mindfullens-entry-module-fetchpriority)',
);
assert.match(
  indexHtml,
  /assets\//,
  'dist/index.html: musi wskazywać na zbudowany katalog assets/ (Vite)',
);

const assetsDir = path.join(dist, 'assets');
assert.ok(fs.existsSync(assetsDir), 'dist/assets/ (katalog bundli Vite)');
const assetNames = fs.readdirSync(assetsDir);
assert.ok(
  assetNames.some((f) => f.endsWith('.js')),
  'dist/assets musi zawierać co najmniej jeden plik .js',
);
assert.ok(
  assetNames.some((f) => f.endsWith('.css')),
  'dist/assets musi zawierać co najmniej jeden plik .css',
);

assert.equal(
  Buffer.compare(indexBuf, notFoundBuf),
  0,
  'dist/404.html musi być kopią dist/index.html (plugin mindfullens-copy-dist-index-to-404 w vite.config.js)',
);

process.stdout.write('PASS dist-outputs\n');
