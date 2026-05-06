import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readJson = async (rel) => JSON.parse(await fs.readFile(path.join(__dirname, rel), 'utf8'));

const pl = await readJson('../src/i18n/locales/pl.json');
const en = await readJson('../src/i18n/locales/en.json');

function flattenKeys(obj, prefix = '') {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [prefix || '(root)'];
  }
  const keys = [];
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const plKeys = new Set(flattenKeys(pl));
const enKeys = new Set(flattenKeys(en));
const missingInEn = [...plKeys].filter((k) => !enKeys.has(k));
const extraInEn = [...enKeys].filter((k) => !plKeys.has(k));

assert.deepEqual(missingInEn, [], `PL keys missing in en.json: ${missingInEn.slice(0, 20).join(', ')}`);
assert.deepEqual(extraInEn, [], `Extra keys in en.json vs pl.json: ${extraInEn.slice(0, 20).join(', ')}`);

console.log('OK i18n parity (pl ↔ en keys)');
