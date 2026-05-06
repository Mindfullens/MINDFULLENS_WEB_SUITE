/**
 * Regresja: applyAdjustmentBindingsForTonePipeline (Etap 8).
 */
import assert from 'node:assert/strict';
import { applyAdjustmentBindingsForTonePipeline, parseMaskSlotIndexFromNodeId } from '../src/filmLab/maskAdjustmentBindingApply.js';

assert.equal(parseMaskSlotIndexFromNodeId('mask_slot_2'), 2);
assert.equal(parseMaskSlotIndexFromNodeId('bad'), null);

const base = {
  exposure: 0.5,
  adjustmentBindings: [
    { version: 1, adjustmentKey: 'exposure', maskGraphNodeId: 'mask_slot_0' },
  ],
  localMasks: [
    {
      name: 'A',
      enabled: true,
      mode: 'brush',
      opacity: 100,
      blend: 'normal',
      exposure: 0,
      brush: {},
      linear: {},
      radial: {},
      luma: {},
      color: {},
    },
  ],
  activeLocalMaskIndex: 0,
};

const out = applyAdjustmentBindingsForTonePipeline(base);
assert.equal(out.exposure, 0);
assert.equal(out.localMasks[0].exposure, 0.5);

const noBind = applyAdjustmentBindingsForTonePipeline({ ...base, adjustmentBindings: [] });
assert.equal(noBind.exposure, 0.5);

console.log('OK mask adjustment binding apply');
