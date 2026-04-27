import { useFilmLabCropRectApplyAndPending } from './useFilmLabCropRectApplyAndPending.js';
import { useFilmLabFilmViewAndCropHandlers } from './useFilmLabFilmViewAndCropHandlers.js';

/**
 * Film view / crop UI handlers + crop rect apply and pending state (FilmLabPro cluster).
 * Order: film view handlers first (incl. setCropLiveRectSafely), then apply/pending (applyCropRect for drag).
 */
export function useFilmLabFilmViewAndCropRectApplyCluster({
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
  cropLiveRect,
  activeCropAspect,
  cropRectNorm,
}) {
  const filmView = useFilmLabFilmViewAndCropHandlers({
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
  });

  const cropRectApply = useFilmLabCropRectApplyAndPending({
    setAdjustments,
    cropLiveRect,
    activeCropAspect,
    activeCropAspectPreset,
    adjustmentsRotation,
    cropRectNorm,
    exifMeta,
    imageMeta,
  });

  return { ...filmView, ...cropRectApply };
}
