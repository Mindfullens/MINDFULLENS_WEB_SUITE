import assert from 'node:assert/strict';
import {
  applyRecipeLayerToneRgb,
  normalizeRecipeLayerBlendMode,
} from '../src/filmLab/recipeLayerBlendApply.js';

assert.equal(normalizeRecipeLayerBlendMode('MULTIPLY'), 'multiply');
assert.equal(normalizeRecipeLayerBlendMode('bogus'), 'normal');

let [r] = applyRecipeLayerToneRgb(128, 128, 128, 1, {
  exposure: 45,
  opacity: 100,
  blendMode: 'multiply',
});
assert.ok(Math.abs(r - 128) > 2, 'multiply should change mid-gray');

[r] = applyRecipeLayerToneRgb(128, 128, 128, 1, {
  exposure: 45,
  opacity: 100,
  blendMode: 'normal',
});
assert.ok(Math.abs(r - 128) > 2, 'normal EV should change mid-gray');

[r] = applyRecipeLayerToneRgb(40, 40, 40, 1, {
  exposure: 35,
  opacity: 100,
  blendMode: 'screen',
});
assert.ok(r > 40, 'screen should lift dark tones');

process.stdout.write('PASS recipe-layer-blend\n');
