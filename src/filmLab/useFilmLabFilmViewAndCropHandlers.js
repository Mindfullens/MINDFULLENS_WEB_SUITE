import { useCallback } from 'react';
import { CROP_ASPECT_PRESETS, CROP_MIN_SIZE, CROP_OVERLAY_MODES } from './crop/cropConstants.js';
import {
  areCropRectsClose,
  clampCropRectToBounds,
  fitCropRectToAspect,
} from './crop/cropGeometry.js';
import {
  normalizeCropAspectPreset,
  normalizeCropOverlayMode,
  resolveNormalizedCropAspectRatio,
} from './crop/cropAspectResolve.js';
import { normalizeOverlayOrientation } from './crop/overlaySvg.js';
import { getDisplayFilm } from './displayFilm.js';
import { getFilmGrainDefaults } from './defaultAdjustments.js';

export function useFilmLabFilmViewAndCropHandlers({
  saveUndo,
  filmStocks,
  setActiveFilmIndex,
  setAdjustments,
  hasImage,
  activeCropOverlayMode,
  activeCropAspectPreset,
  imageMeta,
  exifMeta,
  adjustmentsRotation,
  activeCropRectNorm,
  cropLiveRectRef,
  setCropLiveRect,
}) {
  const setCropLiveRectSafely = useCallback((nextRect, options = {}) => {
    const normalizedRect = clampCropRectToBounds(nextRect, CROP_MIN_SIZE);
    cropLiveRectRef.current = normalizedRect;
    if (options.force) {
      setCropLiveRect(normalizedRect);
      return;
    }
    setCropLiveRect((current) => {
      if (current && areCropRectsClose(current, normalizedRect, 0.0002)) {
        return current;
      }
      return normalizedRect;
    });
  }, [cropLiveRectRef, setCropLiveRect]);

  const selectFilm = useCallback(
    (index) => {
      saveUndo();
      const nextFilm = getDisplayFilm(filmStocks[index], index);
      const grainDefaults = getFilmGrainDefaults(nextFilm);
      const nextStrength = nextFilm?.isInputProfile ? 0 : 100;

      setAdjustments((current) => ({
        ...current,
        strength: nextStrength,
        userGrain: grainDefaults.amount,
        userGrainSize: grainDefaults.size,
      }));
      setActiveFilmIndex(index);
    },
    [filmStocks, saveUndo, setActiveFilmIndex, setAdjustments]
  );

  const toggleClipping = useCallback(() => {
    saveUndo();
    setAdjustments((current) => ({
      ...current,
      showClipping: !current.showClipping,
    }));
  }, [saveUndo, setAdjustments]);

  const toggleCompare = useCallback(() => {
    if (!hasImage) {
      return;
    }
    setAdjustments((current) => ({
      ...current,
      compareMode: !current.compareMode,
      compareX: 0.5,
    }));
  }, [hasImage, setAdjustments]);

  const toggleFlip = useCallback(() => {
    saveUndo();
    setAdjustments((current) => ({
      ...current,
      flipped: !current.flipped,
    }));
  }, [saveUndo, setAdjustments]);

  const rotateImage = useCallback(() => {
    saveUndo();
    setAdjustments((current) => ({
      ...current,
      rotation: (((current.rotation ?? 0) + 90) % 360 + 360) % 360,
    }));
  }, [saveUndo, setAdjustments]);

  const setCropOverlayMode = useCallback(
    (modeId) => {
      const normalizedMode = normalizeCropOverlayMode(modeId);
      if (normalizedMode === activeCropOverlayMode) {
        return;
      }
      saveUndo();
      setAdjustments((current) => ({
        ...current,
        cropOverlayMode: normalizedMode,
      }));
    },
    [activeCropOverlayMode, saveUndo, setAdjustments]
  );

  const cycleCropOverlayMode = useCallback(() => {
    const modeIds = CROP_OVERLAY_MODES.map((item) => item.id);
    const currentIndex = modeIds.indexOf(activeCropOverlayMode);
    const nextMode = modeIds[(currentIndex + 1 + modeIds.length) % modeIds.length];
    setCropOverlayMode(nextMode);
  }, [activeCropOverlayMode, setCropOverlayMode]);

  const rotateCropOverlay = useCallback(() => {
    saveUndo();
    setAdjustments((current) => ({
      ...current,
      cropOverlayOrientation: normalizeOverlayOrientation((current.cropOverlayOrientation ?? 0) + 1),
    }));
  }, [saveUndo, setAdjustments]);

  const setCropAspectPreset = useCallback(
    (presetId) => {
      const normalizedPreset = normalizeCropAspectPreset(presetId);
      if (normalizedPreset === activeCropAspectPreset) {
        return;
      }
      if (!imageMeta) {
        return;
      }
      const nextAspect = CROP_ASPECT_PRESETS.find((item) => item.id === normalizedPreset) ?? CROP_ASPECT_PRESETS[0];
      saveUndo();
      setAdjustments((current) => ({
        ...current,
        cropAspect: normalizedPreset,
      }));
      if (!nextAspect?.ratio) {
        cropLiveRectRef.current = null;
        setCropLiveRect(null);
        return;
      }
      const normalizedRatio = resolveNormalizedCropAspectRatio(nextAspect.ratio, imageMeta, exifMeta, {
        rotation: adjustmentsRotation,
      });
      if (!normalizedRatio) {
        return;
      }
      const baseRect = clampCropRectToBounds(activeCropRectNorm, CROP_MIN_SIZE);
      const fittedRect = fitCropRectToAspect(baseRect, normalizedRatio);
      setCropLiveRectSafely(fittedRect, { force: true });
    },
    [
      activeCropAspectPreset,
      activeCropRectNorm,
      adjustmentsRotation,
      cropLiveRectRef,
      exifMeta,
      imageMeta,
      saveUndo,
      setAdjustments,
      setCropLiveRect,
      setCropLiveRectSafely,
    ]
  );

  return {
    setCropLiveRectSafely,
    selectFilm,
    toggleClipping,
    toggleCompare,
    toggleFlip,
    rotateImage,
    setCropOverlayMode,
    cycleCropOverlayMode,
    rotateCropOverlay,
    setCropAspectPreset,
  };
}
