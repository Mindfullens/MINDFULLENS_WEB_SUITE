/**
 * Tworzy `tests/fixtures/e2e-two-tone.png` (lewa połowa czerwień, prawa zieleń) przed E2E.
 * Dodatkowo uruchamia guard specu `develop-catalog-rapid-switch` — działa przy każdym `playwright test`,
 * nawet gdy na CI jest stary `package.json` bez `check-develop-catalog-e2e-spec` w skrypcie npm.
 */
import { spawnSync } from 'node:child_process';
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(_root, 'tests/fixtures/e2e-two-tone.png');

export default async function globalSetup() {
  const guard = path.join(_root, 'scripts/check-develop-catalog-e2e-spec.mjs');
  const gr = spawnSync(process.execPath, [guard], { cwd: _root, stdio: 'inherit' });
  if (gr.status !== 0) {
    throw new Error(
      '[global-setup] scripts/check-develop-catalog-e2e-spec.mjs — zmerguj main (poll filmstrip zamiast expect(filmstrip).toHaveAttribute).',
    );
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const c = createCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(64, 0, 64, 128);
  fs.writeFileSync(out, c.toBuffer('image/png'));
  /** Drugi plik (ta sama zawartość, inna nazwa) — dwa assety w katalogu bez drugiego generatora kanvasu. */
  const outCopy = path.join(path.dirname(out), 'e2e-two-tone-copy.png');
  fs.writeFileSync(outCopy, fs.readFileSync(out));
}
