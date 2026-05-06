/**
 * Mapuje pozycję wskaźnika z wyświetlanego canvasu (po crop/zoom/level) na znormalizowane
 * współrzędne [0,1] w tej samej przestrzeni co raster maski CPU (`buildLocalMaskStackSnapshot`).
 */

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * Ta sama normalizacja prostokąta kadru co `applyLevelAndCropTransform` (useFilmLabEngine).
 */
function normalizeExplicitCropRectFromAdjustments(adjustments) {
  const bypassCrop = Boolean(adjustments?.cropBypass);
  const rectCandidate = {
    x: Number(adjustments?.cropRectX),
    y: Number(adjustments?.cropRectY),
    w: Number(adjustments?.cropRectW),
    h: Number(adjustments?.cropRectH),
  };
  const hasExplicitRect =
    !bypassCrop &&
    Number.isFinite(rectCandidate.x) &&
    Number.isFinite(rectCandidate.y) &&
    Number.isFinite(rectCandidate.w) &&
    Number.isFinite(rectCandidate.h);

  if (!hasExplicitRect) {
    return null;
  }

  const minSize = 0.05;
  const normalizedRect = {
    x: clamp(rectCandidate.x, 0, 1),
    y: clamp(rectCandidate.y, 0, 1),
    w: clamp(rectCandidate.w, minSize, 1),
    h: clamp(rectCandidate.h, minSize, 1),
  };
  if (normalizedRect.x + normalizedRect.w > 1) {
    normalizedRect.w = 1 - normalizedRect.x;
  }
  if (normalizedRect.y + normalizedRect.h > 1) {
    normalizedRect.h = 1 - normalizedRect.y;
  }
  normalizedRect.w = clamp(normalizedRect.w, minSize, 1 - normalizedRect.x);
  normalizedRect.h = clamp(normalizedRect.h, minSize, 1 - normalizedRect.y);
  return normalizedRect;
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {HTMLCanvasElement} canvasEl
 * @param {object} [adjustments]
 * @param {{ maskNominalW?: number, maskNominalH?: number }} [opts] — wymiary nominalnego bufora CPU (cpuParityNominal), opcjonalnie
 * @returns {{ x: number, y: number } | null}
 */
export function clientToMaskBufferNorm(clientX, clientY, canvasEl, adjustments, _opts = {}) {
  if (!canvasEl || canvasEl.width < 1 || canvasEl.height < 1) {
    return null;
  }
  const rect = canvasEl.getBoundingClientRect();
  if (!rect || rect.width <= 1 || rect.height <= 1) {
    return null;
  }

  const cw = canvasEl.width;
  const ch = canvasEl.height;
  const bx = ((clientX - rect.left) / rect.width) * cw;
  const by = ((clientY - rect.top) / rect.height) * ch;

  const cropNorm = normalizeExplicitCropRectFromAdjustments(adjustments ?? {});
  if (cropNorm) {
    const nx = cropNorm.x + (bx / cw) * cropNorm.w;
    const ny = cropNorm.y + (by / ch) * cropNorm.h;
    return { x: clamp01(nx), y: clamp01(ny) };
  }

  const level = Number(adjustments?.level ?? 0) || 0;
  const cropZoom = Number(adjustments?.cropZoom ?? 100) || 100;
  const cropX = Number(adjustments?.cropX ?? 0) || 0;
  const cropY = Number(adjustments?.cropY ?? 0) || 0;
  const levelCompensation = 1 + Math.min(0.16, Math.abs(level) / 180);
  const zoom = Math.max(cropZoom / 100, levelCompensation, 1);

  const W = cw;
  const H = ch;
  const baseShiftX = Math.max(0, ((zoom - 1) * W) / 2);
  const baseShiftY = Math.max(0, ((zoom - 1) * H) / 2);
  const shiftX = (cropX / 100) * baseShiftX * 1.6;
  const shiftY = (cropY / 100) * baseShiftY * 1.6;

  const noTransform =
    Math.abs(level) < 0.01 &&
    Math.abs(cropZoom - 100) < 0.01 &&
    Math.abs(cropX) < 0.01 &&
    Math.abs(cropY) < 0.01;

  if (noTransform) {
    return { x: clamp01(bx / W), y: clamp01(by / H) };
  }

  const cx = W / 2 + shiftX;
  const cy = H / 2 + shiftY;
  const rad = (-level * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = bx - cx;
  const dy = by - cy;
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  const srcX = W / 2 + rx / zoom;
  const srcY = H / 2 + ry / zoom;

  return { x: clamp01(srcX / W), y: clamp01(srcY / H) };
}

/**
 * Promień pędzla w przestrzeni nominalnej maski — zgodny z rasterem CPU.
 * @param {number} brushRadiusUi — wartość suwaka (jak rozmiar kursora w px CSS)
 * @param {HTMLCanvasElement} canvasEl
 * @param {{ maskNominalW?: number, maskNominalH?: number }} [opts]
 */
export function brushRadiusToMaskRadiusNorm(brushRadiusUi, canvasEl, adjustments, opts = {}) {
  const rect = canvasEl.getBoundingClientRect();
  if (!canvasEl || canvasEl.width < 1 || !rect || rect.width < 1) {
    return { radiusNorm: 0.05 };
  }
  const cw = canvasEl.width;
  const ch = canvasEl.height;
  let rNominalPx = Math.max(1, Number(brushRadiusUi)) * (cw / rect.width);

  const cropNorm = normalizeExplicitCropRectFromAdjustments(adjustments ?? {});
  let nominalW = Number(opts.maskNominalW) > 0 ? Number(opts.maskNominalW) : cw;
  let nominalH = Number(opts.maskNominalH) > 0 ? Number(opts.maskNominalH) : ch;
  if (cropNorm && !(Number(opts.maskNominalW) > 0)) {
    nominalW = cw / Math.max(1e-5, cropNorm.w);
    nominalH = ch / Math.max(1e-5, cropNorm.h);
  }

  if (cropNorm) {
    const sx = (cropNorm.w * nominalW) / cw;
    const sy = (cropNorm.h * nominalH) / ch;
    rNominalPx *= (sx + sy) / 2;
  } else {
    const level = Number(adjustments?.level ?? 0) || 0;
    const cropZoom = Number(adjustments?.cropZoom ?? 100) || 100;
    const levelCompensation = 1 + Math.min(0.16, Math.abs(level) / 180);
    const zoom = Math.max(cropZoom / 100, levelCompensation, 1);
    if (zoom > 1.02 || zoom < 0.98) {
      rNominalPx /= zoom;
    }
    if (Math.abs(nominalW - cw) > 1 || Math.abs(nominalH - ch) > 1) {
      rNominalPx *= (nominalW / cw + nominalH / ch) / 2;
    }
  }

  const maxEdge = Math.max(nominalW, nominalH);
  const radiusNorm = Math.max(0.005, Math.min(0.5, rNominalPx / maxEdge));
  return { radiusNorm, rNominalPx, nominalW, nominalH };
}
