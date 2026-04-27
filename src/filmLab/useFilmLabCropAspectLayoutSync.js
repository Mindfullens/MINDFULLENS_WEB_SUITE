import { useLayoutEffect } from 'react';
import { CROP_MIN_SIZE } from './crop/cropConstants.js';
import { resolveNormalizedCropAspectRatio } from './crop/cropAspectResolve.js';
import { clampCropRectToBounds, fitCropRectToAspect } from './crop/cropGeometry.js';

/**
 * When crop uses a fixed aspect (not "free"), keep the live crop rect fitted after geometry changes.
 * Uses a layout effect so the first paint matches the constrained rect.
 */
export function useFilmLabCropAspectLayoutSync({
  activePanel,
  hasImage,
  activeCropAspectPreset,
  cropAspectRatio,
  adjustmentsRotation,
  cropRectNorm,
  exifMeta,
  imageMeta,
  lastCropGeometryKeyRef,
  setCropLiveRectSafely,
}) {
  useLayoutEffect(() => {
    if (activePanel !== 'crop' || !hasImage || activeCropAspectPreset === 'free') {
      return;
    }
    if (cropAspectRatio == null) {
      return;
    }

    const w = Number(imageMeta?.previewWidth ?? imageMeta?.width ?? 0);
    const h = Number(imageMeta?.previewHeight ?? imageMeta?.height ?? 0);
    if (w <= 0 || h <= 0) {
      return;
    }

    const geometryKey = [
      w,
      h,
      exifMeta?.orientationTransform?.rotationDegrees ?? 0,
      adjustmentsRotation ?? 0,
      activePanel,
    ].join(':');

    if (lastCropGeometryKeyRef.current === geometryKey) {
      return;
    }
    lastCropGeometryKeyRef.current = geometryKey;

    const normalizedRatio = resolveNormalizedCropAspectRatio(cropAspectRatio, imageMeta, exifMeta, {
      rotation: adjustmentsRotation,
    });
    if (!normalizedRatio) {
      return;
    }
    const baseRect = clampCropRectToBounds(cropRectNorm, CROP_MIN_SIZE);
    const fittedRect = fitCropRectToAspect(baseRect, normalizedRatio);
    setCropLiveRectSafely(fittedRect, { force: true });
  }, [
    activeCropAspectPreset,
    activePanel,
    adjustmentsRotation,
    cropAspectRatio,
    cropRectNorm,
    exifMeta,
    hasImage,
    imageMeta,
    setCropLiveRectSafely,
  ]);
}
