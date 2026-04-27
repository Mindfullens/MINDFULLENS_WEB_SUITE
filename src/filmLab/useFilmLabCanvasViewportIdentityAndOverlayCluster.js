import { useFilmLabCanvasViewport } from './useFilmLabCanvasViewport.js';
import { useFilmLabCropOverlayInteractionFlags } from './useFilmLabCropOverlayInteractionFlags.js';
import { useFilmLabImageIdentityKey } from './useFilmLabImageIdentityKey.js';

/**
 * Stable image key + canvas viewport + crop overlay interaction flags (FilmLabPro cluster).
 */
export function useFilmLabCanvasViewportIdentityAndOverlayCluster({
  uploadedFile,
  imageMeta,
  adjustments,
  activePanel,
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
  lastAutoFitKeyRef,
}) {
  const { imageIdentityKey } = useFilmLabImageIdentityKey({ uploadedFile, imageMeta });

  const viewport = useFilmLabCanvasViewport({
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
  });

  const overlay = useFilmLabCropOverlayInteractionFlags({
    hasImage,
    activePanel,
    isStraightenToolArmed,
  });

  return { ...viewport, ...overlay };
}
