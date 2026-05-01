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

import UTIF from 'utif';
import { createCanvas } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

UTIF.ttypes[50706] = 4;
UTIF.ttypes[50707] = 4;
UTIF.ttypes[50721] = 2;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'spike-dng-output');
const OUT_TIF = path.join(OUT_DIR, 'spike-mindfullens-minimal.tif');
const OUT_DNG = path.join(OUT_DIR, 'spike-mindfullens-minimal.dng');

const W = 64;
const H = 64;

function encodeRgbTiff(stripRgb, w, h, extraIfdFields) {
  const idf = {
    t256: [w],
    t257: [h],
    t258: [8, 8, 8],
    t259: [1],
    t262: [2],
    t273: [1000],
    t274: [1],
    t277: [3],
    t278: [h],
    t279: [w * h * 3],
    t282: [72, 1],
    t283: [72, 1],
    t284: [1],
    t296: [1],
    t305: ['Mindfullens Film Lab SPIKE'],
    t338: [1],
    ...extraIfdFields,
  };
  const prfx = new Uint8Array(UTIF.encode([idf]));
  const img = new Uint8Array(stripRgb);
  const data = new Uint8Array(1000 + w * h * 3);
  for (let i = 0; i < prfx.length; i++) data[i] = prfx[i];
  for (let i = 0; i < img.length; i++) data[1000 + i] = img[i];
  return data.buffer;
}

function rgbaToRgbPacked(rgba, w, h) {
  const out = new Uint8Array(w * h * 3);
  let o = 0;
  for (let i = 0; i < w * h * 4; i += 4) {
    out[o++] = rgba[i];
    out[o++] = rgba[i + 1];
    out[o++] = rgba[i + 2];
  }
  return out;
}

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const grd = ctx.createLinearGradient(0, 0, W, H);
grd.addColorStop(0, 'rgb(255, 0, 0)');
grd.addColorStop(1, 'rgb(0, 0, 255)');
ctx.fillStyle = grd;
ctx.fillRect(0, 0, W, H);

const { data: rgba } = ctx.getImageData(0, 0, W, H);
const rgb = rgbaToRgbPacked(rgba, W, H);

const dngTags = {
  t50706: [0x01040000 >>> 0],
  t50707: [0x01010000 >>> 0],
  t50721: ['Mindfullens Film Lab SPIKE'],
};

fs.mkdirSync(OUT_DIR, { recursive: true });

const tifBuffer = Buffer.from(encodeRgbTiff(rgb, W, H, {}));
fs.writeFileSync(OUT_TIF, tifBuffer);

const dngBuffer = Buffer.from(encodeRgbTiff(rgb, W, H, dngTags));
fs.writeFileSync(OUT_DNG, dngBuffer);

console.log(`[spike-write-minimal-dng] OK Photoshop: ${OUT_TIF} (${tifBuffer.length} bytes)`);
console.log(
  `[spike-write-minimal-dng] ${OUT_DNG} (${dngBuffer.length} bytes) — UTIF+DNG tags; nie otwieraj w PS (Camera Raw); tylko badania / UTIF.decode`
);
console.log('[spike-write-minimal-dng] docs: docs/hme/EXPORT-PSD-DNG-SPIKE.md §6, §10');
