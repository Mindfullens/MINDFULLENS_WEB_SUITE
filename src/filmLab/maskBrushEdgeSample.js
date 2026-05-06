/**
 * Sobel magnitude on Rec.709 luma sampled from RGBA ImageData (brush edge-aware dab boost).
 */

import { rgbRec709LumaUnit } from '../engine/colorMathShared.js';

function clampCoord(v, max) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, Math.round(v)));
}

function lumaAt(data, width, height, ix, iy) {
  const x = clampCoord(ix, width - 1);
  const y = clampCoord(iy, height - 1);
  const i = (y * width + x) * 4;
  return rgbRec709LumaUnit(data[i], data[i + 1], data[i + 2]);
}

/**
 * Normalized edge strength 0–1 at fractional pixel (dab center).
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {number} cx
 * @param {number} cy
 */
export function sampleBrushEdgeMagnitude01(data, width, height, cx, cy) {
  if (!(data instanceof Uint8ClampedArray) || width < 3 || height < 3 || data.length < width * height * 4) {
    return 0;
  }
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  if (x0 < 1 || y0 < 1 || x0 >= width - 1 || y0 >= height - 1) {
    return 0;
  }

  const p = (dx, dy) => lumaAt(data, width, height, x0 + dx, y0 + dy);

  const gx =
    -1 * p(-1, -1) +
    1 * p(1, -1) +
    -2 * p(-1, 0) +
    2 * p(1, 0) +
    -1 * p(-1, 1) +
    1 * p(1, 1);
  const gy =
    -1 * p(-1, -1) +
    -2 * p(0, -1) +
    -1 * p(1, -1) +
    1 * p(-1, 1) +
    2 * p(0, 1) +
    1 * p(1, 1);

  const mag = Math.hypot(gx, gy);
  /** Typical strong edge ~0–4+ on 8-bit luma Sobel; squash to 0–1 */
  return Math.max(0, Math.min(1, mag / 5.5));
}
