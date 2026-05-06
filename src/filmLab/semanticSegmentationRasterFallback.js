/**
 * Heuristic sky alpha when no ONNX model is configured — smooth upper-region mask,
 * not a screen-center rectangle. ONNX path replaces this with real spatial output.
 */

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {number} width
 * @param {number} height
 * @param {{ x?: number, y?: number, w?: number, h?: number }} [cropNorm] normalized crop / framing hints
 * @returns {{ width: number, height: number, data: Float32Array }}
 */
export function buildSkySemanticAlphaRaster(width, height, cropNorm) {
  const w = Math.max(4, Math.floor(width));
  const h = Math.max(4, Math.floor(height));
  const data = new Float32Array(w * h);
  const cx = clamp(cropNorm?.x ?? 0, 0, 1);
  const cy = clamp(cropNorm?.y ?? 0, 0, 1);
  const cw = clamp(cropNorm?.w ?? 1, 0.05, 1);
  const ch = clamp(cropNorm?.h ?? 1, 0.05, 1);
  const horizon = clamp(cy + ch * (0.26 + 0.24 * (1 - ch)), 0.08, 0.96);
  const centerXN = cx + cw * 0.5;
  for (let y = 0; y < h; y += 1) {
    const ny = h > 1 ? y / (h - 1) : 0;
    for (let x = 0; x < w; x += 1) {
      const nx = w > 1 ? x / (w - 1) : 0;
      let sky = 0;
      if (ny <= horizon) {
        const t = horizon > 1e-6 ? Math.max(0, Math.min(1, 1 - ny / horizon)) : 1;
        sky = t * t * (3 - 2 * t);
        const lateral = 1 - Math.abs(nx - centerXN) / Math.max(0.12, cw * 0.55);
        sky *= 0.78 + 0.22 * Math.max(0, Math.min(1, lateral));
      }
      data[y * w + x] = Math.max(0, Math.min(1, sky));
    }
  }
  return { width: w, height: h, data };
}
