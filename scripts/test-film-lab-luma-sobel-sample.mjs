/**
 * Regresja `sampleLumaSobelMagnitude01` (krawędź pędzla) — bez przeglądarki: mock CanvasRenderingContext2D.
 */
import assert from 'node:assert/strict';
import { sampleLumaSobelMagnitude01 } from '../src/filmLab/canvasLumaSobelSample.js';

function makeBandPatch(topRgb, bottomRgb) {
  /** 3×3: górny rząd topRgb, środek mieszany, dolny bottomRgb — wyraźna pozioma krawędź */
  const d = new Uint8ClampedArray(36);
  const setPx = (row, col, r, g, b) => {
    const o = (row * 3 + col) * 4;
    d[o] = r;
    d[o + 1] = g;
    d[o + 2] = b;
    d[o + 3] = 255;
  };
  for (let c = 0; c < 3; c += 1) {
    setPx(0, c, ...topRgb);
    setPx(1, c, 128, 128, 128);
    setPx(2, c, ...bottomRgb);
  }
  return d;
}

function mockCtx(imageDataFactory) {
  return {
    getImageData(x0, y0, w, h) {
      return { data: imageDataFactory(x0, y0, w, h), width: w, height: h };
    },
  };
}

const flatGray = new Uint8ClampedArray(36);
for (let i = 0; i < 9; i += 1) {
  const o = i * 4;
  flatGray[o] = 128;
  flatGray[o + 1] = 128;
  flatGray[o + 2] = 128;
  flatGray[o + 3] = 255;
}

const ctxFlat = mockCtx(() => flatGray);
const flatCenter = sampleLumaSobelMagnitude01(ctxFlat, 64, 64, 0.5, 0.5);
assert.ok(flatCenter <= 0.02, `uniform patch → low edge: ${flatCenter}`);

const edgeData = makeBandPatch([0, 0, 0], [255, 255, 255]);
const ctxEdge = mockCtx((x0, y0, w, h) => {
  assert.equal(w, 3);
  assert.equal(h, 3);
  return edgeData.subarray(0, w * h * 4);
});

/** Środek próbki 3×3 to px (1,1): sąsiadztwo musi mieć kontrast → Sobel > 0 */
const edgeMag = sampleLumaSobelMagnitude01(ctxEdge, 100, 100, 0.5, 0.5);
assert.ok(edgeMag > flatCenter + 0.05, `edge patch stronger than flat: flat=${flatCenter} edge=${edgeMag}`);

/** Ta sama formuła co w FilmLabCanvasArea — przy mag∈[0,1] wyższa czułość obniża gain na płaskim (mag<1), na silnej krawędzi mag→1 gain≈1 */
function brushEdgeGain(edgeSens, mag) {
  const t = Math.max(0, Math.min(100, edgeSens)) / 100;
  return Math.max(0.12, Math.min(1, 1 + t * (mag - 1)));
}

assert.ok(Math.abs(brushEdgeGain(0, 1) - brushEdgeGain(100, 1)) < 1e-6, 'mag=1 → gain independent of sensitivity');
assert.ok(
  brushEdgeGain(100, flatCenter) < brushEdgeGain(0, flatCenter),
  'high sensitivity lowers stamp on low-edge (flat) regions'
);

process.stdout.write('PASS film-lab-luma-sobel-sample\n');
