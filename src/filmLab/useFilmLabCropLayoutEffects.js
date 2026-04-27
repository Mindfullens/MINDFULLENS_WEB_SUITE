import { useClearCropGeometryKeyOutsideCrop } from './useClearCropGeometryKeyOutsideCrop.js';
import { useFilmLabCropAspectLayoutSync } from './useFilmLabCropAspectLayoutSync.js';
import { useResetCropLiveOnStraightenOrLeaveCrop } from './useResetCropLiveOnStraightenOrLeaveCrop.js';
import { useStopCropDragOnUnmount } from './useStopCropDragOnUnmount.js';

/** Crop live reset, geometry key clearing, aspect sync, stop drag on unmount. */
export function useFilmLabCropLayoutEffects({
  hasImage,
  activePanel,
  isStraightenToolArmed,
  stopCropDrag,
  cropLiveRectRef,
  setCropLiveRect,
  lastCropGeometryKeyRef,
  activeCropAspectPreset,
  cropAspectRatio,
  adjustmentsRotation,
  cropRectNorm,
  exifMeta,
  imageMeta,
  setCropLiveRectSafely,
}) {
  useResetCropLiveOnStraightenOrLeaveCrop({
    hasImage,
    activePanel,
    isStraightenToolArmed,
    stopCropDrag,
    cropLiveRectRef,
    setCropLiveRect,
  });

  useClearCropGeometryKeyOutsideCrop(activePanel, lastCropGeometryKeyRef);

  useFilmLabCropAspectLayoutSync({
    activePanel,
    hasImage,
    activeCropAspectPreset,
    cropAspectRatio,
    adjustmentsRotation,
    cropRectNorm,
    exifMeta,
    imageMeta,
    lastCropGeometryKeyRef,
    setCropLiveRectSafely,
  });

  useStopCropDragOnUnmount(stopCropDrag);
}
