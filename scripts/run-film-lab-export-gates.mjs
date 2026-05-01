/**
 * Runs the Film Lab export gate chain in order (stdio inherited).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILM_LAB_EXPORT_GATE_STEPS } from './film-lab-export-gate-steps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const rel of FILM_LAB_EXPORT_GATE_STEPS) {
  const scriptPath = path.join(root, rel);
  assert.ok(existsSync(scriptPath), `run-film-lab-export-gates: missing script ${rel}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('PASS film-lab export gate chain');
