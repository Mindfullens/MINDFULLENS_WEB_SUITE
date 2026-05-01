/**
 * Ensures PL/EN locale strings exist for every export format pill ID (raster + PSD).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILM_LAB_EXPORT_MODAL_FORMAT_IDS } from '../src/engine/filmLabExportFormats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function readLocale(rel) {
  const text = await fs.readFile(path.join(root, rel), 'utf8');
  return JSON.parse(text);
}

const en = await readLocale('src/i18n/locales/en.json');
const pl = await readLocale('src/i18n/locales/pl.json');

for (const id of FILM_LAB_EXPORT_MODAL_FORMAT_IDS) {
  const enLabel = en?.filmLab?.exportModal?.format?.[id];
  const plLabel = pl?.filmLab?.exportModal?.format?.[id];
  assert.ok(
    typeof enLabel === 'string' && enLabel.length > 0,
    `en.json: missing non-empty filmLab.exportModal.format.${id}`
  );
  assert.ok(
    typeof plLabel === 'string' && plLabel.length > 0,
    `pl.json: missing non-empty filmLab.exportModal.format.${id}`
  );
}

console.log('PASS film-lab export format i18n parity');
