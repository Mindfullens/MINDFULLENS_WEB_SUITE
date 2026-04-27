import {
  getOrCreatePersistentWebGpuDevice,
  getOrProbeWebGpuAdapter,
  getOrProbeWebGpuDevice,
} from '../webGpuEnvironment.js';
import { createProxyGpuRenderer } from './proxyGpuRenderer.js';
import { createProxyWebGpuRenderer } from './proxyWebGpuRenderer.js';
import { resolveWhiteBalanceGains } from '../whiteBalance.js';
import {
  CLIPPING_HIGHLIGHT_THRESHOLD,
  CLIPPING_SHADOW_THRESHOLD,
  CLIPPING_MIN_HIGHLIGHT_THRESHOLD as CLIPPING_HIGHLIGHT_MIN,
  CLIPPING_MIN_SHADOW_THRESHOLD as CLIPPING_SHADOW_MIN,
  CLIPPING_MAX_SHADOW_THRESHOLD as CLIPPING_SHADOW_MAX,
  CLIPPING_SHADOW_LUMA_FLOOR,
  clamp,
  clampUnit,
  smoothstep,
  mapFilmSafeExposureEv,
  resolveCurveLumaMix,
  mix,
  rgbToYCbCr,
  yCbCrToRgb,
  applyToneAdjustments,
} from '../colorMathShared.js';
import {
  buildCurveLut as buildSharedCurveLut,
  sampleCurveLut as sampleSharedCurveLut,
} from '../curveInterpolation.js';
import { expectedCubeLutRgbByteLength } from '../lut/cubeLutPayload.js';
import {
  fitSourceInsideMaxTextureEdge,
  isDownscaleOutputWithinPixelBudget,
  downscaleRgba8ToTargetStaged,
} from '../proxySourceDownscale.js';
import { wouldProxy3dLutsExceedMaxTexEdge } from '../proxyGpuLut3dLimit.js';
import { fitNominalToMaxTexture2dEdge } from '../proxyNominalOutputFit.js';
import { countImageTilesForMaxEdge, planImageTileGrid } from '../proxyImageTilePlan.js';
import { copyRgba8TileIntoBuffer } from '../proxyOutputTileComposite.js';
import { computeProxySize, DEFAULT_PROXY_MAX } from '../proxyComputeSize.js';
import { readEnvFlag } from '../../filmLab/runtimeEnv.js';
const CURVE_PROXY_LUT_RESOLUTION = 1024;

const state = {
  sourceId: 0,
  sourceWidth: 0,
  sourceHeight: 0,
  sourcePixels: null,
  profileLutSize: 0,
  profileLutData: null,
  proxyMax: DEFAULT_PROXY_MAX,
  canvas: null,
  context: null,
  busy: false,
  activeRequestId: 0,
  pendingRequest: null,
  backend: {
    gpuEnabled: false,
    preferred: 'cpu',
    forceCpuFallback: false,
    gpuFailed: false,
    gpuFailureReason: '',
    gpuRenderer: null,
    webGpuUnusable: false,
  },
  pendingScheduled: false,
  /** Cache RGBA8 pomniejszony do limitu 2D GPU (ten sam plik, ten sam `maxEdge`); unika powtarzania kosztu co klatkę. */
  gpuSourceOverrideCache: null,
};

function resolveHighlightClippingThreshold(adjustments) {
  const positiveExposure = Math.max(0, Number(adjustments?.exposure ?? 0));
  const positiveHighlights = Math.max(0, Number(adjustments?.highlights ?? 0));
  const positiveWhites = Math.max(0, Number(adjustments?.whites ?? 0));
  const responseBias =
    positiveExposure * 0.45 + positiveHighlights * 0.4 + positiveWhites * 0.55;

  return clamp(
    Math.round(CLIPPING_HIGHLIGHT_THRESHOLD - responseBias),
    CLIPPING_HIGHLIGHT_MIN,
    CLIPPING_HIGHLIGHT_THRESHOLD
  );
}

function resolveShadowClippingThreshold(adjustments) {
  const positiveShadows = Math.max(0, Number(adjustments?.shadows ?? 0));
  const positiveBlacks = Math.max(0, Number(adjustments?.blacks ?? 0));
  const negativeShadows = Math.max(0, -Number(adjustments?.shadows ?? 0));
  const negativeBlacks = Math.max(0, -Number(adjustments?.blacks ?? 0));
  const responseBias =
    positiveShadows * 0.07 +
    positiveBlacks * 0.09 -
    negativeShadows * 0.05 -
    negativeBlacks * 0.08;

  return clamp(
    Math.round(CLIPPING_SHADOW_THRESHOLD - responseBias),
    CLIPPING_SHADOW_MIN,
    CLIPPING_SHADOW_MAX
  );
}

function hashNoise(x, y, seed) {
  let h =
    ((x | 0) * 374761393) ^
    ((y | 0) * 668265263) ^
    (((seed * 1_000_003) | 0) * 2246822519);
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function buildCurveLut(points, interpolation = 'monotonic') {
  const interpolationMode = interpolation === 'linear' ? 'linear' : 'monotonic';
  return buildSharedCurveLut(points, {
    resolution: CURVE_PROXY_LUT_RESOLUTION,
    interpolation: interpolationMode,
    round: false,
  });
}

function sampleCurveLut(lut, value) {
  return sampleSharedCurveLut(lut, value);
}

function applyRgbMasterCurve(red, green, blue, rgbLut, curveLumaMix) {
  const rgbDirectRed = sampleCurveLut(rgbLut, red);
  const rgbDirectGreen = sampleCurveLut(rgbLut, green);
  const rgbDirectBlue = sampleCurveLut(rgbLut, blue);
  const [lumaSourceY, lumaSourceCb, lumaSourceCr] = rgbToYCbCr(red, green, blue);
  const targetLumaY = sampleCurveLut(rgbLut, lumaSourceY);
  const [rgbLuminanceRed, rgbLuminanceGreen, rgbLuminanceBlue] = yCbCrToRgb(
    targetLumaY,
    lumaSourceCb,
    lumaSourceCr
  );

  return [
    mix(rgbDirectRed, rgbLuminanceRed, curveLumaMix),
    mix(rgbDirectGreen, rgbLuminanceGreen, curveLumaMix),
    mix(rgbDirectBlue, rgbLuminanceBlue, curveLumaMix),
  ];
}

function cubeIndex(size, red, green, blue) {
  return ((red * size + green) * size + blue) * 3;
}

function sampleCubeLutRgb(size, data, red, green, blue) {
  if (!size || size < 2 || !data || data.length < size * size * size * 3) {
    return [red, green, blue];
  }

  const maxIndex = size - 1;
  const rPos = (red / 255) * maxIndex;
  const gPos = (green / 255) * maxIndex;
  const bPos = (blue / 255) * maxIndex;

  const r0 = Math.floor(rPos);
  const g0 = Math.floor(gPos);
  const b0 = Math.floor(bPos);
  const r1 = Math.min(maxIndex, r0 + 1);
  const g1 = Math.min(maxIndex, g0 + 1);
  const b1 = Math.min(maxIndex, b0 + 1);
  const dr = rPos - r0;
  const dg = gPos - g0;
  const db = bPos - b0;

  const c000 = cubeIndex(size, r0, g0, b0);
  const c001 = cubeIndex(size, r0, g0, b1);
  const c010 = cubeIndex(size, r0, g1, b0);
  const c011 = cubeIndex(size, r0, g1, b1);
  const c100 = cubeIndex(size, r1, g0, b0);
  const c101 = cubeIndex(size, r1, g0, b1);
  const c110 = cubeIndex(size, r1, g1, b0);
  const c111 = cubeIndex(size, r1, g1, b1);

  const result = [0, 0, 0];

  for (let channel = 0; channel < 3; channel += 1) {
    const v000 = data[c000 + channel];
    const v001 = data[c001 + channel];
    const v010 = data[c010 + channel];
    const v011 = data[c011 + channel];
    const v100 = data[c100 + channel];
    const v101 = data[c101 + channel];
    const v110 = data[c110 + channel];
    const v111 = data[c111 + channel];

    const c00 = v000 * (1 - dr) + v100 * dr;
    const c01 = v001 * (1 - dr) + v101 * dr;
    const c10 = v010 * (1 - dr) + v110 * dr;
    const c11 = v011 * (1 - dr) + v111 * dr;
    const c0 = c00 * (1 - dg) + c10 * dg;
    const c1 = c01 * (1 - dg) + c11 * dg;
    result[channel] = clamp(Math.round(c0 * (1 - db) + c1 * db));
  }

  return result;
}

function expectedPixelLength(width, height) {
  return Math.max(0, (Number(width) || 0) * (Number(height) || 0) * 4);
}

function assertValidSourceBuffer(sourcePixels, sourceWidth, sourceHeight) {
  if (!(sourcePixels instanceof Uint8ClampedArray)) {
    throw new Error('Source pixel payload must be Uint8ClampedArray.');
  }
  const expectedLength = expectedPixelLength(sourceWidth, sourceHeight);
  if (sourcePixels.length !== expectedLength) {
    throw new Error(
      `Source pixel payload mismatch: expected ${expectedLength}, got ${sourcePixels.length} (source=${sourceWidth}x${sourceHeight}).`
    );
  }
}

function shouldAttemptGpu(request) {
  const backend = state.backend;
  if (
    !backend.gpuEnabled ||
    backend.preferred !== 'gpu' ||
    backend.forceCpuFallback ||
    backend.gpuFailed
  ) {
    return false;
  }

  const adjustments = request?.adjustments ?? {};
  
  // Now GPU supports curves via Look-LUT, so we can use it.
  // We still fallback for complex pixel-neighborhood effects if they are not in Look-LUT.
  if (
    Math.abs(adjustments.userGrain ?? 0) > 0.01 ||
    Math.abs(adjustments.chromAb ?? 0) > 0.01 ||
    Math.abs(adjustments.halation ?? 0) > 0.01 ||
    Math.abs(adjustments.anamorph ?? 0) > 0.01
  ) {
    return false;
  }

  return true;
}

function webGpuProxyBuildFlag() {
  return readEnvFlag(import.meta?.env?.VITE_FILMLAB_WEBGPU_PROXY);
}

const webGpuDeviceLostHandlerAttached = new WeakSet();

function attachProxyWebGpuPersistentContext(device, format) {
  globalThis.__mlWgpu = { device, format };
  if (webGpuDeviceLostHandlerAttached.has(device)) {
    return;
  }
  webGpuDeviceLostHandlerAttached.add(device);
  if (import.meta?.env?.DEV && typeof device.addEventListener === 'function') {
    try {
      device.addEventListener('uncapturederror', (event) => {
        const err = event?.error;
        console.warn(
          '[FilmLab][proxyWorker][WebGPU] uncapturederror',
          err instanceof Error ? err.message : err
        );
      });
    } catch {
      // noop
    }
  }
  device.lost.then(() => {
    globalThis.__mlWgpu = null;
    state.backend.webGpuUnusable = true;
    if (state.backend.gpuRenderer?.__gpuBackend === 'webgpu') {
      try {
        state.backend.gpuRenderer.destroy();
      } catch {
        // noop
      }
      state.backend.gpuRenderer = null;
    }
    self.postMessage({
      type: 'proxyWebGpuDeviceLost',
      message: 'WebGPU: GPUDevice lost',
    });
  });
}

/**
 * Wybrane `GPUDevice.limits` (duże tekstury, bufory) — do panelu / JSON eksportu.
 * @param {GPUDevice} device
 */
function pickWebGpuDeviceLimitsSnapshot(device) {
  try {
    const L = device?.limits;
    if (!L || typeof L !== 'object') {
      return null;
    }
    return {
      maxTextureDimension1D: Number(L.maxTextureDimension1D),
      maxTextureDimension2D: Number(L.maxTextureDimension2D),
      maxTextureDimension3D: Number(L.maxTextureDimension3D),
      maxTextureArrayLayers: Number(L.maxTextureArrayLayers),
      maxBindGroups: Number(L.maxBindGroups),
      maxStorageBufferBindingSize: Number(L.maxStorageBufferBindingSize),
      maxUniformBufferBindingSize: Number(L.maxUniformBufferBindingSize),
    };
  } catch {
    return null;
  }
}

/**
 * Pobiera trwały `GPUDevice` (gdy jeszcze go nie ma), rejestruje `lost`, czyści
 * `state.backend.gpuRenderer`, żeby `ensureGpuRenderer` mógł wybrać WebGPU / WebGL2.
 */
async function tryAttachPersistentWebGpu() {
  if (!webGpuProxyBuildFlag()) {
    return false;
  }
  if (globalThis.__mlWgpu?.device) {
    return true;
  }
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return false;
  }
  try {
    const device = await getOrCreatePersistentWebGpuDevice();
    const format = navigator.gpu.getPreferredCanvasFormat();
    attachProxyWebGpuPersistentContext(device, format);
    state.backend.webGpuUnusable = false;
    if (state.backend.gpuRenderer) {
      try {
        state.backend.gpuRenderer.destroy();
      } catch {
        // noop
      }
      state.backend.gpuRenderer = null;
    }
    self.postMessage({
      type: 'proxyWebGpuReady',
      canvasFormat: format,
      deviceLimits: pickWebGpuDeviceLimitsSnapshot(device),
    });
    return true;
  } catch (e) {
    if (import.meta?.env?.DEV) {
      console.warn(
        '[FilmLab][proxyWorker] tryAttachPersistentWebGpu',
        e instanceof Error ? e.message : e
      );
    }
    return false;
  }
}

