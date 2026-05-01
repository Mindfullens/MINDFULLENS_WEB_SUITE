/**
 * Binary SPIKE: writes a minimal PSD (single RGB layer, deterministic gradient).
 * Requires native `canvas` (node-canvas). Not run in default CI.
 *
 * @see docs/hme/EXPORT-PSD-DNG-SPIKE.md §8
 */

import { writePsdBuffer } from 'ag-psd';
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'ag-psd/initialize-canvas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'spike-psd-output');
const OUT_FILE = path.join(OUT_DIR, 'spike-mindfullens-minimal.psd');

const W = 64;
const H = 64;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const grd = ctx.createLinearGradient(0, 0, W, H);
grd.addColorStop(0, 'rgb(255, 0, 0)');
grd.addColorStop(1, 'rgb(0, 0, 255)');
ctx.fillStyle = grd;
ctx.fillRect(0, 0, W, H);

const layer = {
  name: 'Film Lab gradient SPIKE',
  top: 0,
  left: 0,
  bottom: H,
  right: W,
  blendMode: 'normal',
  opacity: 1,
  canvas,
};

const psd = {
  width: W,
  height: H,
  channels: 3,
  bitsPerChannel: 8,
  colorMode: 3,
  children: [layer],
  canvas,
};

const buffer = writePsdBuffer(psd, { noBackground: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, buffer);

console.log(`[spike-write-minimal-psd] wrote ${OUT_FILE} (${buffer.length} bytes)`);
