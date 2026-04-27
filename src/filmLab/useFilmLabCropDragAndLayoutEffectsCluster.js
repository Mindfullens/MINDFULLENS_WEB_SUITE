import { useFilmLabCropDrag } from './useFilmLabCropDrag.js';
import { useFilmLabCropLayoutEffects } from './useFilmLabCropLayoutEffects.js';

/**
 * Crop pointer drag handlers + layout/unmount effects that depend on stopCropDrag (FilmLabPro cluster).
 */
export function useFilmLabCropDragAndLayoutEffectsCluster({
  cropDragStateRef,
  cropDragPendingPointRef,
  cropDragFrameRef,
  cropOverlayInteractionRef,
  cropLiveRectRef,
  getPointerCoordinates,
  setCropLiveRectSafely,
  setInteractionKind,
  setIsAdjusting,
  setCropLiveRect,
  hasImage,
  activePanel,
  isStraightenToolArmed,
  cropAspectRatio,
  activeCropAspectPreset,
  adjustmentsRotation,
  imageMeta,
  exifMeta,
  activeCropRectNorm,
  cropRectNorm,
  applyCropRect,
  saveUndo,
  lastNonCropPanelRef,
  setActivePanel,
  lastCropGeometryKeyRef,
}) {
  const cropDrag = useFilmLabCropDrag({
    cropDragStateRef,
    cropDragPendingPointRef,
    cropDragFrameRef,
    cropOverlayInteractionRef,
    cropLiveRectRef,
    getPointerCoordinates,
    setCropLiveRectSafely,
    setInteractionKind,
    setIsAdjusting,
    setCropLiveRect,
    hasImage,
    activePanel,
    isStraightenToolArmed,
    activeCropAspectRatio: cropAspectRatio,
    activeCropAspectPreset,
    adjustmentsRotation,
    imageMeta,
    exifMeta,
    activeCropRectNorm,
    cropRectNorm,
    applyCropRect,
    saveUndo,
    lastNonCropPanelRef,
    setActivePanel,
  });

  useFilmLabCropLayoutEffects({
    hasImage,
    activePanel,
    isStraightenToolArmed,
    stopCropDrag: cropDrag.stopCropDrag,
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
  });

  return cropDrag;
}
