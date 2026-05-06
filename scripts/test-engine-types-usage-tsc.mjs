import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localTscPath = path.join(root, 'node_modules', '.bin', 'tsc');
const tsconfigPath = path.join(
  root,
  'scripts',
  'fixtures',
  'types',
  'tsconfig.depth-diagnostics.json'
);

if (!fs.existsSync(localTscPath)) {
  console.log('SKIP engine-types-usage-tsc (typescript not installed locally)');
  process.exit(0);
}

const result = spawnSync(localTscPath, ['--noEmit', '-p', tsconfigPath], {
  cwd: root,
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status ?? 1);
}

console.log('PASS engine-types-usage-tsc');
