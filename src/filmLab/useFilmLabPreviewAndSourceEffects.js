import { useFilmLabImageSourceEffects } from './useFilmLabImageSourceEffects.js';
import { useFilmLabPreviewCanvasEffects } from './useFilmLabPreviewCanvasEffects.js';

/** Zoom/pan reset, histogram/curves redraw, EXIF load, blob URL lifecycle. */
export function useFilmLabPreviewAndSourceEffects({
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
  interactionKind,
  renderVersion,
  curvesCanvasRef,
  userCurves,
  activeCurveCh,
  activePanel,
  uploadedFile,
  imageUrl,
  setExifMeta,
}) {
  useFilmLabPreviewCanvasEffects({
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
    interactionKind,
    renderVersion,
    curvesCanvasRef,
    userCurves,
    activeCurveCh,
    activePanel,
  });

  useFilmLabImageSourceEffects({ uploadedFile, imageUrl, setExifMeta });
}
