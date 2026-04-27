import { useClearRawSprocketFrame } from './useClearRawSprocketFrame.js';
import { useFilmLabPreviewAndSourceEffects } from './useFilmLabPreviewAndSourceEffects.js';
import { useFilmLabViewportStateRefs } from './useFilmLabViewportStateRefs.js';

/**
 * Viewport ref sync, preview/source effects, legacy raw-sprocket frame cleanup (FilmLabPro cluster).
 */
export function useFilmLabViewportRefsPreviewSourceSprocketCluster({
  zoomRef,
  zoom,
  panOffsetRef,
  panOffset,
  hasImage,
  panDragRef,
  setZoom,
  setPanOffset,
  setIsPanning,
  canvasRef,
  histogramCanvasRef,
  isAdjusting,
  renderVersion,
  curvesCanvasRef,
  userCurves,
  activeCurveCh,
  activePanel,
  uploadedFile,
  imageUrl,
  setExifMeta,
  adjustmentsFrame,
  setAdjustments,
}) {
  useFilmLabViewportStateRefs({ zoomRef, zoom, panOffsetRef, panOffset });

  useFilmLabPreviewAndSourceEffects({
    hasImage,
    zoomRef,
    panOffsetRef,
    panDragRef,
    setZoom,
    setPanOffset,
    setIsPanning,
    canvasRef,
    histogramCanvasRef,
    isAdjusting,
    renderVersion,
    curvesCanvasRef,
    userCurves,
    activeCurveCh,
    activePanel,
    uploadedFile,
    imageUrl,
    setExifMeta,
  });

  useClearRawSprocketFrame(adjustmentsFrame, setAdjustments);
}
