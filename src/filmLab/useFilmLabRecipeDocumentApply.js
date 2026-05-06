import { useCallback } from 'react';
import { decodeRecipeToFlatSnapshot, isFilmLabRecipeDocumentV1 } from './recipe/filmLabRecipeCodec.js';
import { cloneSnapshotSafe } from './sessionSnapshot.js';

/**
 * Zastosuj wyłącznie kopertę recipe v1 do stanu workbencha (bez zmiany pliku źródłowego).
 *
 * @param {{ restoreSnapshot: Function, uploadedFile: File | null | undefined }} params
 */
export function useFilmLabRecipeDocumentApply({ restoreSnapshot, uploadedFile }) {
  return useCallback(
    (recipeDocument) => {
      if (!recipeDocument || !isFilmLabRecipeDocumentV1(recipeDocument)) {
        return false;
      }
      const flat = decodeRecipeToFlatSnapshot(recipeDocument);
      if (!flat) {
        return false;
      }
      const snapshot = cloneSnapshotSafe({
        ...flat,
        ...(uploadedFile instanceof File ? { sourceRestoreFile: uploadedFile } : {}),
      });
      if (!snapshot) {
        return false;
      }
      restoreSnapshot(snapshot, { keepCurrentPanel: true });
      return true;
    },
    [restoreSnapshot, uploadedFile]
  );
}
