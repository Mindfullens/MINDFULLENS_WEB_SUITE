import { encodeFlatSnapshotToRecipeDocument, isFilmLabRecipeDocumentV1 } from './filmLabRecipeCodec.js';
import { migrateRecipeDocumentMaskGraphsToIrV1 } from './filmLabMaskGraphIR.js';

/**
 * Spłaszczone snapshoty lub raw obiekty → koperta v1 (z migracją MaskGraphIR w `maskGraphs`).
 *
 * @param {object} input
 */
export function normalizeToRecipeDocumentV1(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  if (isFilmLabRecipeDocumentV1(input)) {
    return migrateRecipeDocumentMaskGraphsToIrV1(input);
  }
  return encodeFlatSnapshotToRecipeDocument(input);
}
