import { useCallback } from 'react';
import { decodeRecipeToFlatSnapshot, encodeFlatSnapshotToRecipeDocument } from './recipe/filmLabRecipeCodec.js';

export function useFilmLabEditClipboard({
  activeFilmIndex,
  activeFilm,
  adjustments,
  userCurves,
  colorMixer,
  colorGrading,
  colorCalibration,
  zoom,
  panOffset,
  filmStocks,
  saveUndo,
  setAdjustments,
  setUserCurves,
  setActiveFilmIndex,
  setColorMixer,
  setColorGrading,
  setColorCalibration,
  setClipboardFeedback,
}) {
  const copyToClipboard = useCallback(() => {
    const activeFilmRef = {
      index: Number.isInteger(activeFilmIndex) ? activeFilmIndex : 0,
      name: activeFilm?.name ?? null,
      sourceId: activeFilm?.sourceId ?? null,
      canonicalSourceId: activeFilm?.canonicalSourceId ?? null,
      internalSourceId: activeFilm?.internalSourceId ?? null,
    };

    const filmLabRecipeDocument = encodeFlatSnapshotToRecipeDocument({
      activeFilmIndex: Number.isInteger(activeFilmIndex) ? activeFilmIndex : 0,
      adjustments,
      userCurves,
      colorMixer,
      colorGrading,
      colorCalibration,
      zoom,
      panOffset,
    });

    const settings = {
      version: 3,
      adjustments,
      userCurves,
      activeFilmRef,
      activeFilmIndex,
      activeFilmId: activeFilm?.id ?? null,
      colorMixer,
      colorGrading,
      colorCalibration,
      rotation: adjustments.rotation,
      flipped: adjustments.flipped,
      strength: adjustments.strength,
      userGrain: adjustments.userGrain,
      userGrainSize: adjustments.userGrainSize,
      curveLumaMix: adjustments.curveLumaMix,
      filmLabRecipeDocument,
    };
    localStorage.setItem('mindfullens_edit_clipboard', JSON.stringify(settings));
    setClipboardFeedback('copied');
    setTimeout(() => setClipboardFeedback(null), 1500);
  }, [
    activeFilm,
    activeFilmIndex,
    adjustments,
    colorCalibration,
    colorGrading,
    colorMixer,
    panOffset,
    setClipboardFeedback,
    userCurves,
    zoom,
  ]);

  const pasteFromClipboard = useCallback(() => {
    const raw = localStorage.getItem('mindfullens_edit_clipboard');
    if (!raw) {
      return;
    }

    try {
      const data = JSON.parse(raw);
      saveUndo();

      const mergedFromRecipe =
        data?.filmLabRecipeDocument != null ? decodeRecipeToFlatSnapshot(data.filmLabRecipeDocument) : null;

      const findFilmIndexFromClipboard = () => {
        const ref = data?.activeFilmRef ?? null;

        if (Number.isInteger(ref?.index) && filmStocks[ref.index]) {
          return ref.index;
        }
        if (Number.isInteger(data?.activeFilmIndex) && filmStocks[data.activeFilmIndex]) {
          return data.activeFilmIndex;
        }
        if (data?.activeFilmId) {
          const byLegacyId = filmStocks.findIndex((profile) => profile?.id === data.activeFilmId);
          if (byLegacyId >= 0) {
            return byLegacyId;
          }
        }

        const sourceCandidates = [
          ref?.canonicalSourceId,
          ref?.internalSourceId,
          ref?.sourceId,
        ].filter(Boolean);
        for (const candidate of sourceCandidates) {
          const idx = filmStocks.findIndex(
            (profile) =>
              profile?.canonicalSourceId === candidate ||
              profile?.internalSourceId === candidate ||
              profile?.sourceId === candidate
          );
          if (idx >= 0) {
            return idx;
          }
        }

        if (typeof ref?.name === 'string' && ref.name.trim().length > 0) {
          const normalizedName = ref.name.trim().toLowerCase();
          const byName = filmStocks.findIndex(
            (profile) => String(profile?.name ?? '').trim().toLowerCase() === normalizedName
          );
          if (byName >= 0) {
            return byName;
          }
        }

        return -1;
      };

      const adjustmentPayload = mergedFromRecipe?.adjustments ?? data.adjustments;
      const curvesPayload = mergedFromRecipe?.userCurves ?? data.userCurves;
      const mixerPayload = mergedFromRecipe?.colorMixer ?? data.colorMixer;
      const gradingPayload = mergedFromRecipe?.colorGrading ?? data.colorGrading;
      const calibrationPayload = mergedFromRecipe?.colorCalibration ?? data.colorCalibration;

      if (adjustmentPayload && typeof adjustmentPayload === 'object') {
        setAdjustments((prev) => ({
          ...adjustmentPayload,
          isAdjusting: false,
          compareMode: prev.compareMode,
          rotation: data.rotation ?? prev.rotation,
          flipped: data.flipped ?? prev.flipped,
          strength: data.strength ?? prev.strength ?? 100,
          userGrain: data.userGrain ?? prev.userGrain,
          userGrainSize: data.userGrainSize ?? prev.userGrainSize,
          curveLumaMix: data.curveLumaMix ?? prev.curveLumaMix,
        }));
      }
      if (curvesPayload) {
        setUserCurves(curvesPayload);
      }

      if (mixerPayload) {
        setColorMixer(mixerPayload);
      }
      if (gradingPayload) {
        setColorGrading(gradingPayload);
      }
      if (calibrationPayload) {
        setColorCalibration(calibrationPayload);
      }

      let filmIndex = findFilmIndexFromClipboard();
      if (
        filmIndex === -1 &&
        mergedFromRecipe != null &&
        Number.isInteger(mergedFromRecipe.activeFilmIndex) &&
        filmStocks[mergedFromRecipe.activeFilmIndex]
      ) {
        filmIndex = mergedFromRecipe.activeFilmIndex;
      }
      if (filmIndex !== -1) {
        setActiveFilmIndex(filmIndex);
      }

      setClipboardFeedback('pasted');
      setTimeout(() => setClipboardFeedback(null), 1500);
    } catch (e) {
      console.error('Failed to paste settings', e);
    }
  }, [
    filmStocks,
    saveUndo,
    setActiveFilmIndex,
    setAdjustments,
    setClipboardFeedback,
    setColorCalibration,
    setColorGrading,
    setColorMixer,
    setUserCurves,
  ]);

  return {
    copyToClipboard,
    pasteFromClipboard,
  };
}
