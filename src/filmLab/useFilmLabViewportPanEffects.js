import { useEffect } from 'react';
import { FIT_UI_ZOOM } from './viewportZoom.js';

/**
 * Zoom/pan maintenance: reset pan at fit zoom, clamp pan on stage resize, re-sync fit at viewport changes,
 * and drop full-res preview when the image source changes.
 */
export function useFilmLabViewportPanEffects({
  fitZoom,
  zoom,
  hasImage,
  setPreferFullResPreview,
  panOffsetRef,
  setPanOffset,
  setIsPanning,
  panDragRef,
  clampPanToBounds,
  zoomRef,
  setZoom,
  canvasStageSize,
  canvasViewportSize,
}) {
  useEffect(() => {
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : fitZoom;
    if (safeZoom > fitZoom + 0.001) {
      return;
    }

    if (panOffsetRef.current.x === 0 && panOffsetRef.current.y === 0) {
      return;
    }

    const resetPan = { x: 0, y: 0 };
    panOffsetRef.current = resetPan;
    setPanOffset(resetPan);
    setIsPanning(false);
    panDragRef.current.active = false;
  }, [fitZoom, zoom, panOffsetRef, panDragRef, setIsPanning, setPanOffset]);

  useEffect(() => {
    setPreferFullResPreview(false);
  }, [hasImage, setPreferFullResPreview]);

  useEffect(() => {
    if (!hasImage) {
      return;
    }

    const reClampPan = () => {
      const clampedPan = clampPanToBounds(panOffsetRef.current, zoomRef.current);
      if (
        clampedPan.x === panOffsetRef.current.x &&
        clampedPan.y === panOffsetRef.current.y
      ) {
        return;
      }

      panOffsetRef.current = clampedPan;
      setPanOffset(clampedPan);
    };

    reClampPan();
    window.addEventListener('resize', reClampPan);

    return () => {
      window.removeEventListener('resize', reClampPan);
    };
  }, [
    canvasStageSize.height,
    canvasStageSize.width,
    clampPanToBounds,
    hasImage,
    panOffsetRef,
    setPanOffset,
    zoomRef,
  ]);

  useEffect(() => {
    if (!hasImage) {
      return;
    }
    const safeFitZoom = Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : FIT_UI_ZOOM;
    const isCurrentlyFit = Math.abs((Number(zoomRef.current) || safeFitZoom) - safeFitZoom) < 0.0001;
    if (!isCurrentlyFit) {
      return;
    }

    if (panOffsetRef.current.x !== 0 || panOffsetRef.current.y !== 0) {
      const resetPan = { x: 0, y: 0 };
      panOffsetRef.current = resetPan;
      setPanOffset(resetPan);
    }

    if (Math.abs((Number(zoomRef.current) || safeFitZoom) - safeFitZoom) >= 0.0001) {
      zoomRef.current = safeFitZoom;
      setZoom(safeFitZoom);
    }
  }, [
    canvasViewportSize.height,
    canvasViewportSize.width,
    fitZoom,
    hasImage,
    panOffsetRef,
    setPanOffset,
    setZoom,
    zoomRef,
  ]);
}
