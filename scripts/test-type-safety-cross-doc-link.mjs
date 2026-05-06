import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const northStarPath = path.join(root, 'docs/hme/NORTH-STAR.md');
const source = fs.readFileSync(northStarPath, 'utf8');

assert.match(source, /TYPE-SAFETY-POLICY\.md/);
assert.match(source, /\[.*TYPE-SAFETY-POLICY\.md.*\]\(TYPE-SAFETY-POLICY\.md\)/);
assert.match(source, /When to run `preflight` vs `preflight:full`/);
assert.match(source, /npm run preflight/);
assert.match(source, /npm run preflight:full/);

console.log('PASS type-safety-cross-doc-link');
