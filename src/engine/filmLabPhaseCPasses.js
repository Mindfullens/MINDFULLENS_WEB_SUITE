import { clamp } from './colorMathShared.js';

/**
 * Phase C (Film Lab): subtle horizontal „gate weave” before ordered preview dither / canvas composite.
 * Mutates `imageData` in place.
 */
export function applyGateWeaveToImageData(imageData, strength01, seed = 1) {
  if (!imageData?.data?.length) {
    return;
  }
  const w = imageData.width;
  const h = imageData.height;
  const strength = Number(strength01);
  if (!Number.isFinite(strength) || strength <= 0 || w < 8 || h < 8) {
    return;
  }

  const data = imageData.data;
  const srcCopy = new Uint8ClampedArray(data);
  const ampPx = strength * Math.min(w, h) * 0.004;
  const phase = Number(seed) * 0.019;
  const freqY = 0.092;

  for (let y = 0; y < h; y += 1) {
    const shift = Math.round(Math.sin(y * freqY + phase) * ampPx);
    for (let x = 0; x < w; x += 1) {
      let sx = x - shift;
      if (sx < 0) {
        sx = 0;
      } else if (sx >= w) {
        sx = w - 1;
      }
      const di = (y * w + x) * 4;
      const si = (y * w + sx) * 4;
      data[di] = srcCopy[si];
      data[di + 1] = srcCopy[si + 1];
      data[di + 2] = srcCopy[si + 2];
      data[di + 3] = srcCopy[si + 3];
    }
  }
}

/**
 * Second-plate double exposure on top of the graded canvas (after crop / stack effects).
 */
export function applyDoubleExposureBlend(context, canvas, overlay, amount01, blendMode) {
  if (!overlay || !context || !canvas) {
    return;
  }
  const amt = Number(amount01);
  if (!Number.isFinite(amt) || amt <= 0) {
    return;
  }

  const mode = blendMode === 'multiply' ? 'multiply' : 'screen';
  context.save();
  context.globalAlpha = clamp(amt, 0, 1);
  context.globalCompositeOperation = mode;
  try {
    context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  } catch {
    // ignore decode/draw errors
  }
  context.restore();
}
