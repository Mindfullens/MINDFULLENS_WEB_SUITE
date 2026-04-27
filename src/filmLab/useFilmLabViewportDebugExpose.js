import { useEffect } from 'react';
import { VIEWPORT_BUILD_MARKER } from './buildInfo.js';

/** Publish viewport / zoom diagnostics on `window` for debugging and regression tooling. */
export function useFilmLabViewportDebugExpose({
  canvasViewportSize,
  fitCanvasRenderSize,
  zoom,
  displayedZoomPercent,
  zoomOneToOne,
  fitZoom,
  devicePixelRatio,
  panOffsetRef,
}) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.__mindfullensViewportDebug = {
      build: VIEWPORT_BUILD_MARKER,
      viewport: {
        width: Math.round(Number(canvasViewportSize.width) || 0),
        height: Math.round(Number(canvasViewportSize.height) || 0),
      },
      fitCanvas: {
        width: Math.round(Number(fitCanvasRenderSize.width) || 0),
        height: Math.round(Number(fitCanvasRenderSize.height) || 0),
      },
      zoom,
      zoomPercent: displayedZoomPercent,
      zoomPercentDisplay: displayedZoomPercent,
      zoomOneToOne,
      fitZoom,
      dpr: Number(devicePixelRatio) || 1,
      pan: { ...panOffsetRef.current },
    };
  }, [
    canvasViewportSize.height,
    canvasViewportSize.width,
    devicePixelRatio,
    displayedZoomPercent,
    fitCanvasRenderSize.height,
    fitCanvasRenderSize.width,
    fitZoom,
    panOffsetRef,
    zoom,
    zoomOneToOne,
  ]);
}
