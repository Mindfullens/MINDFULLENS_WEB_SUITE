import { useEffect, useLayoutEffect } from 'react';
import { drawCurvesPreview } from './curvesCanvas.js';
import { drawHistogram } from './histogramCanvas.js';
import { FIT_UI_ZOOM } from './viewportZoom.js';

/** Reset zoom/pan when there is no image; refresh histogram when idle; redraw curves preview. */
export function useFilmLabPreviewCanvasEffects({
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
}) {
  useEffect(() => {
    if (!hasImage) {
      const resetPan = { x: 0, y: 0 };
      zoomRef.current = FIT_UI_ZOOM;
      panOffsetRef.current = resetPan;
      panDragRef.current.active = false;
      setZoom(FIT_UI_ZOOM);
      setPanOffset(resetPan);
      setIsPanning(false);
    }
  }, [hasImage]);

  /**
   * Histogram ↔ klatka podglądu: po `renderVersion` (fast/full render zakończony w silniku)
   * rysujemy w tym samym commicie co React (`useLayoutEffect`), bez czekania na idle
   * — unik „histogram jednej klatki do tyłu” po puszczeniu suwaka.
   */
  useLayoutEffect(() => {
    if (!hasImage || isAdjusting) {
      return;
    }
    drawHistogram(canvasRef.current, histogramCanvasRef.current);
  }, [hasImage, isAdjusting, renderVersion, canvasRef, histogramCanvasRef]);

  useEffect(() => {
    if (isAdjusting && interactionKind === 'curve') {
      return;
    }
    drawCurvesPreview(curvesCanvasRef.current, userCurves, activeCurveCh);
  }, [activeCurveCh, activePanel, userCurves, isAdjusting, interactionKind]);
}
