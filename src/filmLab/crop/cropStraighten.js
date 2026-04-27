import { CROP_MIN_SIZE, STRAIGHTEN_MIN_LINE_LENGTH } from './cropConstants.js';
import { clampCropRectToBounds } from './cropGeometry.js';

export function clamp(value, min = 0, max = 255) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

export function clampNormPoint(point) {
  return {
    x: clamp(Number(point?.x) || 0, 0, 1),
    y: clamp(Number(point?.y) || 0, 0, 1),
  };
}

export function buildStraightenGuideFromCropRect(rect) {
  const safeRect = clampCropRectToBounds(rect, CROP_MIN_SIZE);
  const inset = clamp(Math.min(safeRect.w, safeRect.h) * 0.16, 0.04, 0.18);
  const y = safeRect.y + safeRect.h * 0.5;
  let startX = safeRect.x + inset;
  let endX = safeRect.x + safeRect.w - inset;
  if (endX - startX < STRAIGHTEN_MIN_LINE_LENGTH) {
    const centerX = safeRect.x + safeRect.w * 0.5;
    startX = clamp(centerX - STRAIGHTEN_MIN_LINE_LENGTH * 0.5, 0, 1);
    endX = clamp(centerX + STRAIGHTEN_MIN_LINE_LENGTH * 0.5, 0, 1);
  }
  return {
    start: { x: clamp(startX, 0, 1), y: clamp(y, 0, 1) },
    end: { x: clamp(endX, 0, 1), y: clamp(y, 0, 1) },
  };
}

export function normalizeStraightenGuide(guide, fallbackRect) {
  const fallbackGuide = buildStraightenGuideFromCropRect(fallbackRect);
  const start = clampNormPoint(guide?.start ?? fallbackGuide.start);
  const end = clampNormPoint(guide?.end ?? fallbackGuide.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length >= STRAIGHTEN_MIN_LINE_LENGTH) {
    return { start, end };
  }
  const center = {
    x: clamp((start.x + end.x) * 0.5, 0, 1),
    y: clamp((start.y + end.y) * 0.5, 0, 1),
  };
  const half = STRAIGHTEN_MIN_LINE_LENGTH * 0.5;
  return {
    start: { x: clamp(center.x - half, 0, 1), y: center.y },
    end: { x: clamp(center.x + half, 0, 1), y: center.y },
  };
}

export function areStraightenGuidesClose(leftGuide, rightGuide, epsilon = 0.0002) {
  if (!leftGuide || !rightGuide) {
    return false;
  }
  return (
    Math.abs((leftGuide.start?.x ?? 0) - (rightGuide.start?.x ?? 0)) <= epsilon &&
    Math.abs((leftGuide.start?.y ?? 0) - (rightGuide.start?.y ?? 0)) <= epsilon &&
    Math.abs((leftGuide.end?.x ?? 0) - (rightGuide.end?.x ?? 0)) <= epsilon &&
    Math.abs((leftGuide.end?.y ?? 0) - (rightGuide.end?.y ?? 0)) <= epsilon
  );
}

export function moveStraightenGuideWithinBounds(guide, dx, dy) {
  const start = clampNormPoint(guide?.start);
  const end = clampNormPoint(guide?.end);
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const shiftX = clamp(dx, -minX, 1 - maxX);
  const shiftY = clamp(dy, -minY, 1 - maxY);
  return {
    start: { x: start.x + shiftX, y: start.y + shiftY },
    end: { x: end.x + shiftX, y: end.y + shiftY },
  };
}

export function deriveStraightenLevelFromGuide(guide) {
  const start = clampNormPoint(guide?.start);
  const end = clampNormPoint(guide?.end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < STRAIGHTEN_MIN_LINE_LENGTH * 0.5) {
    return null;
  }
  return (-(Math.atan2(dy, dx) * 180)) / Math.PI;
}
