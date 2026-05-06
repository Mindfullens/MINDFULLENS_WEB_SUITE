import { useEffect, useMemo } from 'react';
import { encodeFlatSnapshotToRecipeDocument } from './recipe/filmLabRecipeCodec.js';
import { fingerprintRecipeDocumentStable } from './recipe/filmLabRecipeFingerprint.js';
import { buildMaskEngineWorkerPayload } from './recipe/filmLabRecipeWorkerPayload.js';

/**
 * Stabilny fingerprint aktualnego stanu recipe na `window.__mindfullensRecipeFingerprint` (QA / narzędzia zewnętrzne).
 * Nie wpływa na podgląd — tylko diagnostyka i przyszły bridge cache.
 */
export function useFilmLabRecipeFingerprintEcho({
  activeFilmIndex,
  adjustments,
  userCurves,
  colorMixer,
  colorGrading,
  colorCalibration,
  zoom,
  panOffset,
}) {
  const recipeProjection = useMemo(() => {
    try {
      const doc = encodeFlatSnapshotToRecipeDocument({
        activeFilmIndex,
        adjustments,
        userCurves,
        colorMixer,
        colorGrading,
        colorCalibration,
        zoom,
        panOffset,
      });
      return {
        fingerprint: fingerprintRecipeDocumentStable(doc),
        maskWorkerPayload: buildMaskEngineWorkerPayload(doc),
      };
    } catch {
      return { fingerprint: '', maskWorkerPayload: null };
    }
  }, [
    activeFilmIndex,
    adjustments,
    userCurves,
    colorMixer,
    colorGrading,
    colorCalibration,
    zoom,
    panOffset,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    window.__mindfullensRecipeFingerprint = recipeProjection.fingerprint;
    window.__mindfullensMaskWorkerPayload = recipeProjection.maskWorkerPayload;
    return () => {
      delete window.__mindfullensRecipeFingerprint;
      delete window.__mindfullensMaskWorkerPayload;
    };
  }, [recipeProjection]);

  return recipeProjection.fingerprint;
}
