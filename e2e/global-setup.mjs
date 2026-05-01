/**
 * Tworzy `tests/fixtures/e2e-two-tone.png` (lewa połowa czerwień, prawa zieleń) przed E2E.
 */
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(_root, 'tests/fixtures/e2e-two-tone.png');

export default async function globalSetup() {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const c = createCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(64, 0, 64, 128);
  fs.writeFileSync(out, c.toBuffer('image/png'));
}
