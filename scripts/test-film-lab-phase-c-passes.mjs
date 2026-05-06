/**
 * Smoke (CPU tor): Phase C — gate weave mutuje bufor bez NaN; siła 0 = no-op.
 * Bez DOM canvas (regresja node).
 */
import assert from 'node:assert/strict';
import { applyGateWeaveToImageData } from '../src/engine/filmLabPhaseCPasses.js';

/** Większy bufor: przy małych wymiarach amplituda gate weave zaokrągla się do zera. */
const W = 256;
const H = 256;

function gradientBuffer() {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      data[i] = x % 256;
      data[i + 1] = y % 256;
      data[i + 2] = (x + y) % 256;
      data[i + 3] = 255;
    }
  }
  return data;
}

function solidBuffer(r, g, b) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

const before = gradientBuffer();
const imgData = new Uint8ClampedArray(before);
const img = { data: imgData, width: W, height: H };

applyGateWeaveToImageData(img, 0.65, 777);

let changed = false;
for (let i = 0; i < imgData.length; i += 1) {
  assert.ok(Number.isFinite(imgData[i]));
  assert.ok(imgData[i] >= 0 && imgData[i] <= 255);
  if (imgData[i] !== before[i]) {
    changed = true;
  }
}
assert.ok(changed, 'gate weave should modify at least one sample');

const untouched = solidBuffer(40, 41, 42);
const zeroBuf = new Uint8ClampedArray(untouched);
const snapshot = new Uint8ClampedArray(zeroBuf);
applyGateWeaveToImageData({ data: zeroBuf, width: W, height: H }, 0, 123);
assert.deepEqual(zeroBuf, snapshot);

console.log('OK Film Lab Phase C passes (gate weave CPU)');
