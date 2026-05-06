import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * D4 / lokalny gate: pliki pod assetRelativePath z REFERENCE-SET-MANIFEST.json muszą istnieć
 * (po skopiowaniu z DAM). Nie jest częścią domyślnego `npm run ci` — klon bez RAW-ów by padał.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(
  root,
  'data',
  'reference-sets',
  'reference-set-v1',
  'REFERENCE-SET-MANIFEST.json',
);

const raw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(raw);
assert.equal(manifest.schema, 'mindfullens.reference-set.v1', 'manifest schema');
assert.ok(Array.isArray(manifest.items), 'manifest.items');

const missing = [];
const short = [];
for (const item of manifest.items) {
  const rel = item.assetRelativePath;
  assert.ok(typeof rel === 'string' && rel.length > 0, `${item.id}: assetRelativePath`);
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    missing.push(rel);
    continue;
  }
  const st = fs.statSync(abs);
  if (!st.isFile() || st.size < 1) {
    short.push(rel);
  }
}

if (missing.length || short.length) {
  const msg = [
    missing.length ? `Brak plików (${missing.length}):\n  ${missing.join('\n  ')}` : '',
    short.length ? `Puste / nie-plik (${short.length}):\n  ${short.join('\n  ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  assert.fail(msg);
}

process.stdout.write(
  `PASS reference-set-v1-assets (${manifest.items.length} plików pod assetRelativePath)\n`,
);
