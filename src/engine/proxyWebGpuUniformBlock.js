import { clampUnit } from './colorMathShared.js';
import { resolveLookLutPayload } from './workers/proxyGpuRenderer.js';
import { resolveWhiteBalanceGains } from './whiteBalance.js';

/**
 * Pakowanie `UBlock` z `proxyWebGpuShaders.wgsl` — jeden plik prawdy z `proxyWebGpuRenderer.prepareAndEncodeUniforms`
 * (bez `queue.writeBuffer` / tekstur).
 *
 * @param {object} params
 * @param {object} [params.film]
 * @param {object} [params.adjustments]
 * @param {number} [params.profileLutSize]
 * @param {unknown} [params.profileLutData]
 * @param {unknown} [params.lookLut]
 * @param {number} params.targetWidth
 * @param {number} params.targetHeight
 * @param {{ fullWidth?: number, fullHeight?: number, originX?: number, originY?: number } | null} [params.outputTile]
 * @returns {Float32Array} 64 elementów (256 B)
 */
export function buildProxyWebGpuUBlockFloat32({
  film = {},
  adjustments = {},
  profileLutSize = 0,
  profileLutData = null,
  lookLut = null,
  targetWidth,
  targetHeight,
  outputTile = null,
}) {
  const lookLutPayload = resolveLookLutPayload(lookLut);
  const hasProfileLut = Number(profileLutSize) > 1 && Boolean(profileLutData);
  const hasLookLut = Number(lookLutPayload.size) > 1 && Boolean(lookLutPayload.data);

  const baseProfileStrength = clampUnit((adjustments.strength ?? 100) / 100);
  const profileStrength = baseProfileStrength * 0.66;
  const userExposure = ((adjustments.exposure ?? 0) / 100) * 1.42;
  const profileExposure = (film.exposure ?? 0) * baseProfileStrength * 0.28;
  const exposureEv = userExposure + profileExposure;
  const exposureGain = 2 ** exposureEv;
  const contrast =
    1 +
    ((adjustments.contrast ?? 0) * 0.28) / 200 +
    ((film.contrast ?? 0) * baseProfileStrength * 0.42) / 200;
  const saturation =
    1 +
    ((adjustments.saturation ?? 0) * 0.35) / 100 +
    ((film.saturation ?? 0) * baseProfileStrength * 0.9) / 100;
  const vibrance =
    ((adjustments.vibrance ?? 0) * 0.55) / 100 + ((film.vibrance ?? 0) * baseProfileStrength * 0.9) / 100;
  const hasExplicitWbGains =
    Number.isFinite(adjustments?.wbR) && Number.isFinite(adjustments?.wbG) && Number.isFinite(adjustments?.wbB);
  const wb = hasExplicitWbGains
    ? { r: Number(adjustments.wbR), g: Number(adjustments.wbG), b: Number(adjustments.wbB) }
    : resolveWhiteBalanceGains(adjustments?.temp ?? 0, adjustments?.tint ?? 0);
  const highlights =
    ((adjustments.highlights ?? 0) * 0.3) / 100 + ((film.highlights ?? 0) * baseProfileStrength * 0.28) / 100;
  const shadows =
    ((adjustments.shadows ?? 0) * 0.3) / 100 + ((film.shadows ?? 0) * baseProfileStrength * 0.28) / 100;
  const whites =
    ((adjustments.whites ?? 0) * 0.3) / 100 + ((film.whites ?? 0) * baseProfileStrength * 0.28) / 100;
  const blacks =
    ((adjustments.blacks ?? 0) * 0.3) / 100 + ((film.blacks ?? 0) * baseProfileStrength * 0.28) / 100;
  const fade = clampUnit((adjustments.fade ?? 0) / 100);
  const dehaze = ((adjustments.dehaze ?? 0) / 100) * 0.32 + ((film.dehaze ?? 0) / 100) * 0.2;
  const clarity = ((adjustments.clarity ?? 0) / 100) * 0.4 + ((film.clarity ?? 0) / 100) * 0.22;
  const microContrast = dehaze * 0.22 + clarity * 0.16;
  const vignette = clampUnit((adjustments.userVignette ?? 0) / 100);
  const bloom = clampUnit((adjustments.bloom ?? 0) / 100);

  const u = new Float32Array(64);
  u[0] = exposureGain;
  u[1] = contrast;
  u[2] = adjustments.pivot ?? 0.18;
  u[3] = profileLutSize > 1 ? profileLutSize : 1;
  u[4] = hasLookLut ? lookLutPayload.size : 1;
  u[5] = profileStrength;
  u[6] = 1.0;
  u[7] = 1.0;
  u[8] = saturation;
  u[9] = vibrance;
  u[10] = hasProfileLut ? 1.0 : 0.0;
  u[11] = hasLookLut ? 1.0 : 0.0;
  u[12] = adjustments?.showClipping ? 1.0 : 0.0;
  u[13] = fade;
  u[14] = wb.r;
  u[15] = wb.g;
  u[16] = wb.b;
  u[17] = microContrast;
  u[18] = vignette;
  u[19] = bloom;
  u[20] = highlights;
  u[21] = shadows;
  u[22] = whites;
  u[23] = blacks;
  const fullW = outputTile ? Number(outputTile.fullWidth) || targetWidth : targetWidth;
  const fullH = outputTile ? Number(outputTile.fullHeight) || targetHeight : targetHeight;
  const ox = outputTile ? Number(outputTile.originX) || 0 : 0;
  const oy = outputTile ? Number(outputTile.originY) || 0 : 0;
  u[24] = ox / Math.max(1, fullW);
  u[25] = oy / Math.max(1, fullH);
  u[26] = targetWidth / Math.max(1, fullW);
  u[27] = targetHeight / Math.max(1, fullH);
  return u;
}

/**
 * Sonda main nie uploaduje wolumenów 3D — wyzeruj flagi i rozmiary LUT, żeby `textureSample` nie czytał
 * z 1×1×1 placeholdera przy `u` policzonym z profilu.
 * @param {Float32Array} uIn
 * @returns {Float32Array}
 */
export function stripProxyWebGpuUBlockLutTextureBindings(uIn) {
  const u = new Float32Array(uIn);
  u[3] = 1.0;
  u[4] = 1.0;
  u[10] = 0.0;
  u[11] = 0.0;
  return u;
}
