/**
 * Pojedynczy odczyt siły krawędzi (Sobel na lumie) z kontekstu 2D —wartość ~0–1 dla znaczka pędzla.
 */
function clamp01(v) {
  if (!Number.isFinite(v)) {
    return 0;
  }
  return Math.max(0, Math.min(1, v));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cw canvas bitmap width
 * @param {number} ch canvas bitmap height
 * @param {number} nx normalized X 0–1 (preview space)
 * @param {number} ny normalized Y 0–1
 * @returns {number} magnitude ~0–1
 */
export function sampleLumaSobelMagnitude01(ctx, cw, ch, nx, ny) {
  if (!ctx || cw < 3 || ch < 3) {
    return 0.5;
  }
  const px = Math.round(clamp01(nx) * (cw - 1));
  const py = Math.round(clamp01(ny) * (ch - 1));
  const x0 = Math.max(0, px - 1);
  const y0 = Math.max(0, py - 1);
  const w = Math.min(3, cw - x0);
  const h = Math.min(3, ch - y0);
  if (w < 3 || h < 3) {
    return 0.5;
  }
  let imageData;
  try {
    imageData = ctx.getImageData(x0, y0, w, h);
  } catch {
    return 0.5;
  }
  const d = imageData.data;
  const lum = [];
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    lum.push(0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]);
  }
  if (lum.length !== 9) {
    return 0.5;
  }
  const gx = -lum[0] - 2 * lum[3] - lum[6] + lum[2] + 2 * lum[5] + lum[8];
  const gy = -lum[0] - 2 * lum[1] - lum[2] + lum[6] + 2 * lum[7] + lum[8];
  const mag = Math.hypot(gx, gy);
  return clamp01(mag / 900);
}
