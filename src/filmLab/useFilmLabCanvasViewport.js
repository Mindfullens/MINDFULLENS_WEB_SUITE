import { useCallback } from 'react';
import { resolveFittedSizeForAspect } from '../engine/previewGeometry.js';
import { resolveDisplayedAspectRatioForCrop } from './crop/cropAspectResolve.js';
import { useFilmLabViewportZoomPan } from './useFilmLabViewportZoomPan.js';

/**
 * Preview layout: displayed aspect ratio → fitted stage size, then zoom/pan/canvas handlers.
 */
export function useFilmLabCanvasViewport({
  adjustments,
  activePanel,
  imageMeta,
  exifMeta,
  hasImage,
  devicePixelRatio,
  chromeBox,
  canvasAreaRef,
  canvasStageRef,
  canvasCenterRef,
  canvasStageSize,
  zoom,
  setZoom,
  panOffset,
  setPanOffset,
  zoomRef,
  panOffsetRef,
  zoomAnchorRef,
  panDragRef,
  setIsPanning,
  setPreferFullResPreview,
  setZoomMode,
  isStraightenToolArmed,
  acceptCropDraft,
  acceptManualStraighten,
  imageIdentityKey,
  lastAutoFitKeyRef,
}) {
  const resolveDisplayedAspectRatio = useCallback(() => {
    return resolveDisplayedAspectRatioForCrop(imageMeta, exifMeta, {
      ...adjustments,
      cropBypass: activePanel === 'crop',
    });
  }, [
    activePanel,
    adjustments?.rotation,
    adjustments?.cropRectX,
    adjustments?.cropRectY,
    adjustments?.cropRectW,
    adjustments?.cropRectH,
    exifMeta?.orientationTransform?.rotationDegrees,
    exifMeta?.pixelHeight,
    exifMeta?.pixelWidth,
    imageMeta?.height,
    imageMeta?.sourceHeight,
    imageMeta?.sourceWidth,
    imageMeta?.width,
    imageMeta?.previewWidth,
    imageMeta?.previewHeight,
  ]);

  const resolveFittedSize = useCallback(
    (viewportWidth, viewportHeight, fitMode = 'contain') => {
      const aspectRatio = resolveDisplayedAspectRatio();
      return resolveFittedSizeForAspect(viewportWidth, viewportHeight, aspectRatio, fitMode);
    },
    [resolveDisplayedAspectRatio]
  );

  return useFilmLabViewportZoomPan({
    resolveFittedSize,
    hasImage,
    devicePixelRatio,
    chromeBox,
    canvasAreaRef,
    canvasStageRef,
    canvasCenterRef,
    canvasStageSize,
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    zoomRef,
    panOffsetRef,
    zoomAnchorRef,
    panDragRef,
    setIsPanning,
    setPreferFullResPreview,
    setZoomMode,
    imageMeta,
    exifMeta,
    adjustmentsRotation: adjustments?.rotation,
    activePanel,
    isStraightenToolArmed,
    acceptCropDraft,
    acceptManualStraighten,
    imageIdentityKey,
    lastAutoFitKeyRef,
  });
}
