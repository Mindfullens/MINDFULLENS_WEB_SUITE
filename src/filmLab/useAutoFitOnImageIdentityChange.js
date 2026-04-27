import { useEffect } from 'react';
import { FIT_UI_ZOOM } from './viewportZoom.js';

/** On a new image identity, reset zoom/pan to fit and drop full-res preview preference. */
export function useAutoFitOnImageIdentityChange({
  hasImage,
  imageIdentityKey,
  fitZoom,
  setPreferFullResPreview,
  lastAutoFitKeyRef,
  zoomRef,
  panOffsetRef,
  setZoom,
  setPanOffset,
}) {
  useEffect(() => {
    if (!hasImage) {
      lastAutoFitKeyRef.current = null;
      return;
    }

    if (lastAutoFitKeyRef.current === imageIdentityKey) {
      return;
    }

    const safeFitZoom = Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : FIT_UI_ZOOM;
    const resetPan = { x: 0, y: 0 };
    lastAutoFitKeyRef.current = imageIdentityKey;
    setPreferFullResPreview(false);
    zoomRef.current = safeFitZoom;
    panOffsetRef.current = resetPan;
    setZoom(safeFitZoom);
    setPanOffset(resetPan);
  }, [
    fitZoom,
    hasImage,
    imageIdentityKey,
    setPreferFullResPreview,
    lastAutoFitKeyRef,
    zoomRef,
    panOffsetRef,
    setZoom,
    setPanOffset,
  ]);
}