function ensureGpuRenderer() {
  if (state.backend.gpuRenderer) {
    return state.backend.gpuRenderer;
  }
  if (webGpuProxyBuildFlag() && !state.backend.webGpuUnusable) {
    const wgpu = globalThis.__mlWgpu;
    if (wgpu?.device) {
      try {
        const webGpuRenderer = createProxyWebGpuRenderer();
        state.backend.gpuRenderer = webGpuRenderer;
        return webGpuRenderer;
      } catch {
        state.backend.webGpuUnusable = true;
        // Dalej: WebGL2 (lub późniejszy retry z inną konfiguracją)
      }
    }
  }
  const renderer = createProxyGpuRenderer();
  state.backend.gpuRenderer = renderer;
  return renderer;
}

function setGpuFailure(reason) {
  state.gpuSourceOverrideCache = null;
  state.backend.gpuFailed = true;
  state.backend.gpuFailureReason = reason || 'GPU renderer failed.';
  if (state.backend.gpuRenderer?.__gpuBackend === 'webgpu') {
    state.backend.webGpuUnusable = true;
  }
  if (state.backend.gpuRenderer) {
    try {
      state.backend.gpuRenderer.destroy();
    } catch (_error) {
      // noop
    }
    state.backend.gpuRenderer = null;
  }
  self.postMessage({
    type: 'proxyBackendStatus',
    backend: 'gpu',
    status: 'disabled',
    reason: state.backend.gpuFailureReason,
  });
}

function isRenderableBitmap(bitmap) {
  return Boolean(
    bitmap &&
      typeof bitmap === 'object' &&
      Number(bitmap.width) > 0 &&
      Number(bitmap.height) > 0
  );
}

function roundProxyWorkerRenderMs(v) {
  if (!Number.isFinite(v) || v < 0) {
    return null;
  }
  return Math.max(0, Math.round(v * 10) / 10);
}

/**
 * Maks. dopuszczalna krawdź 2D tekstury wejścia (proxy WebGL2 / WebGPU).
 * Gdy 0 – nie znamy limitu, nie filtrujemy (zachowanie jak wcześniej).
 */
function getProxyRendererMaxTexture2dEdge(renderer) {
  if (!renderer) {
    return 0;
  }
  if (renderer.__gpuBackend === 'webgl') {
    const g = Math.floor(Number(renderer.__glMaxTexture2d) || 0);
    return g > 0 ? g : 0;
  }
  if (renderer.__gpuBackend === 'webgpu') {
    const w = Math.floor(Number(renderer.__maxTexture2d) || 0);
    return w > 0 ? w : 0;
  }
  return 0;
}

/**
 * Maks. krawdź 3D LUT w workerze (WebGL2 / WebGPU). Gdy 0 — brak danych o limicie.
 */
function getProxyRendererMaxTexture3dEdge(renderer) {
  if (!renderer) {
    return 0;
  }
  if (renderer.__gpuBackend === 'webgl') {
    const g = Math.floor(Number(renderer.__glMaxTexture3d) || 0);
    return g > 0 ? g : 0;
  }
  if (renderer.__gpuBackend === 'webgpu') {
    const w = Math.floor(Number(renderer.__maxTexture3d) || 0);
    return w > 0 ? w : 0;
  }
  return 0;
}

/**
 * Cienka otoka: limit 2D z `renderer` → `fitNominalToMaxTexture2dEdge` (moduł wspólny / testy).
 * @param {object | null | undefined} renderer
 */
function fitNominalProxyOutputToRendererMax2d(nominalW, nominalH, renderer) {
  return fitNominalToMaxTexture2dEdge(nominalW, nominalH, getProxyRendererMaxTexture2dEdge(renderer));
}

/**
 * Teoretyczna siatka kafli @ max2D: nominal `computeProxySize` vs wyjście po `fitNominalToMaxTexture2dEdge`
 * (telemetria; pojedynczy pass GPU nadal jedną teksturą wyjścia).
 */
function proxyOutputTileTelemetry(nominalW, nominalH, outFit) {
  const M = Math.max(0, Math.floor(Number(outFit?.max2d) || 0));
  return {
    proxyWorkerOutputTileCountNominal: countImageTilesForMaxEdge(nominalW, nominalH, M),
    proxyWorkerOutputTileCountTarget: countImageTilesForMaxEdge(outFit.w, outFit.h, M),
  };
}

function shouldAbortActiveProxyRequest(requestId) {
  const id = Number(requestId) || 0;
  if (id !== state.activeRequestId) {
    return true;
  }
  const pending = Number(state.pendingRequest?.requestId) || 0;
  return pending > id;
}

/**
 * Tekstura wejścia dla GPU: pełne piksele albo (raz na źródło/limity) wersja zmiejszona do limitu 2D.
 * `inputDownscaleMs`: `null` — tekstura = pełne źródło; `0` — trafiony cache downscale; `>0` — czas CPU (box + bilinear) w `proxySourceDownscale` (ms).
 * @returns {{ ok: true, pixels, width, height, inputDownscaleMs: (number | null) } | { ok: false, reason: 'stale' }}  Gdy wynik `fit` przekracza `MAX_DOWNSCALE_OUTPUT_PIXELS`, `ok: false` (CPU zamiast alokacji).
 */
