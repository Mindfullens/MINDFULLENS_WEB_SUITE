/**
 * Testy deterministycznych helperów adaptera ONNX (bez uruchamiania WASM w Node).
 */
import assert from 'node:assert/strict';
import {
  buildOnnxSemanticCacheKey,
  onnxOutputTensorToConfidenceScalar,
} from '../src/filmLab/onnx/filmLabOnnxRuntimeAdapter.js';

const u = 'https://cdn.example.com/m.onnx';
assert.equal(
  buildOnnxSemanticCacheKey(u, {
    kind: 'sky',
    maskIndex: 2,
    activeCropRectNorm: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
  }),
  buildOnnxSemanticCacheKey(u, {
    kind: 'sky',
    maskIndex: 2,
    activeCropRectNorm: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
  }),
  'cache key stable dla identycznego payloadu'
);

assert.notEqual(
  buildOnnxSemanticCacheKey(u, { kind: 'sky', maskIndex: 1, activeCropRectNorm: {} }),
  buildOnnxSemanticCacheKey(u, { kind: 'subject', maskIndex: 1, activeCropRectNorm: {} }),
  'różny kind → różny klucz'
);

const tProb = { data: new Float32Array([0.2, 0.3, 0.5]) };
assert.ok(Math.abs(onnxOutputTensorToConfidenceScalar(tProb) - 1 / 3) < 1e-6);

const tLogit = { data: new Float32Array([0, 100]) };
assert.ok(onnxOutputTensorToConfidenceScalar(tLogit) > 0.9);

process.stdout.write('PASS film-lab-onnx-adapter\n');
