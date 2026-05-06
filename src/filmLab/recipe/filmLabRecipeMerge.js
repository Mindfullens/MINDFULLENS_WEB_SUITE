import { isFilmLabRecipeDocumentV1 } from './filmLabRecipeCodec.js';

/**
 * Łączy patch do global.adjustments (batch preset / adaptive apply).
 *
 * @param {object} baseDoc
 * @param {Record<string, unknown>} adjustmentPatch
 */
export function mergeRecipeGlobalAdjustmentsPatch(baseDoc, adjustmentPatch) {
  if (!isFilmLabRecipeDocumentV1(baseDoc) || !adjustmentPatch || typeof adjustmentPatch !== 'object') {
    return baseDoc;
  }

  const prev = baseDoc.global?.adjustments && typeof baseDoc.global.adjustments === 'object'
    ? baseDoc.global.adjustments
    : {};

  return {
    ...baseDoc,
    global: {
      ...baseDoc.global,
      adjustments: {
        ...prev,
        ...adjustmentPatch,
      },
    },
  };
}