function getOrBuildGpuSourceTexturePayload(renderer, request) {
  const { sourcePixels, sourceWidth: sw, sourceHeight: sh } = state;
  const requestId = Number(request?.requestId) || 0;
  const M = getProxyRendererMaxTexture2dEdge(renderer);
  const now = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0;

  if (M > 0 && (sw > M || sh > M)) {
    const { width: dw, height: dh } = fitSourceInsideMaxTextureEdge(sw, sh, M);
    if (!isDownscaleOutputWithinPixelBudget(dw, dh)) {
      if (import.meta?.env?.DEV) {
        console.warn('[FilmLab] Proxy GPU input downscale skipped: output pixel budget', { dw, dh, M, sw, sh });
      }
      return { ok: false, reason: 'stale' };
    }
    const key = `${state.sourceId}|${sw}|${sh}|${M}|${dw}|${dh}`;
    const c = state.gpuSourceOverrideCache;
    if (c && c.key === key && c.pixels?.length === dw * dh * 4) {
      return { ok: true, pixels: c.pixels, width: dw, height: dh, inputDownscaleMs: 0 };
    }
    const isCancelled = () => shouldAbortActiveProxyRequest(requestId);
    if (isCancelled()) {
      return { ok: false, reason: 'stale' };
    }
    const tDs0 = now();
    const out = downscaleRgba8ToTargetStaged(sourcePixels, sw, sh, dw, dh, isCancelled);
    if (!out) {
      return { ok: false, reason: 'stale' };
    }
    const tDs1 = now();
    state.gpuSourceOverrideCache = { key, pixels: out };
    return {
      ok: true,
      pixels: out,
      width: dw,
      height: dh,
      inputDownscaleMs: roundProxyWorkerRenderMs(tDs1 - tDs0),
    };
  }

  state.gpuSourceOverrideCache = null;
  return { ok: true, pixels: sourcePixels, width: sw, height: sh, inputDownscaleMs: null };
}

function normalizeFastLookLutPayload(lookLut) {
  if (!lookLut || typeof lookLut !== 'object') {
    return null;
  }
  const size = Math.max(2, Math.round(Number(lookLut.size) || 0));
  if (size < 2) {
    return null;
  }
  const dataCandidate = lookLut.srgbData ?? lookLut.data ?? null;
  const data =
    dataCandidate instanceof Uint8Array
      ? dataCandidate
      : dataCandidate instanceof Uint8ClampedArray
        ? new Uint8Array(dataCandidate.buffer, dataCandidate.byteOffset, dataCandidate.byteLength)
        : null;
  if (!data) {
    return null;
  }
  const expectedLength = size * size * size * 3;
  if (data.length !== expectedLength) {
    return null;
  }
  return {
    key: typeof lookLut.key === 'string' ? lookLut.key : '',
    size,
    srgbData: data,
  };
}

async function renderProxyFrameGpu(request) {
  const { sourcePixels, sourceWidth, sourceHeight } = state;
  if (!sourcePixels || !sourceWidth || !sourceHeight) {
    return null;
  }
  assertValidSourceBuffer(sourcePixels, sourceWidth, sourceHeight);

  const { width, height } = computeProxySize(
    sourceWidth,
    sourceHeight,
    Number(request?.proxyMax) || state.proxyMax
  );
  const renderer = ensureGpuRenderer();
  const rawAdjustments = request.adjustments || {};
  const normalizedLookLut = normalizeFastLookLutPayload(rawAdjustments?.fastLookLut);
  const profileStrength = clampUnit((rawAdjustments.strength ?? 100) / 100);
  const profileLutStatus = String(rawAdjustments.profileLutStatus ?? 'idle');
  const hasProfileLut = state.profileLutSize > 1 && state.profileLutData;
  const shouldBypassProfile =
    Boolean(request?.film?.previewLutFile) && profileLutStatus === 'loading' && !hasProfileLut;
  const effectiveProfileStrength = shouldBypassProfile ? 0 : profileStrength;
  const profileNoLutBoost = hasProfileLut ? 1 : 1.05;
  const profileBalanceStrength = effectiveProfileStrength * 0.64 * profileNoLutBoost;
  const totalTemperature = clamp(
    (rawAdjustments.temp ?? 0) + (request?.film?.temperature ?? 0) * profileBalanceStrength,
    -100,
    100
  );
  const totalTint = clamp(
    (rawAdjustments.tint ?? 0) + (request?.film?.tint ?? 0) * profileBalanceStrength,
    -100,
    100
  );
  const wb = resolveWhiteBalanceGains(totalTemperature, totalTint);
  const gpuAdjustments = {
    ...rawAdjustments,
    temp: totalTemperature,
    tint: totalTint,
    wbR: wb.r,
    wbG: wb.g,
    wbB: wb.b,
  };
  const profileLutSForLimit = hasProfileLut ? state.profileLutSize : 0;
  const lookLutSForLimit = normalizedLookLut ? normalizedLookLut.size : 0;
  const max3d = getProxyRendererMaxTexture3dEdge(renderer);
  if (wouldProxy3dLutsExceedMaxTexEdge(profileLutSForLimit, lookLutSForLimit, max3d)) {
    if (import.meta?.env?.DEV) {
      console.warn('[FilmLab] Proxy GPU skipped: 3D LUT exceeds device max 3D texture edge', {
        profileLutS: profileLutSForLimit,
        lookLutS: lookLutSForLimit,
        maxTex3d: max3d,
        backend: renderer?.__gpuBackend,
      });
    }
    return null;
  }
  const max2dEdge = getProxyRendererMaxTexture2dEdge(renderer);
  const tilesNeededAtEdge = countImageTilesForMaxEdge(width, height, max2dEdge);
  const tryOutputTiles =
    readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_OUTPUT_TILES) &&
    tilesNeededAtEdge != null &&
    tilesNeededAtEdge > 1;

  if (tryOutputTiles) {
    if (!isDownscaleOutputWithinPixelBudget(width, height)) {
      if (import.meta?.env?.DEV) {
        console.warn('[FilmLab] Proxy GPU output tiles skipped: pixel budget', { width, height });
      }
    } else {
      const gpuInTiled = getOrBuildGpuSourceTexturePayload(renderer, request);
      if (!gpuInTiled.ok) {
        return null;
      }
      const tGpuStart =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : 0;
      try {
        const plan = planImageTileGrid(width, height, max2dEdge);
        const outFull = new Uint8ClampedArray(width * height * 4);
        const useGlReadPixels = renderer?.__gpuBackend === 'webgl';
        const useWebGpuReadback =
          renderer?.__gpuBackend === 'webgpu' && typeof renderer.renderToRgba8Pixels === 'function';
        const staging =
          useGlReadPixels || useWebGpuReadback
            ? null
            : (() => {
                const c = new OffscreenCanvas(1, 1);
                return { canvas: c, sctx: c.getContext('2d', { willReadFrequently: true }) };
              })();
        if (!useGlReadPixels && !useWebGpuReadback && !staging?.sctx) {
          throw new Error('2D staging context unavailable for output tiles (fallback).');
        }
        let wgpuTiledReadbackRgba8 = null;
        for (const tile of plan.tiles) {
          const baseTileParams = {
            sourcePixels: gpuInTiled.pixels,
            sourceWidth: gpuInTiled.width,
            sourceHeight: gpuInTiled.height,
            targetWidth: tile.w,
            targetHeight: tile.h,
            outputTile: {
              fullWidth: width,
              fullHeight: height,
              originX: tile.x,
              originY: tile.y,
            },
            film: request.film || {},
            adjustments: gpuAdjustments,
            profileLutSize: state.profileLutSize,
            profileLutData: state.profileLutData,
            lookLut: normalizedLookLut,
          };
          if (useWebGpuReadback) {
            const result = await renderer.renderToRgba8Pixels(baseTileParams);
            if (!result.pixels) {
              throw new Error('WebGPU readback: brak pikseli.');
            }
            if (wgpuTiledReadbackRgba8 == null && result.pixels.length >= 4) {
              wgpuTiledReadbackRgba8 = [
                result.pixels[0],
                result.pixels[1],
                result.pixels[2],
                result.pixels[3],
              ];
            }
            copyRgba8TileIntoBuffer(outFull, width, tile.x, tile.y, tile.w, tile.h, result.pixels);
          } else {
            const result = renderer.render({
              ...baseTileParams,
              returnPixels: useGlReadPixels,
            });
            if (result.pixels) {
              copyRgba8TileIntoBuffer(outFull, width, tile.x, tile.y, tile.w, tile.h, result.pixels);
            } else {
              const { canvas: st, sctx } = staging;
              st.width = tile.w;
              st.height = tile.h;
              sctx.drawImage(result.bitmap, 0, 0);
              result.bitmap.close();
              const id = sctx.getImageData(0, 0, tile.w, tile.h);
              copyRgba8TileIntoBuffer(outFull, width, tile.x, tile.y, tile.w, tile.h, id.data);
            }
          }
        }
        const tGpuEnd =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : tGpuStart;
        const outFitTiled = {
          w: width,
          h: height,
          max2d: max2dEdge,
          fitted: false,
          requestedW: width,
          requestedH: height,
        };
        return {
          width,
          height,
          pixels: outFull,
          gpuRenderMs: roundProxyWorkerRenderMs(tGpuEnd - tGpuStart),
          proxyWorkerGpuInputDownscaleMs: gpuInTiled.inputDownscaleMs,
          proxyWorkerGpuTexW: gpuInTiled.width,
          proxyWorkerGpuTexH: gpuInTiled.height,
          proxyWorkerFullSourceW: state.sourceWidth,
          proxyWorkerFullSourceH: state.sourceHeight,
          proxyWorkerProxyOutputFitted: false,
          proxyWorkerProxyOutputRequestedW: null,
          proxyWorkerProxyOutputRequestedH: null,
          readbackRgba8: wgpuTiledReadbackRgba8,
          readbackChroma: wgpuTiledReadbackRgba8 != null ? 'tile_rgba8' : null,
          ...proxyOutputTileTelemetry(width, height, outFitTiled),
        };
      } catch (gpuError) {
        console.error('[FilmLab] Proxy GPU tiled rendering failed, falling back to CPU:', gpuError);
        setGpuFailure(gpuError.message);
        return null;
      }
    }
  }

  const outTarget = fitNominalProxyOutputToRendererMax2d(width, height, renderer);
  const targetW = outTarget.w;
  const targetH = outTarget.h;
  if (outTarget.fitted && import.meta?.env?.DEV) {
    console.warn('[FilmLab] Proxy GPU: proxy output fitted to 2D texture limit', {
      requestedW: outTarget.requestedW,
      requestedH: outTarget.requestedH,
      targetW,
      targetH,
      maxTex2d: outTarget.max2d,
      backend: renderer?.__gpuBackend,
    });
  }
  const gpuIn = getOrBuildGpuSourceTexturePayload(renderer, request);
  if (!gpuIn.ok) {
    return null;
  }
  const tGpu0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0;
  try {
    const r = renderer.render({
      sourcePixels: gpuIn.pixels,
      sourceWidth: gpuIn.width,
      sourceHeight: gpuIn.height,
      targetWidth: targetW,
      targetHeight: targetH,
      film: request.film || {},
      adjustments: gpuAdjustments,
      profileLutSize: state.profileLutSize,
      profileLutData: state.profileLutData,
      lookLut: normalizedLookLut,
    });
    const result = r != null && typeof r.then === 'function' ? await r : r;
    const tGpu1 =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : tGpu0;
    return {
      ...result,
      gpuRenderMs: roundProxyWorkerRenderMs(tGpu1 - tGpu0),
      proxyWorkerGpuInputDownscaleMs: gpuIn.inputDownscaleMs,
      proxyWorkerGpuTexW: gpuIn.width,
      proxyWorkerGpuTexH: gpuIn.height,
      proxyWorkerFullSourceW: state.sourceWidth,
      proxyWorkerFullSourceH: state.sourceHeight,
      proxyWorkerProxyOutputFitted: outTarget.fitted,
      proxyWorkerProxyOutputRequestedW: outTarget.fitted ? outTarget.requestedW : null,
      proxyWorkerProxyOutputRequestedH: outTarget.fitted ? outTarget.requestedH : null,
      ...proxyOutputTileTelemetry(width, height, outTarget),
    };
  } catch (gpuError) {
    console.error('[FilmLab] Proxy GPU rendering failed, falling back to CPU:', gpuError);
    setGpuFailure(gpuError.message);
    return null;
  }
}

