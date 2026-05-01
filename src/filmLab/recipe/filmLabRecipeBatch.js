import { mergeRecipeGlobalAdjustmentsPatch } from './filmLabRecipeMerge.js';

/**
 * Kolejne patche adjustments (batch preset pipeline).
 *
 * @param {object} baseRecipeDocument
 * @param {Record<string, unknown>[]} patches
 */
export function applySequentialAdjustmentPatches(baseRecipeDocument, patches) {
  if (!Array.isArray(patches) || patches.length === 0) {
    return baseRecipeDocument;
  }
  return patches.reduce((acc, patch) => {
    if (!patch || typeof patch !== 'object') {
      return acc;
    }
    return mergeRecipeGlobalAdjustmentsPatch(acc, patch);
  }, baseRecipeDocument);
}
