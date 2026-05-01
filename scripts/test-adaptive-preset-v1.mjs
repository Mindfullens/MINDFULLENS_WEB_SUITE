import assert from 'node:assert/strict';
import {
  ADAPTIVE_PRESET_V1_SCHEMA,
  applyAdaptivePresetPatch,
  applyAdaptivePresetV1Steps,
  parseAdaptivePresetV1,
  recomputeAiAssistMasksHeuristic,
} from '../src/filmLab/adaptivePresetV1.js';

const bad = parseAdaptivePresetV1('{}');
assert.equal(bad.ok, false);

const ok = parseAdaptivePresetV1(
  JSON.stringify({
    schema: ADAPTIVE_PRESET_V1_SCHEMA,
    version: 1,
    patch: { exposure: 0.5 },
  })
);
assert.ok(ok.ok);
assert.equal(ok.preset.patch.exposure, 0.5);

const adj = {
  exposure: 0,
  contrast: 0,
  localMasks: [
    {
      name: 'Sky A',
      source: 'ai-assist',
      ai: { kind: 'sky' },
      mode: 'linear',
      opacity: 50,
    },
  ],
};

const patched = applyAdaptivePresetPatch(adj, { exposure: 1, localMasks: [], junk: 99 });
assert.equal(patched.exposure, 1);
assert.equal(patched.localMasks.length, 1);

const crop = { x: 0, y: 0.2, w: 1, h: 0.7 };
const recomputed = recomputeAiAssistMasksHeuristic(adj, crop);
assert.ok(Array.isArray(recomputed.localMasks));
assert.equal(recomputed.localMasks[0].name, 'Sky A');
assert.ok(recomputed.localMasks[0].linear);

const stepped = applyAdaptivePresetV1Steps(
  adj,
  {
    schema: ADAPTIVE_PRESET_V1_SCHEMA,
    version: 1,
    steps: [
      { type: 'setPatch', patch: { temp: -5 } },
      { type: 'recomputeAiMasks' },
    ],
  },
  crop
);
assert.equal(stepped.temp, -5);
assert.ok(stepped.localMasks[0].linear);

console.log('test-adaptive-preset-v1: ok');
