import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Każde `VITE_*` z `src/vite-env.d.ts` (ImportMetaEnv) musi pojawić się w `.env.example`
 * (nazwa w komentarzu albo w przykładowym przypisaniu), żeby szablon nie rozjechał się od typów.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dts = fs.readFileSync(path.join(root, 'src', 'vite-env.d.ts'), 'utf8');
const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

const re = /readonly\s+(VITE_[A-Z0-9_]+)\?/g;
const fromDts = new Set();
let m;
while ((m = re.exec(dts)) !== null) {
  fromDts.add(m[1]);
}
assert.ok(fromDts.size > 0, 'vite-env.d.ts: brak pól VITE_* w ImportMetaEnv');

const missing = [...fromDts].filter((name) => !example.includes(name));
assert.deepEqual(
  missing,
  [],
  `Brak w .env.example (dopisz linię / komentarz z nazwą, patrz src/vite-env.d.ts): ${missing.join(
    ', ',
  )}`,
);

process.stdout.write('PASS env-example-parity\n');
