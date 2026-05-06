/**
 * Regresja przybliżonego soft proof CMYK (bez ICC) — wyłącznie stabilność liczb i niezmieniony kanał A.
 */
import assert from 'node:assert/strict';
import { applyCmykSoftProofApproxToRgba } from '../src/engine/filmLabCmykSoftProofApprox.js';

const solid = (r, g, b, len = 12) => {
  const d = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i += 4) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = i === 0 ? 200 : 255;
  }
  return d;
};

const a = solid(200, 100, 50);
applyCmykSoftProofApproxToRgba(a);
for (let i = 0; i < a.length; i += 4) {
  assert.ok(Number.isFinite(a[i]) && Number.isFinite(a[i + 1]) && Number.isFinite(a[i + 2]));
  assert.ok(a[i] >= 0 && a[i] <= 255);
  assert.ok(a[i + 1] >= 0 && a[i + 1] <= 255);
  assert.ok(a[i + 2] >= 0 && a[i + 2] <= 255);
  assert.equal(a[i + 3], i === 0 ? 200 : 255);
}

const black = solid(0, 0, 0);
applyCmykSoftProofApproxToRgba(black);
assert.equal(black[0], 0);
assert.equal(black[1], 0);
assert.equal(black[2], 0);

const mid = new Uint8ClampedArray([128, 64, 192, 99]);
applyCmykSoftProofApproxToRgba(mid);
assert.equal(mid[3], 99);

console.log('OK CMYK soft proof approx');
