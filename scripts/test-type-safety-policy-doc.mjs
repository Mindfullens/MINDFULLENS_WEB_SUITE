import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'docs/hme/TYPE-SAFETY-POLICY.md');
const source = fs.readFileSync(policyPath, 'utf8');

assert.match(source, /# Type Safety Policy/);
assert.match(source, /## Wymagania dla nowego helpera publicznego/);
assert.match(source, /filmLabExportManifestHelpers\.d\.ts/);
assert.match(source, /depth-diagnostics-usage\.ts/);
assert.match(source, /depth-diagnostics-negative-expectations\.ts/);
assert.match(source, /## Gates/);
assert.match(source, /test:types/);
assert.match(source, /test:engine-types-usage-tsc/);
assert.match(source, /## Zasada zmian/);
assert.match(source, /test-engine-index-types-snapshot\.mjs/);
assert.match(source, /## Krótka checklista merge/);
assert.match(source, /npm run preflight/);
assert.match(source, /npm run preflight:full/);

console.log('PASS type-safety-policy-doc');
