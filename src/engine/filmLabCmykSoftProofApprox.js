/**
 * Approximate CMYK “soft proof” for display preview only — NOT ICC-accurate.
 * Quantized RGB → CMYK → RGB loses gamut detail and mimics a coarse print preview.
 */

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * @param {Uint8ClampedArray} data RGBA, alpha unchanged
 */
export function applyCmykSoftProofApproxToRgba(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r0 = data[i] / 255;
    const g0 = data[i + 1] / 255;
    const b0 = data[i + 2] / 255;
    const kf = 1 - Math.max(r0, g0, b0);
    if (kf >= 1 - 1e-8) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      continue;
    }
    const inv = 1 / (1 - kf);
    const cq = clampByte((1 - r0 - kf) * inv * 255);
    const mq = clampByte((1 - g0 - kf) * inv * 255);
    const yq = clampByte((1 - b0 - kf) * inv * 255);
    const kq = clampByte(kf * 255);
    const kNorm = kq / 255;
    data[i] = clampByte(255 * (1 - cq / 255) * (1 - kNorm));
    data[i + 1] = clampByte(255 * (1 - mq / 255) * (1 - kNorm));
    data[i + 2] = clampByte(255 * (1 - yq / 255) * (1 - kNorm));
  }
}
