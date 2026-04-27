import { resolveFilmLabSourcePixelSize } from '../../engine/metadata/exifMetadata.js';
import { CROP_ASPECT_PRESETS, CROP_MIN_SIZE, CROP_OVERLAY_MODES } from './cropConstants.js';
import { clampCropRectToBounds } from './cropGeometry.js';

export function normalizeCropOverlayMode(mode) {
  const normalized = String(mode ?? 'none');
  return CROP_OVERLAY_MODES.some((item) => item.id === normalized) ? normalized : 'none';
}

export function normalizeCropAspectPreset(aspect) {
  const normalized = String(aspect ?? 'free');
  return CROP_ASPECT_PRESETS.some((item) => item.id === normalized) ? normalized : 'free';
}

export function resolveDisplayedAspectRatioForCrop(imageMeta, exifMeta, adjustments) {
  const exifRotation = Number(exifMeta?.orientationTransform?.rotationDegrees ?? 0) || 0;
  const totalRotation = (((Number(adjustments?.rotation ?? 0) + exifRotation) % 360) + 360) % 360;
  const { sourceWidth, sourceHeight } = resolveFilmLabSourcePixelSize(imageMeta, exifMeta);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return 1;
  }
  const isQuarterTurn = totalRotation === 90 || totalRotation === 270;
  let displayedWidth = isQuarterTurn ? sourceHeight : sourceWidth;
  let displayedHeight = isQuarterTurn ? sourceWidth : sourceHeight;
  const cropRectCandidate = {
    x: Number(adjustments?.cropRectX),
    y: Number(adjustments?.cropRectY),
    w: Number(adjustments?.cropRectW),
    h: Number(adjustments?.cropRectH),
  };
  const hasExplicitCropRect =
    Number.isFinite(cropRectCandidate.x) &&
    Number.isFinite(cropRectCandidate.y) &&
    Number.isFinite(cropRectCandidate.w) &&
    Number.isFinite(cropRectCandidate.h);

  const bypassCropForDisplay = Boolean(adjustments?.cropBypass);
  if (hasExplicitCropRect && !bypassCropForDisplay) {
    const normalizedRect = clampCropRectToBounds(cropRectCandidate, CROP_MIN_SIZE);
    displayedWidth *= normalizedRect.w;
    displayedHeight *= normalizedRect.h;
  }

  if (displayedHeight <= 0) {
    return 1;
  }
  return displayedWidth / displayedHeight;
}

export function resolveNormalizedCropAspectRatio(displayRatio, imageMeta, exifMeta, adjustments) {
  const normalizedDisplayRatio = Number(displayRatio);
  if (!Number.isFinite(normalizedDisplayRatio) || normalizedDisplayRatio <= 0) {
    return null;
  }
  const displayedAspectRatio = resolveDisplayedAspectRatioForCrop(imageMeta, exifMeta, adjustments);
  if (!Number.isFinite(displayedAspectRatio) || displayedAspectRatio <= 0) {
    return normalizedDisplayRatio;
  }
  return normalizedDisplayRatio / displayedAspectRatio;
}
