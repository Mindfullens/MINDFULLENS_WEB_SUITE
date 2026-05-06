import assert from 'node:assert/strict';
import { applyRetouchHealBoxBlurPass } from '../src/engine/filmLabRetouchPreviewPass.js';

const w = 6;
const h = 6;
const data = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y += 1) {
  for (let x = 0; x < w; x += 1) {
    const idx = (x + y * w) * 4;
    const gray = ((x * 73 + y * 41) % 90) + 10;
    data[idx] = gray;
    data[idx + 1] = gray;
    data[idx + 2] = gray;
    data[idx + 3] = 255;
  }
}
const before = new Uint8ClampedArray(data);
applyRetouchHealBoxBlurPass(data, w, h, 80, () => 1);
let delta = 0;
for (let i = 0; i < data.length; i += 4) {
  delta += Math.abs(data[i] - before[i]);
}
assert.ok(delta > 50, 'heal pass should alter noisy buffer');

process.stdout.write('PASS film-lab-retouch-pass\n');
