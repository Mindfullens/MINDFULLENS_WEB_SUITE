/**
 * Binary SPIKE (wariant A — „derivative light”):
 * - **`spike-mindfullens-minimal.tif`** — TIFF RGB (UTIF + canvas). **Jedyny** plik z tego skryptu,
 *   który w praktyce otwiera się w **Adobe Photoshop** (ścieżka zwykłego obrazu).
 * - **`spike-mindfullens-minimal.dng`** — ten sam raster + kilka tagów DNG w IFD (UTIF). Służy wyłącznie
 *   do eksperymentów / roundtrip w kodzie — **Photoshop (Camera Raw) odrzuca** ten kontener aż do
 *   osobnej implementacji pełnego **Linear DNG** (macierze, ActiveArea, itd.).
 *
 * Wymaga `canvas` (node-canvas). Nie jest częścią domyślnego CI.
 *
 * @see docs/hme/EXPORT-PSD-DNG-SPIKE.md §4.6–4.7, §6, §10
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from 'canvas';

import {
  encodeDerivativeLightDngArrayBuffer,
  encodeDerivativeLightRgbTiffArrayBuffer,
  stripRgbPackedFromImageData,
} from '../src/engine/filmLabExportDngVariantA.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'spike-dng-output');
const OUT_TIF = path.join(OUT_DIR, 'spike-mindfullens-minimal.tif');
const OUT_DNG = path.join(OUT_DIR, 'spike-mindfullens-minimal.dng');

const W = 64;
const H = 64;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const grd = ctx.createLinearGradient(0, 0, W, H);
grd.addColorStop(0, 'rgb(255, 0, 0)');
grd.addColorStop(1, 'rgb(0, 0, 255)');
ctx.fillStyle = grd;
ctx.fillRect(0, 0, W, H);

const rgba = ctx.getImageData(0, 0, W, H);
const rgb = stripRgbPackedFromImageData(rgba);

const spikeSoftware = 'Mindfullens Film Lab SPIKE';

fs.mkdirSync(OUT_DIR, { recursive: true });

const tifBuffer = Buffer.from(
  encodeDerivativeLightRgbTiffArrayBuffer(rgb, W, H, { software: spikeSoftware }),
);
fs.writeFileSync(OUT_TIF, tifBuffer);

const dngBuffer = Buffer.from(
  encodeDerivativeLightDngArrayBuffer(rgb, W, H, {
    software: spikeSoftware,
    extraIfdFields: { t50721: ['Mindfullens Film Lab SPIKE'] },
  }),
);
fs.writeFileSync(OUT_DNG, dngBuffer);

console.log(`[spike-write-minimal-dng] OK Photoshop: ${OUT_TIF} (${tifBuffer.length} bytes)`);
console.log(
  `[spike-write-minimal-dng] ${OUT_DNG} (${dngBuffer.length} bytes) — UTIF+DNG tags; nie otwieraj w PS (Camera Raw); tylko badania / UTIF.decode`,
);
console.log('[spike-write-minimal-dng] docs: docs/hme/EXPORT-PSD-DNG-SPIKE.md §6, §10');
