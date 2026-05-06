export const DEFAULT_CURVE_LUMA_MIX = 0.72;

export const CLIPPING_HIGHLIGHT_THRESHOLD = 235.5;
export const CLIPPING_SHADOW_THRESHOLD = 10.5;
export const CLIPPING_MIN_HIGHLIGHT_THRESHOLD = 180.5;
export const CLIPPING_MIN_SHADOW_THRESHOLD = 2.5;
export const CLIPPING_MAX_SHADOW_THRESHOLD = 18.5;
export const CLIPPING_SHADOW_LUMA_FLOOR = 6;

export function clamp(value, min = 0, max = 255) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function clampUnit(value) {
  return clamp(value, 0, 1);
}

/** Rec.709 luma w zakresie 0–1 (maski luma / depth-proxy — jeden punkt podmiany na mapę głębi). */
export function rgbRec709LumaUnit(red, green, blue) {
  return clampUnit((0.299 * red + 0.587 * green + 0.114 * blue) / 255);
}

export function smoothstep(edge0, edge1, value) {
  if (Math.abs(edge1 - edge0) < 1e-5) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clampUnit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function resolveCurveLumaMix(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_CURVE_LUMA_MIX;
  }
  return clampUnit(numeric / 100);
}

export function mapFilmSafeExposureEv(exposureEv) {
  if (exposureEv <= 0) {
    return exposureEv;
  }

  const pivotEv = 0.58;
  const softMidEv = 0.92;
  const hardMaxEv = 1.12;

  if (exposureEv <= pivotEv) {
    return exposureEv;
  }

  const compressedMid =
    pivotEv +
    (softMidEv - pivotEv) * (1 - Math.exp(-(exposureEv - pivotEv) / 0.42));

  if (exposureEv <= 1.2) {
    return compressedMid;
  }

  return (
    compressedMid +
    (hardMaxEv - softMidEv) * (1 - Math.exp(-(exposureEv - 1.2) / 0.72))
  );
}

export function mix(a, b, t) {
  return a + (b - a) * clampUnit(t);
}

export function rgbToYCbCr(red, green, blue) {
  const y = 0.299 * red + 0.587 * green + 0.114 * blue;
  const cb = (blue - y) * 0.5643;
  const cr = (red - y) * 0.7132;

  return [y, cb, cr];
}

export function yCbCrToRgb(y, cb, cr) {
  const red = y + 1.402 * cr;
  const green = y - 0.344136 * cb - 0.714136 * cr;
  const blue = y + 1.772 * cb;

  return [red, green, blue];
}

export function applyToneAdjustments(
  red,
  green,
  blue,
  highlights,
  shadows,
  whites,
  blacks
) {
  const luminance = clampUnit((0.299 * red + 0.587 * green + 0.114 * blue) / 255);
  let nextRed = red;
  let nextGreen = green;
  let nextBlue = blue;

  if (shadows !== 0) {
    const shadowMask = 1 - smoothstep(0.1, 0.72, luminance);
    const shift = shadows * shadowMask * 122;
    nextRed += shift;
    nextGreen += shift;
    nextBlue += shift;
  }

  if (highlights !== 0) {
    const highlightMask = smoothstep(0.24, 0.88, luminance);
    const shift = highlights * highlightMask * 122;
    nextRed += shift;
    nextGreen += shift;
    nextBlue += shift;
  }

  if (blacks !== 0) {
    const blackMask = 1 - smoothstep(0.02, 0.5, luminance);
    const shift = blacks * blackMask * 108;
    nextRed += shift;
    nextGreen += shift;
    nextBlue += shift;
  }

  if (whites !== 0) {
    const whiteMask = smoothstep(0.5, 0.98, luminance);
    const shift = whites * whiteMask * 108;
    nextRed += shift;
    nextGreen += shift;
    nextBlue += shift;
  }

  return [nextRed, nextGreen, nextBlue];
}