function ensureCanvas(width, height) {
  if (!state.canvas) {
    state.canvas = new OffscreenCanvas(width, height);
    state.context = state.canvas.getContext('2d', { willReadFrequently: true });
    return;
  }

  if (state.canvas.width !== width) {
    state.canvas.width = width;
  }
  if (state.canvas.height !== height) {
    state.canvas.height = height;
  }
}

/**
 * Opcjonalnie: co tyle wierszy pętli CPU wywołać `setTimeout(0)`, żeby wątek workera
 * mógł obsłużyć inne zadania (0 / brak = bez yield — domyślnie).
 * `VITE_FILMLAB_PROXY_CPU_YIELD_EVERY` w bundlu (np. `64`).
 */
function getProxyCpuYieldEveryRowCount() {
  const v = import.meta?.env?.VITE_FILMLAB_PROXY_CPU_YIELD_EVERY;
  if (v == null || String(v).trim() === '') {
    return 0;
  }
  const n = Math.floor(Number(String(v).trim()));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function renderProxyFrame(request) {
  const { sourcePixels, sourceWidth, sourceHeight } = state;
  if (!sourcePixels || !sourceWidth || !sourceHeight) {
    return null;
  }
  assertValidSourceBuffer(sourcePixels, sourceWidth, sourceHeight);

  const { width, height } = computeProxySize(
    sourceWidth,
    sourceHeight,
    Number(request?.proxyMax) || state.proxyMax
  );
  const max2dEdgeCpu = getProxyRendererMaxTexture2dEdge(state.backend.gpuRenderer);
  const tilesNeededCpu = countImageTilesForMaxEdge(width, height, max2dEdgeCpu);
  const tryCpuOutputTiles =
    readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_OUTPUT_TILES) &&
    tilesNeededCpu != null &&
    tilesNeededCpu > 1 &&
    isDownscaleOutputWithinPixelBudget(width, height) &&
    max2dEdgeCpu > 0;
  const outCpu = tryCpuOutputTiles
    ? {
        w: width,
        h: height,
        max2d: max2dEdgeCpu,
        fitted: false,
        requestedW: width,
        requestedH: height,
      }
    : fitNominalProxyOutputToRendererMax2d(width, height, state.backend.gpuRenderer);
  const outW = outCpu.w;
  const outH = outCpu.h;
  if (tryCpuOutputTiles && import.meta?.env?.DEV) {
    console.info('[FilmLab] Proxy CPU: full nominal output (VITE_FILMLAB_PROXY_OUTPUT_TILES parity)', {
      outW,
      outH,
      maxTex2d: outCpu.max2d,
      tilesTheoretical: tilesNeededCpu,
    });
  }
  if (!tryCpuOutputTiles && outCpu.fitted && import.meta?.env?.DEV) {
    console.warn('[FilmLab] Proxy CPU: output fitted to 2D texture limit (aligned with GPU)', {
      requestedW: outCpu.requestedW,
      requestedH: outCpu.requestedH,
      outW,
      outH,
      maxTex2d: outCpu.max2d,
    });
  }
  const output = new Uint8ClampedArray(outW * outH * 4);
  const tCpu0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0;
  const source = sourcePixels;
  const film = request.film || {};
  const adjustments = request.adjustments || {};
  const requestId = Number(request?.requestId) || 0;
  const isAdjusting = Boolean(adjustments?.isAdjusting);
  const interactionKind = String(adjustments?.interactionKind || 'idle');
  const dragIsHeavy =
    interactionKind === 'curve' ||
    interactionKind.startsWith('slider:mixer-') ||
    interactionKind.startsWith('slider:grade-') ||
    interactionKind.startsWith('slider:calibration-');
  const dragEffectScale = isAdjusting ? (dragIsHeavy ? 0.58 : 0.72) : 1;
  const userCurves = adjustments.userCurves || {};
  const profileCurves = film.curves || {};
  const curveLumaMix = resolveCurveLumaMix(adjustments?.curveLumaMix);
  const profileStrength = clampUnit((adjustments.strength ?? 100) / 100);
  const hasProfileLut =
    (state.profileLutSize > 1 &&
    state.profileLutData &&
    state.profileLutData.length >=
      state.profileLutSize * state.profileLutSize * state.profileLutSize * 3 &&
    profileStrength > 0.0001) ||
    (isAdjusting && state.profileLutData && state.profileLutSize > 1);
  const profileLutStatus = String(adjustments?.profileLutStatus ?? 'idle');
  const shouldBypassProfile =
    Boolean(film?.previewLutFile) && profileLutStatus === 'loading' && !hasProfileLut;
  const effectiveProfileStrength = shouldBypassProfile ? 0 : profileStrength;
  const profileLutStrength = effectiveProfileStrength;
  const profileNoLutBoost = hasProfileLut ? 1 : 1.05;
  const profileBalanceStrength = effectiveProfileStrength * 0.64 * profileNoLutBoost;
  if (isAdjusting && !hasProfileLut && effectiveProfileStrength > 0.01) {
    console.warn('[FilmLab] Profile LUT missing during interaction!', { 
      status: profileLutStatus, 
      hasData: !!state.profileLutData,
      size: state.profileLutSize
    });
  }
  const showClipping = Boolean(adjustments?.showClipping);
  const clippingHighlightThreshold = resolveHighlightClippingThreshold(adjustments);
  const clippingShadowThreshold = resolveShadowClippingThreshold(adjustments);
  const clippingShadowLumaGate = Math.max(
    CLIPPING_SHADOW_LUMA_FLOOR,
    clippingShadowThreshold * 2.2
  );

  const filmRgbLut = buildCurveLut(profileCurves.rgb);
  const filmRLut = buildCurveLut(profileCurves.r);
  const filmGLut = buildCurveLut(profileCurves.g);
  const filmBLut = buildCurveLut(profileCurves.b);
  const userRgbLut = buildCurveLut(userCurves.rgb);
  const userRLut = buildCurveLut(userCurves.r);
  const userGLut = buildCurveLut(userCurves.g);
  const userBLut = buildCurveLut(userCurves.b);

  const exposureEv =
    ((adjustments.exposure ?? 0) / 100) * 1.42 +
    ((film.exposure ?? 0) / 100) * 0.35 * effectiveProfileStrength;
  const exposureGain = Math.pow(2, mapFilmSafeExposureEv(exposureEv));
  const contrast =
    1 +
    ((adjustments.contrast ?? 0) / 100) * 0.28 +
    ((film.contrast ?? 0) / 100) * 0.42 * effectiveProfileStrength;
  const saturation =
    1 +
    ((adjustments.saturation ?? 0) / 100) * 0.35 +
    ((film.saturation ?? 0) / 100) * 0.9 * effectiveProfileStrength;
  const vibrance =
    ((adjustments.vibrance ?? 0) / 100) * 0.55 +
    ((film.vibrance ?? 0) / 100) * 0.9 * effectiveProfileStrength;
  const totalTemperature = clamp(
    (adjustments.temp ?? 0) + (film.temperature ?? 0) * profileBalanceStrength,
    -100,
    100
  );
  const totalTint = clamp(
    (adjustments.tint ?? 0) + (film.tint ?? 0) * profileBalanceStrength,
    -100,
    100
  );
  const wb = resolveWhiteBalanceGains(totalTemperature, totalTint);
  const highlights =
    ((adjustments.highlights ?? 0) / 100) * 0.3 +
    ((film.highlights ?? 0) / 100) * 0.2 * effectiveProfileStrength;
  const shadows =
    ((adjustments.shadows ?? 0) / 100) * 0.3 +
    ((film.shadows ?? 0) / 100) * 0.2 * effectiveProfileStrength;
  const whites =
    ((adjustments.whites ?? 0) / 100) * 0.3 +
    ((film.whites ?? 0) / 100) * 0.2 * effectiveProfileStrength;
  const blacks =
    ((adjustments.blacks ?? 0) / 100) * 0.3 +
    ((film.blacks ?? 0) / 100) * 0.2 * effectiveProfileStrength;
  const fadeAmount = clampUnit((adjustments.fade ?? 0) / 100);
  const dehaze =
    ((adjustments.dehaze ?? 0) / 100) * 0.32 +
    ((film.dehaze ?? 0) / 100) * 0.2 * effectiveProfileStrength;
  const clarity =
    ((adjustments.clarity ?? 0) / 100) * 0.4 +
    ((film.clarity ?? 0) / 100) * 0.22 * effectiveProfileStrength;
  const userGrain = clampUnit((adjustments.userGrain ?? 0) / 100);
  const userGrainSize = clampUnit((adjustments.userGrainSize ?? 10) / 100);
  const vignette = clampUnit((adjustments.userVignette ?? 0) / 100);
  const bloom = clampUnit((adjustments.bloom ?? 0) / 100);
  const chromAb = clampUnit((adjustments.chromAb ?? 0) / 100);
  const halation = clampUnit((adjustments.halation ?? 0) / 100);
  const halRadius = clampUnit(((adjustments.halRadius ?? 30) - 5) / 75);
  const halThreshold = clamp((adjustments.halThresh ?? 200) / 255, 0, 1);
  const halHue = clamp((adjustments.halHue ?? 0) / 100, -1, 1);
  const anamorph = clampUnit((adjustments.anamorph ?? 0) / 100);
  const streakLen = clampUnit((adjustments.streakLen ?? 50) / 100);
  const combinedContrast = clamp(
    contrast * (1 + dehaze * 0.16 + clarity * 0.12),
    0.62,
    1.62
  );
  const caShift = Math.round(chromAb * 2);
  const grainSeed = (requestId + 1) * 131.73;

  const sxRatio = sourceWidth / outW;
  const syRatio = sourceHeight / outH;
  const shouldAbort = () => {
    if (requestId !== state.activeRequestId) {
      return true;
    }
    const pendingRequestId = Number(state.pendingRequest?.requestId) || 0;
    return pendingRequestId > requestId;
  };

  const yieldEvery = getProxyCpuYieldEveryRowCount();
  for (let y = 0; y < outH; y += 1) {
    if (yieldEvery > 0 && y > 0 && y % yieldEvery === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if ((y & 3) === 0 && shouldAbort()) {
      return { aborted: true };
    }
    const sy = Math.min(sourceHeight - 1, Math.floor(y * syRatio));

    for (let x = 0; x < outW; x += 1) {
      const sx = Math.min(sourceWidth - 1, Math.floor(x * sxRatio));
      const sourceIndex = (sy * sourceWidth + sx) * 4;
      const targetIndex = (y * outW + x) * 4;

      let red = source[sourceIndex];
      let green = source[sourceIndex + 1];
      let blue = source[sourceIndex + 2];

      red *= exposureGain;
      green *= exposureGain;
      blue *= exposureGain;

      red *= wb.r;
      green *= wb.g;
      blue *= wb.b;

      [red, green, blue] = applyToneAdjustments(
        red,
        green,
        blue,
        highlights,
        shadows,
        whites,
        blacks
      );

      const filmStrength = effectiveProfileStrength;
      const redIndex = clamp(Math.round(red));
      const greenIndex = clamp(Math.round(green));
      const blueIndex = clamp(Math.round(blue));
      if (hasProfileLut) {
        const [lutRed, lutGreen, lutBlue] = sampleCubeLutRgb(
          state.profileLutSize,
          state.profileLutData,
          redIndex,
          greenIndex,
          blueIndex
        );
        red = redIndex * (1 - profileLutStrength) + lutRed * profileLutStrength;
        green = greenIndex * (1 - profileLutStrength) + lutGreen * profileLutStrength;
        blue = blueIndex * (1 - profileLutStrength) + lutBlue * profileLutStrength;
      } else {
        red = redIndex * (1 - filmStrength) + sampleCurveLut(filmRLut, redIndex) * filmStrength;
        green =
          greenIndex * (1 - filmStrength) +
          sampleCurveLut(filmGLut, greenIndex) * filmStrength;
        blue =
          blueIndex * (1 - filmStrength) +
          sampleCurveLut(filmBLut, blueIndex) * filmStrength;
      }

      if (!hasProfileLut && effectiveProfileStrength > 0) {
        const preLuma = clamp(Math.round(0.299 * red + 0.587 * green + 0.114 * blue));
        const filmLumaShift =
          (sampleCurveLut(filmRgbLut, preLuma) - preLuma) *
          effectiveProfileStrength *
          0.4;
        red += filmLumaShift;
        green += filmLumaShift;
        blue += filmLumaShift;
      }

      red = sampleCurveLut(userRLut, red);
      green = sampleCurveLut(userGLut, green);
      blue = sampleCurveLut(userBLut, blue);
      [red, green, blue] = applyRgbMasterCurve(red, green, blue, userRgbLut, curveLumaMix);

      red = ((red / 255 - 0.5) * combinedContrast + 0.5) * 255;
      green = ((green / 255 - 0.5) * combinedContrast + 0.5) * 255;
      blue = ((blue / 255 - 0.5) * combinedContrast + 0.5) * 255;

      const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
      let saturationMix = saturation;
      if (vibrance !== 0) {
        const maxChannel = Math.max(red, green, blue);
        const minChannel = Math.min(red, green, blue);
        const currentSat = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;
        saturationMix += vibrance * (1 - currentSat);
      }
      red = gray + (red - gray) * saturationMix;
      green = gray + (green - gray) * saturationMix;
      blue = gray + (blue - gray) * saturationMix;

      if (fadeAmount > 0) {
        const fadeLevel = fadeAmount * 54;
        red = red * (1 - fadeAmount * 0.16) + fadeLevel;
        green = green * (1 - fadeAmount * 0.16) + fadeLevel * 0.98;
        blue = blue * (1 - fadeAmount * 0.16) + fadeLevel * 0.94;
      }

      const radialX = (x / Math.max(1, outW - 1)) * 2 - 1;
      const radialY = (y / Math.max(1, outH - 1)) * 2 - 1;
      const radial = Math.sqrt(radialX * radialX + radialY * radialY);

      if (vignette > 0) {
        const vigMask = smoothstep(0.35, 1, radial) * vignette * 0.82;
        red *= 1 - vigMask;
        green *= 1 - vigMask;
        blue *= 1 - vigMask;
      }

      const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

      if (bloom > 0) {
        const bloomMask = smoothstep(0.63, 1, luminance) * bloom * 0.36 * dragEffectScale;
        red += bloomMask * 58;
        green += bloomMask * 48;
        blue += bloomMask * 52;
      }

      if (halation > 0 && luminance > halThreshold) {
        const hl =
          smoothstep(halThreshold, 1, luminance) *
          halation *
          (0.32 + halRadius * 0.24) *
          dragEffectScale;
        const redGain = 1 + Math.max(0, halHue) * 0.8;
        const blueGain = 1 + Math.max(0, -halHue) * 0.8;
        red += 48 * hl * redGain;
        green += 16 * hl;
        blue += 24 * hl * blueGain;
      }

      if (anamorph > 0) {
        const streakMask =
          smoothstep(0.66, 1, luminance) * anamorph * 0.22 * dragEffectScale;
        const horizontalPulse = Math.sin((x / Math.max(1, outW)) * Math.PI * (2 + streakLen * 4));
        const streak = Math.max(0, horizontalPulse) * streakMask;
        red += 14 * streak;
        green += 11 * streak;
        blue += 28 * streak;
      }

      if (userGrain > 0) {
        const envelope = clampUnit(4 * luminance * (1 - luminance));
        const grainScale = userGrain * (0.45 + userGrainSize * 0.55) * 18;
        const baseNoise = hashNoise(x, y, grainSeed) - 0.5;
        const noiseA = baseNoise;
        const noiseB = hashNoise(x + 97, y + 37, grainSeed) - 0.5;
        const noiseC = hashNoise(x + 191, y + 71, grainSeed) - 0.5;
        red += noiseA * grainScale * envelope * 0.82;
        green += noiseB * grainScale * envelope * 0.92;
        blue += noiseC * grainScale * envelope * 1.08;
      }

      if (caShift > 0) {
        const leftX = Math.max(0, sx - caShift);
        const rightX = Math.min(sourceWidth - 1, sx + caShift);
        const leftIndex = (sy * sourceWidth + leftX) * 4;
        const rightIndex = (sy * sourceWidth + rightX) * 4;
        red = red * 0.72 + source[leftIndex] * 0.28;
        blue = blue * 0.72 + source[rightIndex + 2] * 0.28;
      }

      if (showClipping) {
        const finalLuma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        if (
          red > clippingHighlightThreshold ||
          green > clippingHighlightThreshold ||
          blue > clippingHighlightThreshold
        ) {
          red = 255; green = 0; blue = 0;
        } else if (
          finalLuma <= clippingShadowLumaGate &&
          red < clippingShadowThreshold &&
          green < clippingShadowThreshold &&
          blue < clippingShadowThreshold
        ) {
          red = 0; green = 0; blue = 255;
        }
      }

      output[targetIndex] = clamp(Math.round(red));
      output[targetIndex + 1] = clamp(Math.round(green));
      output[targetIndex + 2] = clamp(Math.round(blue));
      output[targetIndex + 3] = 255;
    }
  }

  const tCpu1 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : tCpu0;
  return {
    width: outW,
    height: outH,
    pixels: output,
    cpuRenderMs: roundProxyWorkerRenderMs(tCpu1 - tCpu0),
    proxyWorkerProxyOutputFitted: outCpu.fitted,
    /** `true` gdy `VITE_FILMLAB_PROXY_OUTPUT_TILES` + >1 kafel @ max2D — bufor CPU = pełny nominal (parity z GPU). */
    proxyWorkerCpuFullNominalParity: Boolean(tryCpuOutputTiles),
    proxyWorkerProxyOutputRequestedW: outCpu.fitted ? outCpu.requestedW : null,
    proxyWorkerProxyOutputRequestedH: outCpu.fitted ? outCpu.requestedH : null,
    ...proxyOutputTileTelemetry(width, height, outCpu),
  };
}

function postFrame(request, frame, backend = 'cpu', proxyGpuImpl = null) {
  const gpuImplField =
    backend === 'gpu' && (proxyGpuImpl === 'webgpu' || proxyGpuImpl === 'webgl')
      ? { proxyGpuImpl }
      : {};
  const sourceTexField =
    backend === 'gpu' && proxyGpuImpl === 'webgpu'
      ? {
          proxyWorkerWebGpuSourceTexFormat: String(
            state.backend.gpuRenderer?.__proxySourceTexFormat ?? '',
          ) || null,
          proxyWorkerWebGpuLut3dTexFormat: String(
            state.backend.gpuRenderer?.__proxyLut3dTexFormat ?? '',
          ) || null,
        }
      : {};
  const wgpuReadbackField =
    backend === 'gpu' && proxyGpuImpl === 'webgpu'
      ? (() => {
          const rb = frame?.readbackRgba8;
          const as4 =
            rb != null && Number(rb.length) >= 4
              ? [rb[0], rb[1], rb[2], rb[3]]
              : null;
          return {
            proxyWorkerWebGpuReadbackRgba8: as4,
            proxyWorkerWebGpuReadbackChroma: frame?.readbackChroma != null ? String(frame.readbackChroma) : null,
          };
        })()
      : {};
  const webglLimitsField =
    backend === 'gpu' && proxyGpuImpl === 'webgl'
      ? {
          proxyWorkerWebGlMaxTex2d: state.backend.gpuRenderer?.__glMaxTexture2d ?? null,
          proxyWorkerWebGlMaxTex3d: state.backend.gpuRenderer?.__glMaxTexture3d ?? null,
          proxyWorkerWebGlRgba16fFbo: state.backend.gpuRenderer?.__webgl2Rgba16fFbo === true,
          proxyWorkerWebGlFbo16fBlit: state.backend.gpuRenderer?.__webgl2ProxyFboRgba16fBlit === true,
          proxyWorkerWebGl3dLutRgba16f: state.backend.gpuRenderer?.__webgl2Proxy3dLutRgba16f === true,
        }
      : {};
  const timingField = {
    proxyGpuRenderMs:
      backend === 'gpu' && typeof frame?.gpuRenderMs === 'number' && Number.isFinite(frame.gpuRenderMs)
        ? frame.gpuRenderMs
        : null,
    proxyCpuRenderMs:
      backend === 'cpu' && typeof frame?.cpuRenderMs === 'number' && Number.isFinite(frame.cpuRenderMs)
        ? frame.cpuRenderMs
        : null,
  };
  const gpuSourceTexField =
    backend === 'gpu' &&
    Number.isFinite(Number(frame?.proxyWorkerGpuTexW)) &&
    Number.isFinite(Number(frame?.proxyWorkerGpuTexH)) &&
    Number.isFinite(Number(frame?.proxyWorkerFullSourceW)) &&
    Number.isFinite(Number(frame?.proxyWorkerFullSourceH))
      ? {
          proxyWorkerGpuTexW: Math.floor(Number(frame.proxyWorkerGpuTexW)),
          proxyWorkerGpuTexH: Math.floor(Number(frame.proxyWorkerGpuTexH)),
          proxyWorkerFullSourceW: Math.floor(Number(frame.proxyWorkerFullSourceW)),
          proxyWorkerFullSourceH: Math.floor(Number(frame.proxyWorkerFullSourceH)),
          ...(frame?.proxyWorkerGpuInputDownscaleMs === null ||
          (typeof frame?.proxyWorkerGpuInputDownscaleMs === 'number' &&
            Number.isFinite(frame.proxyWorkerGpuInputDownscaleMs))
            ? {
                proxyWorkerGpuInputDownscaleMs:
                  frame.proxyWorkerGpuInputDownscaleMs === null
                    ? null
                    : roundProxyWorkerRenderMs(frame.proxyWorkerGpuInputDownscaleMs),
              }
            : {}),
        }
      : {};
  const outputFittedField = {
    proxyWorkerProxyOutputFitted: frame?.proxyWorkerProxyOutputFitted === true,
    ...(frame?.proxyWorkerProxyOutputFitted === true &&
    Number.isFinite(Number(frame?.proxyWorkerProxyOutputRequestedW)) &&
    Number.isFinite(Number(frame?.proxyWorkerProxyOutputRequestedH))
      ? {
          proxyWorkerProxyOutputRequestedW: Math.floor(Number(frame.proxyWorkerProxyOutputRequestedW)),
          proxyWorkerProxyOutputRequestedH: Math.floor(Number(frame.proxyWorkerProxyOutputRequestedH)),
        }
      : {}),
  };
  const normalizeNullableTileCount = (v) => {
    if (v == null) {
      return null;
    }
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const outputTileField = {
    proxyWorkerOutputTileCountNominal: normalizeNullableTileCount(frame?.proxyWorkerOutputTileCountNominal),
    proxyWorkerOutputTileCountTarget: normalizeNullableTileCount(frame?.proxyWorkerOutputTileCountTarget),
  };
  const cpuFullNominalParityField = {
    proxyWorkerCpuFullNominalParity:
      backend === 'cpu' && frame?.proxyWorkerCpuFullNominalParity === true,
  };

  if (isRenderableBitmap(frame?.bitmap)) {
    try {
      self.postMessage(
        {
          type: 'proxyFrame',
          requestId: request.requestId,
          sourceId: request.sourceId,
          backend,
          width: frame.width,
          height: frame.height,
          bitmap: frame.bitmap,
          ...gpuImplField,
          ...sourceTexField,
          ...wgpuReadbackField,
          ...webglLimitsField,
          ...timingField,
          ...gpuSourceTexField,
          ...outputFittedField,
          ...outputTileField,
          ...cpuFullNominalParityField,
        },
        [frame.bitmap]
      );
      return;
    } catch (error) {
      try {
        frame.bitmap?.close?.();
      } catch {
        /* noop */
      }
      if (import.meta?.env?.DEV) {
        console.warn(
          '[FilmLab] Failed to transfer frame bitmap to main thread, falling back:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  try {
    ensureCanvas(frame.width, frame.height);
    if (state.context && state.canvas) {
      const imageData = new ImageData(frame.pixels, frame.width, frame.height);
      state.context.putImageData(imageData, 0, 0);
      const bitmap = state.canvas.transferToImageBitmap();
      if (isRenderableBitmap(bitmap)) {
        self.postMessage(
          {
            type: 'proxyFrame',
            requestId: request.requestId,
            sourceId: request.sourceId,
            backend,
            width: frame.width,
            height: frame.height,
            bitmap,
            ...gpuImplField,
            ...sourceTexField,
            ...wgpuReadbackField,
            ...webglLimitsField,
            ...timingField,
            ...gpuSourceTexField,
            ...outputFittedField,
            ...outputTileField,
            ...cpuFullNominalParityField,
          },
          [bitmap]
        );
        return;
      }
    }
  } catch (error) {
    if (import.meta?.env?.DEV) {
      console.warn(
        '[FilmLab] OffscreenCanvas bitmap path failed, falling back to pixels:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (!(frame?.pixels instanceof Uint8ClampedArray) || !frame?.pixels?.byteLength) {
    self.postMessage({
      type: 'proxyFrameError',
      requestId: Number(request?.requestId) || 0,
      sourceId: Number(request?.sourceId) || 0,
      message: 'Frame payload missing pixels fallback.',
    });
    return;
  }

  self.postMessage(
    {
      type: 'proxyFrame',
      requestId: request.requestId,
      sourceId: request.sourceId,
      backend,
      width: frame.width,
      height: frame.height,
      pixels: frame.pixels.buffer,
      ...gpuImplField,
      ...sourceTexField,
      ...wgpuReadbackField,
      ...webglLimitsField,
      ...timingField,
      ...gpuSourceTexField,
      ...outputFittedField,
      ...outputTileField,
      ...cpuFullNominalParityField,
    },
    [frame.pixels.buffer]
  );
}

/**
 * Sonda WebGPU + opcjonalnie trwały `GPUDevice` (`__mlWgpu`).
 * `processPending` wykonuje `await webGpuWorkerBootPromise` gdy włączony jest
 * `VITE_FILMLAB_WEBGPU_PROXY` — dzięki temu `ensureGpuRenderer` widzi `__mlWgpu`
 * przed pierwszą klatką (bez top-level await w bundlowanym IIFE workera).
 */
async function bootstrapWorkerWebGpu() {
  try {
    const ap = await getOrProbeWebGpuAdapter();
    const dp = await getOrProbeWebGpuDevice();
    self.postMessage({
      type: 'webgpuWorkerProbe',
      webGpuApi: ap.api,
      webGpuAdapter: ap.adapter,
      webGpuAdapterInfo: ap.adapterInfo,
      webGpuDevice: dp,
    });
    if (readEnvFlag(import.meta?.env?.VITE_FILMLAB_WEBGPU_PROXY) && ap.api.exposed) {
      try {
        await tryAttachPersistentWebGpu();
      } catch {
        // brak trwałego device — `ensureGpuRenderer` użyje WebGL2
      }
    }
  } catch (e) {
    self.postMessage({
      type: 'webgpuWorkerProbe',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

const webGpuWorkerBootPromise = bootstrapWorkerWebGpu();

function scheduleProcessPending() {
  if (state.pendingScheduled) {
    return;
  }
  state.pendingScheduled = true;
  const run = () => {
    state.pendingScheduled = false;
    processPending();
  };
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run);
    return;
  }
  setTimeout(run, 0);
}

function processPending() {
  if (state.busy || !state.pendingRequest) {
    return;
  }

  state.busy = true;
  const request = state.pendingRequest;
  state.pendingRequest = null;
  state.activeRequestId = Number(request?.requestId) || 0;

  void (async () => {
    try {
      if (webGpuProxyBuildFlag()) {
        await webGpuWorkerBootPromise;
      }

      let frame = null;
      let backend = 'cpu';

      if (shouldAttemptGpu(request)) {
        try {
          frame = await renderProxyFrameGpu(request);
          backend = frame ? 'gpu' : 'cpu';
        } catch (error) {
          setGpuFailure(error instanceof Error ? error.message : 'GPU render error.');
        }
      }

      if (!frame) {
        frame = await renderProxyFrame(request);
        backend = 'cpu';
      }

      if (frame?.aborted) {
        // A newer request arrived while this frame was computing.
        // Skip presenting stale output and immediately continue.
        return;
      }

      if (frame) {
        const gpb = state.backend.gpuRenderer?.__gpuBackend;
        const proxyGpuImpl =
          backend === 'gpu' ? (gpb === 'webgpu' || gpb === 'webgl' ? gpb : 'webgl') : null;
        postFrame(request, frame, backend, proxyGpuImpl);
      } else {
        self.postMessage({
          type: 'proxyFrameError',
          requestId: request.requestId,
          sourceId: request.sourceId,
          message: 'Missing source frame.',
        });
      }
    } catch (error) {
      self.postMessage({
        type: 'proxyFrameError',
        requestId: request.requestId,
        sourceId: request.sourceId,
        message: error instanceof Error ? error.message : 'Proxy render failed.',
      });
    } finally {
      state.busy = false;
      if (state.pendingRequest) {
        scheduleProcessPending();
      }
    }
  })();
}

self.onmessage = (event) => {
  const message = event?.data ?? {};

  if (message.type === 'configure') {
    state.gpuSourceOverrideCache = null;
    const enableGpu = Boolean(message.enableGpu);
    const preferred = message.preferredBackend === 'gpu' ? 'gpu' : 'cpu';
    const forceCpuFallback = Boolean(message.forceCpuFallback);
    state.backend.gpuEnabled = enableGpu;
    state.backend.preferred = preferred;
    state.backend.forceCpuFallback = forceCpuFallback;
    state.backend.gpuFailed = false;
    state.backend.gpuFailureReason = '';
    state.backend.webGpuUnusable = false;
    if ((!enableGpu || preferred !== 'gpu' || forceCpuFallback) && state.backend.gpuRenderer) {
      try {
        state.backend.gpuRenderer.destroy();
      } catch (_error) {
        // noop
      }
      state.backend.gpuRenderer = null;
    }
    const gpuRuntimeEnabled = enableGpu && preferred === 'gpu' && !forceCpuFallback;
    self.postMessage({
      type: 'proxyBackendStatus',
      backend: 'gpu',
      status: gpuRuntimeEnabled ? 'enabled' : 'disabled',
      reason: !enableGpu
        ? 'feature-flag-off'
        : forceCpuFallback
          ? 'forced-cpu-fallback'
          : `preferred:${preferred}`,
    });
    if (gpuRuntimeEnabled && webGpuProxyBuildFlag()) {
      void tryAttachPersistentWebGpu();
    }
    return;
  }

  if (message.type === 'reinitWebGpu') {
    if (
      !webGpuProxyBuildFlag() ||
      !state.backend.gpuEnabled ||
      state.backend.preferred !== 'gpu' ||
      state.backend.forceCpuFallback
    ) {
      return;
    }
    state.gpuSourceOverrideCache = null;
    void tryAttachPersistentWebGpu().then((ok) => {
      if (ok) {
        self.postMessage({ type: 'proxyWebGpuReinitOk' });
        return;
      }
      self.postMessage({
        type: 'proxyWebGpuReinitFailed',
        message: 'Nie udało się ponownie utworzyć GPUDevice (pozostaje WebGL2 / CPU).',
      });
    });
    return;
  }

  if (message.type === 'setSource') {
    state.gpuSourceOverrideCache = null;
    state.sourceId = Number(message.sourceId) || 0;
    state.sourceWidth = Number(message.width) || 0;
    state.sourceHeight = Number(message.height) || 0;
    state.proxyMax = Number(message.proxyMax) || DEFAULT_PROXY_MAX;
    const nextPixels =
      message.pixels instanceof Uint8ClampedArray
        ? message.pixels
        : new Uint8ClampedArray(message.pixels || 0);
    const expectedLength = expectedPixelLength(state.sourceWidth, state.sourceHeight);
    if (!state.sourceWidth || !state.sourceHeight || nextPixels.length !== expectedLength) {
      state.sourcePixels = null;
      self.postMessage({
        type: 'proxyFrameError',
        requestId: 0,
        sourceId: state.sourceId,
        message: `Source pixel payload mismatch: expected ${expectedLength}, got ${nextPixels.length} (source=${state.sourceWidth}x${state.sourceHeight}).`,
      });
      return;
    }
    state.sourcePixels = nextPixels;
    self.postMessage({
      type: 'sourceReady',
      sourceId: state.sourceId,
      width: state.sourceWidth,
      height: state.sourceHeight,
    });
    return;
  }

  if (message.type === 'clearSource') {
    state.gpuSourceOverrideCache = null;
    state.sourceId = 0;
    state.sourceWidth = 0;
    state.sourceHeight = 0;
    state.sourcePixels = null;
    state.profileLutSize = 0;
    state.profileLutData = null;
    state.activeRequestId = 0;
    state.pendingRequest = null;
    return;
  }

  if (message.type === 'setProfileLut') {
    if (!message.lutData) {
      state.profileLutSize = 0;
      state.profileLutData = null;
      return;
    }
    const normalizedSize = Math.round(Number(message.lutSize) || 0);
    const normalizedData =
      message.lutData instanceof Uint8Array
        ? message.lutData
        : new Uint8Array(message.lutData);
    const expectedLength = expectedCubeLutRgbByteLength(normalizedSize);
    if (expectedLength == null || normalizedData.length !== expectedLength) {
      state.profileLutSize = 0;
      state.profileLutData = null;
      self.postMessage({
        type: 'proxyFrameError',
        requestId: 0,
        sourceId: state.sourceId,
        message:
          expectedLength == null
            ? `Profile LUT size out of range: size=${normalizedSize}.`
            : `Profile LUT payload mismatch: expected ${expectedLength}, got ${normalizedData.length} (size=${normalizedSize}).`,
      });
      return;
    }
    state.profileLutSize = normalizedSize;
    state.profileLutData = normalizedData;
    return;
  }

  if (message.type === 'clearProfileLut') {
    state.profileLutSize = 0;
    state.profileLutData = null;
    return;
  }

  if (message.type === 'renderProxy') {
    if (!state.sourcePixels || Number(message.sourceId) !== state.sourceId) {
      self.postMessage({
        type: 'proxyFrameError',
        requestId: Number(message.requestId) || 0,
        sourceId: Number(message.sourceId) || 0,
        message: 'Source mismatch.',
      });
      return;
    }

    state.pendingRequest = {
      requestId: Number(message.requestId) || 0,
      sourceId: Number(message.sourceId) || 0,
      proxyMax: Number(message.proxyMax) || state.proxyMax,
      film: message.film || {},
      adjustments: message.adjustments || {},
    };
    scheduleProcessPending();
    return;
  }

  if (message.type === 'generateLutCube') {
    const size = 33;
    const film = message.film || {};
    const adjustments = message.adjustments || {};
    const curveLumaMix = resolveCurveLumaMix(adjustments?.curveLumaMix);
    
    // Preparation
    const profileStrength = clampUnit((adjustments.strength ?? 100) / 100);
    const profileLutStatus = String(adjustments.profileLutStatus ?? 'idle');
    const shouldBypassProfile = Boolean(film.previewLutFile) && profileLutStatus === 'loading';
    const effectiveProfileStrength = shouldBypassProfile ? 0 : profileStrength;
    const profileLutStrength = effectiveProfileStrength;
    const hasProfileLut = state.profileLutSize > 1 && state.profileLutData;
    const profileNoLutBoost = hasProfileLut ? 1 : 1.05;
    const profileBalanceStrength = effectiveProfileStrength * 0.64 * profileNoLutBoost;

    const filmRgbLut = buildCurveLut(film.curves?.rgb);
    const filmRLut = buildCurveLut(film.curves?.r);
    const filmGLut = buildCurveLut(film.curves?.g);
    const filmBLut = buildCurveLut(film.curves?.b);
    const userRgbLut = buildCurveLut(adjustments.userCurves?.rgb);
    const userRLut = buildCurveLut(adjustments.userCurves?.r);
    const userGLut = buildCurveLut(adjustments.userCurves?.g);
    const userBLut = buildCurveLut(adjustments.userCurves?.b);

    const exposureEv = ((adjustments.exposure ?? 0) / 100) * 1.42 + ((film.exposure ?? 0) / 100) * 0.35 * effectiveProfileStrength;
    const exposureGain = Math.pow(2, mapFilmSafeExposureEv(exposureEv));
    const contrast = 1 + ((adjustments.contrast ?? 0) / 100) * 0.28 + ((film.contrast ?? 0) / 100) * 0.25 * effectiveProfileStrength;
    const saturation = 1 + ((adjustments.saturation ?? 0) / 100) * 0.35 + ((film.saturation ?? 0) / 100) * 0.2 * effectiveProfileStrength;
    const vibrance = ((adjustments.vibrance ?? 0) / 100) * 0.55 + ((film.vibrance ?? 0) / 100) * 0.28 * effectiveProfileStrength;
    const totalTemperature = clamp(
      (adjustments.temp ?? 0) + (film.temperature ?? 0) * profileBalanceStrength,
      -100,
      100
    );
    const totalTint = clamp(
      (adjustments.tint ?? 0) + (film.tint ?? 0) * profileBalanceStrength,
      -100,
      100
    );
    const wb = resolveWhiteBalanceGains(totalTemperature, totalTint);
    
    const highlights = ((adjustments.highlights ?? 0) / 100) * 0.3 + ((film.highlights ?? 0) / 100) * 0.2 * effectiveProfileStrength;
    const shadows = ((adjustments.shadows ?? 0) / 100) * 0.3 + ((film.shadows ?? 0) / 100) * 0.2 * effectiveProfileStrength;
    const whites = ((adjustments.whites ?? 0) / 100) * 0.3 + ((film.whites ?? 0) / 100) * 0.2 * effectiveProfileStrength;
    const blacks = ((adjustments.blacks ?? 0) / 100) * 0.3 + ((film.blacks ?? 0) / 100) * 0.2 * effectiveProfileStrength;
    
    const fadeAmount = clampUnit((adjustments.fade ?? 0) / 100);
    const dehaze = ((adjustments.dehaze ?? 0) / 100) * 0.32 + ((film.dehaze ?? 0) / 100) * 0.2 * effectiveProfileStrength;
    const clarity = ((adjustments.clarity ?? 0) / 100) * 0.4 + ((film.clarity ?? 0) / 100) * 0.22 * effectiveProfileStrength;
    const combinedContrast = clamp(contrast * (1 + dehaze * 0.16 + clarity * 0.12), 0.62, 1.62);

    let lutString = `TITLE "Film-Lab Custom Export"\nLUT_3D_SIZE ${size}\n`;

    for (let bIndex = 0; bIndex < size; bIndex++) {
      for (let gIndex = 0; gIndex < size; gIndex++) {
        for (let rIndex = 0; rIndex < size; rIndex++) {
          
          let red = (rIndex / (size - 1)) * 255;
          let green = (gIndex / (size - 1)) * 255;
          let blue = (bIndex / (size - 1)) * 255;

          red *= exposureGain;
          green *= exposureGain;
          blue *= exposureGain;

          red *= wb.r;
          green *= wb.g;
          blue *= wb.b;

          [red, green, blue] = applyToneAdjustments(red, green, blue, highlights, shadows, whites, blacks);

          const filmStrength = effectiveProfileStrength;
          const rRnd = clamp(Math.round(red));
          const gRnd = clamp(Math.round(green));
          const bRnd = clamp(Math.round(blue));
          
          if (hasProfileLut) {
            const [lutRed, lutGreen, lutBlue] = sampleCubeLutRgb(state.profileLutSize, state.profileLutData, rRnd, gRnd, bRnd);
            red = rRnd * (1 - profileLutStrength) + lutRed * profileLutStrength;
            green = gRnd * (1 - profileLutStrength) + lutGreen * profileLutStrength;
            blue = bRnd * (1 - profileLutStrength) + lutBlue * profileLutStrength;
          } else {
            red = rRnd * (1 - filmStrength) + sampleCurveLut(filmRLut, rRnd) * filmStrength;
            green = gRnd * (1 - filmStrength) + sampleCurveLut(filmGLut, gRnd) * filmStrength;
            blue = bRnd * (1 - filmStrength) + sampleCurveLut(filmBLut, bRnd) * filmStrength;
          }

          if (!hasProfileLut && effectiveProfileStrength > 0) {
            const preLuma = clamp(Math.round(0.299 * red + 0.587 * green + 0.114 * blue));
            const filmLumaShift =
              (sampleCurveLut(filmRgbLut, preLuma) - preLuma) *
              effectiveProfileStrength *
              0.4;
            red += filmLumaShift;
            green += filmLumaShift;
            blue += filmLumaShift;
          }

          red = sampleCurveLut(userRLut, red);
          green = sampleCurveLut(userGLut, green);
          blue = sampleCurveLut(userBLut, blue);
          [red, green, blue] = applyRgbMasterCurve(red, green, blue, userRgbLut, curveLumaMix);

          red = ((red / 255 - 0.5) * combinedContrast + 0.5) * 255;
          green = ((green / 255 - 0.5) * combinedContrast + 0.5) * 255;
          blue = ((blue / 255 - 0.5) * combinedContrast + 0.5) * 255;

          const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
          let saturationMix = saturation;
          if (vibrance !== 0) {
            const maxChannel = Math.max(red, green, blue);
            const minChannel = Math.min(red, green, blue);
            const currentSat = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;
            saturationMix += vibrance * (1 - currentSat);
          }
          red = gray + (red - gray) * saturationMix;
          green = gray + (green - gray) * saturationMix;
          blue = gray + (blue - gray) * saturationMix;

          if (fadeAmount > 0) {
            const fadeLevel = fadeAmount * 54;
            red = red * (1 - fadeAmount * 0.16) + fadeLevel;
            green = green * (1 - fadeAmount * 0.16) + fadeLevel * 0.98;
            blue = blue * (1 - fadeAmount * 0.16) + fadeLevel * 0.94;
          }

          red = clamp(red) / 255.0;
          green = clamp(green) / 255.0;
          blue = clamp(blue) / 255.0;

          lutString += `${red.toFixed(6)} ${green.toFixed(6)} ${blue.toFixed(6)}\n`;
        }
      }
    }

    self.postMessage({
      type: 'proxyLutCubeReady',
      requestId: Number(message.requestId) || 0,
      lutString: lutString
    });
    return;
  }
};
