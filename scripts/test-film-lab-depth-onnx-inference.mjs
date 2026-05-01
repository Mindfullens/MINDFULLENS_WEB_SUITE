/**
 * Helpery ścieżki depth ONNX (bez WASM — deterministyczne).
 */
import assert from 'node:assert/strict';
import {
  classifyDepthOnnxRgbLayout,
  depthOnnxLetterboxTargetSize,
  normalizeDepthPlane01,
  pickDepthOnnxOutputTensor,
  resizeFloatMapBilinear,
  resolveDepthNchwInputDims,
  resolveDepthNhwcInputDims,
  resolveDepthRgbInputDims,
  extractDepthPlaneFromOnnxTensor,
} from '../src/filmLab/depth/filmLabDepthOnnxInference.js';

assert.deepEqual(depthOnnxLetterboxTargetSize(800, 600, 768), { tw: 768, th: 576 });

assert.deepEqual(resolveDepthNchwInputDims([1, 3, 256, 256], 100, 100, 512), {
  layout: 'nchw',
  dims: [1, 3, 256, 256],
  tw: 256,
  th: 256,
});

assert.equal(classifyDepthOnnxRgbLayout([1, 3, 400, 400]), 'nchw');
assert.equal(classifyDepthOnnxRgbLayout([1, 400, 400, 3]), 'nhwc');

assert.deepEqual(resolveDepthNhwcInputDims([1, 128, 192, 3], 999, 999, 512), {
  layout: 'nhwc',
  dims: [1, 128, 192, 3],
  tw: 192,
  th: 128,
});

assert.equal(resolveDepthRgbInputDims([1, 64, 64, 3], 50, 50, 200)?.layout, 'nhwc');
assert.equal(resolveDepthRgbInputDims([1, 3, 64, 64], 50, 50, 200)?.layout, 'nchw');

const dyn = resolveDepthNchwInputDims([1, 3, -1, -1], 400, 200, 100);
assert.ok(dyn && dyn.layout === 'nchw' && dyn.tw <= 100 && dyn.th <= 100);

const half = resolveDepthNchwInputDims([1, 3, 320, -1], 100, 50, 999);
assert.ok(half && half.tw === 640 && half.th === 320);

const amb = resolveDepthRgbInputDims([1, -1, -1, -1], 200, 100, 400);
assert.ok(amb && amb.layout === 'nchw' && amb.dims[1] === 3);

const src = new Float32Array([0, 1, 1, 0]);
const up = resizeFloatMapBilinear(src, 2, 2, 4, 4);
assert.ok(Math.abs(up[0] - 0) < 1e-5 && Math.abs(up[up.length - 1] - 0) < 1e-5);

const flat = new Float32Array([10, 20, 30]);
normalizeDepthPlane01(flat);
assert.ok(Math.abs(flat[0]) < 1e-5 && Math.abs(flat[2] - 1) < 1e-5);

const nchwOut = extractDepthPlaneFromOnnxTensor({
  dims: [1, 1, 4, 4],
  data: new Float32Array(16).fill(0.25),
});
assert.ok(nchwOut && nchwOut.w === 4 && nchwOut.plane.length === 16);

const nhwcOut = extractDepthPlaneFromOnnxTensor({
  dims: [1, 4, 4, 1],
  data: new Float32Array(16).fill(0.25),
});
assert.ok(nhwcOut && nhwcOut.w === 4 && nhwcOut.plane.length === 16);

const tA = { dims: [1, 2, 2], data: new Float32Array(4).fill(1) };
const tB = { dims: [1, 2, 2], data: new Float32Array(4).fill(2) };
assert.strictEqual(
  pickDepthOnnxOutputTensor({ x: tA, y: tB }, { outputNames: ['x', 'y'] }),
  tA
);
assert.strictEqual(pickDepthOnnxOutputTensor({ y: tB, x: tA }, { outputNames: ['x', 'y'] }), tA);
assert.strictEqual(pickDepthOnnxOutputTensor({ y: tB, x: tA }, { outputNames: ['y', 'x'] }), tB);

/** [1,H,W,C] — dwa kanały na piksel (średnia = 0.2). */
const nhwc2c = new Float32Array(8);
for (let p = 0; p < 4; p += 1) {
  nhwc2c[p * 2] = 0.1;
  nhwc2c[p * 2 + 1] = 0.3;
}
const meanOut = extractDepthPlaneFromOnnxTensor(
  { dims: [1, 2, 2, 2], data: nhwc2c },
  'mean'
);
assert.ok(meanOut && Math.abs(meanOut.plane[0] - 0.2) < 1e-5);

process.stdout.write('PASS film-lab-depth-onnx-inference\n');
