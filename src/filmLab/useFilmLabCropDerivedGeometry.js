import { useMemo } from 'react';
import { CROP_ASPECT_PRESETS, CROP_MIN_SIZE } from './crop/cropConstants.js';
import { buildCropRectNormFromAdjustments, clampCropRectToBounds } from './crop/cropGeometry.js';
import { normalizeCropAspectPreset, normalizeCropOverlayMode } from './crop/cropAspectResolve.js';
import { normalizeOverlayOrientation } from './crop/overlaySvg.js';
import { useFilmLabCropOverlayGeometry } from './useFilmLabCropOverlayGeometry.jsx';

export function useFilmLabCropDerivedGeometry({ adjustments, cropLiveRect, straightenGuide }) {
  const activeCropOverlayMode = useMemo(
    () => normalizeCropOverlayMode(adjustments?.cropOverlayMode),
    [adjustments?.cropOverlayMode]
  );
  const activeCropOverlayOrientation = useMemo(
    () => normalizeOverlayOrientation(adjustments?.cropOverlayOrientation),
    [adjustments?.cropOverlayOrientation]
  );
  const activeCropAspectPreset = useMemo(
    () => normalizeCropAspectPreset(adjustments?.cropAspect),
    [adjustments?.cropAspect]
  );
  const activeCropAspect = useMemo(
    () => CROP_ASPECT_PRESETS.find((item) => item.id === activeCropAspectPreset) ?? CROP_ASPECT_PRESETS[0],
    [activeCropAspectPreset]
  );
  const cropRectNorm = useMemo(
    () => buildCropRectNormFromAdjustments(adjustments),
    [
      adjustments?.cropRectH,
      adjustments?.cropRectW,
      adjustments?.cropRectX,
      adjustments?.cropRectY,
      adjustments?.cropZoom,
      adjustments?.cropX,
      adjustments?.cropY,
      adjustments?.level,
    ]
  );
  const activeCropRectNorm = useMemo(
    () => clampCropRectToBounds(cropLiveRect ?? cropRectNorm, CROP_MIN_SIZE),
    [cropLiveRect, cropRectNorm]
  );
  const cropRectPercent = useMemo(
    () => ({
      x: activeCropRectNorm.x * 100,
      y: activeCropRectNorm.y * 100,
      w: activeCropRectNorm.w * 100,
      h: activeCropRectNorm.h * 100,
    }),
    [activeCropRectNorm.h, activeCropRectNorm.w, activeCropRectNorm.x, activeCropRectNorm.y]
  );

  const {
    straightenGuidePercent,
    cropMaskPath,
    cropGuideTransform,
    cropHandles,
    cropMoveZoneRect,
    cropHandleHitboxes,
    cropOverlayGuideElements,
  } = useFilmLabCropOverlayGeometry({
    cropRectPercent,
    straightenGuide,
    activeCropOverlayMode,
  });

  return {
    activeCropOverlayMode,
    activeCropOverlayOrientation,
    activeCropAspectPreset,
    activeCropAspect,
    cropRectNorm,
    activeCropRectNorm,
    cropRectPercent,
    straightenGuidePercent,
    cropMaskPath,
    cropGuideTransform,
    cropHandles,
    cropMoveZoneRect,
    cropHandleHitboxes,
    cropOverlayGuideElements,
  };
}
