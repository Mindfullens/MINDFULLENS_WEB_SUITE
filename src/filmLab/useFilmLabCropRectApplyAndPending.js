import { useCallback, useMemo } from 'react';
import { CROP_MIN_SIZE } from './crop/cropConstants.js';
import { resolveNormalizedCropAspectRatio } from './crop/cropAspectResolve.js';
import {
  areCropRectsClose,
  buildCropRectNormFromAdjustments,
  clampCropRectToBounds,
  fitCropRectToAspect,
} from './crop/cropGeometry.js';

export function useFilmLabCropRectApplyAndPending({
  setAdjustments,
  cropLiveRect,
  activeCropAspect,
  activeCropAspectPreset,
  adjustmentsRotation,
  cropRectNorm,
  exifMeta,
  imageMeta,
}) {
  const applyCropRect = useCallback((nextRect) => {
    const normalizedRect = clampCropRectToBounds(nextRect, CROP_MIN_SIZE);
    setAdjustments((current) => {
      const currentRect = buildCropRectNormFromAdjustments(current);
      const legacyCropIsNeutral =
        Math.abs((Number(current?.cropZoom ?? 100) || 100) - 100) < 0.0001 &&
        Math.abs(Number(current?.cropX ?? 0) || 0) < 0.0001 &&
        Math.abs(Number(current?.cropY ?? 0) || 0) < 0.0001;

      if (areCropRectsClose(currentRect, normalizedRect) && legacyCropIsNeutral) {
        return current;
      }

      return {
        ...current,
        cropRectX: normalizedRect.x,
        cropRectY: normalizedRect.y,
        cropRectW: normalizedRect.w,
        cropRectH: normalizedRect.h,
        cropZoom: 100,
        cropX: 0,
        cropY: 0,
      };
    });
  }, [setAdjustments]);

  const hasPendingCropChanges = useMemo(() => {
    if (cropLiveRect) {
      return !areCropRectsClose(cropLiveRect, cropRectNorm, 0.0005);
    }
    if (activeCropAspectPreset === 'free') {
      return false;
    }
    const ratio = activeCropAspect?.ratio;
    if (ratio == null) {
      return false;
    }
    const normalizedRatio = resolveNormalizedCropAspectRatio(ratio, imageMeta, exifMeta, {
      rotation: adjustmentsRotation,
    });
    if (!normalizedRatio) {
      return false;
    }
    const fittedPreview = fitCropRectToAspect(
      clampCropRectToBounds(cropRectNorm, CROP_MIN_SIZE),
      normalizedRatio
    );
    return !areCropRectsClose(fittedPreview, cropRectNorm, 0.0005);
  }, [
    activeCropAspect?.ratio,
    activeCropAspectPreset,
    adjustmentsRotation,
    cropLiveRect,
    cropRectNorm,
    exifMeta,
    imageMeta,
  ]);

  return { applyCropRect, hasPendingCropChanges };
}
