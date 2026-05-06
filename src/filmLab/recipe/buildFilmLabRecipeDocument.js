import { encodeFlatSnapshotToRecipeDocument } from './filmLabRecipeCodec.js';

/**
 * Canonical builder: flat workbench snapshot → persisted recipe envelope (same as autosave path).
 *
 * @param {object} flatSnapshot — output of `createSnapshot` / `captureCurrentSnapshot`
 */
export function buildFilmLabRecipeDocumentFromFlatSnapshot(flatSnapshot) {
  return encodeFlatSnapshotToRecipeDocument(flatSnapshot);
}
