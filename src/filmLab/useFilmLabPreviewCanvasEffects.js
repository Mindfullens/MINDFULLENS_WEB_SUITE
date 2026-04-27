import { useEffect } from 'react';
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

  useEffect(() => {
    if (!hasImage) {
      return;
    }

    if (isAdjusting) {
      return;
    }

    const run = () => {
      drawHistogram(canvasRef.current, histogramCanvasRef.current);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(run, { timeout: 240 });
      return () => window.cancelIdleCallback(handle);
    }

    const timeoutId = window.setTimeout(run, 80);
    return () => window.clearTimeout(timeoutId);
  }, [canvasRef, hasImage, isAdjusting, renderVersion]);

  useEffect(() => {
    drawCurvesPreview(curvesCanvasRef.current, userCurves, activeCurveCh);
  }, [activeCurveCh, activePanel, userCurves]);
}
