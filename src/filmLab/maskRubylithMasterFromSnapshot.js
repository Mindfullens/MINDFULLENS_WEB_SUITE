/**
 * Kanał alfa rubylith = ta sama waga piksela co silnik (`computeLocalMaskWeightAtPixel`),
 * złożenie warstw jak `compoundLayerIntoMaster` w podglądzie maski.
 */

import { computeLocalMaskWeightAtPixel } from '../engine/filmLabLocalMaskRangeMath.js';
import { rgbRec709LumaUnit } from '../engine/colorMathShared.js';
import { combineLocalMaskGraphWeights } from './localMaskGraph.js';

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function compoundLayerIntoMaster(master, g, p, opacity01, blend) {
  const op = clamp01(opacity01);
  const b = String(blend ?? 'normal');
  const gs = clamp01(g * op);
  if (gs <= 0.00001) {
    return;
  }
  if (b === 'subtract') {
    master[p] = clamp01(master[p] - gs);
  } else if (b === 'add') {
    master[p] = clamp01(master[p] + gs * (1 - master[p]));
  } else {
    master[p] = Math.max(master[p], gs);
  }
}

/**
 * @param {object} snap — wynik `buildLocalMaskStackSnapshot`
 * @param {ImageData} imageData — RGBA w tej samej rozdzielczości co snapshot (np. zeskalowany kadr z canvasu)
 * @param {object} [adjustments] — do `activeLocalMaskIndex` przy graph combine
 * @returns {{ master: Float32Array, width: number, height: number } | null}
 */
export function buildRubylithMasterFromSnapshot(snap, imageData, adjustments = {}) {
  if (!snap?.brushMaskEnabled || !Array.isArray(snap.localMaskStack) || snap.localMaskStack.length === 0) {
    return null;
  }
  if (!imageData?.data || imageData.width < 2 || imageData.height < 2) {
    return null;
  }
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const pixelCount = width * height;
  if (data.length < pixelCount * 4) {
    return null;
  }

  /** Uzupełnij proxy głębi z luminancji (jak eksport), gdy brak bufora ONNX; spójnie z trybem „luminance”. */
  const useLumaProxy = String(adjustments?.depthMapSource ?? 'luminance') === 'luminance';
  const stack = snap.localMaskStack.map((entry) => {
    if (entry?.mode !== 'depth' || !useLumaProxy) {
      return entry;
    }
    if (entry?.depthProxyBuffer instanceof Float32Array && entry.depthProxyBuffer.length === pixelCount) {
      return entry;
    }
    const depthProxyBuf = new Float32Array(pixelCount);
    for (let pIdx = 0; pIdx < pixelCount; pIdx += 1) {
      const i = pIdx * 4;
      depthProxyBuf[pIdx] = rgbRec709LumaUnit(data[i], data[i + 1], data[i + 2]);
    }
    return { ...entry, depthProxyBuffer: depthProxyBuf };
  });

  if (snap.graphCombineActive) {
    const entryA = stack[snap.graphIdxA];
    const entryB = stack[snap.graphIdxB];
    const driverIdx = Math.max(
      0,
      Math.min(stack.length - 1, Number(adjustments?.activeLocalMaskIndex ?? 0)),
    );
    const driver = stack[driverIdx];
    if (!entryA || !entryB || !driver) {
      return null;
    }
    const master = new Float32Array(pixelCount);
    const dop = driver.opacity;
    for (let pIdx = 0; pIdx < pixelCount; pIdx += 1) {
      const i = pIdx * 4;
      const wA = computeLocalMaskWeightAtPixel(entryA, pIdx, data[i], data[i + 1], data[i + 2]);
      const wB = computeLocalMaskWeightAtPixel(entryB, pIdx, data[i], data[i + 1], data[i + 2]);
      const combined = combineLocalMaskGraphWeights(wA, wB, snap.graphOpNorm);
      master[pIdx] = clamp01(combined * dop);
    }
    let peak = 0;
    for (let i = 0; i < master.length; i += 1) {
      if (master[i] > peak) peak = master[i];
    }
    if (peak < 1e-6) {
      return null;
    }
    return { master, width, height };
  }

  const master = new Float32Array(pixelCount).fill(0);
  for (const entry of stack) {
    const opacity01 = entry.opacity;
    const blend = entry.blend;
    for (let pIdx = 0; pIdx < pixelCount; pIdx += 1) {
      const i = pIdx * 4;
      const g = computeLocalMaskWeightAtPixel(entry, pIdx, data[i], data[i + 1], data[i + 2]);
      compoundLayerIntoMaster(master, g, pIdx, opacity01, blend);
    }
  }

  let peak = 0;
  for (let i = 0; i < master.length; i += 1) {
    if (master[i] > peak) peak = master[i];
  }
  if (peak < 1e-6) {
    return null;
  }

  return { master, width, height };
}
