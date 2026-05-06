/**
 * Podgląd rubylith — ten sam kanał wag co silnik (`buildLocalMaskStackSnapshot` +
 * `computeLocalMaskWeightAtPixel`), nie „udawana” plama geometryczna.
 */

import { buildLocalMaskStackSnapshot } from './buildLocalMaskStackSnapshot.js';
import { buildRubylithMasterFromSnapshot } from './maskRubylithMasterFromSnapshot.js';

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {object} adjustments
 * @param {ImageData} scaledSourceImageData — RGBA w rozdzielczości snapshotu (np. zeskalowany kadr z canvasu)
 * @param {object} [extraAdjustments] — opcjonalnie scalone z `adjustments` (np. `depthProxyDigest` z silnika)
 * @returns {{ master: Float32Array, width: number, height: number } | null}
 */
export function buildCompoundMasterAlphaPreview(adjustments, scaledSourceImageData, extraAdjustments = null) {
  if (!adjustments?.brushMaskEnabled || !scaledSourceImageData?.data) {
    return null;
  }
  const w = scaledSourceImageData.width;
  const h = scaledSourceImageData.height;
  if (w < 2 || h < 2) {
    return null;
  }
  const adj =
    extraAdjustments && typeof extraAdjustments === 'object' ? { ...adjustments, ...extraAdjustments } : adjustments;
  const snap = buildLocalMaskStackSnapshot(w, h, adj, new Map(), scaledSourceImageData);
  return buildRubylithMasterFromSnapshot(snap, scaledSourceImageData, adj);
}

/**
 * Draw semi-transparent rubylith (blue) from master alpha; fills CSS pixel box.
 * `master` values są 0–1 — intensywność odpowiada sile maski (w tym flow/density z bufora geometrycznego).
 */
export function drawRubylithFromMaster(canvas, cssWidth, cssHeight, preview) {
  if (!canvas || !preview?.master) {
    return;
  }
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    return;
  }
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const pw = preview.width;
  const ph = preview.height;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const img = ctx.createImageData(pw, ph);
  const d = img.data;
  const m = preview.master;
  /** Ten sam składnik wizualny co wcześniej — alpha liniowa względem `master` (niższy flow = słabszy niebieski). */
  const rubylithTintAlpha = 0.42;
  for (let i = 0; i < pw * ph; i += 1) {
    const a = clamp01(m[i]) * rubylithTintAlpha;
    const j = i * 4;
    d[j] = 59;
    d[j + 1] = 130;
    d[j + 2] = 246;
    d[j + 3] = Math.round(a * 255);
  }
  const tmp = document.createElement('canvas');
  tmp.width = pw;
  tmp.height = ph;
  const tctx = tmp.getContext('2d');
  if (!tctx) {
    return;
  }
  tctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, pw, ph, 0, 0, cssWidth, cssHeight);
}
