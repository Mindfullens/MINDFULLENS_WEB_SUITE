/**
 * Retusz v1 — lekki podgląd „Heal” (blur mieszany z maską / globalnie).
 */

import { clamp } from './colorMathShared.js';
import { computeLocalMaskWeightAtPixel } from './filmLabLocalMaskRangeMath.js';
import { combineLocalMaskGraphWeights } from '../filmLab/localMaskGraph.js';

/**
 * @param {object} snap — wynik `buildLocalMaskStackSnapshot`
 * @param {number} pIdx
 * @param {number} red 0..255
 * @param {number} green
 * @param {number} blue
 * @param {'global' | 'masked'} scope
 * @param {object} adjustments — dla `activeLocalMaskIndex` przy grafie
 */
export function computeRetouchMaskWeightAtPixel(snap, pIdx, red, green, blue, scope, adjustments) {
  if (scope !== 'masked') {
    return 1;
  }
  if (!snap?.brushMaskEnabled || !Array.isArray(snap.localMaskStack) || snap.localMaskStack.length === 0) {
    return 0;
  }

  if (snap.graphCombineActive) {
    const entryA = snap.localMaskStack[snap.graphIdxA];
    const entryB = snap.localMaskStack[snap.graphIdxB];
    const driverIdx = Math.max(
      0,
      Math.min(
        snap.localMaskStack.length - 1,
        Number(adjustments?.activeLocalMaskIndex ?? 0)
      )
    );
    const driver = snap.localMaskStack[driverIdx];
    if (!entryA || !entryB || !driver) {
      return 0;
    }
    const wA = computeLocalMaskWeightAtPixel(entryA, pIdx, red, green, blue);
    const wB = computeLocalMaskWeightAtPixel(entryB, pIdx, red, green, blue);
    const combined = combineLocalMaskGraphWeights(wA, wB, snap.graphOpNorm);
    return combined * driver.opacity;
  }

  let maxW = 0;
  for (const maskEntry of snap.localMaskStack) {
    maxW = Math.max(maxW, computeLocalMaskWeightAtPixel(maskEntry, pIdx, red, green, blue));
  }
  return maxW;
}

/**
 * Mieszanie z rozmytym sąsiedztwem 3×3 (jedna iteracja).
 *
 * @param {Uint8ClampedArray} data — RGBA in-place
 * @param {number} width
 * @param {number} height
 * @param {number} strength 0..100 (UI)
 * @param {(pIdx: number, r: number, g: number, b: number) => number} maskWeight01
 */
export function applyRetouchHealBoxBlurPass(data, width, height, strength, maskWeight01) {
  const mixBase = Math.max(0, Math.min(0.48, (Number(strength) / 100) * 0.48));
  if (mixBase <= 0) {
    return;
  }

  const copy = new Uint8ClampedArray(data.length);
  copy.set(data);
  const pixCount = width * height;

  for (let pIdx = 0; pIdx < pixCount; pIdx += 1) {
    const cx = pIdx % width;
    const cy = Math.floor(pIdx / width);
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let cnt = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const ni = (ny * width + nx) * 4;
        sumR += copy[ni];
        sumG += copy[ni + 1];
        sumB += copy[ni + 2];
        cnt += 1;
      }
    }
    if (cnt <= 0) {
      continue;
    }
    const br = sumR / cnt;
    const bg = sumG / cnt;
    const bb = sumB / cnt;
    const i = pIdx * 4;
    const mr = copy[i];
    const mg = copy[i + 1];
    const mb = copy[i + 2];
    const m = maskWeight01(pIdx, mr, mg, mb);
    const t = mixBase * Math.max(0, Math.min(1, m));
    data[i] = clamp(mr * (1 - t) + br * t);
    data[i + 1] = clamp(mg * (1 - t) + bg * t);
    data[i + 2] = clamp(mb * (1 - t) + bb * t);
  }
}
