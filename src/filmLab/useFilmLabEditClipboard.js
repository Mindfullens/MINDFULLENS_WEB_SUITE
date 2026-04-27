import { useCallback } from 'react';

export function useFilmLabEditClipboard({
  activeFilmIndex,
  activeFilm,
  adjustments,
  userCurves,
  colorMixer,
  colorGrading,
  colorCalibration,
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

    const settings = {
      version: 2,
      adjustments,
      userCurves,
      activeFilmRef,
      // Backward compatibility for older snapshots.
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
    setClipboardFeedback,
    userCurves,
  ]);

  const pasteFromClipboard = useCallback(() => {
    const raw = localStorage.getItem('mindfullens_edit_clipboard');
    if (!raw) {
      return;
    }

    try {
      const data = JSON.parse(raw);
      saveUndo();

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

      if (data.adjustments) {
        setAdjustments((prev) => ({
          ...data.adjustments,
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
      if (data.userCurves) {
        setUserCurves(data.userCurves);
      }

      const filmIndex = findFilmIndexFromClipboard();
      if (filmIndex !== -1) {
        setActiveFilmIndex(filmIndex);
      }
      if (data.colorMixer) {
        setColorMixer(data.colorMixer);
      }
      if (data.colorGrading) {
        setColorGrading(data.colorGrading);
      }
      if (data.colorCalibration) {
        setColorCalibration(data.colorCalibration);
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
