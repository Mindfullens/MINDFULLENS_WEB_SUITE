import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getOrCreatePersistentWebGpuDevice,
  getOrProbeWebGpuAdapter,
  getOrProbeWebGpuDevice,
  getWebGpuApiExposure,
} from './webGpuEnvironment.js';
import { ingestUploadSource } from './pipeline/ingestSource.js';
import { createIdlePipelineInfo, PIPELINE_KIND, PIPELINE_STATUS } from './pipeline/constants.js';
import { disposeRawPipeline } from './pipeline/raw/rawPipelineController.js';
import { createFastPreviewRenderer } from './preview/fastPreviewRenderer.js';
import {
  getSharedArrayBufferHostSnapshot,
  isEnvCpuPreviewMatchNominal,
  isEnvE2eHostSchedRaf,
  isEnvMainPreviewWebGpuAb,
  readEnvFlag,
} from '../filmLab/runtimeEnv.js';
import {
  mapCalibrationStateForResponse,
  mapColorGradeStateForResponse,
  mapHslStateForResponse,
  mapSignedSliderForResponse,
  mapUnsignedSliderForResponse,
} from './sliderResponseMap.js';
import {
  DUST_OVERLAY_FILES,
  FILMSTRIP_OVERLAY_FILES,
  RAW_LEAK_OVERLAY_FILES,
} from './overlayManifest.js';
import { buildCurveLut, sampleCurveLut as sampleSharedCurveLut } from './curveInterpolation.js';
import { resolveWhiteBalanceGains } from './whiteBalance.js';
import {
  CLIPPING_HIGHLIGHT_THRESHOLD,
  CLIPPING_SHADOW_THRESHOLD,
  CLIPPING_MIN_HIGHLIGHT_THRESHOLD,
  CLIPPING_MIN_SHADOW_THRESHOLD,
  CLIPPING_MAX_SHADOW_THRESHOLD,
  CLIPPING_SHADOW_LUMA_FLOOR,
  clamp,
  clampUnit,
  rgbRec709LumaUnit,
  smoothstep,
  resolveCurveLumaMix,
  mix,
  rgbToYCbCr,
  yCbCrToRgb,
  applyToneAdjustments,
  mapFilmSafeExposureEv,
} from './colorMathShared.js';
import { validateCubeLutSrgbForWorkerTransfer } from './lut/cubeLutPayload.js';
import { FAST_PREVIEW_MAIN_THREAD_SOURCE_TEX_FORMAT } from './preview/fastPreviewConstants.js';
import { getNominalProxyRenderSize } from './proxyComputeSize.js';
import { buildProxyWebGpuUBlockFloat32 } from './proxyWebGpuUniformBlock.js';
import {
  downscaleSourceCanvasRgba8ForWebGpuHostProbe,
  FILM_LAB_MAIN_THREAD_WEBGPU_PREVIEW_STATUS,
  MAIN_THREAD_HOST_WGPU_SOURCE_MAX_EDGE,
  probeMainThreadWebGpuHostSourceRgba8ProxyPass,
  probeMainThreadWebGpuPreview,
  renderMainThreadWebGpuHostSourceRgba8ToCanvas,
} from '../filmLab/filmLabMainThreadWebGpuPreview.js';
import {
  clearFilmLabE2ePointerMark,
  computePreviewE2ePointerToPresentMs,
  getFilmLabE2eKeyboardSession,
  getFilmLabE2ePointerAuxSession,
  setFilmLabE2eKeyboardSession,
  setFilmLabE2ePointerAuxSession,
} from '../filmLab/previewE2ePointerMark.js';
import {
  getPreviewE2eFrameCostGateInfo,
  PREVIEW_E2E_FRAME_COST_TARGET_MS,
  PREVIEW_E2E_KPI_TARGET_MS,
} from '../filmLab/rolloutGate.js';
import {
  combineLocalMaskGraphWeights,
  normalizeLocalMaskGraphOp,
} from '../filmLab/localMaskGraph.js';
import { applyRecipeLayerToneRgb } from '../filmLab/recipeLayerBlendApply.js';
import {
  applyRetouchHealBoxBlurPass,
  computeRetouchMaskWeightAtPixel,
} from './filmLabRetouchPreviewPass.js';
import { applyCmykSoftProofApproxToRgba } from './filmLabCmykSoftProofApprox.js';
import { inferDepthProxyBufferFromImageData } from '../filmLab/depth/filmLabDepthOnnxInference.js';
import {
  getDepthOnnxIdleCallbackTimeoutMs,
  scheduleDepthOnnxInferOnIdle,
} from '../filmLab/depth/filmLabDepthOnnxHostSchedule.js';
import { computeLocalMaskWeightAtPixel } from './filmLabLocalMaskRangeMath.js';
import { applyExposureGainWithShoulder } from './filmLabExposureGainShoulder.js';
import { resolveRuntimeTier } from '../filmLab/runtimeTier.js';
import { applyAdjustmentBindingsForTonePipeline } from '../filmLab/maskAdjustmentBindingApply.js';
import { encodeFlatSnapshotToRecipeDocument } from '../filmLab/recipe/filmLabRecipeCodec.js';
import { fingerprintRecipeDocumentStable } from '../filmLab/recipe/filmLabRecipeFingerprint.js';
import { SERVICE_BUILD_LABEL, SERVICE_BUILD_TAG, VIEWPORT_BUILD_MARKER } from '../filmLab/buildInfo.js';
import { buildFilmLabExportManifestArtifactRow } from './filmLabExportManifestArtifact.js';
import {
  manifestLossyQualityForFilmLabExport,
  normalizeFilmLabExportFileFormat,
} from './filmLabExportFormats.js';
import { applyOutputSharpening } from './outputSharpening.js';
import {
  attachFilmLabExportManifestDigest,
  buildFilmLabExportManifestRootBase,
} from './filmLabExportManifestHelpers.js';
import { activeCropRectNormFromAdjustments, recomputeAiAssistMasksHeuristic } from '../filmLab/adaptivePresetV1.js';

function readPreviewE2ePointerContext(isAdjustingRef, isPanningRef) {
  return (
    Boolean(isAdjustingRef?.current) ||
    Boolean(isPanningRef?.current) ||
    getFilmLabE2ePointerAuxSession() ||
    getFilmLabE2eKeyboardSession()
  );
}

function takePreviewE2ePointerToPresentMs(isAdjustingRef, isPanningRef) {
  const ms = computePreviewE2ePointerToPresentMs(
    readPreviewE2ePointerContext(isAdjustingRef, isPanningRef)
  );
  if (getFilmLabE2eKeyboardSession()) {
    setFilmLabE2eKeyboardSession(false);
  }
  return ms;
}

function takePreviewE2eHostSchedToRafMs(t0Ref) {
  if (!t0Ref || t0Ref.current == null || !Number.isFinite(t0Ref.current)) {
    return null;
  }
  const t0 = t0Ref.current;
  t0Ref.current = null;
  return roundTimingMs(nowMs() - t0);
}

const PREVIEW_E2E_MEDIAN_WINDOW = 31;
const MAIN_PREVIEW_AB_ROLLOUT_WARMUP_FRAMES = 10;
const MAIN_PREVIEW_AB_ROLLOUT_FALLBACK_WARN_THRESHOLD = 0.2;

function computeMainPreviewAbRolloutHealth(totalFrames, fallbackFrames) {
  const total = Number(totalFrames);
  if (!Number.isFinite(total) || total <= 0) {
    return { state: 'n/a', fallbackRate: null, totalFrames: 0 };
  }
  const totalInt = Math.max(0, Math.floor(total));
  if (totalInt < MAIN_PREVIEW_AB_ROLLOUT_WARMUP_FRAMES) {
    return { state: 'insufficient-data', fallbackRate: null, totalFrames: totalInt };
  }
  const fallback = Number.isFinite(Number(fallbackFrames)) ? Number(fallbackFrames) : 0;
  const fallbackInt = Math.max(0, Math.floor(fallback));
  const fallbackRate = Number((fallbackInt / totalInt).toFixed(4));
  return {
    state:
      fallbackRate <= MAIN_PREVIEW_AB_ROLLOUT_FALLBACK_WARN_THRESHOLD
        ? 'ok'
        : 'warn',
    fallbackRate,
    totalFrames: totalInt,
  };
}

function buildE2ePathStatsSnapshot(samplesByPathRef) {
  if (!samplesByPathRef || !(samplesByPathRef.current instanceof Map)) {
    return null;
  }
  const out = {};
  for (const [path, arr] of samplesByPathRef.current.entries()) {
    if (!Array.isArray(arr) || !arr.length) {
      continue;
    }
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMs =
      sorted.length % 2 === 0
        ? roundTimingMs((sorted[mid - 1] + sorted[mid]) / 2)
        : roundTimingMs(sorted[mid]);
    out[String(path)] = {
      medianMs,
      count: sorted.length,
      kpiState: medianMs <= PREVIEW_E2E_KPI_TARGET_MS ? 'ok' : 'warn',
    };
  }
  return Object.keys(out).length ? out : null;
}

function computeE2ePathMedianSnapshot(samplesByPathRef, path, sampleMs) {
  if (!samplesByPathRef || !path || !Number.isFinite(Number(sampleMs))) {
    return { medianMs: null, kpiState: 'n/a', pathStats: buildE2ePathStatsSnapshot(samplesByPathRef) };
  }
  const key = String(path);
  const prev = samplesByPathRef.current.get(key);
  const next = Array.isArray(prev) ? prev.slice() : [];
  next.push(Number(sampleMs));
  while (next.length > PREVIEW_E2E_MEDIAN_WINDOW) {
    next.shift();
  }
  samplesByPathRef.current.set(key, next);
  const sorted = next.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? roundTimingMs((sorted[mid - 1] + sorted[mid]) / 2)
      : roundTimingMs(sorted[mid]);
  const kpiState = medianMs <= PREVIEW_E2E_KPI_TARGET_MS ? 'ok' : 'warn';
  return { medianMs, kpiState, pathStats: buildE2ePathStatsSnapshot(samplesByPathRef) };
}

function buildE2eFrameCostPathStatsSnapshot(samplesByPathRef) {
  if (!samplesByPathRef || !(samplesByPathRef.current instanceof Map)) {
    return null;
  }
  const out = {};
  for (const [path, arr] of samplesByPathRef.current.entries()) {
    if (!Array.isArray(arr) || !arr.length) {
      continue;
    }
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMs =
      sorted.length % 2 === 0
        ? roundTimingMs((sorted[mid - 1] + sorted[mid]) / 2)
        : roundTimingMs(sorted[mid]);
    out[String(path)] = {
      medianMs,
      count: sorted.length,
      kpiState: medianMs <= PREVIEW_E2E_FRAME_COST_TARGET_MS ? 'ok' : 'warn',
    };
  }
  return Object.keys(out).length ? out : null;
}

function computeE2eFrameCostMedianSnapshot(samplesByPathRef, path, frameCostMs) {
  if (!samplesByPathRef || !path || !Number.isFinite(Number(frameCostMs))) {
    return {
      medianMs: null,
      kpiState: 'n/a',
      pathStats: buildE2eFrameCostPathStatsSnapshot(samplesByPathRef),
    };
  }
  const key = String(path);
  const prev = samplesByPathRef.current.get(key);
  const next = Array.isArray(prev) ? prev.slice() : [];
  next.push(Number(frameCostMs));
  while (next.length > PREVIEW_E2E_MEDIAN_WINDOW) {
    next.shift();
  }
  samplesByPathRef.current.set(key, next);
  const sorted = next.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? roundTimingMs((sorted[mid - 1] + sorted[mid]) / 2)
      : roundTimingMs(sorted[mid]);
  const kpiState = medianMs <= PREVIEW_E2E_FRAME_COST_TARGET_MS ? 'ok' : 'warn';
  return { medianMs, kpiState, pathStats: buildE2eFrameCostPathStatsSnapshot(samplesByPathRef) };
}

function withPreviewE2eFrameCostGate(nextState) {
  const g = getPreviewE2eFrameCostGateInfo(nextState);
  return {
    ...nextState,
    previewE2eFrameCostGateDecision: g.decision,
    previewE2eFrameCostGateReady: g.isReady,
    previewE2eFrameCostGateSummary: g.exportSummary,
  };
}
// Export-only modules: loaded lazily on first export to keep the preview pipeline fast.
// import { processBatch as runBatch } from './batchProcessor.js';
// import piexif from 'piexifjs';

const IDENTITY_CURVES = {
  rgb: [
    [0, 0],
    [255, 255],
  ],
  r: [
    [0, 0],
    [255, 255],
  ],
  g: [
    [0, 0],
    [255, 255],
  ],
  b: [
    [0, 0],
    [255, 255],
  ],
};

const HUE_SECTORS = [
  { id: 'red', center: 0, spread: 42 },
  { id: 'orange', center: 32, spread: 28 },
  { id: 'yellow', center: 58, spread: 26 },
  { id: 'green', center: 118, spread: 40 },
  { id: 'aqua', center: 182, spread: 32 },
  { id: 'blue', center: 232, spread: 36 },
  { id: 'purple', center: 278, spread: 24 },
  { id: 'magenta', center: 318, spread: 26 },
];

const USER_RESPONSE_SCALE = Object.freeze({
  exposure: 1.42,
  contrast: 0.28,
  saturation: 0.35,
  vibrance: 0.55,
  temp: 0.286,
  tint: 0.286,
  highlights: 0.3,
  shadows: 0.3,
  whites: 0.3,
  blacks: 0.3,
  dehaze: 0.32,
  clarity: 0.4,
  fade: 0.5,
  mixer: 0.48,
  grading: 0.62,
  calibration: 0.42,
});

const USER_CURVE_LUT_RESOLUTION = 4096;

const cubeLutCache = new Map();
const cubeLutInflight = new Map();
const overlayImageCache = new Map();
const fastLookLutCache = new Map();
const MIN_SUPPORTED_LUT_SIZE = 8;
const FAST_LOOK_LUT_SIZE = 17;
const FAST_LOOK_LUT_CACHE_LIMIT = 20;
const OVERLAY_CACHE_BUSTER = '20260410c';
const overlayBasePath =
  typeof import.meta !== 'undefined' && import.meta?.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : '/';

function shouldDefaultProxyForceCpuFallback() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const userAgent = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  return /Mac|iPhone|iPad|iPod/i.test(`${userAgent} ${platform}`);
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function roundTimingMs(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value * 10) / 10);
}

/** Czas od ostatniego wejścia w `scheduleProgressiveRender` do bieżącej prezentacji (warstwa harmonogramu → canvas). */
function computePreviewE2eIntentToPresentMs(intentT0Ref) {
  if (!intentT0Ref || typeof intentT0Ref !== 'object') {
    return null;
  }
  const t0 = intentT0Ref.current;
  if (t0 == null || !Number.isFinite(t0)) {
    return null;
  }
  return roundTimingMs(nowMs() - t0);
}

/** Czas od rozpoczęcia interakcji (pierwsze `isAdjusting` po idle) do prezentacji — tylko gdy w momencie zapisu na canvas użytkownik nadal jest w trybie `isAdjusting`. */
function computePreviewE2eDragToPresentMs(dragT0Ref, isAdjusting) {
  if (!isAdjusting || !dragT0Ref || typeof dragT0Ref !== 'object') {
    return null;
  }
  const t0 = dragT0Ref.current;
  if (t0 == null || !Number.isFinite(t0)) {
    return null;
  }
  return roundTimingMs(nowMs() - t0);
}

function normalizeUnknownError(error, fallbackMessage = 'Nieznany błąd') {
  if (error instanceof Error) {
    return error.message || fallbackMessage;
  }
  if (error && typeof error === 'object') {
    const eventType = typeof error.type === 'string' ? error.type : null;
    const trusted = typeof error.isTrusted === 'boolean' ? ` isTrusted=${error.isTrusted}` : '';
    if (eventType) {
      return `Event error: ${eventType}.${trusted}`;
    }
  }
  const serialized = String(error ?? '').trim();
  return serialized.length > 0 ? serialized : fallbackMessage;
}

function resolveHighlightClippingThreshold(adjustments) {
  const positiveExposure = Math.max(0, Number(adjustments?.exposure ?? 0));
  const positiveHighlights = Math.max(0, Number(adjustments?.highlights ?? 0));
  const positiveWhites = Math.max(0, Number(adjustments?.whites ?? 0));
  const responseBias =
    positiveExposure * 0.45 + positiveHighlights * 0.4 + positiveWhites * 0.55;

  return clamp(
    Math.round(CLIPPING_HIGHLIGHT_THRESHOLD - responseBias),
    CLIPPING_MIN_HIGHLIGHT_THRESHOLD,
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
    CLIPPING_MIN_SHADOW_THRESHOLD,
    CLIPPING_MAX_SHADOW_THRESHOLD
  );
}

const ENABLE_WORKER_DRAG_PREVIEW = readEnvFlag(
  import.meta?.env?.VITE_FILMLAB_WORKER_DRAG,
  true
);

const ENABLE_WORKER_PROXY_GPU = readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_GPU, false);
const ENABLE_WORKER_WEBGPU_PROXY = readEnvFlag(import.meta?.env?.VITE_FILMLAB_WEBGPU_PROXY, false);
const ENABLE_MAIN_PREVIEW_WEBGPU_AB = isEnvMainPreviewWebGpuAb();
const FORCE_WORKER_PROXY_CPU_FALLBACK = readEnvFlag(
  import.meta?.env?.VITE_FILMLAB_PROXY_FORCE_CPU,
  shouldDefaultProxyForceCpuFallback()
);
/** Gdy włączone: `proxyMax` workera min. tyle co dłuższa krawędź bufora preview — brak drugiego downscale względem CPU (koszt: wyższy render przy drag). */
const PROXY_MATCH_PREVIEW_BUFFER = readEnvFlag(
  import.meta?.env?.VITE_FILMLAB_PROXY_MATCH_PREVIEW,
  false
);
const PRESERVE_FULL_EFFECT_STACK_DURING_ADJUST = true;

function parseCubeLut(text) {
  let size = 0;
  const values = [];
  const hasPlaceholderTag = /PLACEHOLDER/i.test(text);

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const upper = trimmed.toUpperCase();

    if (upper.startsWith('LUT_3D_SIZE')) {
      size = Number(trimmed.split(/\s+/).pop()) || 0;
      return;
    }

    if (upper.startsWith('DOMAIN_')) {
      return;
    }

    const parts = trimmed.split(/\s+/);

    if (parts.length === 3) {
      values.push(Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0);
    }
  });

  if (
    hasPlaceholderTag ||
    !size ||
    size < MIN_SUPPORTED_LUT_SIZE ||
    values.length !== size * size * size * 3
  ) {
    throw new Error('Invalid cube LUT');
  }

  const srgbData = new Uint8ClampedArray(values.length);

  for (let index = 0; index < values.length; index += 1) {
    srgbData[index] = clamp(Math.round(clampUnit(values[index]) * 255));
  }

  const coordFloor = new Uint8Array(256);
  const coordCeil = new Uint8Array(256);
  const coordMix = new Float32Array(256);
  const maxIndex = size - 1;

  for (let value = 0; value < 256; value += 1) {
    const position = (value / 255) * maxIndex;
    const floorValue = Math.floor(position);

    coordFloor[value] = floorValue;
    coordCeil[value] = Math.min(maxIndex, floorValue + 1);
    coordMix[value] = position - floorValue;
  }

  return {
    size,
    data: new Float32Array(values),
    srgbData,
    coordFloor,
    coordCeil,
    coordMix,
  };
}

function setFastLookLutCache(key, value) {
  if (!key || !value) {
    return;
  }

  if (fastLookLutCache.has(key)) {
    fastLookLutCache.delete(key);
  }

  fastLookLutCache.set(key, value);

  if (fastLookLutCache.size <= FAST_LOOK_LUT_CACHE_LIMIT) {
    return;
  }

  const oldestKey = fastLookLutCache.keys().next().value;

  if (oldestKey != null) {
    fastLookLutCache.delete(oldestKey);
  }
}

function normalizeFastLookLutForWorker(lookLut) {
  const validated = validateCubeLutSrgbForWorkerTransfer(lookLut);
  if (!validated) {
    return null;
  }
  return {
    key: typeof lookLut.key === 'string' ? lookLut.key : '',
    size: validated.size,
    srgbData: validated.srgbData,
  };
}

const FAST_PREVIEW_CPU_ONLY_INTERACTION_PREFIXES = [];

function shouldForceCpuPreviewDuringAdjust(interactionKind) {
  if (!interactionKind || interactionKind === 'idle') {
    return false;
  }

  return FAST_PREVIEW_CPU_ONLY_INTERACTION_PREFIXES.some((prefix) =>
    interactionKind.startsWith(prefix)
  );
}

async function loadCubeLut(lutFile) {
  if (!lutFile) {
    return null;
  }

  if (cubeLutCache.has(lutFile)) {
    return cubeLutCache.get(lutFile);
  }

  if (cubeLutInflight.has(lutFile)) {
    return cubeLutInflight.get(lutFile);
  }

  const request = fetch(`${import.meta.env.BASE_URL}luts/${lutFile}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load LUT: ${lutFile}`);
      }

      return response.text();
    })
    .then((text) => {
      const parsed = parseCubeLut(text);
      cubeLutCache.set(lutFile, parsed);
      cubeLutInflight.delete(lutFile);
      return parsed;
    })
    .catch((error) => {
      cubeLutInflight.delete(lutFile);
      throw error;
    });

  cubeLutInflight.set(lutFile, request);
  return request;
}

function cubeIndex(size, red, green, blue) {
  return ((red * size + green) * size + blue) * 3;
}

function sampleCubeLut(lut, red, green, blue) {
  const size = lut.size;
  const data = lut.srgbData ?? lut.data;
  const r0 = lut.coordFloor?.[red] ?? red;
  const g0 = lut.coordFloor?.[green] ?? green;
  const b0 = lut.coordFloor?.[blue] ?? blue;
  const r1 = lut.coordCeil?.[red] ?? Math.min(size - 1, r0 + 1);
  const g1 = lut.coordCeil?.[green] ?? Math.min(size - 1, g0 + 1);
  const b1 = lut.coordCeil?.[blue] ?? Math.min(size - 1, b0 + 1);
  const dr = lut.coordMix?.[red] ?? 0;
  const dg = lut.coordMix?.[green] ?? 0;
  const db = lut.coordMix?.[blue] ?? 0;

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

function buildOverlayPath(folder, fileName) {
  if (!fileName) {
    return null;
  }

  return `${overlayBasePath}overlays/${folder}/${fileName}?v=${OVERLAY_CACHE_BUSTER}`;
}

function getOverlayImage(path) {
  if (!path || typeof Image === 'undefined') {
    return null;
  }

  let entry = overlayImageCache.get(path);

  if (!entry) {
    const image = new Image();
    entry = { image, loaded: false, failed: false };
    image.decoding = 'async';
    image.onload = () => {
      entry.loaded = true;
      entry.width = image.naturalWidth || 0;
      entry.height = image.naturalHeight || 0;
    };
    image.onerror = () => {
      entry.failed = true;
    };
    image.src = path;
    if (typeof image.decode === 'function') {
      image
        .decode()
        .then(() => {
          if (!entry.failed) {
            entry.loaded = true;
            entry.width = image.naturalWidth || 0;
            entry.height = image.naturalHeight || 0;
          }
        })
        .catch(() => {});
    }
    overlayImageCache.set(path, entry);
  }

  if (!entry.loaded && entry.image.complete && entry.image.naturalWidth > 0) {
    entry.loaded = true;
    entry.width = entry.image.naturalWidth || 0;
    entry.height = entry.image.naturalHeight || 0;
  }

  if (!entry.loaded || entry.failed) {
    return null;
  }

  return entry.image;
}

function preloadOverlayGroup(folder, files) {
  if (!Array.isArray(files)) {
    return;
  }

  files.forEach((fileName) => {
    const path = buildOverlayPath(folder, fileName);

    if (!path) {
      return;
    }

    getOverlayImage(path);
  });
}

function resolveOrientation(width, height) {
  const normalizedWidth = Number(width) || 0;
  const normalizedHeight = Number(height) || 0;

  if (normalizedWidth <= 0 || normalizedHeight <= 0) {
    return 'unknown';
  }

  if (Math.abs(normalizedWidth - normalizedHeight) <= 1) {
    return 'square';
  }

  return normalizedWidth > normalizedHeight ? 'landscape' : 'portrait';
}

function drawRandomOverlay({
  context,
  canvas,
  random,
  folder,
  files,
  fileIndex = null,
  opacity = 0.5,
  blendMode = 'screen',
  matchOrientation = false,
  strictOrientation = false,
  randomizeTransform = true,
}) {
  if (!Array.isArray(files) || files.length === 0) {
    return false;
  }

  const targetOrientation = matchOrientation
    ? resolveOrientation(canvas.width, canvas.height)
    : 'unknown';
  const resolvedIndex =
    Number.isInteger(fileIndex) && fileIndex >= 0
      ? fileIndex % files.length
      : Math.floor(random() * files.length);
  const orderedIndices = [resolvedIndex];

  for (let offset = 1; offset < files.length; offset += 1) {
    orderedIndices.push((resolvedIndex + offset) % files.length);
  }

  const isOrientationAllowed = (entry) => {
    if (!matchOrientation || targetOrientation === 'unknown' || targetOrientation === 'square') {
      return true;
    }

    if (!entry?.loaded) {
      return false;
    }

    const overlayOrientation = resolveOrientation(
      entry.width || entry.image?.naturalWidth || 0,
      entry.height || entry.image?.naturalHeight || 0
    );

    if (overlayOrientation === 'unknown') {
      return false;
    }

    if (targetOrientation === 'portrait') {
      return overlayOrientation !== 'landscape';
    }

    if (targetOrientation === 'landscape') {
      return overlayOrientation !== 'portrait';
    }

    return true;
  };

  let image = null;

  for (const index of orderedIndices) {
    const path = buildOverlayPath(folder, files[index]);
    const entry = overlayImageCache.get(path);

    if (!isOrientationAllowed(entry)) {
      continue;
    }

    image = getOverlayImage(path);

    if (image) {
      break;
    }
  }

  if (!image && !strictOrientation) {
    for (const index of orderedIndices) {
      image = getOverlayImage(buildOverlayPath(folder, files[index]));

      if (image) {
        break;
      }
    }
  }

  if (!image) {
    return false;
  }

  const { width, height } = canvas;
  const flipX = randomizeTransform ? (random() > 0.5 ? -1 : 1) : 1;
  const flipY = randomizeTransform ? (random() > 0.5 ? -1 : 1) : 1;
  const scale = randomizeTransform ? 1 + (random() - 0.5) * 0.16 : 1;
  const offsetX = randomizeTransform ? (random() - 0.5) * 0.05 * width : 0;
  const offsetY = randomizeTransform ? (random() - 0.5) * 0.05 * height : 0;

  context.save();
  context.globalCompositeOperation = blendMode;
  context.globalAlpha = clampUnit(opacity);
  context.translate(width / 2 + offsetX, height / 2 + offsetY);
  context.scale(flipX * scale, flipY * scale);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();

  return true;
}

function buildLUT(points, interpolation = 'smooth') {
  const interpolationMode = interpolation === 'linear' ? 'linear' : 'monotonic';
  return buildCurveLut(points, {
    resolution: 256,
    interpolation: interpolationMode,
    round: true,
  });
}

function buildHighResCurveLut(
  points,
  interpolation = 'smooth',
  resolution = USER_CURVE_LUT_RESOLUTION
) {
  const interpolationMode = interpolation === 'linear' ? 'linear' : 'monotonic';
  return buildCurveLut(points, {
    resolution,
    interpolation: interpolationMode,
    round: false,
  });
}

function sampleHighResCurveLut(lut, value) {
  return sampleSharedCurveLut(lut, value);
}

function mapHalationThreshold(value) {
  const min = 120;
  const max = 250;
  const numeric = Number(value);
  const clampedThreshold = Number.isFinite(numeric)
    ? Math.min(max, Math.max(min, numeric))
    : 200;
  return max - (clampedThreshold - min);
}

function mapHalationThresholdUnit(value) {
  return clampUnit(mapHalationThreshold(value) / 255);
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return [0, 0, lightness];
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
      break;
  }

  return [hue / 6, saturation, lightness];
}

function hueToRgb(p, q, t) {
  let temp = t;

  if (temp < 0) {
    temp += 1;
  }

  if (temp > 1) {
    temp -= 1;
  }

  if (temp < 1 / 6) {
    return p + (q - p) * 6 * temp;
  }

  if (temp < 1 / 2) {
    return q;
  }

  if (temp < 2 / 3) {
    return p + (q - p) * (2 / 3 - temp) * 6;
  }

  return p;
}

function hslToRgb(hue, saturation, lightness) {
  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return [value, value, value];
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return [
    Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hue) * 255),
    Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  ];
}

function circularHueDistance(a, b) {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function getHueWeight(hue, center, spread) {
  const distance = circularHueDistance(hue, center);

  if (distance >= spread) {
    return 0;
  }

  const normalized = 1 - distance / spread;
  return normalized * normalized * (3 - 2 * normalized);
}

function hasMapAdjustments(values) {
  return Object.values(values ?? {}).some((value) => Number(value) !== 0);
}

function createRegionalAdjustments(regionalHsl, strength) {
  const hue = { ...(regionalHsl?.hue ?? {}) };
  const saturation = { ...(regionalHsl?.saturation ?? {}) };
  const luminance = { ...(regionalHsl?.luminance ?? {}) };

  return {
    hue,
    saturation,
    luminance,
    strength,
    enabled:
      strength > 0 &&
      (hasMapAdjustments(hue) ||
        hasMapAdjustments(saturation) ||
        hasMapAdjustments(luminance)),
  };
}

function hasCalibrationAdjustments(calibration) {
  const hasPrimaryAdjustments = ['red', 'green', 'blue'].some((channel) => {
    const entry = calibration?.[channel];
    return Number(entry?.hue ?? 0) !== 0 || Number(entry?.saturation ?? 0) !== 0;
  });

  return hasPrimaryAdjustments || Number(calibration?.shadowsTint ?? 0) !== 0;
}

function createCalibrationAdjustments(calibration, strength) {
  const normalizedCalibration = {
    shadowsTint: Number(calibration?.shadowsTint ?? 0) || 0,
    red: {
      hue: Number(calibration?.red?.hue ?? 0) || 0,
      saturation: Number(calibration?.red?.saturation ?? 0) || 0,
    },
    green: {
      hue: Number(calibration?.green?.hue ?? 0) || 0,
      saturation: Number(calibration?.green?.saturation ?? 0) || 0,
    },
    blue: {
      hue: Number(calibration?.blue?.hue ?? 0) || 0,
      saturation: Number(calibration?.blue?.saturation ?? 0) || 0,
    },
  };

  return {
    calibration: normalizedCalibration,
    strength,
    enabled: strength > 0 && hasCalibrationAdjustments(normalizedCalibration),
  };
}

function normalizeGrayMixer(grayMixer) {
  if (!grayMixer) {
    return null;
  }

  if (Array.isArray(grayMixer)) {
    return {
      red: Number(grayMixer[0]) || 0,
      orange: 0,
      yellow: 0,
      green: Number(grayMixer[1]) || 0,
      aqua: 0,
      blue: Number(grayMixer[2]) || 0,
      purple: 0,
      magenta: 0,
    };
  }

  return {
    red: Number(grayMixer.red) || 0,
    orange: Number(grayMixer.orange) || 0,
    yellow: Number(grayMixer.yellow) || 0,
    green: Number(grayMixer.green) || 0,
    aqua: Number(grayMixer.aqua) || 0,
    blue: Number(grayMixer.blue) || 0,
    purple: Number(grayMixer.purple) || 0,
    magenta: Number(grayMixer.magenta) || 0,
  };
}

function applyBlackAndWhiteMixer(red, green, blue, grayMixer) {
  const normalizedMixer = normalizeGrayMixer(grayMixer);
  const baseGray = 0.299 * red + 0.587 * green + 0.114 * blue;

  if (!normalizedMixer) {
    return [baseGray, baseGray, baseGray];
  }

  const [hue, saturation] = rgbToHsl(red, green, blue);
  const chromaMask = smoothstep(0.02, 0.26, saturation);

  if (chromaMask <= 0) {
    return [baseGray, baseGray, baseGray];
  }

  const hueDegrees = hue * 360;
  let mixerShift = 0;
  let totalWeight = 0;

  HUE_SECTORS.forEach((sector) => {
    const weight = getHueWeight(hueDegrees, sector.center, sector.spread);

    if (weight <= 0) {
      return;
    }

    mixerShift += weight * (normalizedMixer[sector.id] ?? 0);
    totalWeight += weight;
  });

  if (totalWeight <= 0) {
    return [baseGray, baseGray, baseGray];
  }

  const weightedShift = (mixerShift / totalWeight) * chromaMask;
  const nextGray = clamp(
    Math.round(baseGray * (1 + weightedShift / 150) + weightedShift * 0.18)
  );

  return [nextGray, nextGray, nextGray];
}

function applyCalibrationAdjustments(red, green, blue, calibrationAdjustments) {
  if (!calibrationAdjustments.enabled) {
    return [red, green, blue];
  }

  let nextRed = red;
  let nextGreen = green;
  let nextBlue = blue;
  const strength = calibrationAdjustments.strength;
  const total = red + green + blue + 1e-6;
  const redWeight = clampUnit((red / total) * 2.2);
  const greenWeight = clampUnit((green / total) * 2.2);
  const blueWeight = clampUnit((blue / total) * 2.2);

  const shadowsTint = Number(calibrationAdjustments.calibration?.shadowsTint ?? 0);

  if (shadowsTint !== 0) {
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    const shadowMask = 1 - smoothstep(0.2, 0.62, luminance);

    if (shadowMask > 0) {
      const tintStrength =
        (shadowsTint / 100) * strength * shadowMask * 10;
      nextRed += tintStrength;
      nextGreen -= tintStrength * 0.9;
      nextBlue += tintStrength * 0.85;
    }
  }

  const redHue = (Number(calibrationAdjustments.calibration?.red?.hue ?? 0) / 100) * strength;
  const greenHue =
    (Number(calibrationAdjustments.calibration?.green?.hue ?? 0) / 100) * strength;
  const blueHue = (Number(calibrationAdjustments.calibration?.blue?.hue ?? 0) / 100) * strength;

  const redSat =
    (Number(calibrationAdjustments.calibration?.red?.saturation ?? 0) / 100) * strength;
  const greenSat =
    (Number(calibrationAdjustments.calibration?.green?.saturation ?? 0) / 100) * strength;
  const blueSat =
    (Number(calibrationAdjustments.calibration?.blue?.saturation ?? 0) / 100) * strength;

  // Lightroom-style calibration feel: each primary shifts the axis and saturation of its own range.
  nextGreen += redWeight * redHue * 18;
  nextBlue -= redWeight * redHue * 16;

  nextBlue += greenWeight * greenHue * 17;
  nextRed -= greenWeight * greenHue * 15;

  nextRed += blueWeight * blueHue * 19;
  nextGreen -= blueWeight * blueHue * 17;

  const redSatAmount = redWeight * redSat * 24;
  nextRed += redSatAmount;
  nextGreen -= redSatAmount * 0.45;
  nextBlue -= redSatAmount * 0.45;

  const greenSatAmount = greenWeight * greenSat * 24;
  nextGreen += greenSatAmount;
  nextRed -= greenSatAmount * 0.45;
  nextBlue -= greenSatAmount * 0.45;

  const blueSatAmount = blueWeight * blueSat * 24;
  nextBlue += blueSatAmount;
  nextRed -= blueSatAmount * 0.45;
  nextGreen -= blueSatAmount * 0.45;

  return [nextRed, nextGreen, nextBlue];
}

function applyRegionalColorAdjustments(red, green, blue, regionalAdjustments) {
  if (!regionalAdjustments.enabled) {
    return [red, green, blue];
  }

  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  const chromaMask = smoothstep(0.03, 0.22, saturation);

  if (chromaMask <= 0) {
    return [red, green, blue];
  }

  const hueDegrees = hue * 360;
  let hueShift = 0;
  let saturationShift = 0;
  let luminanceShift = 0;
  let totalWeight = 0;

  HUE_SECTORS.forEach((sector) => {
    const weight = getHueWeight(hueDegrees, sector.center, sector.spread);

    if (weight <= 0) {
      return;
    }

    hueShift += weight * (regionalAdjustments.hue[sector.id] ?? 0);
    saturationShift +=
      weight * (regionalAdjustments.saturation[sector.id] ?? 0);
    luminanceShift +=
      weight * (regionalAdjustments.luminance[sector.id] ?? 0);
    totalWeight += weight;
  });

  if (totalWeight <= 0) {
    return [red, green, blue];
  }

  const mixStrength = regionalAdjustments.strength * chromaMask;
  const averagedHueShift = hueShift / totalWeight;
  const averagedSaturationShift = saturationShift / totalWeight;
  const averagedLuminanceShift = luminanceShift / totalWeight;
  const nextHue =
    (((hueDegrees + averagedHueShift * mixStrength * 0.62) % 360) + 360) %
    360;
  const nextSaturation = clampUnit(
    saturation + (averagedSaturationShift / 100) * mixStrength * 0.36
  );
  let [nextRed, nextGreen, nextBlue] = hslToRgb(
    nextHue / 360,
    nextSaturation,
    lightness
  );

  if (averagedLuminanceShift !== 0) {
    const [baseY, cb, cr] = rgbToYCbCr(nextRed, nextGreen, nextBlue);
    // Lightroom-like feel: luminance slider changes perceived brightness of selected hue
    // while keeping chroma relatively stable.
    const luminanceDelta = averagedLuminanceShift * mixStrength * 0.34;
    const nextY = clamp(baseY + luminanceDelta);
    [nextRed, nextGreen, nextBlue] = yCbCrToRgb(nextY, cb, cr);
  }

  return [nextRed, nextGreen, nextBlue];
}

function applyToneTint(
  red,
  green,
  blue,
  hue,
  saturation,
  luminanceShift,
  mask,
  strength
) {
  if ((saturation <= 0 && luminanceShift === 0) || mask <= 0 || strength <= 0) {
    return [red, green, blue];
  }

  let nextRed = red;
  let nextGreen = green;
  let nextBlue = blue;

  if (saturation > 0) {
    const [toneRed, toneGreen, toneBlue] = hslToRgb(
      (((hue % 360) + 360) % 360) / 360,
      clampUnit(saturation / 100),
      0.5
    );
    const tintMix = clampUnit((saturation / 100) * mask * strength * 0.4);

    nextRed = nextRed * (1 - tintMix) + toneRed * tintMix;
    nextGreen = nextGreen * (1 - tintMix) + toneGreen * tintMix;
    nextBlue = nextBlue * (1 - tintMix) + toneBlue * tintMix;
  }

  if (luminanceShift !== 0) {
    const luminanceOffset = (luminanceShift / 100) * mask * strength * 14;
    nextRed += luminanceOffset;
    nextGreen += luminanceOffset;
    nextBlue += luminanceOffset;
  }

  return [nextRed, nextGreen, nextBlue];
}

function applyColorGrading(red, green, blue, colorGrade, strength) {
  if (!colorGrade || strength <= 0) {
    return [red, green, blue];
  }

  const [, baseSaturation] = rgbToHsl(red, green, blue);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  const chromaMask = 0.26 + smoothstep(0.02, 0.24, baseSaturation) * 0.66;
  const balance = (colorGrade.balance ?? 0) / 100;
  const blending = clampUnit((colorGrade.blending ?? 50) / 100);
  const shadowMask =
    1 - smoothstep(0.2 + balance * 0.22, 0.6 + balance * 0.16, luminance);
  const highlightMask = smoothstep(
    0.36 + balance * 0.16,
    0.86 + balance * 0.22,
    luminance
  );
  const midBase = Math.max(0, 1 - Math.abs(luminance - 0.5 - balance * 0.11) * 2.05);
  const midMask = clampUnit(midBase * (0.42 + blending * 0.58));

  let result = [red, green, blue];
  result = applyToneTint(
    result[0],
    result[1],
    result[2],
    colorGrade.shadows?.hue ?? 0,
    colorGrade.shadows?.saturation ?? 0,
    colorGrade.shadows?.luminance ?? 0,
    shadowMask,
    strength * chromaMask
  );
  result = applyToneTint(
    result[0],
    result[1],
    result[2],
    colorGrade.midtones?.hue ?? 0,
    colorGrade.midtones?.saturation ?? 0,
    colorGrade.midtones?.luminance ?? 0,
    midMask,
    strength * chromaMask
  );
  result = applyToneTint(
    result[0],
    result[1],
    result[2],
    colorGrade.highlights?.hue ?? 0,
    colorGrade.highlights?.saturation ?? 0,
    colorGrade.highlights?.luminance ?? 0,
    highlightMask,
    strength * chromaMask
  );
  result = applyToneTint(
    result[0],
    result[1],
    result[2],
    colorGrade.global?.hue ?? 0,
    colorGrade.global?.saturation ?? 0,
    0,
    1,
    strength * chromaMask * 0.62
  );

  return result;
}

function buildFastLookLut({
  cacheKey,
  userCurves,
  curveLumaMix = 0.72,
  tonePost = null,
  isBlackAndWhite = false,
  profileCurveSource = null,
  profileChannelCurveStrength = 0,
  profileMasterCurveStrength = 0,
  profileGrayMixer = null,
  profileColorGrade = null,
  profileColorGradeStrength = 0,
  userCalibrationAdjustments = null,
  userRegionalAdjustments = null,
  userColorGrade = null,
  userColorGradeStrength = 0,
  size = FAST_LOOK_LUT_SIZE,
  curveResolution = USER_CURVE_LUT_RESOLUTION,
}) {
  const profileCurveEnabled =
    !isBlackAndWhite &&
    profileCurveSource &&
    (profileChannelCurveStrength > 0.0001 || profileMasterCurveStrength > 0.0001);
  const profileCurveLuts = profileCurveEnabled
    ? {
        rgb: buildLUT(profileCurveSource.rgb, 'monotonic'),
        r: buildLUT(profileCurveSource.r, 'monotonic'),
        g: buildLUT(profileCurveSource.g, 'monotonic'),
        b: buildLUT(profileCurveSource.b, 'monotonic'),
      }
    : null;
  const curveStrengthEnabled = hasUserCurveAdjustments(userCurves);
  const curveLuts = curveStrengthEnabled
    ? {
        rgb: buildHighResCurveLut(userCurves.rgb, 'monotonic', curveResolution),
        r: buildHighResCurveLut(userCurves.r, 'monotonic', curveResolution),
        g: buildHighResCurveLut(userCurves.g, 'monotonic', curveResolution),
        b: buildHighResCurveLut(userCurves.b, 'monotonic', curveResolution),
      }
    : null;
  const hasPostTone =
    Math.abs(tonePost?.highlights ?? 0) > 0.0001 ||
    Math.abs(tonePost?.shadows ?? 0) > 0.0001 ||
    Math.abs(tonePost?.whites ?? 0) > 0.0001 ||
    Math.abs(tonePost?.blacks ?? 0) > 0.0001;
  const applyUserCalibration =
    !isBlackAndWhite && Boolean(userCalibrationAdjustments?.enabled);
  const applyUserRegional = !isBlackAndWhite && Boolean(userRegionalAdjustments?.enabled);
  const applyProfileColorGrade =
    !isBlackAndWhite &&
    hasColorGradeAdjustments(profileColorGrade) &&
    profileColorGradeStrength > 0.0001;
  const applyUserColorGrade =
    !isBlackAndWhite &&
    hasColorGradeAdjustments(userColorGrade) &&
    userColorGradeStrength > 0.0001;
  const clampedSize = Math.max(5, Math.min(FAST_LOOK_LUT_SIZE, Math.round(size)));
  const maxIndex = clampedSize - 1;
  const out = new Uint8Array(clampedSize * clampedSize * clampedSize * 3);
  let writeIndex = 0;

  for (let redIndex = 0; redIndex < clampedSize; redIndex += 1) {
    const redBase = (redIndex / maxIndex) * 255;

    for (let greenIndex = 0; greenIndex < clampedSize; greenIndex += 1) {
      const greenBase = (greenIndex / maxIndex) * 255;

      for (let blueIndex = 0; blueIndex < clampedSize; blueIndex += 1) {
        const blueBase = (blueIndex / maxIndex) * 255;
        let red = redBase;
        let green = greenBase;
        let blue = blueBase;

        if (profileCurveLuts) {
          const preCurveLuminance = clampUnit(
            (0.299 * red + 0.587 * green + 0.114 * blue) / 255
          );
          const shadowProtection = 1 - smoothstep(0.03, 0.18, preCurveLuminance);
          const highlightProtection = smoothstep(0.82, 0.985, preCurveLuminance);
          const shadowColorMask = smoothstep(0.12, 0.3, preCurveLuminance);
          const highlightColorMask = 1 - smoothstep(0.9, 0.99, preCurveLuminance) * 0.18;
          const channelStrength =
            profileChannelCurveStrength *
            shadowColorMask *
            clampUnit(highlightColorMask);
          const masterStrength =
            profileMasterCurveStrength *
            clampUnit(1 - shadowProtection * 0.5 - highlightProtection * 0.58);

          const redIndex = clamp(Math.round(red));
          const greenIndex = clamp(Math.round(green));
          const blueIndex = clamp(Math.round(blue));

          if (channelStrength > 0.0001) {
            const redDelta = (profileCurveLuts.r[redIndex] - redIndex) * channelStrength;
            const greenDelta = (profileCurveLuts.g[greenIndex] - greenIndex) * channelStrength;
            const blueDelta = (profileCurveLuts.b[blueIndex] - blueIndex) * channelStrength;
            const sharedDelta = redDelta * 0.299 + greenDelta * 0.587 + blueDelta * 0.114;

            red += redDelta - sharedDelta;
            green += greenDelta - sharedDelta;
            blue += blueDelta - sharedDelta;
          }

          if (masterStrength > 0.0001) {
            const masterLuminance = clamp(
              Math.round(0.299 * red + 0.587 * green + 0.114 * blue)
            );
            const masterShift =
              (profileCurveLuts.rgb[masterLuminance] - masterLuminance) * masterStrength;
            red += masterShift;
            green += masterShift;
            blue += masterShift;
          }
        }

        if (curveLuts) {
          red = sampleHighResCurveLut(curveLuts.r, red);
          green = sampleHighResCurveLut(curveLuts.g, green);
          blue = sampleHighResCurveLut(curveLuts.b, blue);

          const rgbDirectRed = sampleHighResCurveLut(curveLuts.rgb, red);
          const rgbDirectGreen = sampleHighResCurveLut(curveLuts.rgb, green);
          const rgbDirectBlue = sampleHighResCurveLut(curveLuts.rgb, blue);
          const [lumaSourceY, lumaSourceCb, lumaSourceCr] = rgbToYCbCr(red, green, blue);
          const targetLumaY = sampleHighResCurveLut(curveLuts.rgb, lumaSourceY);
          const [rgbLuminanceRed, rgbLuminanceGreen, rgbLuminanceBlue] = yCbCrToRgb(
            targetLumaY,
            lumaSourceCb,
            lumaSourceCr
          );

          red = mix(rgbDirectRed, rgbLuminanceRed, curveLumaMix);
          green = mix(rgbDirectGreen, rgbLuminanceGreen, curveLumaMix);
          blue = mix(rgbDirectBlue, rgbLuminanceBlue, curveLumaMix);
        }

        if (isBlackAndWhite) {
          [red, green, blue] = applyBlackAndWhiteMixer(red, green, blue, profileGrayMixer);
        }

        if (hasPostTone) {
          [red, green, blue] = applyToneAdjustments(
            red,
            green,
            blue,
            tonePost?.highlights ?? 0,
            tonePost?.shadows ?? 0,
            tonePost?.whites ?? 0,
            tonePost?.blacks ?? 0
          );
        }

        if (applyUserCalibration) {
          [red, green, blue] = applyCalibrationAdjustments(
            red,
            green,
            blue,
            userCalibrationAdjustments
          );
        }

        if (applyUserRegional) {
          [red, green, blue] = applyRegionalColorAdjustments(
            red,
            green,
            blue,
            userRegionalAdjustments
          );
        }

        if (applyProfileColorGrade) {
          [red, green, blue] = applyColorGrading(
            red,
            green,
            blue,
            profileColorGrade,
            profileColorGradeStrength
          );
        }

        if (applyUserColorGrade) {
          [red, green, blue] = applyColorGrading(
            red,
            green,
            blue,
            userColorGrade,
            userColorGradeStrength
          );
        }

        out[writeIndex] = clamp(Math.round(red));
        out[writeIndex + 1] = clamp(Math.round(green));
        out[writeIndex + 2] = clamp(Math.round(blue));
        writeIndex += 3;
      }
    }
  }

  return {
    key: cacheKey,
    size: clampedSize,
    srgbData: out,
  };
}

function srgbToLinearUnit(value) {
  const safe = clampUnit(value);
  if (safe <= 0.04045) {
    return safe / 12.92;
  }
  return ((safe + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbUnit(value) {
  const safe = clampUnit(value);
  if (safe <= 0.0031308) {
    return safe * 12.92;
  }
  return 1.055 * safe ** (1 / 2.4) - 0.055;
}

function applyRawLinearExposureStage(
  red,
  green,
  blue,
  {
    gain = 1,
    wbR = 1,
    wbG = 1,
    wbB = 1,
    highlightRecovery = 0,
    shadowRecovery = 0,
    sourceMeanLuma = null,
    sourceNonBlackRatio = null,
  } = {}
) {
  const safeGain = Math.max(0.0001, Number(gain) || 1);
  const safeHighlightRecovery = clampUnit(highlightRecovery);
  const safeShadowRecovery = clampUnit(shadowRecovery);
  const sourceLumaNorm = Number.isFinite(sourceMeanLuma)
    ? clampUnit(sourceMeanLuma / 255)
    : 0.52;
  const sourceCoverage = Number.isFinite(sourceNonBlackRatio)
    ? clampUnit(sourceNonBlackRatio)
    : 0.8;

  let linearRed = srgbToLinearUnit(clamp(red) / 255) * safeGain * wbR;
  let linearGreen = srgbToLinearUnit(clamp(green) / 255) * safeGain * wbG;
  let linearBlue = srgbToLinearUnit(clamp(blue) / 255) * safeGain * wbB;
  const linearLuma = clampUnit(
    0.2126 * clampUnit(linearRed) + 0.7152 * clampUnit(linearGreen) + 0.0722 * clampUnit(linearBlue)
  );
  const linearPeak = Math.max(linearRed, linearGreen, linearBlue);

  if (safeHighlightRecovery > 0) {
    const shoulderMask = smoothstep(0.58, 1.35, linearPeak);
    const lumaMask = smoothstep(0.52, 1.15, linearLuma);
    const sceneBias = mix(0.9, 1.16, sourceLumaNorm);
    const compression = safeHighlightRecovery * shoulderMask * lumaMask * sceneBias;
    if (compression > 0) {
      const scale = 1 / (1 + compression * 1.9);
      linearRed *= scale;
      linearGreen *= scale;
      linearBlue *= scale;
    }
  }

  if (safeShadowRecovery > 0) {
    const shadowMask = 1 - smoothstep(0.03, 0.32, linearLuma);
    const sceneLift = mix(0.84, 1.1, 1 - sourceCoverage);
    const lift = safeShadowRecovery * shadowMask * sceneLift * 0.085;
    if (lift > 0) {
      linearRed += lift;
      linearGreen += lift;
      linearBlue += lift;
    }
  }

  const gainHeadroom = clampUnit((safeGain - 1) / 1.85);
  // Keep RAW neutral at startup (all sliders at zero):
  // no baseline shoulder unless exposure/highlight recovery actually requests it.
  const shoulderStrength = Math.max(0, gainHeadroom * 0.82 + safeHighlightRecovery * 0.44);
  const toneMap = (channel) => {
    const safe = Math.max(0, channel);
    const mapped = safe / (1 + safe * shoulderStrength);
    return linearToSrgbUnit(mapped) * 255;
  };

  return [toneMap(linearRed), toneMap(linearGreen), toneMap(linearBlue)];
}

function applyDehazeToRgb(red, green, blue, amount) {
  if (amount === 0) {
    return [red, green, blue];
  }

  const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
  const lift = amount * 34;

  return [
    red + amount * (red - gray) * 0.85 + lift,
    green + amount * (green - gray) * 0.85 + lift,
    blue + amount * (blue - gray) * 0.85 + lift,
  ];
}

function ensureCanvas(ref, width, height) {
  if (!ref.current) {
    ref.current = document.createElement('canvas');
  }

  if (ref.current.width !== width) {
    ref.current.width = width;
  }

  if (ref.current.height !== height) {
    ref.current.height = height;
  }

  return ref.current;
}

function getCanvasContext(canvas, options = {}) {
  return (
    canvas.getContext('2d', {
      colorSpace: 'srgb',
      ...options,
    }) || canvas.getContext('2d', options)
  );
}

function normalizeTransparentImageDataInPlace(imageData) {
  if (!imageData?.data || !imageData?.width || !imageData?.height) {
    return {
      adjusted: false,
      reason: 'missing-image-data',
    };
  }

  const { data, width, height } = imageData;
  const pixelCount = width * height;
  if (!pixelCount) {
    return {
      adjusted: false,
      reason: 'empty-image-data',
    };
  }

  let zeroAlphaCount = 0;
  let partialAlphaCount = 0;
  let nonZeroRgbAtZeroAlphaCount = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) {
      zeroAlphaCount += 1;
      if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) {
        nonZeroRgbAtZeroAlphaCount += 1;
      }
    } else if (alpha < 255) {
      partialAlphaCount += 1;
    }
  }

  const zeroAlphaRatio = zeroAlphaCount / pixelCount;
  const nonZeroRgbAtZeroAlphaRatio = nonZeroRgbAtZeroAlphaCount / pixelCount;
  const shouldForceOpaque =
    zeroAlphaRatio > 0.96 ||
    (zeroAlphaRatio > 0.5 && nonZeroRgbAtZeroAlphaRatio > 0.01 && partialAlphaCount === 0);

  if (!shouldForceOpaque) {
    return {
      adjusted: false,
      reason: 'alpha-ok',
      zeroAlphaRatio,
      nonZeroRgbAtZeroAlphaRatio,
      partialAlphaCount,
    };
  }

  for (let index = 3; index < data.length; index += 4) {
    data[index] = 255;
  }

  return {
    adjusted: true,
    reason: 'forced-opaque-alpha',
    zeroAlphaRatio,
    nonZeroRgbAtZeroAlphaRatio,
    partialAlphaCount,
  };
}

function computeSampledRgbaStats(data, width, height, maxSamples = 8192) {
  if (!data?.length || !width || !height) {
    return null;
  }

  const pixelCount = width * height;
  if (!pixelCount) {
    return null;
  }

  const step = Math.max(1, Math.floor(pixelCount / Math.max(1, Math.round(maxSamples))));
  let sampled = 0;
  let lumaSum = 0;
  let nonBlackCount = 0;
  let opaqueCount = 0;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += step) {
    const index = pixelIndex * 4;
    const red = data[index] || 0;
    const green = data[index + 1] || 0;
    const blue = data[index + 2] || 0;
    const alpha = data[index + 3] || 0;
    const alphaNorm = alpha / 255;
    const luma = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * alphaNorm;

    sampled += 1;
    lumaSum += luma;
    if (luma > 8) {
      nonBlackCount += 1;
    }
    if (alpha > 8) {
      opaqueCount += 1;
    }
  }

  if (!sampled) {
    return null;
  }

  return {
    sampled,
    meanLuma: lumaSum / sampled,
    nonBlackRatio: nonBlackCount / sampled,
    opaqueRatio: opaqueCount / sampled,
  };
}

function transformSourceImageData(source, rotation = 0, flipped = false) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  if (normalizedRotation === 0 && !flipped) {
    return source;
  }

  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const width = normalizedRotation % 180 === 0 ? sourceWidth : sourceHeight;
  const height = normalizedRotation % 180 === 0 ? sourceHeight : sourceWidth;
  const transformed = new Uint8ClampedArray(width * height * 4);
  const original = source.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const displayX = flipped ? width - 1 - x : x;
      let sourceX = displayX;
      let sourceY = y;

      switch (normalizedRotation) {
        case 90:
          sourceX = y;
          sourceY = sourceHeight - 1 - displayX;
          break;
        case 180:
          sourceX = sourceWidth - 1 - displayX;
          sourceY = sourceHeight - 1 - y;
          break;
        case 270:
          sourceX = sourceWidth - 1 - y;
          sourceY = displayX;
          break;
        default:
          break;
      }

      const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;

      transformed[targetIndex] = original[sourceIndex];
      transformed[targetIndex + 1] = original[sourceIndex + 1];
      transformed[targetIndex + 2] = original[sourceIndex + 2];
      transformed[targetIndex + 3] = original[sourceIndex + 3];
    }
  }

  return {
    data: transformed,
    width,
    height,
  };
}

/**
 * Bilinear downscale (Canvas 2D) do rozmiaru proxy nominalnego — wyrównanie CPU preview z workerem.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} source
 * @param {number} targetW
 * @param {number} targetH
 * @returns {ImageData | null}
 */
function downscaleImageDataToNominalSize(source, targetW, targetH) {
  const sw = source.width;
  const sh = source.height;
  if (sw === targetW && sh === targetH) {
    return null;
  }
  if (typeof document === 'undefined' || !source?.data) {
    return null;
  }
  try {
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = sw;
    srcCanvas.height = sh;
    const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (!sctx) {
      return null;
    }
    sctx.putImageData(new ImageData(source.data, sw, sh), 0, 0);
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = targetW;
    dstCanvas.height = targetH;
    const dctx = dstCanvas.getContext('2d', { willReadFrequently: true });
    if (!dctx) {
      return null;
    }
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = 'high';
    dctx.drawImage(srcCanvas, 0, 0, targetW, targetH);
    return dctx.getImageData(0, 0, targetW, targetH);
  } catch {
    return null;
  }
}

function applyClarity(context, canvas, fxCanvasRef, amount, options = {}) {
  const { width, height } = canvas;
  const original = context.getImageData(0, 0, width, height);
  const fxCanvas = ensureCanvas(fxCanvasRef, width, height);
  const fxContext = getCanvasContext(fxCanvas, { willReadFrequently: true });
  const blurScale = options.blurScale ?? 0.02;
  const minBlur = options.minBlur ?? 8;
  const strengthScale = options.strengthScale ?? 1.5;
  const midtoneBias = clampUnit(options.midtoneBias ?? 1);

  if (!fxContext) {
    return;
  }

  fxContext.clearRect(0, 0, width, height);
  fxContext.filter = `blur(${Math.max(minBlur, Math.round(Math.min(width, height) * blurScale))}px)`;
  fxContext.drawImage(canvas, 0, 0);
  fxContext.filter = 'none';

  const blurred = fxContext.getImageData(0, 0, width, height);
  const originalData = original.data;
  const blurredData = blurred.data;
  const strength = amount * strengthScale;

  for (let index = 0; index < originalData.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const channelIndex = index + channel;
      const difference = originalData[channelIndex] - blurredData[channelIndex];
      const luminance =
        (originalData[index] * 0.299 +
          originalData[index + 1] * 0.587 +
          originalData[index + 2] * 0.114) /
        255;
      const midMask = 1 - (2 * luminance - 1) ** 2;
      const detailMask = midMask * midtoneBias + (1 - midtoneBias);
      const boost = difference * strength * detailMask;

      originalData[channelIndex] = clamp(Math.round(originalData[channelIndex] + boost));
    }
  }

  context.putImageData(original, 0, 0);
}

function applyGrain(context, canvas, amount, size, frequency = 50) {
  const { width, height } = canvas;
  const grain = context.getImageData(0, 0, width, height);
  const data = grain.data;
  const frequencyNorm = clampUnit(frequency / 100);
  const sizeNorm = clampUnit((size - 0.1) / 0.9);
  const baseAmount = amount * (0.45 + sizeNorm * 0.55);
  const rmsScale = 12 + (1 - frequencyNorm) * 6;
  const redSigma = baseAmount * rmsScale * 0.8;
  const greenSigma = baseAmount * rmsScale * 0.9;
  const blueSigma = baseAmount * rmsScale * 1.2;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    const envelope = clampUnit(4 * luminance * (1 - luminance));

    if (envelope <= 0.0001) {
      continue;
    }

    // Approx. Gaussian grain (triangular distribution blend), aligned with
    // stochastic midtone-weighted behavior from MindfulLens_System_Master.
    const noiseA = Math.random() + Math.random() + Math.random() - 1.5;
    const noiseB = Math.random() + Math.random() + Math.random() - 1.5;
    const noiseC = Math.random() + Math.random() + Math.random() - 1.5;

    data[index] = clamp(red + noiseA * redSigma * envelope);
    data[index + 1] = clamp(green + noiseB * greenSigma * envelope);
    data[index + 2] = clamp(blue + noiseC * blueSigma * envelope);
  }

  context.putImageData(grain, 0, 0);
}

function applyVignette(context, canvas, amount) {
  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
  const gradient = context.createRadialGradient(
    centerX,
    centerY,
    maxRadius * 0.3,
    centerX,
    centerY,
    maxRadius
  );

  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${Math.min(1, amount * 1.2)})`);

  context.save();
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function applyLightLeak(context, canvas, type, seed = 1, variantIndex = null) {
  const { width, height } = canvas;
  const random = createSeededRandom(seed);
  let gradient;

  context.save();
  context.globalCompositeOperation = 'screen';

  switch (type) {
    case 'warm':
      gradient = context.createLinearGradient(0, 0, width * 0.6, height * 0.4);
      gradient.addColorStop(0, 'rgba(255,120,40,0.25)');
      gradient.addColorStop(0.4, 'rgba(255,180,60,0.12)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      break;
    case 'cool':
      gradient = context.createLinearGradient(width, 0, 0, height * 0.5);
      gradient.addColorStop(0, 'rgba(80,140,255,0.2)');
      gradient.addColorStop(0.5, 'rgba(120,180,255,0.08)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      break;
    case 'vintage':
      gradient = context.createRadialGradient(width * 0.2, height * 0.3, 0, width * 0.2, height * 0.3, width * 0.6);
      gradient.addColorStop(0, 'rgba(255,200,100,0.2)');
      gradient.addColorStop(0.5, 'rgba(255,100,50,0.08)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      gradient = context.createRadialGradient(width * 0.8, height * 0.7, 0, width * 0.8, height * 0.7, width * 0.5);
      gradient.addColorStop(0, 'rgba(200,100,255,0.1)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      break;
    case 'prism':
      gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, 'rgba(255,0,80,0.12)');
      gradient.addColorStop(0.3, 'rgba(255,200,0,0.08)');
      gradient.addColorStop(0.6, 'rgba(0,255,200,0.08)');
      gradient.addColorStop(1, 'rgba(80,0,255,0.12)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      break;
    case 'halation':
      context.globalAlpha = 0.35;
      gradient = context.createRadialGradient(width * 0.5, height * 0.5, width * 0.1, width * 0.5, height * 0.5, width * 0.7);
      gradient.addColorStop(0, 'rgba(255,60,40,0.3)');
      gradient.addColorStop(0.3, 'rgba(255,100,60,0.15)');
      gradient.addColorStop(0.6, 'rgba(255,60,30,0.06)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      context.globalAlpha = 1;
      break;
    case 'raw-leakedge': {
      drawRandomOverlay({
        context,
        canvas,
        random,
        folder: 'raw-leak',
        files: RAW_LEAK_OVERLAY_FILES,
        fileIndex: variantIndex,
        opacity: 0.06 + random() * 0.1,
        blendMode: 'screen',
        matchOrientation: true,
        strictOrientation: true,
        randomizeTransform: false,
      });
      break;
    }
    default:
      break;
  }

  context.restore();
}

function applyChromAb(context, canvas, amount) {
  const { width, height } = canvas;
  const shift = Math.round(amount * 8);

  if (shift < 1) {
    return;
  }

  const imageData = context.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const redIndex = (y * width + Math.max(0, x - shift)) * 4;
      const blueIndex = (y * width + Math.min(width - 1, x + shift)) * 4;

      data[index] = source[redIndex];
      data[index + 2] = source[blueIndex + 2];
    }
  }

  context.putImageData(imageData, 0, 0);
}

function applyBloom(context, canvas, fxCanvasRef, amount) {
  const { width, height } = canvas;
  const fxCanvas = ensureCanvas(fxCanvasRef, width, height);
  const fxContext = getCanvasContext(fxCanvas, { willReadFrequently: true });

  if (!fxContext) {
    return;
  }

  fxContext.clearRect(0, 0, width, height);
  fxContext.filter = `blur(${Math.round(amount * 20)}px)`;
  fxContext.drawImage(canvas, 0, 0);
  fxContext.filter = 'none';

  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = amount * 0.5;
  context.drawImage(fxCanvas, 0, 0);
  context.restore();
}

function createSeededRandom(seed) {
  let state = (Math.floor(seed) >>> 0) || 1;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function applyDust(context, canvas, amount, seed = 1, variantIndex = null) {
  const random = createSeededRandom(seed);
  drawRandomOverlay({
    context,
    canvas,
    random,
    folder: 'dust',
    files: DUST_OVERLAY_FILES,
    fileIndex: variantIndex,
    opacity: Math.min(0.75, 0.14 + amount * 0.45),
    blendMode: 'screen',
    matchOrientation: true,
    strictOrientation: true,
    randomizeTransform: false,
  });
}

function applyHalation(context, canvas, fxCanvasRef, strength, radius, threshold, hue) {
  const { width, height } = canvas;
  const source = context.getImageData(0, 0, width, height);
  const sourceData = source.data;
  const fxCanvas = ensureCanvas(fxCanvasRef, width, height);
  const fxContext = getCanvasContext(fxCanvas, { willReadFrequently: true });

  if (!fxContext) {
    return;
  }

  const mask = fxContext.createImageData(width, height);
  const maskData = mask.data;
  const redShift = hue > 0 ? 1 + hue / 100 : 1;
  const blueShift = hue < 0 ? 1 + Math.abs(hue) / 100 : 1;
  const kneeStart = Math.max(0, threshold - 46);
  const kneeEnd = Math.min(255, threshold + 8);

  for (let index = 0; index < sourceData.length; index += 4) {
    const luminance =
      0.299 * sourceData[index] +
      0.587 * sourceData[index + 1] +
      0.114 * sourceData[index + 2];
    const highlightMask = smoothstep(kneeStart, kneeEnd, luminance);

    if (highlightMask <= 0) {
      continue;
    }

    const alpha = clampUnit(highlightMask * strength * 1.05);
    maskData[index] = Math.min(255, sourceData[index] * alpha * redShift);
    maskData[index + 1] = Math.min(255, sourceData[index + 1] * alpha * 0.36);
    maskData[index + 2] = Math.min(255, sourceData[index + 2] * alpha * blueShift);
    maskData[index + 3] = 255;
  }

  fxContext.clearRect(0, 0, width, height);
  fxContext.putImageData(mask, 0, 0);

  context.save();
  context.globalCompositeOperation = 'screen';
  context.filter = `blur(${Math.round(radius / 2)}px)`;
  context.drawImage(fxCanvas, 0, 0);
  context.filter = 'none';
  context.restore();
}

function applyAnamorph(context, canvas, fxCanvasRef, strength, streakLength) {
  const { width, height } = canvas;
  const fxCanvas = ensureCanvas(fxCanvasRef, width, height);
  const fxContext = getCanvasContext(fxCanvas, { willReadFrequently: true });

  if (!fxContext) {
    return;
  }

  fxContext.clearRect(0, 0, width, height);
  fxContext.filter = `blur(${Math.max(1, Math.round(streakLength * strength * 0.45))}px)`;
  fxContext.drawImage(canvas, 0, 0);
  fxContext.filter = 'none';

  const blurred = fxContext.getImageData(0, 0, width, height);
  const data = blurred.data;
  const streakThreshold = 155;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];

    if (luminance < streakThreshold) {
      data[index + 3] = 0;
    } else {
      data[index] = Math.min(255, data[index] * 0.7 + 80);
      data[index + 1] = Math.min(255, data[index + 1] * 0.8 + 60);
      data[index + 2] = Math.min(255, data[index + 2] + 100);
      data[index + 3] = Math.round((strength * 255 * (luminance - streakThreshold)) / 95);
    }
  }

  fxContext.putImageData(blurred, 0, 0);

  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = strength * 0.7;
  context.drawImage(fxCanvas, 0, 0);
  context.restore();
}

function buildBrushMaskBuffer(width, height, brushStrokes) {
  if (!Array.isArray(brushStrokes) || brushStrokes.length === 0 || width < 1 || height < 1) {
    return null;
  }
  const mask = new Float32Array(width * height);
  for (const stroke of brushStrokes) {
    const cx = Math.round(clampUnit(Number(stroke?.x ?? 0.5)) * (width - 1));
    const cy = Math.round(clampUnit(Number(stroke?.y ?? 0.5)) * (height - 1));
    const radiusNorm = Math.max(0.004, Math.min(0.5, Number(stroke?.radius ?? 0.05)));
    const feather = clampUnit(Number(stroke?.feather ?? 0.65));
    const radiusPx = Math.max(2, Math.round(radiusNorm * Math.max(width, height)));
    const softStart = radiusPx * (1 - feather * 0.85);
    const yMin = Math.max(0, cy - radiusPx);
    const yMax = Math.min(height - 1, cy + radiusPx);
    const xMin = Math.max(0, cx - radiusPx);
    const xMax = Math.min(width - 1, cx + radiusPx);
    for (let y = yMin; y <= yMax; y += 1) {
      for (let x = xMin; x <= xMax; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radiusPx) {
          continue;
        }
        let weight = 1;
        if (dist > softStart) {
          const t = (dist - softStart) / Math.max(1e-5, radiusPx - softStart);
          weight = 1 - t;
        }
        const idx = y * width + x;
        const edgeGain = Math.max(0.12, Math.min(1, Number(stroke?.edgeGain ?? 1)));
        const safeWeight = Math.max(0, Math.min(1, weight * edgeGain));
        if (stroke?.erase) {
          mask[idx] = Math.max(0, mask[idx] - safeWeight);
        } else {
          mask[idx] = Math.max(mask[idx], safeWeight);
        }
      }
    }
  }
  return mask;
}

function buildBrushMaskSignature(width, height, brushStrokes) {
  if (!Array.isArray(brushStrokes) || brushStrokes.length === 0) {
    return `${width}x${height}:0`;
  }
  // Compact stable signature: dimensions + stroke count + rounded stroke fields.
  let signature = `${width}x${height}:${brushStrokes.length}`;
  for (let i = 0; i < brushStrokes.length; i += 1) {
    const s = brushStrokes[i];
    const x = Math.round(clampUnit(Number(s?.x ?? 0.5)) * 1000);
    const y = Math.round(clampUnit(Number(s?.y ?? 0.5)) * 1000);
    const r = Math.round(Math.max(0, Math.min(0.5, Number(s?.radius ?? 0.05))) * 1000);
    const f = Math.round(clampUnit(Number(s?.feather ?? 0.65)) * 1000);
    const e = s?.erase ? 1 : 0;
    const g = Math.round(Math.max(0, Math.min(1, Number(s?.edgeGain ?? 1))) * 1000);
    signature += `|${x},${y},${r},${f},${e},${g}`;
  }
  return signature;
}

function buildLinearMaskBuffer(width, height, adjustments) {
  if (width < 1 || height < 1) {
    return null;
  }
  const mask = new Float32Array(width * height);
  const angleDeg = Number(adjustments?.linearMaskAngle ?? 0);
  const angle = (angleDeg * Math.PI) / 180;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const feather = clampUnit(Number(adjustments?.linearMaskFeather ?? 55) / 100);
  const offset = Math.max(-1, Math.min(1, Number(adjustments?.linearMaskOffset ?? 0) / 100));
  const span = Math.max(0.03, 0.25 + feather * 0.5);
  for (let y = 0; y < height; y += 1) {
    const ny = height > 1 ? y / (height - 1) - 0.5 : 0;
    for (let x = 0; x < width; x += 1) {
      const nx = width > 1 ? x / (width - 1) - 0.5 : 0;
      const p = nx * dirX + ny * dirY - offset * 0.5;
      const t = clampUnit((p + span) / (span * 2));
      mask[y * width + x] = t * t * (3 - 2 * t);
    }
  }
  return mask;
}

function buildRadialMaskBuffer(width, height, adjustments) {
  if (width < 1 || height < 1) {
    return null;
  }
  const mask = new Float32Array(width * height);
  const cx = clampUnit(Number(adjustments?.radialMaskCenterX ?? 50) / 100);
  const cy = clampUnit(Number(adjustments?.radialMaskCenterY ?? 50) / 100);
  const radius = Math.max(0.04, Math.min(1, Number(adjustments?.radialMaskRadius ?? 35) / 100));
  const feather = clampUnit(Number(adjustments?.radialMaskFeather ?? 55) / 100);
  const inner = Math.max(0, radius * (1 - feather * 0.92));
  for (let y = 0; y < height; y += 1) {
    const ny = height > 1 ? y / (height - 1) : 0;
    for (let x = 0; x < width; x += 1) {
      const nx = width > 1 ? x / (width - 1) : 0;
      const d = Math.hypot(nx - cx, ny - cy);
      let w = 0;
      if (d <= inner) {
        w = 1;
      } else if (d < radius) {
        const t = 1 - (d - inner) / Math.max(1e-5, radius - inner);
        w = t * t * (3 - 2 * t);
      }
      mask[y * width + x] = w;
    }
  }
  return mask;
}

function buildLocalMaskSignature(width, height, adjustments) {
  const mode = String(adjustments?.localMaskMode ?? 'brush');
  if (mode === 'linear') {
    return `linear:${width}x${height}:${Math.round(Number(adjustments?.linearMaskAngle ?? 0) * 10)}:${Math.round(
      Number(adjustments?.linearMaskFeather ?? 55) * 10
    )}:${Math.round(Number(adjustments?.linearMaskOffset ?? 0) * 10)}`;
  }
  if (mode === 'radial') {
    return `radial:${width}x${height}:${Math.round(Number(adjustments?.radialMaskCenterX ?? 50) * 10)}:${Math.round(
      Number(adjustments?.radialMaskCenterY ?? 50) * 10
    )}:${Math.round(Number(adjustments?.radialMaskRadius ?? 35) * 10)}:${Math.round(
      Number(adjustments?.radialMaskFeather ?? 55) * 10
    )}`;
  }
  if (mode === 'luma') {
    return `luma:${Math.round(Number(adjustments?.lumaMaskMin ?? 0) * 10)}:${Math.round(
      Number(adjustments?.lumaMaskMax ?? 100) * 10
    )}:${Math.round(Number(adjustments?.lumaMaskFeather ?? 35) * 10)}`;
  }
  if (mode === 'color') {
    return `color:${Math.round(Number(adjustments?.colorMaskHueCenter ?? 210) * 10)}:${Math.round(
      Number(adjustments?.colorMaskHueWidth ?? 90) * 10
    )}:${Math.round(Number(adjustments?.colorMaskFeather ?? 35) * 10)}:${Math.round(
      Number(adjustments?.colorMaskChromaMin ?? 0) * 10
    )}:${Math.round(Number(adjustments?.colorMaskChromaMax ?? 100) * 10)}`;
  }
  if (mode === 'depth') {
    const digestRaw = adjustments?.depthProxyDigest;
    const digest =
      digestRaw != null && String(digestRaw).trim() !== ''
        ? String(digestRaw).trim().slice(0, 80)
        : 'luma';
    const dms = String(adjustments?.depthMapSource ?? 'luminance').slice(0, 32);
    return `depth:${Math.round(Number(adjustments?.depthMaskMin ?? 0) * 10)}:${Math.round(
      Number(adjustments?.depthMaskMax ?? 100) * 10
    )}:${Math.round(Number(adjustments?.depthMaskFeather ?? 35) * 10)}:${dms}:${digest}:${buildBrushMaskSignature(
      width,
      height,
      adjustments?.brushMaskStrokes
    )}`;
  }
  return `brush:${buildBrushMaskSignature(width, height, adjustments?.brushMaskStrokes)}`;
}

/**
 * Same mask stack resolution as the render loop (for export / diagnostics).
 * @param {Map} maskCache — reuse brushMask buffers when provided (e.g. brushMaskCacheRef.current).
 */
function buildLocalMaskStackSnapshot(width, height, adjustments, maskCache) {
  const cache = maskCache instanceof Map ? maskCache : new Map();
  const brushMaskEnabled = Boolean(adjustments?.brushMaskEnabled);
  const localMaskEntries = (() => {
    const stack = Array.isArray(adjustments?.localMasks) ? adjustments.localMasks : [];
    const soloIndex = Number(adjustments?.localMaskSoloIndex ?? -1);
    const activeIdx = Math.max(
      0,
      Math.min(stack.length > 0 ? stack.length - 1 : 0, Number(adjustments?.activeLocalMaskIndex ?? 0))
    );
    const current = {
      enabled: adjustments?.localMaskEnabled !== false,
      mode: String(adjustments?.localMaskMode ?? 'brush'),
      opacity: Number(adjustments?.localMaskOpacity ?? 100),
      blend: String(adjustments?.localMaskBlend ?? 'normal'),
      exposure: Number(adjustments?.brushMaskExposure ?? 0),
      brush: {
        strokes: Array.isArray(adjustments?.brushMaskStrokes) ? adjustments.brushMaskStrokes : [],
      },
      linear: {
        angle: Number(adjustments?.linearMaskAngle ?? 0),
        feather: Number(adjustments?.linearMaskFeather ?? 55),
        offset: Number(adjustments?.linearMaskOffset ?? 0),
      },
      radial: {
        centerX: Number(adjustments?.radialMaskCenterX ?? 50),
        centerY: Number(adjustments?.radialMaskCenterY ?? 50),
        radius: Number(adjustments?.radialMaskRadius ?? 35),
        feather: Number(adjustments?.radialMaskFeather ?? 55),
      },
      luma: {
        min: Number(adjustments?.lumaMaskMin ?? 0),
        max: Number(adjustments?.lumaMaskMax ?? 100),
        feather: Number(adjustments?.lumaMaskFeather ?? 35),
      },
      color: {
        hueCenter: Number(adjustments?.colorMaskHueCenter ?? 210),
        hueWidth: Number(adjustments?.colorMaskHueWidth ?? 90),
        feather: Number(adjustments?.colorMaskFeather ?? 35),
        chromaMin: Number(adjustments?.colorMaskChromaMin ?? 0),
        chromaMax: Number(adjustments?.colorMaskChromaMax ?? 100),
      },
      depth: {
        min: Number(adjustments?.depthMaskMin ?? 0),
        max: Number(adjustments?.depthMaskMax ?? 100),
        feather: Number(adjustments?.depthMaskFeather ?? 35),
        mapSource: String(adjustments?.depthMapSource ?? 'luminance'),
      },
    };
    if (!brushMaskEnabled) {
      return [];
    }
    if (stack.length === 0) {
      return [current];
    }
    const merged = stack.map((entry, idx) => (idx === activeIdx ? current : entry));
    if (Number.isInteger(soloIndex) && soloIndex >= 0 && soloIndex < merged.length) {
      return [merged[soloIndex]];
    }
    return merged.filter((entry) => entry?.enabled !== false);
  })();

  const localMaskStack = localMaskEntries
    .map((entry, maskIndex) => {
      const exposure = Number(entry?.exposure ?? entry?.brushMaskExposure ?? 0);
      const opacity = Math.max(0, Math.min(1, Number(entry?.opacity ?? entry?.localMaskOpacity ?? 100) / 100));
      if (Math.abs(exposure) < 0.01 || opacity <= 0.0001) {
        return null;
      }
      const mode = String(entry?.mode ?? entry?.localMaskMode ?? 'brush');
      const signature = buildLocalMaskSignature(width, height, {
        ...entry,
        localMaskMode: mode,
        linearMaskAngle: entry?.linear?.angle ?? entry?.linearMaskAngle,
        linearMaskFeather: entry?.linear?.feather ?? entry?.linearMaskFeather,
        linearMaskOffset: entry?.linear?.offset ?? entry?.linearMaskOffset,
        radialMaskCenterX: entry?.radial?.centerX ?? entry?.radialMaskCenterX,
        radialMaskCenterY: entry?.radial?.centerY ?? entry?.radialMaskCenterY,
        radialMaskRadius: entry?.radial?.radius ?? entry?.radialMaskRadius,
        radialMaskFeather: entry?.radial?.feather ?? entry?.radialMaskFeather,
        brushMaskStrokes: entry?.brush?.strokes ?? entry?.brushMaskStrokes,
        lumaMaskMin: entry?.luma?.min ?? entry?.lumaMaskMin,
        lumaMaskMax: entry?.luma?.max ?? entry?.lumaMaskMax,
        lumaMaskFeather: entry?.luma?.feather ?? entry?.lumaMaskFeather,
        colorMaskHueCenter: entry?.color?.hueCenter ?? entry?.colorMaskHueCenter,
        colorMaskHueWidth: entry?.color?.hueWidth ?? entry?.colorMaskHueWidth,
        colorMaskFeather: entry?.color?.feather ?? entry?.colorMaskFeather,
        colorMaskChromaMin: entry?.color?.chromaMin ?? entry?.colorMaskChromaMin,
        colorMaskChromaMax: entry?.color?.chromaMax ?? entry?.colorMaskChromaMax,
        depthMaskMin: entry?.depth?.min ?? entry?.depthMaskMin,
        depthMaskMax: entry?.depth?.max ?? entry?.depthMaskMax,
        depthMaskFeather: entry?.depth?.feather ?? entry?.depthMaskFeather,
        depthMapSource: entry?.depth?.mapSource ?? adjustments?.depthMapSource ?? 'luminance',
        depthProxyDigest:
          adjustments?.depthProxyDigest ??
          entry?.depthProxyDigest ??
          (typeof entry?.depth?.digest === 'string' ? entry.depth.digest : null),
      });
      const cacheKey = `${maskIndex}:${signature}`;
      let buffer = cache.get(cacheKey) ?? null;
      if (!(buffer instanceof Float32Array) || buffer.length !== width * height) {
        if (mode === 'linear') {
          buffer = buildLinearMaskBuffer(width, height, {
            linearMaskAngle: entry?.linear?.angle ?? entry?.linearMaskAngle,
            linearMaskFeather: entry?.linear?.feather ?? entry?.linearMaskFeather,
            linearMaskOffset: entry?.linear?.offset ?? entry?.linearMaskOffset,
          });
        } else if (mode === 'radial') {
          buffer = buildRadialMaskBuffer(width, height, {
            radialMaskCenterX: entry?.radial?.centerX ?? entry?.radialMaskCenterX,
            radialMaskCenterY: entry?.radial?.centerY ?? entry?.radialMaskCenterY,
            radialMaskRadius: entry?.radial?.radius ?? entry?.radialMaskRadius,
            radialMaskFeather: entry?.radial?.feather ?? entry?.radialMaskFeather,
          });
        } else {
          buffer = buildBrushMaskBuffer(
            width,
            height,
            Array.isArray(entry?.brush?.strokes ?? entry?.brushMaskStrokes)
              ? entry?.brush?.strokes ?? entry?.brushMaskStrokes
              : []
          );
        }
        if (buffer instanceof Float32Array) {
          cache.set(cacheKey, buffer);
          if (cache.size > 12) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
          }
        }
      }
      return {
        buffer: buffer instanceof Float32Array ? buffer : null,
        exposure,
        opacity,
        mode,
        lumaMin: Number(entry?.luma?.min ?? entry?.lumaMaskMin ?? 0) / 100,
        lumaMax: Number(entry?.luma?.max ?? entry?.lumaMaskMax ?? 100) / 100,
        lumaFeather: Number(entry?.luma?.feather ?? entry?.lumaMaskFeather ?? 35) / 100,
        colorHueCenter: Number(entry?.color?.hueCenter ?? entry?.colorMaskHueCenter ?? 210),
        colorHueWidth: Number(entry?.color?.hueWidth ?? entry?.colorMaskHueWidth ?? 90),
        colorFeather: Number(entry?.color?.feather ?? entry?.colorMaskFeather ?? 35) / 100,
        colorChromaMin: Number(entry?.color?.chromaMin ?? entry?.colorMaskChromaMin ?? 0) / 100,
        colorChromaMax: Number(entry?.color?.chromaMax ?? entry?.colorMaskChromaMax ?? 100) / 100,
        depthMin: Number(entry?.depth?.min ?? entry?.depthMaskMin ?? 0) / 100,
        depthMax: Number(entry?.depth?.max ?? entry?.depthMaskMax ?? 100) / 100,
        depthFeather: Number(entry?.depth?.feather ?? entry?.depthMaskFeather ?? 35) / 100,
        blend: String(entry?.blend ?? entry?.localMaskBlend ?? 'normal'),
        ...(mode === 'depth'
          ? {
              depthProxyBuffer:
                entry?.depthProxyBuffer instanceof Float32Array ? entry.depthProxyBuffer : null,
            }
          : {}),
      };
    })
    .filter(Boolean);

  const graphOpNorm = normalizeLocalMaskGraphOp(adjustments?.localMaskGraphOp);
  let graphCombineActive = false;
  let graphIdxA = 0;
  let graphIdxB = 1;
  if (Boolean(adjustments?.localMaskGraphEnabled) && brushMaskEnabled && localMaskStack.length >= 2) {
    graphIdxA = Math.max(
      0,
      Math.min(localMaskStack.length - 1, Math.round(Number(adjustments?.localMaskGraphIndexA ?? 0)))
    );
    graphIdxB = Math.max(
      0,
      Math.min(localMaskStack.length - 1, Math.round(Number(adjustments?.localMaskGraphIndexB ?? 1)))
    );
    graphCombineActive = graphIdxA !== graphIdxB;
    if (graphCombineActive && (!localMaskStack[graphIdxA] || !localMaskStack[graphIdxB])) {
      graphCombineActive = false;
    }
  }

  return {
    localMaskStack,
    graphCombineActive,
    graphIdxA,
    graphIdxB,
    graphOpNorm,
    brushMaskEnabled,
  };
}

/**
 * Grayscale ImageData of local mask weights at export resolution (source-aligned).
 * Uses source luminance / hue for luma / color masks (approximates graded preview weights).
 * When mask graph combine is active, exports combined A/B weights × driver opacity (matches preview intent).
 */
function buildExportMaskGrayscaleImageData(width, height, transformedSource, adjustments, maskCache) {
  if (!adjustments?.brushMaskEnabled) {
    return null;
  }

  const snap = buildLocalMaskStackSnapshot(width, height, adjustments, maskCache);
  if (!snap.localMaskStack.length) {
    return null;
  }

  const data = transformedSource.data;

  if (snap.graphCombineActive) {
    const entryA = snap.localMaskStack[snap.graphIdxA];
    const entryB = snap.localMaskStack[snap.graphIdxB];
    const driverIdx = Math.max(
      0,
      Math.min(snap.localMaskStack.length - 1, Number(adjustments?.activeLocalMaskIndex ?? 0))
    );
    const driver = snap.localMaskStack[driverIdx];
    if (!entryA || !entryB || !driver) {
      return null;
    }
    const out = new ImageData(width, height);
    const od = out.data;
    for (let pIdx = 0; pIdx < width * height; pIdx += 1) {
      const i = pIdx * 4;
      const wA = computeLocalMaskWeightAtPixel(entryA, pIdx, data[i], data[i + 1], data[i + 2]);
      const wB = computeLocalMaskWeightAtPixel(entryB, pIdx, data[i], data[i + 1], data[i + 2]);
      const combined = combineLocalMaskGraphWeights(wA, wB, snap.graphOpNorm);
      const v = Math.round(Math.max(0, Math.min(255, combined * driver.opacity * 255)));
      const j = pIdx * 4;
      od[j] = v;
      od[j + 1] = v;
      od[j + 2] = v;
      od[j + 3] = 255;
    }
    return out;
  }

  const mode = String(adjustments?.localMaskMode ?? 'brush');
  const opacity = Math.max(0, Math.min(1, Number(adjustments?.localMaskOpacity ?? 100) / 100));
  let buffer = null;
  if (mode === 'linear') {
    buffer = buildLinearMaskBuffer(width, height, adjustments);
  } else if (mode === 'radial') {
    buffer = buildRadialMaskBuffer(width, height, adjustments);
  } else if (mode === 'brush') {
    buffer = buildBrushMaskBuffer(width, height, adjustments?.brushMaskStrokes ?? []);
  } else if (mode === 'luma') {
    buffer = new Float32Array(width * height);
    const data = transformedSource.data;
    const maskEntry = {
      buffer: null,
      mode: 'luma',
      lumaMin: Number(adjustments?.lumaMaskMin ?? 0) / 100,
      lumaMax: Number(adjustments?.lumaMaskMax ?? 100) / 100,
      lumaFeather: Number(adjustments?.lumaMaskFeather ?? 35) / 100,
    };
    for (let pIdx = 0; pIdx < width * height; pIdx += 1) {
      const i = pIdx * 4;
      buffer[pIdx] = computeLocalMaskWeightAtPixel(
        maskEntry,
        pIdx,
        data[i],
        data[i + 1],
        data[i + 2]
      );
    }
  } else if (mode === 'color') {
    buffer = new Float32Array(width * height);
    const data = transformedSource.data;
    const maskEntry = {
      buffer: null,
      mode: 'color',
      colorHueCenter: Number(adjustments?.colorMaskHueCenter ?? 210),
      colorHueWidth: Number(adjustments?.colorMaskHueWidth ?? 90),
      colorFeather: Number(adjustments?.colorMaskFeather ?? 35) / 100,
      colorChromaMin: Number(adjustments?.colorMaskChromaMin ?? 0) / 100,
      colorChromaMax: Number(adjustments?.colorMaskChromaMax ?? 100) / 100,
    };
    for (let pIdx = 0; pIdx < width * height; pIdx += 1) {
      const i = pIdx * 4;
      buffer[pIdx] = computeLocalMaskWeightAtPixel(
        maskEntry,
        pIdx,
        data[i],
        data[i + 1],
        data[i + 2]
      );
    }
  } else if (mode === 'depth') {
    const brushBuf = buildBrushMaskBuffer(width, height, adjustments?.brushMaskStrokes ?? []);
    buffer = new Float32Array(width * height);
    const data = transformedSource.data;
    const useLumaProxy =
      String(adjustments?.depthMapSource ?? 'luminance') === 'luminance';
    const depthProxyBuf = useLumaProxy ? new Float32Array(width * height) : null;
    const maskEntry = {
      buffer: brushBuf,
      mode: 'depth',
      depthMin: Number(adjustments?.depthMaskMin ?? 0) / 100,
      depthMax: Number(adjustments?.depthMaskMax ?? 100) / 100,
      depthFeather: Number(adjustments?.depthMaskFeather ?? 35) / 100,
      depthProxyBuffer: depthProxyBuf,
    };
    for (let pIdx = 0; pIdx < width * height; pIdx += 1) {
      const i = pIdx * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (depthProxyBuf) {
        depthProxyBuf[pIdx] = rgbRec709LumaUnit(r, g, b);
      }
      buffer[pIdx] = computeLocalMaskWeightAtPixel(maskEntry, pIdx, r, g, b);
    }
  }

  if (!(buffer instanceof Float32Array) || buffer.length !== width * height) {
    return null;
  }

  let maxW = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] > maxW) maxW = buffer[i];
  }
  if (maxW <= 0.00001 && (mode === 'brush' || mode === 'depth')) {
    return null;
  }

  const out = new ImageData(width, height);
  const od = out.data;
  for (let pIdx = 0; pIdx < width * height; pIdx += 1) {
    const v = Math.round(Math.max(0, Math.min(255, buffer[pIdx] * opacity * 255)));
    const i = pIdx * 4;
    od[i] = v;
    od[i + 1] = v;
    od[i + 2] = v;
    od[i + 3] = 255;
  }
  return out;
}

function buildExportRecipeSnapshot({
  activeFilm,
  adjustments,
  renderDebugInfo,
  rawBackendPreference,
  pipelineKind = null,
  exportSessionId = null,
  sizeProfile,
  fileFormat,
  lossyQuality = undefined,
  sourceName = null,
  variant = 'after',
  artifactName = null,
  artifactMimeType = null,
}) {
  const runtimeTier = resolveRuntimeTier(renderDebugInfo);
  const recipeDocument = encodeFlatSnapshotToRecipeDocument({
    adjustments: adjustments && typeof adjustments === 'object' ? adjustments : {},
    activeFilmIndex: 0,
    userCurves: {},
    colorMixer: {},
    colorGrading: {},
    colorCalibration: {},
    zoom: 1,
    panOffset: { x: 0, y: 0 },
  });
  const recipeFingerprint = fingerprintRecipeDocumentStable(recipeDocument);
  const lossyQ = manifestLossyQualityForFilmLabExport(fileFormat, lossyQuality);
  const exportBlock = {
    sizeProfile,
    fileFormat,
    variant,
    artifactName,
    artifactMimeType,
  };
  if (lossyQ !== undefined) {
    exportBlock.lossyQuality = lossyQ;
  }
  return {
    schema: 'filmLab.recipe.export.v1',
    exportedAt: new Date().toISOString(),
    sourceName,
    export: exportBlock,
    film: {
      id: activeFilm?.id ?? null,
      name: activeFilm?.name ?? null,
    },
    runtime: {
      tier: runtimeTier?.tier ?? 'C',
      source: runtimeTier?.source ?? 'default-cpu',
      rawBackendPreference: rawBackendPreference ?? null,
      pipelineKind,
    },
    exportSessionId,
    recipeFingerprint: {
      algorithm: 'djb2-stable-v1',
      stable: recipeFingerprint,
    },
    recipeDocument,
    adjustments,
  };
}

async function sha256HexFromBytes(bytes) {
  const cryptoApi = globalThis?.crypto;
  if (!cryptoApi?.subtle || !(bytes instanceof Uint8Array)) {
    return null;
  }
  try {
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    const view = new Uint8Array(digest);
    return Array.from(view)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function applyFrame(context, canvas, type, seed = 1, variantIndex = null) {
  const { width, height } = canvas;
  const thin = Math.max(1, Math.round(Math.min(width, height) * 0.005));
  const thick = Math.max(4, Math.round(Math.min(width, height) * 0.04));
  const random = createSeededRandom(seed);

  context.save();

  switch (type) {
    case 'border-thin':
      context.strokeStyle = '#f5f0e8';
      context.lineWidth = thin * 2;
      context.strokeRect(thin, thin, width - thin * 2, height - thin * 2);
      break;
    case 'polaroid': {
      const padding = Math.round(Math.min(width, height) * 0.04);
      const bottomPadding = padding * 3;
      context.fillStyle = '#f5f0e8';
      context.fillRect(0, 0, width, padding);
      context.fillRect(0, 0, padding, height);
      context.fillRect(width - padding, 0, padding, height);
      context.fillRect(0, height - bottomPadding, width, bottomPadding);
      break;
    }
    case 'border-thick':
      context.fillStyle = '#f5f0e8';
      context.fillRect(0, 0, width, thick);
      context.fillRect(0, 0, thick, height);
      context.fillRect(width - thick, 0, thick, height);
      context.fillRect(0, height - thick, width, thick);
      break;
    case 'black-thin':
      context.strokeStyle = '#1a1a1a';
      context.lineWidth = thin * 2;
      context.strokeRect(thin, thin, width - thin * 2, height - thin * 2);
      break;
    case 'black-thick':
      context.fillStyle = '#1a1a1a';
      context.fillRect(0, 0, width, thick);
      context.fillRect(0, 0, thick, height);
      context.fillRect(width - thick, 0, thick, height);
      context.fillRect(0, height - thick, width, thick);
      break;
    case 'filmstrip': {
      const overlayApplied = drawRandomOverlay({
        context,
        canvas,
        random,
        folder: 'filmstrip',
        files: FILMSTRIP_OVERLAY_FILES,
        fileIndex: variantIndex,
        opacity: 0.95,
        blendMode: 'screen',
        matchOrientation: true,
        strictOrientation: true,
        randomizeTransform: false,
      });

      if (!overlayApplied) {
        const strip = Math.round(Math.min(width, height) * 0.05);
        context.fillStyle = '#151514';
        context.fillRect(0, 0, width, strip);
        context.fillRect(0, height - strip, width, strip);
      }
      break;
    }
    case 'raw-darkroom': {
      const darkroom = Math.round(Math.min(width, height) * 0.05);
      context.fillStyle = '#0a0a08';
      context.fillRect(0, 0, width, darkroom);
      context.fillRect(0, 0, darkroom, height);
      context.fillRect(width - darkroom, 0, darkroom, height);
      context.fillRect(0, height - darkroom, width, darkroom);
      context.strokeStyle = 'rgba(196,148,78,0.25)';
      context.lineWidth = 1;
      context.strokeRect(darkroom + 3, darkroom + 3, width - darkroom * 2 - 6, height - darkroom * 2 - 6);
      context.strokeRect(darkroom + 5, darkroom + 5, width - darkroom * 2 - 10, height - darkroom * 2 - 10);
      break;
    }
    case 'raw-leakedge': {
      const edge = Math.round(Math.min(width, height) * 0.02);
      context.fillStyle = 'rgba(255,140,40,0.15)';
      context.fillRect(0, 0, edge * 3, height);
      context.fillStyle = 'rgba(255,80,80,0.1)';
      context.fillRect(0, 0, width, edge * 2);
      context.fillStyle = 'rgba(180,120,255,0.08)';
      context.fillRect(width - edge * 4, 0, edge * 4, height);
      context.strokeStyle = 'rgba(255,255,255,0.06)';
      context.lineWidth = 1;
      context.strokeRect(edge, edge, width - edge * 2, height - edge * 2);
      break;
    }
    default:
      break;
  }

  context.restore();
}

// Before must match full buffer size: after first applyLevelAndCrop, the canvas
// can be a cropped (smaller) size; putImageData would clip and break aspect in the view.
function applyCompare(context, canvas, originalSource) {
  const w = originalSource.width;
  const h = originalSource.height;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const original = new ImageData(new Uint8ClampedArray(originalSource.data), w, h);
  context.putImageData(original, 0, 0);
}

function requestIdleCallbackSafe(callback, timeout = 120) {
  if (typeof window === 'undefined') {
    return setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), timeout);
  }

  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout });
  }

  return window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), timeout);
}

function cancelIdleCallbackSafe(handle) {
  if (handle == null) {
    return;
  }

  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle);
    return;
  }

  clearTimeout(handle);
}

function getPreviewMaxDimension(width, height) {
  const megapixels = (width * height) / 1_000_000;
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900;
  const viewportMaxEdge =
    typeof window !== 'undefined'
      ? Math.max(window.innerWidth * 0.54, window.innerHeight * 0.78)
      : 980;
  const deviceScale =
    typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.18) : 1;
  const desired = Math.round(viewportMaxEdge * deviceScale);
  const minTarget = isMobile ? 700 : 820;

  if (isMobile) {
    return clamp(desired, minTarget, megapixels > 20 ? 860 : 980);
  }

  if (megapixels > 30) {
    return clamp(desired, minTarget, 920);
  }

  if (megapixels > 20) {
    return clamp(desired, minTarget, 980);
  }

  if (megapixels > 12) {
    return clamp(desired, minTarget, 1040);
  }

  return clamp(desired, minTarget, 1120);
}

function getWorkerProxyMaxDimension(width, height) {
  const megapixels = (width * height) / 1_000_000;
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900;
  const viewportMaxEdge =
    typeof window !== 'undefined'
      ? Math.max(window.innerWidth * 0.42, window.innerHeight * 0.56)
      : 760;
  const desired = Math.round(viewportMaxEdge);
  const minTarget = isMobile ? 480 : 560;

  if (isMobile) {
    return clamp(desired, minTarget, megapixels > 12 ? 680 : 740);
  }

  if (megapixels > 20) {
    return clamp(desired, minTarget, 720);
  }

  if (megapixels > 12) {
    return clamp(desired, minTarget, 780);
  }

  return clamp(desired, minTarget, 860);
}

function getInteractiveWorkerProxyMaxDimension(baseMax, interactionKind = 'idle') {
  const normalizedBase = Math.max(360, Math.round(baseMax || 0));
  const kind = String(interactionKind || 'idle');

  if (kind === 'curve') {
    return Math.max(360, Math.round(normalizedBase * 0.7));
  }

  if (
    kind.startsWith('slider:userGrain') ||
    kind.startsWith('slider:chromAb') ||
    kind.startsWith('slider:bloom') ||
    kind.startsWith('slider:halation') ||
    kind.startsWith('slider:anamorph')
  ) {
    return Math.max(360, Math.round(normalizedBase * 0.68));
  }

  if (
    kind.startsWith('slider:mixer-') ||
    kind.startsWith('slider:grade-') ||
    kind.startsWith('slider:calibration-')
  ) {
    return Math.max(360, Math.round(normalizedBase * 0.74));
  }

  if (kind.startsWith('slider:')) {
    return Math.max(360, Math.round(normalizedBase * 0.8));
  }

  return normalizedBase;
}

function applyOrderedPreviewDither(data, width, height, amount = 0.75) {
  if (amount <= 0) {
    return;
  }

  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const threshold = (bayer4[y % 4][x % 4] / 15 - 0.5) * amount;
      const pixelIndex = (y * width + x) * 4;

      data[pixelIndex] = clamp(Math.round(data[pixelIndex] + threshold));
      data[pixelIndex + 1] = clamp(Math.round(data[pixelIndex + 1] + threshold));
      data[pixelIndex + 2] = clamp(Math.round(data[pixelIndex + 2] + threshold));
    }
  }
}

function hasDeferredPreviewEffects(film, adjustments) {
  const profileUsesPreviewLut = Boolean(film?.previewLutFile);

  return Boolean(
    (!profileUsesPreviewLut &&
      ((film?.texture ?? 0) !== 0 ||
        (film?.clarity ?? 0) !== 0 ||
        (film?.grain ?? 0) !== 0 ||
        (film?.vignette ?? 0) !== 0)) ||
      (adjustments?.userGrain ?? 0) > 0 ||
      (adjustments?.userVignette ?? 0) > 0 ||
      (adjustments?.chromAb ?? 0) > 0 ||
      (adjustments?.bloom ?? 0) > 0 ||
      (adjustments?.dust ?? 0) > 0 ||
      (adjustments?.halation ?? 0) > 0 ||
      (adjustments?.anamorph ?? 0) > 0 ||
      (adjustments?.frame && adjustments.frame !== 'none') ||
      (adjustments?.leak && adjustments.leak !== 'none')
  );
}

function buildWorkerFilmPayload(film) {
  if (!film) {
    return {};
  }

  return {
    exposure: film.exposure ?? 0,
    contrast: film.contrast ?? 0,
    saturation: film.saturation ?? 0,
    vibrance: film.vibrance ?? 0,
    temperature: film.temperature ?? 0,
    tint: film.tint ?? 0,
    highlights: film.highlights ?? 0,
    shadows: film.shadows ?? 0,
    whites: film.whites ?? 0,
    blacks: film.blacks ?? 0,
    dehaze: film.dehaze ?? 0,
    clarity: film.clarity ?? 0,
    curves: film.curves ?? IDENTITY_CURVES,
  };
}

function buildWorkerAdjustmentsPayload(adjustments, profileLutStatus = 'idle') {
  if (!adjustments) {
    return {};
  }

  return {
    strength: adjustments.strength ?? 100,
    exposure: adjustments.exposure ?? 0,
    contrast: adjustments.contrast ?? 0,
    highlights: adjustments.highlights ?? 0,
    shadows: adjustments.shadows ?? 0,
    whites: adjustments.whites ?? 0,
    blacks: adjustments.blacks ?? 0,
    temp: adjustments.temp ?? 0,
    tint: adjustments.tint ?? 0,
    saturation: adjustments.saturation ?? 0,
    vibrance: adjustments.vibrance ?? 0,
    fade: adjustments.fade ?? 0,
    clarity: adjustments.clarity ?? 0,
    dehaze: adjustments.dehaze ?? 0,
    userGrain: adjustments.userGrain ?? 0,
    userGrainSize: adjustments.userGrainSize ?? 10,
    userVignette: adjustments.userVignette ?? 0,
    chromAb: adjustments.chromAb ?? 0,
    bloom: adjustments.bloom ?? 0,
    halation: adjustments.halation ?? 0,
    halRadius: adjustments.halRadius ?? 30,
    halThresh: adjustments.halThresh ?? 200,
    halHue: adjustments.halHue ?? 0,
    anamorph: adjustments.anamorph ?? 0,
    streakLen: adjustments.streakLen ?? 50,
    userCurves: adjustments.userCurves ?? IDENTITY_CURVES,
    isAdjusting: Boolean(adjustments.isAdjusting),
    interactionKind: adjustments.interactionKind ?? 'idle',
    profileLutStatus,
    showClipping: Boolean(adjustments.showClipping),
  };
}

function getPresentationDimensions(width, height, rotation = 0) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return {
      width: height,
      height: width,
    };
  }

  return { width, height };
}

function drawPresentedImage(
  context,
  image,
  sourceWidth,
  sourceHeight,
  rotation = 0,
  flipped = false,
  clipWidth = null
) {
  const { width: outputWidth, height: outputHeight } = getPresentationDimensions(
    sourceWidth,
    sourceHeight,
    rotation
  );

  context.save();

  if (clipWidth != null) {
    context.beginPath();
    context.rect(0, 0, clipWidth, outputHeight);
    context.clip();
  }

  context.translate(outputWidth / 2, outputHeight / 2);
  context.rotate((((rotation % 360) + 360) % 360) * Math.PI / 180);
  context.scale(flipped ? -1 : 1, 1);
  context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  context.restore();
}

function applyLevelAndCropTransform(context, canvas, fxCanvasRef, adjustments) {
  const level = Number(adjustments?.level ?? 0) || 0;
  const bypassCrop = Boolean(adjustments?.cropBypass);
  const rectCandidate = {
    x: Number(adjustments?.cropRectX),
    y: Number(adjustments?.cropRectY),
    w: Number(adjustments?.cropRectW),
    h: Number(adjustments?.cropRectH),
  };
  const hasExplicitRect =
    !bypassCrop &&
    Number.isFinite(rectCandidate.x) &&
    Number.isFinite(rectCandidate.y) &&
    Number.isFinite(rectCandidate.w) &&
    Number.isFinite(rectCandidate.h);

  const { width, height } = canvas;
  const levelCompensation = 1 + Math.min(0.16, Math.abs(level) / 180);
  let zoom = 1;
  let shiftX = 0;
  let shiftY = 0;
  let hasCropAdjustment = false;
  let explicitCropRect = null;

  if (hasExplicitRect) {
    const minSize = 0.05;
    const normalizedRect = {
      x: clamp(rectCandidate.x, 0, 1),
      y: clamp(rectCandidate.y, 0, 1),
      w: clamp(rectCandidate.w, minSize, 1),
      h: clamp(rectCandidate.h, minSize, 1),
    };
    if (normalizedRect.x + normalizedRect.w > 1) {
      normalizedRect.w = 1 - normalizedRect.x;
    }
    if (normalizedRect.y + normalizedRect.h > 1) {
      normalizedRect.h = 1 - normalizedRect.y;
    }
    normalizedRect.w = clamp(normalizedRect.w, minSize, 1 - normalizedRect.x);
    normalizedRect.h = clamp(normalizedRect.h, minSize, 1 - normalizedRect.y);
    explicitCropRect = normalizedRect;

    const centerX = normalizedRect.x + normalizedRect.w / 2;
    const centerY = normalizedRect.y + normalizedRect.h / 2;
    const zoomFromRect = 1 / Math.max(normalizedRect.w, normalizedRect.h);
    zoom = Math.max(zoomFromRect, levelCompensation, 1);

    const maxShiftX = Math.max(0, ((zoom - 1) * width) / 2);
    const maxShiftY = Math.max(0, ((zoom - 1) * height) / 2);
    shiftX = clamp((0.5 - centerX) * width * zoom, -maxShiftX, maxShiftX);
    shiftY = clamp((0.5 - centerY) * height * zoom, -maxShiftY, maxShiftY);

    hasCropAdjustment =
      Math.abs(normalizedRect.x) > 0.0001 ||
      Math.abs(normalizedRect.y) > 0.0001 ||
      Math.abs(normalizedRect.w - 1) > 0.0001 ||
      Math.abs(normalizedRect.h - 1) > 0.0001;
  } else if (!bypassCrop) {
    const cropZoom = Number(adjustments?.cropZoom ?? 100) || 100;
    const cropX = Number(adjustments?.cropX ?? 0) || 0;
    const cropY = Number(adjustments?.cropY ?? 0) || 0;
    zoom = Math.max(cropZoom / 100, levelCompensation, 1);
    const baseShiftX = Math.max(0, ((zoom - 1) * width) / 2);
    const baseShiftY = Math.max(0, ((zoom - 1) * height) / 2);
    shiftX = (cropX / 100) * baseShiftX * 1.6;
    shiftY = (cropY / 100) * baseShiftY * 1.6;
    hasCropAdjustment =
      Math.abs(cropX) > 0.01 ||
      Math.abs(cropY) > 0.01 ||
      Math.abs(cropZoom - 100) > 0.01;
  } else {
    zoom = Math.max(levelCompensation, 1);
    shiftX = 0;
    shiftY = 0;
    hasCropAdjustment = false;
  }

  if (Math.abs(level) < 0.01 && !hasCropAdjustment) {
    return;
  }

  const fxCanvas = ensureCanvas(fxCanvasRef, width, height);
  const fxContext = getCanvasContext(fxCanvas, { willReadFrequently: true });
  if (!fxContext) {
    return;
  }
  fxContext.clearRect(0, 0, width, height);
  fxContext.drawImage(canvas, 0, 0, width, height);

  // For explicit crop rectangles, map 1:1 to selected source region.
  // The legacy zoom/shift model cannot represent arbitrary aspect ratios
  // (e.g. 1:1 on a 3:2 source), which causes "crop in different place".
  if (explicitCropRect) {
    const srcX = clamp(Math.round(explicitCropRect.x * width), 0, Math.max(0, width - 1));
    const srcY = clamp(Math.round(explicitCropRect.y * height), 0, Math.max(0, height - 1));
    const srcW = clamp(Math.round(explicitCropRect.w * width), 1, Math.max(1, width - srcX));
    const srcH = clamp(Math.round(explicitCropRect.h * height), 1, Math.max(1, height - srcY));

    if (canvas.width !== srcW) {
      canvas.width = srcW;
    }
    if (canvas.height !== srcH) {
      canvas.height = srcH;
    }
    context.clearRect(0, 0, srcW, srcH);
    context.drawImage(fxCanvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    if (Math.abs(level) < 0.01) {
      return;
    }

    const croppedCanvas = ensureCanvas(fxCanvasRef, srcW, srcH);
    const croppedContext = getCanvasContext(croppedCanvas, { willReadFrequently: true });
    if (!croppedContext) {
      return;
    }
    croppedContext.clearRect(0, 0, srcW, srcH);
    croppedContext.drawImage(canvas, 0, 0, srcW, srcH);

    const levelZoom = Math.max(levelCompensation, 1);
    context.save();
    context.clearRect(0, 0, srcW, srcH);
    context.translate(srcW / 2, srcH / 2);
    context.rotate((level * Math.PI) / 180);
    context.scale(levelZoom, levelZoom);
    context.drawImage(croppedCanvas, -srcW / 2, -srcH / 2, srcW, srcH);
    context.restore();
    return;
  }

  context.save();
  context.clearRect(0, 0, width, height);
  context.translate(width / 2 + shiftX, height / 2 + shiftY);
  context.rotate((level * Math.PI) / 180);
  context.scale(zoom, zoom);
  context.drawImage(fxCanvas, -width / 2, -height / 2, width, height);
  context.restore();
}

function isIdentityCurveChannel(points) {
  return Boolean(
    points &&
      points.length === 2 &&
      points[0]?.[0] === 0 &&
      points[0]?.[1] === 0 &&
      points[1]?.[0] === 255 &&
      points[1]?.[1] === 255
  );
}

function hasUserCurveAdjustments(userCurves) {
  if (!userCurves) {
    return false;
  }

  return !(
    isIdentityCurveChannel(userCurves.rgb) &&
    isIdentityCurveChannel(userCurves.r) &&
    isIdentityCurveChannel(userCurves.g) &&
    isIdentityCurveChannel(userCurves.b)
  );
}

function hasColorGradeAdjustments(colorGrade) {
  if (!colorGrade) {
    return false;
  }

  const zoneHasAdjustments = (zone) => {
    const hasHue = Math.abs(Number(colorGrade?.[zone]?.hue) || 0) > 0.01;
    const hasSaturation =
      Math.abs(Number(colorGrade?.[zone]?.saturation) || 0) > 0.01;
    const hasLuminance =
      zone === 'global'
        ? false
        : Math.abs(Number(colorGrade?.[zone]?.luminance) || 0) > 0.01;

    return hasHue || hasSaturation || hasLuminance;
  };

  return (
    zoneHasAdjustments('shadows') ||
    zoneHasAdjustments('midtones') ||
    zoneHasAdjustments('highlights') ||
    zoneHasAdjustments('global')
  );
}

function canUseFastPreviewPath(
  film,
  adjustments,
  profileLut,
  profileLutStatus = 'idle',
  options = {}
) {
  if (!adjustments) {
    return false;
  }

  const allowApproximateDuringAdjust = Boolean(options.allowApproximateDuringAdjust);
  const interactionKind = String(adjustments?.interactionKind ?? 'idle');
  const hasActiveProfile = !film?.isInputProfile && (adjustments?.strength ?? 100) > 0.01;

  if (allowApproximateDuringAdjust) {
    if (shouldForceCpuPreviewDuringAdjust(interactionKind)) {
      return false;
    }

    if (adjustments?.compareMode) {
      return false;
    }

    // Do not use approximate fast path when any deferred effect is active.
    // This keeps all creative effects visible while dragging sliders.
    if (PRESERVE_FULL_EFFECT_STACK_DURING_ADJUST && hasDeferredPreviewEffects(film, adjustments)) {
      return false;
    }
    // During drag, prefer the fast path unconditionally to keep UI responsive.
    // If LUT is still loading/failed, renderer uses analytic profile fallback.
    return true;
  }

  // Keep non-drag preview visually stable with active film profiles.
  // CPU preview matches the export pipeline and avoids profile drop-out.
  if (hasActiveProfile) {
    return false;
  }

  if (
    Math.abs(adjustments.highlights ?? 0) > 0.01 ||
    Math.abs(adjustments.shadows ?? 0) > 0.01 ||
    Math.abs(adjustments.whites ?? 0) > 0.01 ||
    Math.abs(adjustments.blacks ?? 0) > 0.01 ||
    Math.abs(adjustments.clarity ?? 0) > 0.01 ||
    Math.abs(adjustments.dehaze ?? 0) > 0.01 ||
    Math.abs(adjustments.userGrain ?? 0) > 0.01 ||
    Math.abs(adjustments.userVignette ?? 0) > 0.01 ||
    Math.abs(adjustments.chromAb ?? 0) > 0.01 ||
    Math.abs(adjustments.bloom ?? 0) > 0.01 ||
    Math.abs(adjustments.dust ?? 0) > 0.01 ||
    Math.abs(adjustments.halation ?? 0) > 0.01 ||
    Math.abs(adjustments.anamorph ?? 0) > 0.01 ||
    (adjustments.leak && adjustments.leak !== 'none') ||
    (adjustments.frame && adjustments.frame !== 'none')
  ) {
    return false;
  }

  // Color Grade, HSL, Curves, and Calibration are fully supported in fast preview
  // via the dynamically built fastLookLut, so we no longer bail out here.

  if (film?.previewLutFile) {
    if (profileLutStatus === 'loading') {
      return false;
    }

    if (profileLutStatus === 'failed') {
      return false;
    }

    return Boolean(profileLut);
  }

  return true;
}

function buildFastPreviewAdjustments(film, adjustments, profileLutStatus = 'idle') {
  const next = {
    ...(adjustments ?? {}),
  };
  const interactionKind = String(adjustments?.interactionKind ?? 'idle');
  const isAdjustingInteraction = Boolean(adjustments?.isAdjusting);
  const isCurveInteraction = interactionKind === 'curve';
  const isHslInteraction = interactionKind.startsWith('slider:mixer-');
  const isGradeInteraction = interactionKind.startsWith('slider:grade-');
  const isCalibrationInteraction = interactionKind.startsWith('slider:calibration-');
  const isAdvancedColorInteraction =
    isHslInteraction || isGradeInteraction || isCalibrationInteraction;

  next.showClipping = Boolean(adjustments?.showClipping);

  const strength = (adjustments?.strength ?? 100) / 100;
  const effectiveProfileStrength = strength;
  const hasProfileLut = Boolean(film?.previewLutFile && (profileLutStatus === 'ready' || profileLutStatus === 'loading'));
  // Keep LUT state active during drag to prevent profile drop-out.
  const useProfileLutInFastDrag = true;
  const hasEffectiveProfileLut = hasProfileLut && useProfileLutInFastDrag;
  const shouldBypassProfileCpuColor = false;
  const profileNoLutBoost = hasEffectiveProfileLut ? 1 : 1.05;
  const profileMasterCurveStrength = effectiveProfileStrength * 0.42 * profileNoLutBoost;
  const profileChannelCurveStrength = effectiveProfileStrength * 0.86 * profileNoLutBoost;
  const profileColorStrength = effectiveProfileStrength * 0.9 * profileNoLutBoost;
  const profileBalanceStrength = effectiveProfileStrength * 0.64 * profileNoLutBoost;
  const profileToneStrength = effectiveProfileStrength * 0.28 * profileNoLutBoost;
  const profileDetailStrength = effectiveProfileStrength * 0.4 * profileNoLutBoost;

  const userExposure =
    mapSignedSliderForResponse(adjustments?.exposure ?? 0, 'exposure') *
    USER_RESPONSE_SCALE.exposure;
  const userContrast =
    mapSignedSliderForResponse(adjustments?.contrast ?? 0, 'contrast') *
    USER_RESPONSE_SCALE.contrast;
  const userSaturation =
    mapSignedSliderForResponse(adjustments?.saturation ?? 0, 'saturation') *
    USER_RESPONSE_SCALE.saturation;
  const userVibrance =
    mapSignedSliderForResponse(adjustments?.vibrance ?? 0, 'vibrance') *
    USER_RESPONSE_SCALE.vibrance;
  const userTemperature = Number(adjustments?.temp ?? 0);
  const userTint = Number(adjustments?.tint ?? 0);
  const userHighlights =
    mapSignedSliderForResponse(adjustments?.highlights ?? 0, 'highlights') *
    USER_RESPONSE_SCALE.highlights;
  const userShadows =
    mapSignedSliderForResponse(adjustments?.shadows ?? 0, 'shadows') *
    USER_RESPONSE_SCALE.shadows;
  const userWhites =
    mapSignedSliderForResponse(adjustments?.whites ?? 0, 'whites') *
    USER_RESPONSE_SCALE.whites;
  const userBlacks =
    mapSignedSliderForResponse(adjustments?.blacks ?? 0, 'blacks') *
    USER_RESPONSE_SCALE.blacks;
  const userDehaze =
    mapSignedSliderForResponse(adjustments?.dehaze ?? 0, 'dehaze') *
    USER_RESPONSE_SCALE.dehaze;
  const userClarity =
    mapSignedSliderForResponse(adjustments?.clarity ?? 0, 'clarity') *
    USER_RESPONSE_SCALE.clarity;
  const fadeAmount =
    (mapUnsignedSliderForResponse(adjustments?.fade ?? 0, 'fade') *
      USER_RESPONSE_SCALE.fade) /
    100;

  const profileExposure =
    shouldBypassProfileCpuColor
      ? 0
      : (film?.exposure ?? 0) * profileToneStrength;
  const mappedExposureEv = mapFilmSafeExposureEv(userExposure / 100 + profileExposure);
  const totalCon =
    1 +
    (((shouldBypassProfileCpuColor ? 0 : film?.contrast ?? 0) * profileColorStrength) / 200) +
    userContrast / 200;
  const totalSat =
    1 +
    (((shouldBypassProfileCpuColor ? 0 : film?.saturation ?? 0) * profileColorStrength) / 100 +
      userSaturation / 100);
  const totalVib =
    (((shouldBypassProfileCpuColor ? 0 : film?.vibrance ?? 0) * profileColorStrength) / 100) +
    userVibrance / 100;
  const profileTemperature =
    (shouldBypassProfileCpuColor ? 0 : film?.temperature ?? 0) * profileBalanceStrength;
  const profileTint =
    (shouldBypassProfileCpuColor ? 0 : film?.tint ?? 0) * profileBalanceStrength;
  const totalTemperature = clamp(userTemperature + profileTemperature, -100, 100);
  const totalTint = clamp(userTint + profileTint, -100, 100);
  const wb = resolveWhiteBalanceGains(totalTemperature, totalTint);
  next.temp = totalTemperature;
  next.tint = totalTint;
  next.fastWbR = wb.r;
  next.fastWbG = wb.g;
  next.fastWbB = wb.b;

  const profileDehaze =
    ((shouldBypassProfileCpuColor ? 0 : film?.dehaze ?? 0) * profileDetailStrength) / 140;
  const profileClarity =
    ((shouldBypassProfileCpuColor ? 0 : film?.clarity ?? 0) * profileDetailStrength) / 85;
  const totalDehaze = profileDehaze + userDehaze / 100;
  const totalClarity = profileClarity + userClarity / 100;

  const profileHighlights =
    ((shouldBypassProfileCpuColor ? 0 : film?.highlights ?? 0) * profileToneStrength) / 100;
  const profileShadows =
    ((shouldBypassProfileCpuColor ? 0 : film?.shadows ?? 0) * profileToneStrength) / 100;
  const profileWhites =
    ((shouldBypassProfileCpuColor ? 0 : film?.whites ?? 0) * profileToneStrength) / 100;
  const profileBlacks =
    ((shouldBypassProfileCpuColor ? 0 : film?.blacks ?? 0) * profileToneStrength) / 100;
  const userCurveToneCompensation = hasUserCurveAdjustments(adjustments?.userCurves) ? 0.42 : 0;
  const userTonePreWeight = 1 - userCurveToneCompensation;
  const totalHighlightsPre = profileHighlights + (userHighlights / 100) * userTonePreWeight;
  const totalShadowsPre = profileShadows + (userShadows / 100) * userTonePreWeight;
  const totalWhitesPre = profileWhites + (userWhites / 100) * userTonePreWeight;
  const totalBlacksPre = profileBlacks + (userBlacks / 100) * userTonePreWeight;
  const totalHighlightsPost = (userHighlights / 100) * userCurveToneCompensation;
  const totalShadowsPost = (userShadows / 100) * userCurveToneCompensation;
  const totalWhitesPost = (userWhites / 100) * userCurveToneCompensation;
  const totalBlacksPost = (userBlacks / 100) * userCurveToneCompensation;
  const mappedUserHsl = mapHslStateForResponse(adjustments?.userHsl ?? null);
  const mappedUserColorGrade = mapColorGradeStateForResponse(
    adjustments?.userColorGrade ?? null
  );
  const mappedUserCalibration = mapCalibrationStateForResponse(
    adjustments?.userCalibration ?? null
  );
  const userRegionalAdjustments = createRegionalAdjustments(
    mappedUserHsl,
    USER_RESPONSE_SCALE.mixer
  );
  const userColorGradeStrength = USER_RESPONSE_SCALE.grading;
  const userCalibrationAdjustments = createCalibrationAdjustments(
    mappedUserCalibration,
    USER_RESPONSE_SCALE.calibration
  );
  const isBlackAndWhite = !film?.previewLutFile && Boolean(film?.bw);
  const hasProfileCurveFallback =
    !isBlackAndWhite &&
    !hasEffectiveProfileLut &&
    !shouldBypassProfileCpuColor &&
    Boolean(film?.curves?.rgb && film?.curves?.r && film?.curves?.g && film?.curves?.b) &&
    effectiveProfileStrength > 0.0001;
  const hasFastLookAdjustments =
    hasProfileCurveFallback ||
    isBlackAndWhite ||
    hasUserCurveAdjustments(adjustments?.userCurves ?? IDENTITY_CURVES) ||
    Math.abs(totalHighlightsPost) > 0.0001 ||
    Math.abs(totalShadowsPost) > 0.0001 ||
    Math.abs(totalWhitesPost) > 0.0001 ||
    Math.abs(totalBlacksPost) > 0.0001 ||
    (!isBlackAndWhite &&
      (userCalibrationAdjustments.enabled ||
        userRegionalAdjustments.enabled ||
        hasColorGradeAdjustments(mappedUserColorGrade)));

  next.fastExposure = mappedExposureEv;
  next.fastContrast = totalCon;
  next.fastSaturation = totalSat;
  next.fastVibrance = totalVib;
  next.temp = totalTemperature;
  next.tint = totalTint;
  next.fastFade = fadeAmount;
  next.fastHighlights = totalHighlightsPre;
  next.fastShadows = totalShadowsPre;
  next.fastWhites = totalWhitesPre;
  next.fastBlacks = totalBlacksPre;
  next.fastDehaze = totalDehaze;
  next.fastClarity = totalClarity;
  next.fastDehazeLiftScale = 1;
  next.fastGrain = (adjustments?.userGrain ?? 0) / 100;
  next.fastGrainSize = Math.max(0.1, (adjustments?.userGrainSize ?? 10) / 100);
  next.fastChromAb = Math.min(1, (adjustments?.chromAb ?? 0) / 100);
  next.fastBloom = Math.min(1, (adjustments?.bloom ?? 0) / 100);
  next.fastVignette = clampUnit(
    (Math.abs(((shouldBypassProfileCpuColor ? 0 : film?.vignette ?? 0) * strength * 0.12)) +
      (adjustments?.userVignette ?? 0)) /
      100
  );
  next.fastHalation = clampUnit((adjustments?.halation ?? 0) / 100);
  next.fastHalRadius = clampUnit(((adjustments?.halRadius ?? 30) - 5) / 75);
  next.fastHalThreshold = mapHalationThresholdUnit(adjustments?.halThresh ?? 200);
  next.fastHalHue = Math.max(-1, Math.min(1, (adjustments?.halHue ?? 0) / 100));
  next.fastAnamorph = clampUnit((adjustments?.anamorph ?? 0) / 100);
  next.fastStreakLen = clampUnit(((adjustments?.streakLen ?? 50) - 10) / 90);

  if (hasFastLookAdjustments) {
    const fastLookLutSize = isAdjustingInteraction
      ? isCurveInteraction
        ? 9
        : isAdvancedColorInteraction
          ? 9
          : 9
      : FAST_LOOK_LUT_SIZE;
    const fastCurveResolution = isAdjustingInteraction
      ? isCurveInteraction
        ? 128
        : 256
      : USER_CURVE_LUT_RESOLUTION;
    const curveLumaMix = resolveCurveLumaMix(adjustments?.curveLumaMix);
    const lookState = {
      lutSize: fastLookLutSize,
      curveResolution: fastCurveResolution,
      userCurves: adjustments?.userCurves ?? IDENTITY_CURVES,
      curveLumaMix,
      profileCurveSource: hasProfileCurveFallback
        ? {
            rgb: film?.curves?.rgb ?? IDENTITY_CURVES.rgb,
            r: film?.curves?.r ?? IDENTITY_CURVES.r,
            g: film?.curves?.g ?? IDENTITY_CURVES.g,
            b: film?.curves?.b ?? IDENTITY_CURVES.b,
          }
        : null,
      profileChannelCurveStrength: hasProfileCurveFallback
        ? profileChannelCurveStrength
        : 0,
      profileMasterCurveStrength: hasProfileCurveFallback
        ? profileMasterCurveStrength
        : 0,
      profileGrayMixer: isBlackAndWhite ? film?.grayMixer ?? null : null,
      tonePost: {
        highlights: totalHighlightsPost,
        shadows: totalShadowsPost,
        whites: totalWhitesPost,
        blacks: totalBlacksPost,
      },
      isBlackAndWhite,
      userCalibration: userCalibrationAdjustments.enabled
        ? userCalibrationAdjustments.calibration
        : null,
      userRegional: userRegionalAdjustments.enabled
        ? {
            hue: userRegionalAdjustments.hue,
            saturation: userRegionalAdjustments.saturation,
            luminance: userRegionalAdjustments.luminance,
            strength: userRegionalAdjustments.strength,
          }
        : null,
      userColorGrade: hasColorGradeAdjustments(mappedUserColorGrade)
        ? mappedUserColorGrade
        : null,
      userColorGradeStrength,
    };
    
    const getArrayHash = (arr) => {
      if (!arr || !arr.length) return '0';
      // For curves, treat the whole array as the hash to ensure any point move updates the key.
      if (arr.length < 20 && Array.isArray(arr[0])) {
        return JSON.stringify(arr);
      }
      return `${arr.length}-${arr[0]}-${arr[Math.floor(arr.length/2)]}-${arr[arr.length-1]}`;
    };
    const getCurveStateHash = (curves) => {
       if (!curves) return 'none';
       return `${getArrayHash(curves.rgb)}|${getArrayHash(curves.r)}|${getArrayHash(curves.g)}|${getArrayHash(curves.b)}`;
    };

    const getHslHash = (hsl) => {
      if (!hsl) return 'none';
      return `${hsl.hue.join(',')}|${hsl.saturation.join(',')}|${hsl.luminance.join(',')}|${hsl.strength}`;
    };

    const getColorGradeHash = (cg) => {
      if (!cg) return 'none';
      return `${cg.shadows.h},${cg.shadows.s},${cg.shadows.l}|${cg.midtones.h},${cg.midtones.s},${cg.midtones.l}|${cg.highlights.h},${cg.highlights.s},${cg.highlights.l}|${cg.blending},${cg.balance}`;
    };

    const getCalibrationHash = (cal) => {
      if (!cal) return 'none';
      return `${cal.shadowsTint}|${cal.redHue},${cal.redSat}|${cal.greenHue},${cal.greenSat}|${cal.blueHue},${cal.blueSat}`;
    };

    const cacheKey = JSON.stringify({
      s: lookState.lutSize,
      c: lookState.curveResolution,
      m: lookState.curveLumaMix,
      uC: getCurveStateHash(lookState.userCurves),
      pC: getCurveStateHash(lookState.profileCurveSource),
      ps: lookState.profileChannelCurveStrength,
      ms: lookState.profileMasterCurveStrength,
      pcg: lookState.profileColorGrade,
      pcgs: lookState.profileColorGradeStrength,
      t: lookState.tonePost,
      b: lookState.isBlackAndWhite,
      cal: getCalibrationHash(lookState.userCalibration),
      reg: getHslHash(lookState.userRegional),
      cg: getColorGradeHash(lookState.userColorGrade),
      cgs: lookState.userColorGradeStrength
    });
    
    let lookLut = fastLookLutCache.get(cacheKey);

    if (!lookLut) {
      lookLut = buildFastLookLut({
        cacheKey,
        userCurves: lookState.userCurves,
        curveLumaMix: lookState.curveLumaMix,
        profileCurveSource: lookState.profileCurveSource,
        profileChannelCurveStrength: lookState.profileChannelCurveStrength,
        profileMasterCurveStrength: lookState.profileMasterCurveStrength,
        profileGrayMixer: lookState.profileGrayMixer,
        profileColorGrade: lookState.profileColorGrade,
        profileColorGradeStrength: lookState.profileColorGradeStrength,
        tonePost: lookState.tonePost,
        isBlackAndWhite: lookState.isBlackAndWhite,
        userCalibrationAdjustments: userCalibrationAdjustments.enabled
          ? userCalibrationAdjustments
          : null,
        userRegionalAdjustments: userRegionalAdjustments.enabled
          ? userRegionalAdjustments
          : null,
        userColorGrade: lookState.userColorGrade,
        userColorGradeStrength,
        size: fastLookLutSize,
        curveResolution: fastCurveResolution,
      });
      setFastLookLutCache(cacheKey, lookLut);
    }

    next.fastLookLut = lookLut;
  } else {
    next.fastLookLut = null;
  }

  return next;
}

function computeMedianLuma(imageData) {
  if (!imageData || !imageData.data) return 0.18;
  const { data } = imageData;
  const hist = new Int32Array(256);
  const step = 16; 
  let count = 0;
  for (let i = 0; i < data.length; i += step) {
    const luma = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[luma]++;
    count++;
  }
  let sum = 0;
  const half = count / 2;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    if (sum >= half) {
      return Math.max(0.05, Math.min(Math.pow(i / 255.0, 2.2), 0.8));
    }
  }
  return 0.18;
}

export function useFilmLabEngine(
  uploadedImage,
  uploadedFile,
  activeFilm,
  adjustments,
  options = {}
) {
  const rawBackendPreference = options?.rawBackendPreference ?? null;
  const rawLinearStageOverride = options?.rawLinearStageOverride ?? null;
  const adaptivePivotRef = useRef(0.18);
  const canvasRef = useRef(null);
  const previewSourceRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const mainThreadHostWgpuSourceProbeKeyRef = useRef('');
  const wgpuHostUniformCtxRef = useRef({
    adjustments: null,
    activeFilm: null,
    profileLut: null,
    profileLutStatus: 'idle',
  });
  const sourceVersionRef = useRef(0);
  const fullSourceRef = useRef(null);
  const fullCanvasRef = useRef(null);
  const fullSourcePromiseRef = useRef(null);
  const preferFullResPreviewRef = useRef(false);
  const fxCanvasRef = useRef(null);
  const fastPreviewRendererRef = useRef(null);
  const proxyWorkerRef = useRef(null);
  const proxyWorkerSourceReadyRef = useRef(false);
  const proxySourceIdRef = useRef(0);
  const proxyLutExportCallbackRef = useRef(null);
  const proxyRequestIdRef = useRef(0);
  const proxyLastPresentedRequestIdRef = useRef(0);
  const previewE2eIntentT0Ref = useRef(null);
  const previewE2eHostSchedRafT0Ref = useRef(null);
  const proxyE2eHostSchedRafByRequestIdRef = useRef(new Map());
  const previewE2eDragT0Ref = useRef(null);
  const previewE2eSamplesByPathRef = useRef(new Map());
  const previewE2eFrameCostSamplesByPathRef = useRef(new Map());
  const prevIsAdjustingE2eRef = useRef(false);
  const isAdjustingSnapshotRef = useRef(false);
  const isPanningSnapshotRef = useRef(false);
  const proxyWorkerFailedRef = useRef(false);
  const proxyWorkerRafRef = useRef(null);
  const proxyWorkerQueuedPayloadRef = useRef(null);
  const proxyRequestStartTimesRef = useRef(new Map());
  const proxyRenderMetaRef = useRef({
    rotation: 0,
    flipped: false,
    level: 0,
    cropBypass: false,
    cropZoom: 100,
    cropX: 0,
    cropY: 0,
    cropRectX: 0,
    cropRectY: 0,
    cropRectW: 1,
    cropRectH: 1,
  });
  const animationFrameRef = useRef(null);
  const cpuRenderInFlightRef = useRef(false);
  const fastRenderInFlightRef = useRef(false);
  const previewRerunRequestedRef = useRef(false);
  const brushMaskCacheRef = useRef(new Map());
  /** Per-frame scratch: Rec.709 luma 0–1 dla trybu maski depth + depthMapSource=luminance (proxy ONNX-ready). */
  const depthLumaMaterializeRef = useRef(null);
  /** Wynik async `inferDepthProxyBufferFromImageData` (Float32 W×H, digest) — `depthMapSource === 'onnx'`. */
  const depthOnnxExternalRef = useRef({
    buffer: null,
    digest: '',
    width: 0,
    height: 0,
  });
  const depthOnnxInferTimerRef = useRef(null);
  /** Anulowanie `scheduleDepthOnnxInferOnIdle` (np. nowy debounce zanim wykona się idle). */
  const depthOnnxIdleCancelRef = useRef(null);
  /** Sekwencja inferencji depth ONNX — odrzuca `.then` po nowszym zaplanowaniu. */
  const depthOnnxInferSeqRef = useRef(0);
  /** Ostatni `toneAdj` z pętli CPU preview — walidacja async ONNX po zmianie źródła mapy. */
  const latestToneAdjForDepthOnnxRef = useRef(null);
  const scheduleProgressiveRenderRef = useRef(null);
  const previewHydrationFrameRef = useRef(null);
  const deferredRenderRef = useRef(null);
  const fullResPrewarmIdleRef = useRef(null);
  const renderTokenRef = useRef(0);
  const batchAdjustmentsOverrideRef = useRef({ active: false, value: null });
  const effectSeedRef = useRef({
    dust: Math.floor(Math.random() * 1_000_000_000),
    leak: Math.floor(Math.random() * 1_000_000_000),
    frame: Math.floor(Math.random() * 1_000_000_000),
  });
  const lastEffectStateRef = useRef({
    dust: 0,
    dustVariant: -1,
    leak: 'none',
    rawLeakVariant: -1,
    frame: 'none',
    frameVariant: -1,
    dustCycle: 0,
    rawLeakCycle: 0,
    frameCycle: 0,
    sourceKey: 0,
  });

  isAdjustingSnapshotRef.current = Boolean(adjustments?.isAdjusting);
  isPanningSnapshotRef.current = Boolean(options?.e2eIsPanning);

  const [depthOnnxInferenceUi, setDepthOnnxInferenceUi] = useState(() => ({
    phase: 'idle',
    reason: null,
    via: null,
  }));
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageMeta, setImageMeta] = useState(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [pipelineInfo, setPipelineInfo] = useState(createIdlePipelineInfo);
  const latestFrameQualityRef = useRef({
    quality: 'idle',
    pixelCount: 0,
    highlightClipRatio: 0,
    shadowClipRatio: 0,
    blackOutputGuardTriggered: false,
  });
  const [renderDebugInfo, setRenderDebugInfo] = useState({
    workerDragEnabled: ENABLE_WORKER_DRAG_PREVIEW,
    proxyGpuEnabled: ENABLE_WORKER_PROXY_GPU,
    proxyForceCpuFallback: FORCE_WORKER_PROXY_CPU_FALLBACK,
    proxyWorkerStatus: 'booting',
    proxyWorkerReason: '',
    webgpuProxyBuild: ENABLE_WORKER_WEBGPU_PROXY,
    proxyWorkerWebGpuCanvasFormat: null,
    proxyWorkerWebGpuDeviceLimits: null,
    proxyWorkerWebGpuSourceTexFormat: null,
    proxyWorkerWebGpuLut3dTexFormat: null,
    /** Readback 1×1 (0,0) z wyjścia WebGPU w workerze; `tile_rgba8` przy kafelkach. */
    proxyWorkerWebGpuReadbackRgba8: null,
    proxyWorkerWebGpuReadbackChroma: null,
    proxyLastFrameBackend: 'n/a',
    proxyLastFrameGpuImpl: 'n/a',
    proxyWebGpuDeviceLost: false,
    proxyWebGpuDeviceLostAt: null,
    proxyWebGpuDeviceLostMessage: null,
    proxyWebGpuReinitFailedAt: null,
    proxyWebGpuReinitFailedMessage: null,
    proxySourceReady: false,
    isAdjusting: false,
    /** Efektywne `interactionKind` z `engineAdjustments` (idle, gdy !isAdjusting w `useFilmLabEngineAdjustments`). */
    interactionKind: 'idle',
    /** Odpowiada `options.e2eIsPanning` (host, np. `useFilmLabViewportZoomPan`); włącza gałąź E2E v3 pointer gdy isAdjusting=0. */
    e2ePanning: false,
    profileRenderMode: 'no-profile-lut',
    lastRenderPath: 'idle',
    fastRenderMs: null,
    cpuPreviewMs: null,
    cpuFullMs: null,
    workerRenderMs: null,
    proxyWorkerGpuRenderMs: null,
    proxyWorkerCpuRenderMs: null,
    proxyWorkerWebGlMaxTex2d: null,
    proxyWorkerWebGlMaxTex3d: null,
    proxyWorkerWebGlRgba16f: null,
    /** FBO rgba16f + blit do canvas w workerze WebGL2 (§5.1.1.1). */
    proxyWorkerWebGlFbo16fBlit: null,
    /** 3D LUT w workerze WebGL2: `RGBA16F`+`HALF_FLOAT` gdy sonda + FBO+blit (§5.1.1.1). */
    proxyWorkerWebGl3dLutRgba16f: null,
    proxyWorkerGpuTexW: null,
    proxyWorkerGpuTexH: null,
    proxyWorkerFullSourceW: null,
    proxyWorkerFullSourceH: null,
    proxyWorkerGpuInputDownscaleMs: null,
    proxyWorkerProxyOutputFitted: false,
    proxyWorkerProxyOutputRequestedW: null,
    proxyWorkerProxyOutputRequestedH: null,
    proxyWorkerProxyOutputTargetW: null,
    proxyWorkerProxyOutputTargetH: null,
    proxyWorkerOutputTileCountNominal: null,
    proxyWorkerOutputTileCountTarget: null,
    /** Worker CPU: pełny bufor nominal (parity z kafelkami GPU) — `VITE_FILMLAB_PROXY_OUTPUT_TILES`. */
    proxyWorkerCpuFullNominalParity: false,
    proxyWorkerNominalW: null,
    proxyWorkerNominalH: null,
    proxyWorkerProxyMaxEffective: null,
    proxyInputBufferW: null,
    proxyInputBufferH: null,
    fullResRequested: false,
    fullResReady: false,
    lastFrameHighlightClipRatio: null,
    lastFrameShadowClipRatio: null,
    lastFramePixelCount: null,
    lastFrameBlackGuardTriggered: false,
    webGpuApi: getWebGpuApiExposure(),
    webGpuAdapter: { status: 'pending' },
    webGpuAdapterInfo: null,
    webGpuDevice: { status: 'pending' },
    webGpuWorker: { status: 'pending' },
    /** Flaga A/B: główny podgląd WebGPU (wątek główny), tylko jawnie `VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB=1`. */
    mainThreadWebGpuPreviewAbEnabled: ENABLE_MAIN_PREVIEW_WEBGPU_AB,
    /** Runtime decyzja A/B (`off`, `armed_probe_ok`, `armed_probe_fail`, `*_bootstrap_error`). */
    mainThreadWebGpuPreviewAbDecision: ENABLE_MAIN_PREVIEW_WEBGPU_AB ? 'armed_pending' : 'off',
    /** Ostatnia ścieżka A/B dla głównego podglądu (`webgpu-main` / `webgl-fallback` / `none`). */
    mainThreadWebGpuPreviewAbPath: 'none',
    /** Czas ostatniej klatki A/B (ms) — liczony jak `fastRenderMs`. */
    mainThreadWebGpuPreviewAbRenderMs: null,
    /** Format wejściowej tekstury 2D przy A/B (`rgba8unorm` na aktualnym etapie). */
    mainThreadWebGpuPreviewAbSourceTexFormat: null,
    /** Licznik klatek obserwowanych przez A/B main preview od ostatniego resetu źródła. */
    mainThreadWebGpuPreviewAbFramesTotal: 0,
    /** Licznik klatek zakończonych torem `webgpu-main` (A/B). */
    mainThreadWebGpuPreviewAbFramesWebGpuMain: 0,
    /** Licznik klatek, które spadły do `webgl-fallback` przy aktywnym A/B. */
    mainThreadWebGpuPreviewAbFramesWebGlFallback: 0,
    /** Udział klatek `webgpu-main` w A/B (0..1) na bazie liczników runtime. */
    mainThreadWebGpuPreviewAbWebGpuRatio: null,
    /** Stan zdrowia rolloutu A/B oparty o fallback-rate (`ok`/`warn`/`insufficient-data`/`n/a`). */
    mainThreadWebGpuPreviewAbHealthState: 'n/a',
    /** Fallback-rate (0..1) dla rolloutu A/B po przekroczeniu warmup (`>=10` klatek). */
    mainThreadWebGpuPreviewAbFallbackRate: null,
    /** Liczba klatek użyta do oceny health (powtórzona diagnostycznie). */
    mainThreadWebGpuPreviewAbHealthFrames: 0,
    mainThreadWebGpuPreviewStatus: FILM_LAB_MAIN_THREAD_WEBGPU_PREVIEW_STATUS,
    /** `device.limits.maxTextureDimension2D` gdy sonda main OK (`ok_minimal_queue_submit`). */
    mainThreadWebGpuMaxTextureDimension2d: null,
    /** `device.limits.maxTextureDimension3D` — limity 3D LUT w sondzie main (por. worker `proxyWorkerWebGpuDeviceLimits`). */
    mainThreadWebGpuMaxTextureDimension3d: null,
    /** `rgba16float` / `rgba8unorm` — ten sam wybór co worker 3D LUT (`getProbeLut3dTexFormatLabel`) gdy sonda main OK. */
    mainThreadWebGpuLut3dTexFormat: null,
    /** `configure` + clear pass na `HTMLCanvasElement` + `getContext('webgpu')` (§5.1.1.3). */
    mainThreadWebGpuCanvasClearPass: null,
    /** WGSL + `createRenderPipeline` + `draw(3)` (trójkąt pełnoekranowy) na canvas (§5.1.1.3). */
    mainThreadWebGpuSolidDrawPass: null,
    /** `createTexture` + `writeTexture` + `textureSample` na tym samym canvas (§5.1.1.3). */
    mainThreadWebGpuTextureDrawPass: null,
    /** Ten sam `proxyWebGpuShaders.wgsl` co worker — rysunek z `fmain` (§5.1.1.3). */
    mainThreadWebGpuProxyShaderDrawPass: null,
    /** Osobno po załadowaniu źródła: `downscale` + `probeMainThreadWebGpuHostSourceRgba8ProxyPass`. */
    mainThreadWebGpuHostSourceProxyPass: null,
    /** Readback 1×1 (0,0) z sondy host→WGSL; RGBA8 po ewent. zamianie BGRA swapchain. */
    mainThreadWebGpuHostSourceReadbackRgba8: null,
    /** `getPreferredCanvasFormat()` w chwili readbacku (sonda). */
    mainThreadWebGpuHostSourceReadbackChroma: null,
    sharedArrayBufferHost: getSharedArrayBufferHostSnapshot(),
    previewE2eIntentToPresentMs: null,
    previewE2ePath: null,
    /** Mediana ruchoma (ostatnie 31 próbek) per `previewE2ePath`. */
    previewE2eMedianMs: null,
    /** Target KPI dla mediany E2E (ms). */
    previewE2eKpiTargetMs: PREVIEW_E2E_KPI_TARGET_MS,
    /** `ok` / `warn` / `n/a` (gdy brak próbki). */
    previewE2eKpiState: 'n/a',
    /** Migawka median i liczności per `previewE2ePath` (okno 31 próbek). */
    previewE2ePerPathStats: null,
    previewE2eDragToPresentMs: null,
    previewE2ePointerToPresentMs: null,
    /** Ostatni pomiar schedule→pierwszy host rAF, gdy `VITE_FILMLAB_E2E_HOST_SCHED_RAF=1`. */
    previewE2eHostSchedToRafMs: null,
    /** Czas samej klatki (render workera / fast / CPU) — bez pełnego intent→present. */
    previewE2eFrameCostMs: null,
    previewE2eFrameCostMedianMs: null,
    previewE2eFrameCostKpiTargetMs: PREVIEW_E2E_FRAME_COST_TARGET_MS,
    previewE2eFrameCostKpiState: 'n/a',
    previewE2eFrameCostPerPathStats: null,
    previewE2eFrameCostGateDecision: null,
    previewE2eFrameCostGateReady: false,
    previewE2eFrameCostGateSummary: null,
    fastPreviewMainThreadSourceTexFormat: FAST_PREVIEW_MAIN_THREAD_SOURCE_TEX_FORMAT,
    fastPreviewGlContext: null,
    fastPreviewFloatPipeline: 'off',
    fastPreviewLutAtlasTexFormat: 'rgba8',
    fastPreviewGradingPrecision: 'mediump',
    /** Nominal W×H z `getNominalProxyRenderSize` (CPU preview) vs bufor; §5.1.1.2. */
    cpuParityNominalW: null,
    cpuParityNominalH: null,
    cpuParityProxyMax: null,
    cpuParityBufferW: null,
    cpuParityBufferH: null,
    cpuParityMatchNominal: null,
    /** `true` gdy `VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL` + udany downscale do nominalu. */
    cpuParityDownscaled: null,
  });
  const [renderPipelineAlert, setRenderPipelineAlert] = useState(null);
  const [filmLutState, setFilmLutState] = useState({
    file: null,
    data: null,
    status: 'idle',
  });
  const shouldBootProxyWorker = Boolean(uploadedImage || uploadedFile);

  const profileLutMatchesActive = Boolean(
    activeFilm?.previewLutFile && 
    filmLutState.file === activeFilm.previewLutFile &&
    filmLutState.data
  );
  const profileLut = profileLutMatchesActive ? filmLutState.data : null;
  const profileLutStatus = profileLutMatchesActive ? filmLutState.status : 'idle';
  wgpuHostUniformCtxRef.current = {
    adjustments,
    activeFilm,
    profileLut,
    profileLutStatus,
  };
  const profileRenderMode = useMemo(() => {
    if (!activeFilm?.previewLutFile) {
      return 'no-profile-lut';
    }

    if (profileLutStatus === 'ready' && profileLut?.srgbData && profileLut?.size) {
      return 'lut-active';
    }

    if (profileLutStatus === 'loading') {
      return 'fallback-loading-lut';
    }

    if (profileLutStatus === 'failed') {
      return 'fallback-lut-failed';
    }

    return 'fallback-lut-idle';
  }, [activeFilm?.previewLutFile, profileLut, profileLutStatus]);

  const reportRenderPipelineError = useCallback((code, message, details = null) => {
    setRenderPipelineAlert({
      code: String(code || 'RENDER_PIPELINE_ERROR'),
      message: String(message || 'Nieznany błąd renderera.'),
      details: details && typeof details === 'object' ? details : null,
      at: new Date().toISOString(),
    });
  }, []);

  const clearRenderPipelineAlert = useCallback(() => {
    setRenderPipelineAlert(null);
  }, []);

  useEffect(() => {
    if (String(adjustments?.depthMapSource ?? 'luminance') !== 'onnx') {
      setDepthOnnxInferenceUi({ phase: 'idle', reason: null, via: null });
    }
  }, [adjustments?.depthMapSource]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const probe = await getOrProbeWebGpuAdapter();
        if (cancelled) {
          return;
        }
        setRenderDebugInfo((current) => ({
          ...current,
          webGpuApi: probe.api,
          webGpuAdapter: probe.adapter,
          webGpuAdapterInfo: probe.adapterInfo,
        }));
        const deviceProbe = await getOrProbeWebGpuDevice();
        if (cancelled) {
          return;
        }
        const mainThreadWgpu = await probeMainThreadWebGpuPreview();
        if (cancelled) {
          return;
        }
        setRenderDebugInfo((current) => ({
          ...current,
          webGpuDevice: deviceProbe,
          mainThreadWebGpuPreviewAbEnabled: ENABLE_MAIN_PREVIEW_WEBGPU_AB,
          mainThreadWebGpuPreviewAbDecision: ENABLE_MAIN_PREVIEW_WEBGPU_AB
            ? String(mainThreadWgpu.status).startsWith('ok_')
              ? 'armed_probe_ok'
              : 'armed_probe_fail'
            : 'off_probe_only',
          mainThreadWebGpuPreviewStatus: mainThreadWgpu.status,
          mainThreadWebGpuMaxTextureDimension2d: mainThreadWgpu.maxTextureDimension2d,
          mainThreadWebGpuMaxTextureDimension3d: mainThreadWgpu.maxTextureDimension3d,
          mainThreadWebGpuLut3dTexFormat: mainThreadWgpu.mainThreadWebGpuLut3dTexFormat,
          mainThreadWebGpuCanvasClearPass: mainThreadWgpu.mainThreadWebGpuCanvasClearPass,
          mainThreadWebGpuSolidDrawPass: mainThreadWgpu.mainThreadWebGpuSolidDrawPass,
          mainThreadWebGpuTextureDrawPass: mainThreadWgpu.mainThreadWebGpuTextureDrawPass,
          mainThreadWebGpuProxyShaderDrawPass: mainThreadWgpu.mainThreadWebGpuProxyShaderDrawPass,
        }));
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setRenderDebugInfo((current) => ({
          ...current,
          webGpuApi: getWebGpuApiExposure(),
          webGpuAdapter: { status: 'error', reason: message },
          webGpuAdapterInfo: null,
          webGpuDevice: { status: 'error', reason: message, limits: null },
          mainThreadWebGpuPreviewAbEnabled: ENABLE_MAIN_PREVIEW_WEBGPU_AB,
          mainThreadWebGpuPreviewAbDecision: ENABLE_MAIN_PREVIEW_WEBGPU_AB
            ? 'armed_bootstrap_error'
            : 'off_bootstrap_error',
          mainThreadWebGpuPreviewStatus: 'unavailable_bootstrap',
          mainThreadWebGpuMaxTextureDimension2d: null,
          mainThreadWebGpuMaxTextureDimension3d: null,
          mainThreadWebGpuLut3dTexFormat: null,
          mainThreadWebGpuCanvasClearPass: null,
          mainThreadWebGpuSolidDrawPass: null,
          mainThreadWebGpuTextureDrawPass: null,
          mainThreadWebGpuProxyShaderDrawPass: null,
          mainThreadWebGpuHostSourceProxyPass: null,
          mainThreadWebGpuHostSourceReadbackRgba8: null,
          mainThreadWebGpuHostSourceReadbackChroma: null,
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (renderDebugInfo?.mainThreadWebGpuProxyShaderDrawPass !== true) {
      return;
    }
    if (!imageMeta?.width || !imageMeta?.height) {
      return;
    }
    const key = [
      uploadedFile?.name ?? 'no-name',
      String(uploadedFile?.size ?? 0),
      String(imageMeta.width),
      String(imageMeta.height),
    ].join(':');
    if (mainThreadHostWgpuSourceProbeKeyRef.current === key) {
      return;
    }
    let cancelled = false;
    setRenderDebugInfo((c) => ({
      ...c,
      mainThreadWebGpuHostSourceProxyPass: null,
      mainThreadWebGpuHostSourceReadbackRgba8: null,
      mainThreadWebGpuHostSourceReadbackChroma: null,
    }));
    const runAttempt = (attempt) => {
      if (cancelled) {
        return;
      }
      const sc = sourceCanvasRef.current;
      if (!sc?.width || !sc?.height) {
        if (attempt < 16) {
          setTimeout(() => runAttempt(attempt + 1), 72);
        }
        return;
      }
      (async () => {
        try {
          const down = downscaleSourceCanvasRgba8ForWebGpuHostProbe(
            sc,
            MAIN_THREAD_HOST_WGPU_SOURCE_MAX_EDGE,
          );
          if (cancelled) {
            return;
          }
          if (!down?.width) {
            mainThreadHostWgpuSourceProbeKeyRef.current = key;
            setRenderDebugInfo((c) => ({
              ...c,
              mainThreadWebGpuHostSourceProxyPass: false,
              mainThreadWebGpuHostSourceReadbackRgba8: null,
              mainThreadWebGpuHostSourceReadbackChroma: null,
            }));
            return;
          }
          const dev = await getOrCreatePersistentWebGpuDevice({ label: 'ml-film-lab-main-preview' });
          if (cancelled) {
            return;
          }
          const wCtx = wgpuHostUniformCtxRef.current;
          const wFilm = wCtx.activeFilm || {};
          const wAdj = wCtx.adjustments || {};
          const wProfStatus = wCtx.profileLutStatus || 'idle';
          const wProfileLut = wCtx.profileLut;
          const plSize =
            wProfileLut && Number(wProfileLut.size) > 1 ? Math.floor(Number(wProfileLut.size)) : 0;
          const plData = wProfileLut?.srgbData ?? wProfileLut?.data ?? null;
          const fastPrev = buildFastPreviewAdjustments(wFilm, wAdj, wProfStatus);
          const lookN = normalizeFastLookLutForWorker(fastPrev?.fastLookLut);
          const uFull = buildProxyWebGpuUBlockFloat32({
            film: wFilm,
            adjustments: {
              ...buildWorkerAdjustmentsPayload(wAdj, wProfStatus),
              pivot: wAdj?.pivot ?? 0.18,
            },
            profileLutSize: plSize,
            profileLutData: plData,
            lookLut: lookN,
            targetWidth: down.width,
            targetHeight: down.height,
            outputTile: null,
          });
          const tr = await probeMainThreadWebGpuHostSourceRgba8ProxyPass(
            dev,
            down.width,
            down.height,
            down.data,
            {
              uBlock: uFull,
              profileLutSize: plSize,
              profileLutData: plData,
              lookLut: lookN,
            },
          );
          if (cancelled) {
            return;
          }
          mainThreadHostWgpuSourceProbeKeyRef.current = key;
          const passOk = tr != null && typeof tr === 'object' && tr.pass === true;
          const rgbaArr =
            tr != null && typeof tr === 'object' && tr.readbackRgba8 != null
              ? [tr.readbackRgba8[0], tr.readbackRgba8[1], tr.readbackRgba8[2], tr.readbackRgba8[3]]
              : null;
          setRenderDebugInfo((c) => ({
            ...c,
            mainThreadWebGpuHostSourceProxyPass: passOk,
            mainThreadWebGpuHostSourceReadbackRgba8: rgbaArr,
            mainThreadWebGpuHostSourceReadbackChroma:
              tr != null && typeof tr === 'object' && tr.readbackChroma != null
                ? String(tr.readbackChroma)
                : null,
          }));
        } catch {
          if (cancelled) {
            return;
          }
          mainThreadHostWgpuSourceProbeKeyRef.current = key;
          setRenderDebugInfo((c) => ({
            ...c,
            mainThreadWebGpuHostSourceProxyPass: false,
            mainThreadWebGpuHostSourceReadbackRgba8: null,
            mainThreadWebGpuHostSourceReadbackChroma: null,
          }));
        }
      })();
    };
    runAttempt(0);
    return () => {
      cancelled = true;
    };
  }, [renderDebugInfo?.mainThreadWebGpuProxyShaderDrawPass, imageMeta, uploadedFile]);

  useEffect(() => {
    let cancelled = false;
    const nextLutFile = activeFilm?.previewLutFile ?? null;

    if (!nextLutFile) {
      setFilmLutState({
        file: null,
        data: null,
        status: 'idle',
      });
      return () => {
        cancelled = true;
      };
    }

    setFilmLutState((current) => {
      if (
        current.file === nextLutFile &&
        (current.status === 'ready' || current.status === 'loading')
      ) {
        return current;
      }

      return {
        file: nextLutFile,
        data: null,
        status: 'loading',
      };
    });

    loadCubeLut(nextLutFile)
      .then((lut) => {
        if (!cancelled) {
          setFilmLutState({
            file: nextLutFile,
            data: lut,
            status: 'ready',
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFilmLutState({
            file: nextLutFile,
            data: null,
            status: 'failed',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeFilm?.previewLutFile]);

  useEffect(() => {
    if (profileLutStatus !== 'ready' || !profileLut?.srgbData || !profileLut?.size) {
      return;
    }
    if (!sourceCanvasRef.current || !imageMeta) {
      return;
    }
    setRenderVersion((value) => value + 1);
  }, [activeFilm?.previewLutFile, imageMeta, profileLut, profileLutStatus]);

  useEffect(() => {
    setRenderDebugInfo((current) => {
      const next = {
        ...current,
        isAdjusting: Boolean(adjustments?.isAdjusting),
        interactionKind: String(adjustments?.interactionKind ?? 'idle'),
        proxySourceReady: Boolean(proxyWorkerSourceReadyRef.current),
        profileRenderMode,
      };

      if (
        next.isAdjusting === current.isAdjusting &&
        next.interactionKind === current.interactionKind &&
        next.proxySourceReady === current.proxySourceReady &&
        next.profileRenderMode === current.profileRenderMode
      ) {
        return current;
      }

      return next;
    });
  }, [adjustments?.isAdjusting, adjustments?.interactionKind, profileRenderMode]);

  useEffect(() => {
    const next = Boolean(options?.e2eIsPanning);
    setRenderDebugInfo((current) => {
      if (current.e2ePanning === next) {
        return current;
      }
      return { ...current, e2ePanning: next };
    });
  }, [options?.e2eIsPanning]);

  useEffect(() => {
    const cur = Boolean(adjustments?.isAdjusting);
    if (cur && !prevIsAdjustingE2eRef.current) {
      previewE2eDragT0Ref.current = nowMs();
    }
    if (!cur) {
      previewE2eDragT0Ref.current = null;
      if (!isPanningSnapshotRef.current && !getFilmLabE2ePointerAuxSession()) {
        clearFilmLabE2ePointerMark();
      }
    }
    prevIsAdjustingE2eRef.current = cur;
  }, [adjustments?.isAdjusting]);

  useEffect(() => {
    const worker = proxyWorkerRef.current;
    if (!worker || proxyWorkerFailedRef.current) {
      return;
    }

    if (profileLutStatus === 'ready') {
      const validated = validateCubeLutSrgbForWorkerTransfer(profileLut);
      if (!validated) {
        if (import.meta?.env?.DEV) {
          console.warn('[FilmLab] Profile LUT failed worker transfer validation; clearing proxy LUT.', {
            previewLutFile: activeFilm?.previewLutFile ?? null,
          });
        }
        try {
          worker.postMessage({ type: 'clearProfileLut' });
        } catch (_error) {
          // Ignore.
        }
        return;
      }
      try {
        // Clone the data to avoid detaching the buffer from the main thread
        // which would cause the WebGL fast preview to lose access to the LUT.
        const copiedPayload = new Uint8Array(validated.srgbData.length);
        copiedPayload.set(new Uint8Array(validated.srgbData));

        worker.postMessage(
          {
            type: 'setProfileLut',
            lutSize: validated.size,
            lutData: copiedPayload,
          },
          [copiedPayload.buffer]
        );
      } catch (error) {
        console.error('[FilmLab] Failed to transfer profile LUT to proxy worker', error);
      }
      return;
    }

    // Only block CLEARING the LUT during interaction to prevent dropouts.
    // LOADING a LUT should always be allowed.
    if (adjustments?.isAdjusting) {
      return;
    }

    try {
      worker.postMessage({ type: 'clearProfileLut' });
    } catch (_error) {
      // Ignore.
    }
  }, [activeFilm?.previewLutFile, profileLut, profileLutStatus]);

  useEffect(() => {
    if (!shouldBootProxyWorker) {
      proxyWorkerFailedRef.current = false;
      proxyWorkerSourceReadyRef.current = false;
      setRenderDebugInfo((current) => {
        if (
          current.proxyWorkerStatus === 'idle' &&
          current.proxyWorkerReason === '' &&
          current.proxySourceReady === false &&
          current.workerRenderMs == null &&
          current.proxyWorkerGpuRenderMs == null &&
          current.proxyWorkerCpuRenderMs == null &&
          current.proxyWorkerWebGlMaxTex2d == null &&
          current.proxyWorkerWebGlMaxTex3d == null &&
          current.proxyWorkerGpuTexW == null &&
          current.proxyWorkerGpuTexH == null &&
          current.proxyWorkerFullSourceW == null &&
          current.proxyWorkerFullSourceH == null &&
          current.proxyWorkerGpuInputDownscaleMs == null &&
          current.proxyWorkerProxyOutputFitted === false &&
          current.proxyWorkerProxyOutputRequestedW == null &&
          current.proxyWorkerProxyOutputRequestedH == null &&
          current.proxyWorkerProxyOutputTargetW == null &&
          current.proxyWorkerProxyOutputTargetH == null &&
          current.proxyWorkerOutputTileCountNominal == null &&
          current.proxyWorkerOutputTileCountTarget == null &&
          current.proxyWorkerCpuFullNominalParity === false &&
          current.proxyWorkerNominalW == null &&
          current.proxyWorkerNominalH == null &&
          current.proxyWorkerProxyMaxEffective == null &&
          current.proxyInputBufferW == null &&
          current.proxyInputBufferH == null &&
          current.webGpuWorker?.status === 'skipped' &&
          current.webGpuWorker?.reason === 'no-proxy-session'
        ) {
          return current;
        }
        return {
          ...current,
          proxyWorkerStatus: 'idle',
          proxyWorkerReason: '',
          proxySourceReady: false,
          workerRenderMs: null,
          proxyWorkerGpuRenderMs: null,
          proxyWorkerCpuRenderMs: null,
          proxyWorkerWebGlMaxTex2d: null,
          proxyWorkerWebGlMaxTex3d: null,
          proxyWorkerWebGlRgba16f: null,
          proxyWorkerWebGlFbo16fBlit: null,
          proxyWorkerWebGl3dLutRgba16f: null,
          proxyWorkerGpuTexW: null,
          proxyWorkerGpuTexH: null,
          proxyWorkerFullSourceW: null,
          proxyWorkerFullSourceH: null,
          proxyWorkerGpuInputDownscaleMs: null,
          proxyWorkerProxyOutputFitted: false,
          proxyWorkerProxyOutputRequestedW: null,
          proxyWorkerProxyOutputRequestedH: null,
          proxyWorkerProxyOutputTargetW: null,
          proxyWorkerProxyOutputTargetH: null,
          proxyWorkerOutputTileCountNominal: null,
          proxyWorkerOutputTileCountTarget: null,
          proxyWorkerCpuFullNominalParity: false,
          proxyWorkerNominalW: null,
          proxyWorkerNominalH: null,
          proxyWorkerProxyMaxEffective: null,
          proxyInputBufferW: null,
          proxyInputBufferH: null,
          webGpuWorker: { status: 'skipped', reason: 'no-proxy-session' },
        };
      });
      return () => {};
    }

    if (!ENABLE_WORKER_DRAG_PREVIEW && !ENABLE_WORKER_PROXY_GPU) {
      setRenderDebugInfo((current) => ({
        ...current,
        proxyWorkerStatus: 'disabled',
        proxyWorkerReason: 'feature-flags-off',
        webGpuWorker: { status: 'skipped', reason: 'feature-flags-off' },
      }));
      return () => {};
    }

    if (typeof Worker === 'undefined') {
      proxyWorkerFailedRef.current = true;
      setRenderDebugInfo((current) => ({
        ...current,
        webGpuWorker: { status: 'skipped', reason: 'no-Worker' },
      }));
      return () => {};
    }

    let worker = null;
    let disposed = false;

    try {
      worker = new Worker(new URL('./workers/proxyRenderWorker.js', import.meta.url), { type: 'module' });
      proxyWorkerRef.current = worker;
      proxyWorkerFailedRef.current = false;
      proxyWorkerSourceReadyRef.current = false;
      proxyLastPresentedRequestIdRef.current = 0;
      worker.postMessage({
        type: 'configure',
        enableGpu: ENABLE_WORKER_PROXY_GPU,
        preferredBackend: ENABLE_WORKER_PROXY_GPU ? 'gpu' : 'cpu',
        forceCpuFallback: FORCE_WORKER_PROXY_CPU_FALLBACK,
      });
      setRenderDebugInfo((current) => ({
        ...current,
        proxyForceCpuFallback: FORCE_WORKER_PROXY_CPU_FALLBACK,
        proxyWorkerStatus: 'ready',
        proxyWorkerReason: '',
        webGpuWorker: { status: 'pending' },
      }));
    } catch (error) {
      console.error('[FilmLab] Failed to start proxy worker', error);
      reportRenderPipelineError(
        'WORKER_INIT_FAILED',
        error instanceof Error ? error.message : 'Nie udało się uruchomić workera renderującego.',
        { stage: 'worker-init' }
      );
      proxyWorkerFailedRef.current = true;
      setRenderDebugInfo((current) => ({
        ...current,
        proxyWorkerStatus: 'error',
        proxyWorkerReason: error instanceof Error ? error.message : 'worker init failed',
        webGpuWorker: {
          status: 'error',
          reason: error instanceof Error ? error.message : 'worker init failed',
        },
      }));
    }

    if (!worker) {
      return () => {};
    }

    worker.onmessage = (event) => {
      if (disposed) {
        return;
      }

      const message = event?.data ?? {};

      if (message.type === 'webgpuWorkerProbe') {
        if (message.error) {
          setRenderDebugInfo((current) => ({
            ...current,
            webGpuWorker: { status: 'error', reason: String(message.error) },
          }));
        } else {
          setRenderDebugInfo((current) => ({
            ...current,
            webGpuWorker: {
              status: 'ready',
              webGpuApi: message.webGpuApi,
              webGpuAdapter: message.webGpuAdapter,
              webGpuAdapterInfo: message.webGpuAdapterInfo,
              webGpuDevice: message.webGpuDevice,
            },
          }));
        }
        return;
      }

      if (message.type === 'proxyWebGpuReady') {
        setRenderDebugInfo((current) => ({
          ...current,
          proxyWorkerWebGpuCanvasFormat: String(message?.canvasFormat ?? '') || null,
          proxyWorkerWebGpuDeviceLimits:
            message?.deviceLimits && typeof message.deviceLimits === 'object'
              ? message.deviceLimits
              : null,
        }));
        return;
      }

      if (message.type === 'proxyWebGpuDeviceLost') {
        setRenderDebugInfo((current) => ({
          ...current,
          proxyWebGpuDeviceLost: true,
          proxyWebGpuDeviceLostAt: new Date().toISOString(),
          proxyWebGpuDeviceLostMessage: String(message?.message ?? ''),
          proxyWebGpuReinitFailedAt: null,
          proxyWebGpuReinitFailedMessage: null,
          proxyWorkerWebGpuCanvasFormat: null,
          proxyWorkerWebGpuDeviceLimits: null,
          proxyWorkerWebGpuSourceTexFormat: null,
          proxyWorkerWebGpuLut3dTexFormat: null,
          proxyWorkerWebGpuReadbackRgba8: null,
          proxyWorkerWebGpuReadbackChroma: null,
          proxyWorkerGpuRenderMs: null,
          proxyWorkerCpuRenderMs: null,
          proxyWorkerWebGlMaxTex2d: null,
          proxyWorkerWebGlMaxTex3d: null,
          proxyWorkerWebGlRgba16f: null,
          proxyWorkerWebGlFbo16fBlit: null,
          proxyWorkerWebGl3dLutRgba16f: null,
          proxyWorkerGpuTexW: null,
          proxyWorkerGpuTexH: null,
          proxyWorkerFullSourceW: null,
          proxyWorkerFullSourceH: null,
          proxyWorkerGpuInputDownscaleMs: null,
          proxyWorkerProxyOutputFitted: false,
          proxyWorkerProxyOutputRequestedW: null,
          proxyWorkerProxyOutputRequestedH: null,
          proxyWorkerProxyOutputTargetW: null,
          proxyWorkerProxyOutputTargetH: null,
          proxyWorkerOutputTileCountNominal: null,
          proxyWorkerOutputTileCountTarget: null,
          proxyWorkerCpuFullNominalParity: false,
          proxyWorkerNominalW: null,
          proxyWorkerNominalH: null,
          proxyWorkerProxyMaxEffective: null,
          proxyInputBufferW: null,
          proxyInputBufferH: null,
        }));
        if (import.meta?.env?.DEV) {
          console.warn('[FilmLab] proxyWebGpuDeviceLost', message?.message);
        }
        if (
          ENABLE_WORKER_WEBGPU_PROXY &&
          ENABLE_WORKER_PROXY_GPU &&
          !FORCE_WORKER_PROXY_CPU_FALLBACK
        ) {
          setTimeout(() => {
            if (disposed) {
              return;
            }
            const w = proxyWorkerRef.current;
            if (w) {
              try {
                w.postMessage({ type: 'reinitWebGpu' });
              } catch {
                // noop
              }
            }
          }, 0);
        }
        return;
      }

      if (message.type === 'proxyWebGpuReinitOk') {
        setRenderDebugInfo((current) => ({
          ...current,
          proxyWebGpuDeviceLost: false,
          proxyWebGpuDeviceLostAt: null,
          proxyWebGpuDeviceLostMessage: null,
          proxyWebGpuReinitFailedAt: null,
          proxyWebGpuReinitFailedMessage: null,
        }));
        setRenderVersion((value) => value + 1);
        return;
      }

      if (message.type === 'proxyWebGpuReinitFailed') {
        setRenderDebugInfo((current) => ({
          ...current,
          proxyWebGpuReinitFailedAt: new Date().toISOString(),
          proxyWebGpuReinitFailedMessage: String(message?.message ?? ''),
        }));
        if (import.meta?.env?.DEV) {
          console.warn('[FilmLab] proxyWebGpuReinitFailed', message?.message);
        }
        return;
      }

      if (message.type === 'sourceReady') {
        if (Number(message.sourceId) === proxySourceIdRef.current) {
          proxyWorkerSourceReadyRef.current = true;
          setRenderDebugInfo((current) => ({
            ...current,
            proxySourceReady: true,
          }));
        }
        return;
      }

      if (message.type === 'proxyFrameError') {
        const sourceId = Number(message.sourceId) || 0;
        const requestId = Number(message.requestId) || 0;
        const reason = String(message.message ?? '');

        if (sourceId !== proxySourceIdRef.current) {
          return;
        }

        // Source swaps during drag can legitimately race; do not mark worker failed.
        if (reason === 'Source mismatch.' || reason === 'Missing source frame.') {
          return;
        }

        if (requestId >= proxyLastPresentedRequestIdRef.current) {
          reportRenderPipelineError(
            'PROXY_FRAME_ERROR',
            reason || 'Worker zwrócił błąd ramki proxy.',
            { stage: 'proxy-frame', sourceId, requestId, backend: message?.backend ?? null }
          );
          proxyWorkerFailedRef.current = true;
          setRenderDebugInfo((current) => ({
            ...current,
            proxyWorkerStatus: 'error',
            proxyWorkerReason: reason || 'proxy frame error',
          }));
          if (
            import.meta?.env?.DEV &&
            /webgl|gpu|teximage2d|drawarrays|payload mismatch|lut payload/i.test(reason)
          ) {
            console.warn('[FilmLab] Worker proxy frame error (CPU fallback active):', reason);
          }
        }
        return;
      }

      if (message.type === 'proxyBackendStatus') {
        if (message?.backend === 'gpu' && message?.status === 'disabled' && ENABLE_WORKER_PROXY_GPU) {
          console.warn('[FilmLab] Proxy GPU backend disabled, CPU fallback active:', message?.reason);
        }
        setRenderDebugInfo((current) => ({
          ...current,
          proxyForceCpuFallback:
            String(message?.reason ?? '') === 'forced-cpu-fallback'
              ? true
              : current.proxyForceCpuFallback,
          proxyWorkerStatus:
            message?.status === 'enabled'
              ? 'ready'
              : message?.status === 'disabled'
                ? 'fallback-cpu'
                : current.proxyWorkerStatus,
          proxyWorkerReason: String(message?.reason ?? ''),
        }));
        return;
      }

      if (message.type === 'proxyLutCubeReady') {
        const lutString = message.lutString;
        if (proxyLutExportCallbackRef.current) {
          proxyLutExportCallbackRef.current(lutString);
          proxyLutExportCallbackRef.current = null;
        }
        return;
      }

      if (message.type !== 'proxyFrame') {
        return;
      }

      const requestId = Number(message.requestId) || 0;
      const sourceId = Number(message.sourceId) || 0;
      const hostMap = proxyE2eHostSchedRafByRequestIdRef.current;
      const frameHostSchedRafMs = hostMap.has(requestId) ? hostMap.get(requestId) : null;
      if (hostMap.has(requestId)) {
        hostMap.delete(requestId);
      }
      const requestStartTimes = proxyRequestStartTimesRef.current;
      const startedAt = requestStartTimes.get(requestId);
      const workerRenderElapsedMs = Number.isFinite(startedAt)
        ? roundTimingMs(nowMs() - startedAt)
        : null;
      requestStartTimes.delete(requestId);
      for (const staleId of requestStartTimes.keys()) {
        if (staleId < requestId) {
          requestStartTimes.delete(staleId);
        }
      }

      // During rapid drag, worker can be 1-2 requests behind; we still want the
      // freshest available frame instead of dropping everything until pointer-up.
      if (sourceId !== proxySourceIdRef.current || requestId <= proxyLastPresentedRequestIdRef.current) {
        proxyE2eHostSchedRafByRequestIdRef.current.delete(requestId);
        if (message.bitmap && typeof message.bitmap.close === 'function') {
          message.bitmap.close();
        }
        return;
      }
      proxyLastPresentedRequestIdRef.current = requestId;
      const frameBackend = String(message?.backend ?? 'cpu');
      const frameGpuImpl =
        frameBackend === 'gpu' && (message?.proxyGpuImpl === 'webgpu' || message?.proxyGpuImpl === 'webgl')
          ? message.proxyGpuImpl
          : 'n/a';
      const frameSourceTexFormat =
        frameBackend === 'gpu' && message?.proxyGpuImpl === 'webgpu'
          ? String(message?.proxyWorkerWebGpuSourceTexFormat ?? '') || null
          : null;
      const frameLut3dTexFormat =
        frameBackend === 'gpu' && message?.proxyGpuImpl === 'webgpu'
          ? String(message?.proxyWorkerWebGpuLut3dTexFormat ?? '') || null
          : null;
      const msgRb = message?.proxyWorkerWebGpuReadbackRgba8;
      const frameWgpuReadbackRgba8 =
        frameBackend === 'gpu' &&
        message?.proxyGpuImpl === 'webgpu' &&
        Array.isArray(msgRb) &&
        msgRb.length === 4
          ? [msgRb[0], msgRb[1], msgRb[2], msgRb[3]]
          : null;
      const chRawWgpu = message?.proxyWorkerWebGpuReadbackChroma;
      const frameWgpuReadbackChroma =
        frameBackend === 'gpu' && message?.proxyGpuImpl === 'webgpu' && chRawWgpu != null
          ? String(chRawWgpu).trim() !== ''
            ? String(chRawWgpu)
            : null
          : null;
      const rawGpuRenderMs = message?.proxyGpuRenderMs;
      const frameWorkerGpuRenderMs =
        frameBackend === 'gpu' && rawGpuRenderMs != null && Number.isFinite(Number(rawGpuRenderMs))
          ? roundTimingMs(Number(rawGpuRenderMs))
          : null;
      const rawCpuRenderMs = message?.proxyCpuRenderMs;
      const frameWorkerCpuRenderMs =
        frameBackend === 'cpu' && rawCpuRenderMs != null && Number.isFinite(Number(rawCpuRenderMs))
          ? roundTimingMs(Number(rawCpuRenderMs))
          : null;
      const frameWebGlMaxTex2d =
        frameBackend === 'gpu' &&
        message?.proxyGpuImpl === 'webgl' &&
        message?.proxyWorkerWebGlMaxTex2d != null &&
        Number.isFinite(Number(message.proxyWorkerWebGlMaxTex2d))
          ? Math.floor(Number(message.proxyWorkerWebGlMaxTex2d))
          : null;
      const frameWebGlMaxTex3d =
        frameBackend === 'gpu' &&
        message?.proxyGpuImpl === 'webgl' &&
        message?.proxyWorkerWebGlMaxTex3d != null &&
        Number.isFinite(Number(message.proxyWorkerWebGlMaxTex3d))
          ? Math.floor(Number(message.proxyWorkerWebGlMaxTex3d))
          : null;
      const frameWebGlRgba16f =
        frameBackend === 'gpu' && message?.proxyGpuImpl === 'webgl'
          ? Object.prototype.hasOwnProperty.call(message ?? {}, 'proxyWorkerWebGlRgba16fFbo')
            ? message.proxyWorkerWebGlRgba16fFbo === true
            : null
          : null;
      const frameWebGlFbo16fBlit =
        frameBackend === 'gpu' && message?.proxyGpuImpl === 'webgl'
          ? Object.prototype.hasOwnProperty.call(message ?? {}, 'proxyWorkerWebGlFbo16fBlit')
            ? message.proxyWorkerWebGlFbo16fBlit === true
            : null
          : null;
      const frameWebGl3dLutRgba16f =
        frameBackend === 'gpu' && message?.proxyGpuImpl === 'webgl'
          ? Object.prototype.hasOwnProperty.call(message ?? {}, 'proxyWorkerWebGl3dLutRgba16f')
            ? message.proxyWorkerWebGl3dLutRgba16f === true
            : null
          : null;
      const frameGpuTexW =
        frameBackend === 'gpu' &&
        message?.proxyWorkerGpuTexW != null &&
        Number.isFinite(Number(message.proxyWorkerGpuTexW))
          ? Math.floor(Number(message.proxyWorkerGpuTexW))
          : null;
      const frameGpuTexH =
        frameBackend === 'gpu' &&
        message?.proxyWorkerGpuTexH != null &&
        Number.isFinite(Number(message.proxyWorkerGpuTexH))
          ? Math.floor(Number(message.proxyWorkerGpuTexH))
          : null;
      const frameFullSourceW =
        frameBackend === 'gpu' &&
        message?.proxyWorkerFullSourceW != null &&
        Number.isFinite(Number(message.proxyWorkerFullSourceW))
          ? Math.floor(Number(message.proxyWorkerFullSourceW))
          : null;
      const frameFullSourceH =
        frameBackend === 'gpu' &&
        message?.proxyWorkerFullSourceH != null &&
        Number.isFinite(Number(message.proxyWorkerFullSourceH))
          ? Math.floor(Number(message.proxyWorkerFullSourceH))
          : null;
      const hasGpuInputDownscaleMs = Object.prototype.hasOwnProperty.call(
        message ?? {},
        'proxyWorkerGpuInputDownscaleMs',
      );
      const frameGpuInputDownscaleMs =
        frameBackend === 'gpu' && hasGpuInputDownscaleMs
          ? message.proxyWorkerGpuInputDownscaleMs === null
            ? null
            : Number.isFinite(Number(message.proxyWorkerGpuInputDownscaleMs))
              ? roundTimingMs(Number(message.proxyWorkerGpuInputDownscaleMs))
              : null
          : null;
      const frameOutputTileCountNominal =
        message?.proxyWorkerOutputTileCountNominal != null &&
        Number.isFinite(Number(message.proxyWorkerOutputTileCountNominal))
          ? Math.floor(Number(message.proxyWorkerOutputTileCountNominal))
          : null;
      const frameOutputTileCountTarget =
        message?.proxyWorkerOutputTileCountTarget != null &&
        Number.isFinite(Number(message.proxyWorkerOutputTileCountTarget))
          ? Math.floor(Number(message.proxyWorkerOutputTileCountTarget))
          : null;
      const frameWorkerCpuFullNominalParity =
        frameBackend === 'cpu' ? message?.proxyWorkerCpuFullNominalParity === true : false;

      const canvas = canvasRef.current;
      if (!canvas) {
        if (message.bitmap && typeof message.bitmap.close === 'function') {
          message.bitmap.close();
        }
        return;
      }

      const context = getCanvasContext(canvas, { willReadFrequently: true });
      if (!context) {
        if (message.bitmap && typeof message.bitmap.close === 'function') {
          message.bitmap.close();
        }
        return;
      }

      const frameWidth = Number(message.width) || 0;
      const frameHeight = Number(message.height) || 0;
      if (!frameWidth || !frameHeight) {
        if (message.bitmap && typeof message.bitmap.close === 'function') {
          message.bitmap.close();
        }
        return;
      }

      const frameProxyOutputFitted = message?.proxyWorkerProxyOutputFitted === true;
      const frameProxyOutputRequestedW =
        frameProxyOutputFitted &&
        message?.proxyWorkerProxyOutputRequestedW != null &&
        Number.isFinite(Number(message.proxyWorkerProxyOutputRequestedW))
          ? Math.floor(Number(message.proxyWorkerProxyOutputRequestedW))
          : null;
      const frameProxyOutputRequestedH =
        frameProxyOutputFitted &&
        message?.proxyWorkerProxyOutputRequestedH != null &&
        Number.isFinite(Number(message.proxyWorkerProxyOutputRequestedH))
          ? Math.floor(Number(message.proxyWorkerProxyOutputRequestedH))
          : null;
      const frameProxyOutputTargetW = frameProxyOutputFitted ? frameWidth : null;
      const frameProxyOutputTargetH = frameProxyOutputFitted ? frameHeight : null;

      const frameMeta = proxyRenderMetaRef.current || {};
      const rotation = Number(frameMeta.rotation ?? 0) || 0;
      const flipped = Boolean(frameMeta.flipped);
      const displaySourceWidth = sourceCanvasRef.current?.width || frameWidth;
      const displaySourceHeight = sourceCanvasRef.current?.height || frameHeight;
      const workerCanvas = ensureCanvas(fxCanvasRef, frameWidth, frameHeight);
      const workerContext = getCanvasContext(workerCanvas, { willReadFrequently: true });
      if (!workerContext) {
        if (message.bitmap && typeof message.bitmap.close === 'function') {
          message.bitmap.close();
        }
        return;
      }

      try {
        let presentationImage = null;
        const hasRenderableBitmap =
          Boolean(message.bitmap) &&
          Number(message.bitmap?.width) > 0 &&
          Number(message.bitmap?.height) > 0;
        if (hasRenderableBitmap) {
          workerCanvas.width = frameWidth;
          workerCanvas.height = frameHeight;
          workerContext.clearRect(0, 0, frameWidth, frameHeight);
          workerContext.drawImage(message.bitmap, 0, 0, frameWidth, frameHeight);
          presentationImage = workerCanvas;
        } else if (message.pixels) {
          const pixels = new Uint8ClampedArray(message.pixels);
          const imageData = new ImageData(pixels, frameWidth, frameHeight);
          workerCanvas.width = frameWidth;
          workerCanvas.height = frameHeight;
          workerContext.putImageData(imageData, 0, 0);
          presentationImage = workerCanvas;
        }

        if (!presentationImage) {
          return;
        }

        const presentation = getPresentationDimensions(
          displaySourceWidth,
          displaySourceHeight,
          rotation
        );
        if (canvas.width !== presentation.width) {
          canvas.width = presentation.width;
        }
        if (canvas.height !== presentation.height) {
          canvas.height = presentation.height;
        }
        context.clearRect(0, 0, presentation.width, presentation.height);
        drawPresentedImage(
          context,
          presentationImage,
          displaySourceWidth,
          displaySourceHeight,
          rotation,
          flipped
        );
        if (adjustments?.cmykSoftProofEnabled && !adjustments?.compareMode) {
          try {
            const cmykId = context.getImageData(0, 0, presentation.width, presentation.height);
            applyCmykSoftProofApproxToRgba(cmykId.data);
            context.putImageData(cmykId, 0, 0);
          } catch {
            /* ignore readback failures */
          }
        }
      } catch (presentationError) {
        const errorMessage =
          presentationError instanceof Error
            ? presentationError.message
            : String(presentationError || 'worker frame presentation failed');
        const transientBitmapStateError =
          Boolean(message.bitmap) &&
          (/invalidstateerror/i.test(errorMessage) ||
            /detached/i.test(errorMessage) ||
            /neuter/i.test(errorMessage));
        if (transientBitmapStateError) {
          if (import.meta?.env?.DEV) {
            console.warn('[FilmLab] Ignoring transient worker bitmap state error:', errorMessage);
          }
          return;
        }
        console.error('[FilmLab] Failed to present worker frame', presentationError);
        reportRenderPipelineError(
          'WORKER_PRESENTATION_FAILED',
          presentationError instanceof Error
            ? presentationError.message
            : 'Nie udało się wyświetlić ramki z workera.',
          { stage: 'presentation' }
        );
        proxyWorkerFailedRef.current = true;
        setRenderDebugInfo((current) => ({
          ...current,
          proxyWorkerStatus: 'error',
          proxyWorkerReason:
            presentationError instanceof Error
              ? presentationError.message
              : 'worker frame presentation failed',
        }));
        if (import.meta?.env?.DEV) {
          console.warn(
            '[FilmLab] Worker frame presentation failed (CPU fallback active):',
            presentationError instanceof Error ? presentationError.message : 'unknown error'
          );
        }
        return;
      } finally {
        if (message.bitmap && typeof message.bitmap.close === 'function') {
          message.bitmap.close();
        }
      }

      applyLevelAndCropTransform(context, canvas, fxCanvasRef, frameMeta);
      setIsProcessing(false);
      const framePreviewE2ePath = `worker-${frameBackend}`;
      const framePreviewE2eMs = computePreviewE2eIntentToPresentMs(previewE2eIntentT0Ref);
      const frameE2eMedian = computeE2ePathMedianSnapshot(
        previewE2eSamplesByPathRef,
        framePreviewE2ePath,
        framePreviewE2eMs,
      );
      const frameCostSnap = computeE2eFrameCostMedianSnapshot(
        previewE2eFrameCostSamplesByPathRef,
        framePreviewE2ePath,
        workerRenderElapsedMs,
      );
      const framePreviewDragE2eMs = computePreviewE2eDragToPresentMs(
        previewE2eDragT0Ref,
        isAdjustingSnapshotRef.current
      );
      const framePreviewPointerE2eMs = takePreviewE2ePointerToPresentMs(
        isAdjustingSnapshotRef,
        isPanningSnapshotRef
      );
      setRenderDebugInfo((current) => {
        if (
          current.proxyLastFrameBackend === frameBackend &&
          current.proxyLastFrameGpuImpl === frameGpuImpl &&
          current.proxyWorkerWebGpuSourceTexFormat === frameSourceTexFormat &&
          current.proxyWorkerWebGpuLut3dTexFormat === frameLut3dTexFormat &&
          JSON.stringify(current.proxyWorkerWebGpuReadbackRgba8) ===
            JSON.stringify(frameWgpuReadbackRgba8) &&
          current.proxyWorkerWebGpuReadbackChroma === frameWgpuReadbackChroma &&
          current.proxyWorkerGpuRenderMs === frameWorkerGpuRenderMs &&
          current.proxyWorkerCpuRenderMs === frameWorkerCpuRenderMs &&
          current.proxyWorkerWebGlMaxTex2d === frameWebGlMaxTex2d &&
          current.proxyWorkerWebGlMaxTex3d === frameWebGlMaxTex3d &&
          current.proxyWorkerWebGlRgba16f === frameWebGlRgba16f &&
          current.proxyWorkerWebGlFbo16fBlit === frameWebGlFbo16fBlit &&
          current.proxyWorkerWebGl3dLutRgba16f === frameWebGl3dLutRgba16f &&
          current.proxyWorkerGpuTexW === frameGpuTexW &&
          current.proxyWorkerGpuTexH === frameGpuTexH &&
          current.proxyWorkerFullSourceW === frameFullSourceW &&
          current.proxyWorkerFullSourceH === frameFullSourceH &&
          current.proxyWorkerGpuInputDownscaleMs === frameGpuInputDownscaleMs &&
          current.proxyWorkerProxyOutputFitted === frameProxyOutputFitted &&
          current.proxyWorkerProxyOutputRequestedW === frameProxyOutputRequestedW &&
          current.proxyWorkerProxyOutputRequestedH === frameProxyOutputRequestedH &&
          current.proxyWorkerProxyOutputTargetW === frameProxyOutputTargetW &&
          current.proxyWorkerProxyOutputTargetH === frameProxyOutputTargetH &&
          current.proxyWorkerOutputTileCountNominal === frameOutputTileCountNominal &&
          current.proxyWorkerOutputTileCountTarget === frameOutputTileCountTarget &&
          current.proxyWorkerCpuFullNominalParity === frameWorkerCpuFullNominalParity &&
          current.proxySourceReady === true &&
          current.lastRenderPath === `worker-${frameBackend}` &&
          current.workerRenderMs === workerRenderElapsedMs &&
          current.previewE2ePath === framePreviewE2ePath &&
          current.previewE2eIntentToPresentMs === framePreviewE2eMs &&
          current.previewE2eMedianMs === frameE2eMedian.medianMs &&
          current.previewE2eKpiState === frameE2eMedian.kpiState &&
          current.previewE2eDragToPresentMs === framePreviewDragE2eMs &&
          current.previewE2ePointerToPresentMs === framePreviewPointerE2eMs &&
          current.previewE2eHostSchedToRafMs === frameHostSchedRafMs &&
          current.previewE2eFrameCostMs === workerRenderElapsedMs &&
          current.previewE2eFrameCostMedianMs === frameCostSnap.medianMs &&
          current.previewE2eFrameCostKpiState === frameCostSnap.kpiState &&
          JSON.stringify(current.previewE2eFrameCostPerPathStats) ===
            JSON.stringify(frameCostSnap.pathStats) &&
          current.previewE2eFrameCostGateSummary ===
            getPreviewE2eFrameCostGateInfo({
              ...current,
              previewE2ePath: framePreviewE2ePath,
              previewE2eFrameCostPerPathStats: frameCostSnap.pathStats,
            }).exportSummary
        ) {
          return current;
        }
        return withPreviewE2eFrameCostGate({
          ...current,
          proxyLastFrameBackend: frameBackend,
          proxyLastFrameGpuImpl: frameGpuImpl,
          proxyWorkerWebGpuSourceTexFormat: frameSourceTexFormat,
          proxyWorkerWebGpuLut3dTexFormat: frameLut3dTexFormat,
          proxyWorkerWebGpuReadbackRgba8: frameWgpuReadbackRgba8,
          proxyWorkerWebGpuReadbackChroma: frameWgpuReadbackChroma,
          proxyWorkerGpuRenderMs: frameWorkerGpuRenderMs,
          proxyWorkerCpuRenderMs: frameWorkerCpuRenderMs,
          proxyWorkerWebGlMaxTex2d: frameWebGlMaxTex2d,
          proxyWorkerWebGlMaxTex3d: frameWebGlMaxTex3d,
          proxyWorkerWebGlRgba16f: frameWebGlRgba16f,
          proxyWorkerWebGlFbo16fBlit: frameWebGlFbo16fBlit,
          proxyWorkerWebGl3dLutRgba16f: frameWebGl3dLutRgba16f,
          proxyWorkerGpuTexW: frameGpuTexW,
          proxyWorkerGpuTexH: frameGpuTexH,
          proxyWorkerFullSourceW: frameFullSourceW,
          proxyWorkerFullSourceH: frameFullSourceH,
          proxyWorkerGpuInputDownscaleMs: frameGpuInputDownscaleMs,
          proxyWorkerProxyOutputFitted: frameProxyOutputFitted,
          proxyWorkerProxyOutputRequestedW: frameProxyOutputRequestedW,
          proxyWorkerProxyOutputRequestedH: frameProxyOutputRequestedH,
          proxyWorkerProxyOutputTargetW: frameProxyOutputTargetW,
          proxyWorkerProxyOutputTargetH: frameProxyOutputTargetH,
          proxyWorkerOutputTileCountNominal: frameOutputTileCountNominal,
          proxyWorkerOutputTileCountTarget: frameOutputTileCountTarget,
          proxyWorkerCpuFullNominalParity: frameWorkerCpuFullNominalParity,
          proxySourceReady: true,
          lastRenderPath: `worker-${frameBackend}`,
          workerRenderMs: workerRenderElapsedMs,
          previewE2eIntentToPresentMs: framePreviewE2eMs,
          previewE2ePath: framePreviewE2ePath,
          previewE2eMedianMs: frameE2eMedian.medianMs,
          previewE2eKpiTargetMs: PREVIEW_E2E_KPI_TARGET_MS,
          previewE2eKpiState: frameE2eMedian.kpiState,
          previewE2ePerPathStats: frameE2eMedian.pathStats,
          previewE2eDragToPresentMs: framePreviewDragE2eMs,
          previewE2ePointerToPresentMs: framePreviewPointerE2eMs,
          previewE2eHostSchedToRafMs: frameHostSchedRafMs,
          previewE2eFrameCostMs: workerRenderElapsedMs,
          previewE2eFrameCostMedianMs: frameCostSnap.medianMs,
          previewE2eFrameCostKpiTargetMs: PREVIEW_E2E_FRAME_COST_TARGET_MS,
          previewE2eFrameCostKpiState: frameCostSnap.kpiState,
          previewE2eFrameCostPerPathStats: frameCostSnap.pathStats,
        });
      });
      setRenderVersion((value) => value + 1);
    };

    worker.onerror = (error) => {
      console.error('[FilmLab] Proxy worker runtime error', error);
      reportRenderPipelineError(
        'WORKER_RUNTIME_ERROR',
        error?.message || 'Worker crash: unknown error',
        { stage: 'worker-runtime' }
      );
      proxyWorkerFailedRef.current = true;
      setRenderDebugInfo((current) => ({
        ...current,
        proxyWorkerStatus: 'error',
        proxyWorkerReason: error?.message || 'worker runtime error',
      }));
    };

    return () => {
      disposed = true;
      if (proxyWorkerRafRef.current) {
        cancelAnimationFrame(proxyWorkerRafRef.current);
        proxyWorkerRafRef.current = null;
      }
      proxyWorkerQueuedPayloadRef.current = null;
      proxyWorkerRef.current = null;
      proxyWorkerSourceReadyRef.current = false;
      proxySourceIdRef.current = 0;
      proxyRequestIdRef.current = 0;
      proxyLastPresentedRequestIdRef.current = 0;
      proxyRequestStartTimesRef.current.clear();
      previewE2eSamplesByPathRef.current.clear();
      previewE2eFrameCostSamplesByPathRef.current.clear();
      setRenderDebugInfo((current) => ({
        ...current,
        proxySourceReady: false,
        proxyLastFrameBackend: 'n/a',
        proxyLastFrameGpuImpl: 'n/a',
        proxyWebGpuDeviceLost: false,
        proxyWebGpuDeviceLostAt: null,
        proxyWebGpuDeviceLostMessage: null,
        proxyWebGpuReinitFailedAt: null,
        proxyWebGpuReinitFailedMessage: null,
        proxyWorkerWebGpuCanvasFormat: null,
        proxyWorkerWebGpuDeviceLimits: null,
        proxyWorkerWebGpuSourceTexFormat: null,
        proxyWorkerWebGpuLut3dTexFormat: null,
        proxyWorkerWebGpuReadbackRgba8: null,
        proxyWorkerWebGpuReadbackChroma: null,
        workerRenderMs: null,
        proxyWorkerGpuRenderMs: null,
        proxyWorkerCpuRenderMs: null,
        proxyWorkerWebGlMaxTex2d: null,
        proxyWorkerWebGlMaxTex3d: null,
        proxyWorkerWebGlRgba16f: null,
        proxyWorkerWebGlFbo16fBlit: null,
        proxyWorkerWebGl3dLutRgba16f: null,
        proxyWorkerGpuTexW: null,
        proxyWorkerGpuTexH: null,
        proxyWorkerFullSourceW: null,
        proxyWorkerFullSourceH: null,
        proxyWorkerGpuInputDownscaleMs: null,
        proxyWorkerProxyOutputFitted: false,
        proxyWorkerProxyOutputRequestedW: null,
        proxyWorkerProxyOutputRequestedH: null,
        proxyWorkerProxyOutputTargetW: null,
        proxyWorkerProxyOutputTargetH: null,
        proxyWorkerOutputTileCountNominal: null,
        proxyWorkerOutputTileCountTarget: null,
        proxyWorkerCpuFullNominalParity: false,
        proxyWorkerNominalW: null,
        proxyWorkerNominalH: null,
        proxyWorkerProxyMaxEffective: null,
        proxyInputBufferW: null,
        proxyInputBufferH: null,
      }));
      try {
        worker.postMessage({ type: 'clearSource' });
      } catch (_error) {
        // Ignore.
      }
      worker.terminate();
    };
  }, [reportRenderPipelineError, shouldBootProxyWorker]);

  useEffect(
    () => () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (previewHydrationFrameRef.current) {
        cancelAnimationFrame(previewHydrationFrameRef.current);
      }

      if (proxyWorkerRafRef.current) {
        cancelAnimationFrame(proxyWorkerRafRef.current);
        proxyWorkerRafRef.current = null;
      }
      proxyWorkerQueuedPayloadRef.current = null;

      cancelIdleCallbackSafe(deferredRenderRef.current);
      fastPreviewRendererRef.current?.dispose?.();
      try {
        proxyWorkerRef.current?.postMessage?.({ type: 'clearSource' });
      } catch (_error) {
        // Ignore.
      }
      proxyWorkerRef.current?.terminate?.();
      proxyWorkerRef.current = null;
      proxyLastPresentedRequestIdRef.current = 0;
      setRenderDebugInfo((current) => ({
        ...current,
        proxyWorkerStatus: 'closed',
      }));
      disposeRawPipeline();
    },
    []
  );

  useEffect(() => {
    preloadOverlayGroup('dust', DUST_OVERLAY_FILES);
    preloadOverlayGroup('raw-leak', RAW_LEAK_OVERLAY_FILES);
    preloadOverlayGroup('filmstrip', FILMSTRIP_OVERLAY_FILES);
  }, [uploadedImage]);

  useEffect(() => {
    const dustValue = Number(adjustments?.dust ?? 0);
    const dustVariant = Number(adjustments?.dustVariant ?? -1);
    const leakValue = adjustments?.leak ?? 'none';
    const rawLeakVariant = Number(adjustments?.rawLeakVariant ?? -1);
    const frameValue = adjustments?.frame ?? 'none';
    const frameVariant = Number(adjustments?.frameVariant ?? -1);
    const dustCycle = Number(adjustments?.dustCycle ?? 0);
    const rawLeakCycle = Number(adjustments?.rawLeakCycle ?? 0);
    const frameCycle = Number(adjustments?.frameCycle ?? 0);
    const sourceKey = sourceVersionRef.current;
    const last = lastEffectStateRef.current;

    if (sourceKey !== last.sourceKey) {
      effectSeedRef.current.dust = Math.floor(Math.random() * 1_000_000_000);
      effectSeedRef.current.leak = Math.floor(Math.random() * 1_000_000_000);
      effectSeedRef.current.frame = Math.floor(Math.random() * 1_000_000_000);
    }

    if (dustValue !== last.dust) {
      effectSeedRef.current.dust = Math.floor(Math.random() * 1_000_000_000);
    }

    if (dustVariant !== last.dustVariant) {
      effectSeedRef.current.dust = Math.floor(Math.random() * 1_000_000_000);
    }

    if (dustCycle !== last.dustCycle) {
      effectSeedRef.current.dust = Math.floor(Math.random() * 1_000_000_000);
    }

    if (leakValue !== last.leak) {
      effectSeedRef.current.leak = Math.floor(Math.random() * 1_000_000_000);
    }

    if (rawLeakVariant !== last.rawLeakVariant) {
      effectSeedRef.current.leak = Math.floor(Math.random() * 1_000_000_000);
    }

    if (rawLeakCycle !== last.rawLeakCycle) {
      effectSeedRef.current.leak = Math.floor(Math.random() * 1_000_000_000);
    }

    if (frameValue !== last.frame) {
      effectSeedRef.current.frame = Math.floor(Math.random() * 1_000_000_000);
    }

    if (frameVariant !== last.frameVariant) {
      effectSeedRef.current.frame = Math.floor(Math.random() * 1_000_000_000);
    }

    if (frameCycle !== last.frameCycle) {
      effectSeedRef.current.frame = Math.floor(Math.random() * 1_000_000_000);
    }

    lastEffectStateRef.current = {
      dust: dustValue,
      dustVariant,
      leak: leakValue,
      rawLeakVariant,
      frame: frameValue,
      frameVariant,
      dustCycle,
      rawLeakCycle,
      frameCycle,
      sourceKey,
    };
  }, [
    adjustments?.dust,
    adjustments?.dustVariant,
    adjustments?.leak,
    adjustments?.rawLeakVariant,
    adjustments?.frame,
    adjustments?.frameVariant,
    adjustments?.dustCycle,
    adjustments?.rawLeakCycle,
    adjustments?.frameCycle,
    renderVersion,
  ]);

  const shuffleSeeds = useCallback(() => {
    effectSeedRef.current = {
      ...effectSeedRef.current,
      dust: Math.floor(Math.random() * 1_000_000_000),
      leak: Math.floor(Math.random() * 1_000_000_000),
      frame: Math.floor(Math.random() * 1_000_000_000),
    };
  }, []);

  const renderToContext = useCallback(
    ({
      canvas,
      context,
      source,
      includeCompare,
      quality = 'full',
      renderToken = null,
      showClipping = false,
      displayPreviewApproximations = false,
    }) => {
      const batchOv = batchAdjustmentsOverrideRef.current;
      const adjustmentsForRender =
        batchOv?.active && batchOv?.value != null && typeof batchOv.value === 'object'
          ? batchOv.value
          : adjustments;
      const film = activeFilm ?? {};
      const isRawPipeline = pipelineInfo?.pipelineKind === PIPELINE_KIND.RAW;
      const userCurves = adjustmentsForRender?.userCurves ?? IDENTITY_CURVES;
      const curveLumaMix = resolveCurveLumaMix(adjustmentsForRender?.curveLumaMix);
      let transformedSource = transformSourceImageData(
        source,
        adjustmentsForRender?.rotation ?? 0,
        adjustmentsForRender?.flipped
      );
      const isPreviewQuality = quality === 'preview';
      let width = transformedSource.width;
      let height = transformedSource.height;

      if (isPreviewQuality) {
        const baseProxyMax = getWorkerProxyMaxDimension(width, height);
        const rawProxyMax = adjustmentsForRender?.isAdjusting
          ? getInteractiveWorkerProxyMaxDimension(baseProxyMax, adjustmentsForRender?.interactionKind)
          : baseProxyMax;
        const par = getNominalProxyRenderSize(width, height, rawProxyMax, {
          matchPreviewBuffer: PROXY_MATCH_PREVIEW_BUFFER,
        });
        const bufferW0 = width;
        const bufferH0 = height;
        let downscaled = false;
        if (
          isEnvCpuPreviewMatchNominal() &&
          (bufferW0 !== par.width || bufferH0 !== par.height)
        ) {
          const scaled = downscaleImageDataToNominalSize(
            { data: transformedSource.data, width, height },
            par.width,
            par.height
          );
          if (scaled) {
            transformedSource = scaled;
            width = par.width;
            height = par.height;
            downscaled = true;
          }
        }
        setRenderDebugInfo((c) => ({
          ...c,
          cpuParityNominalW: par.width,
          cpuParityNominalH: par.height,
          cpuParityProxyMax: par.proxyMax,
          cpuParityBufferW: bufferW0,
          cpuParityBufferH: bufferH0,
          cpuParityMatchNominal: bufferW0 === par.width && bufferH0 === par.height,
          cpuParityDownscaled: downscaled,
        }));
      } else {
        setRenderDebugInfo((c) => ({
          ...c,
          cpuParityNominalW: null,
          cpuParityNominalH: null,
          cpuParityProxyMax: null,
          cpuParityBufferW: null,
          cpuParityBufferH: null,
          cpuParityMatchNominal: null,
          cpuParityDownscaled: null,
        }));
      }

      const originalSourceData = new Uint8ClampedArray(transformedSource.data);
      const sourceData = new Uint8ClampedArray(transformedSource.data);
      const lut = {
        rgb: buildLUT(film.curves?.rgb, 'monotonic'),
        r: buildLUT(film.curves?.r, 'monotonic'),
        g: buildLUT(film.curves?.g, 'monotonic'),
        b: buildLUT(film.curves?.b, 'monotonic'),
      };
      const userHighResLut = {
        rgb: buildHighResCurveLut(userCurves.rgb, 'monotonic'),
        r: buildHighResCurveLut(userCurves.r, 'monotonic'),
        g: buildHighResCurveLut(userCurves.g, 'monotonic'),
        b: buildHighResCurveLut(userCurves.b, 'monotonic'),
      };

      const imageData = new ImageData(sourceData, width, height);
      const data = imageData.data;
      const isInteractivePreview = isPreviewQuality && Boolean(adjustmentsForRender?.isAdjusting);
      const strength = (adjustmentsForRender?.strength ?? 100) / 100;
      const toneAdj = applyAdjustmentBindingsForTonePipeline(adjustmentsForRender);
      latestToneAdjForDepthOnnxRef.current = toneAdj;
      const lutStrength = Math.min(1, strength * 0.66);
      const effectiveProfileStrength = strength;
      // RAW preview stabilization:
      // some browser/GPU combinations can produce intermittent black CPU frames
      // right after asynchronous profile LUT hydration. For RAW we keep a deterministic
      // curve-based profile fallback in CPU preview and skip direct cube sampling.
      const canUseCpuProfileLut = !isRawPipeline;
      const hasProfileLut = Boolean(
        canUseCpuProfileLut && profileLut && profileLutStatus === 'ready'
      );
      const waitingForProfileLut = Boolean(
        canUseCpuProfileLut && activeFilm?.previewLutFile && profileLutStatus === 'loading'
      );
      const shouldBypassProfileCpuColor = waitingForProfileLut;
      const profileNoLutBoost = hasProfileLut ? 1 : 1.05;
      const profileMasterCurveStrength = effectiveProfileStrength * 0.42 * profileNoLutBoost;
      const profileChannelCurveStrength =
        effectiveProfileStrength * 0.86 * profileNoLutBoost;
      const profileColorStrength = effectiveProfileStrength * 0.9 * profileNoLutBoost;
      const profileBalanceStrength = effectiveProfileStrength * 0.64 * profileNoLutBoost;
      const profileToneStrength = effectiveProfileStrength * 0.28 * profileNoLutBoost;
      const profileDetailStrength = effectiveProfileStrength * 0.4 * profileNoLutBoost;
      const userExposure =
        mapSignedSliderForResponse(toneAdj?.exposure ?? 0, 'exposure') *
        USER_RESPONSE_SCALE.exposure;
      const userContrast =
        mapSignedSliderForResponse(adjustmentsForRender?.contrast ?? 0, 'contrast') *
        USER_RESPONSE_SCALE.contrast;
      const userSaturation =
        mapSignedSliderForResponse(adjustmentsForRender?.saturation ?? 0, 'saturation') *
        USER_RESPONSE_SCALE.saturation;
      const userVibrance =
        mapSignedSliderForResponse(adjustmentsForRender?.vibrance ?? 0, 'vibrance') *
        USER_RESPONSE_SCALE.vibrance;
      const userTemperature = Number(adjustmentsForRender?.temp ?? 0);
      const userTint = Number(adjustmentsForRender?.tint ?? 0);
      const userHighlights =
        mapSignedSliderForResponse(adjustmentsForRender?.highlights ?? 0, 'highlights') *
        USER_RESPONSE_SCALE.highlights;
      const userShadows =
        mapSignedSliderForResponse(adjustmentsForRender?.shadows ?? 0, 'shadows') *
        USER_RESPONSE_SCALE.shadows;
      const userWhites =
        mapSignedSliderForResponse(adjustmentsForRender?.whites ?? 0, 'whites') *
        USER_RESPONSE_SCALE.whites;
      const userBlacks =
        mapSignedSliderForResponse(adjustmentsForRender?.blacks ?? 0, 'blacks') *
        USER_RESPONSE_SCALE.blacks;
      const userDehaze =
        mapSignedSliderForResponse(adjustmentsForRender?.dehaze ?? 0, 'dehaze') *
        USER_RESPONSE_SCALE.dehaze;
      const userClarity =
        mapSignedSliderForResponse(adjustmentsForRender?.clarity ?? 0, 'clarity') *
        USER_RESPONSE_SCALE.clarity;
      const profileExposure =
        shouldBypassProfileCpuColor
          ? 0
          : (film.exposure ?? 0) * profileToneStrength;
      const mappedExposureEv = mapFilmSafeExposureEv(userExposure / 100 + profileExposure);
      const totalExp = Math.pow(2, mappedExposureEv);
      const totalCon =
        1 +
        (((shouldBypassProfileCpuColor ? 0 : film.contrast ?? 0) * profileColorStrength) /
          200) +
        userContrast / 200;
      const totalSat =
        1 +
        (((shouldBypassProfileCpuColor ? 0 : film?.saturation ?? 0) *
          profileColorStrength) /
          100 +
          userSaturation / 100);
      const totalVib =
        (((shouldBypassProfileCpuColor ? 0 : film.vibrance ?? 0) * profileColorStrength) /
          100) +
        userVibrance / 100;
      const profileTemperature =
        (shouldBypassProfileCpuColor ? 0 : film.temperature ?? 0) * profileBalanceStrength;
      const profileTint =
        (shouldBypassProfileCpuColor ? 0 : film.tint ?? 0) * profileBalanceStrength;
      const totalTemp = clamp(userTemperature + profileTemperature, -100, 100);
      const totalTint = clamp(userTint + profileTint, -100, 100);
      const wb = resolveWhiteBalanceGains(totalTemp, totalTint);
      const wbR = wb.r;
      const wbG = wb.g;
      const wbB = wb.b;
      const fadeAmount =
        (mapUnsignedSliderForResponse(adjustmentsForRender?.fade ?? 0, 'fade') *
          USER_RESPONSE_SCALE.fade) /
        100;
      const profileHighlights =
        (((shouldBypassProfileCpuColor ? 0 : film.highlights ?? 0) * profileToneStrength) /
          100);
      const profileShadows =
        (((shouldBypassProfileCpuColor ? 0 : film.shadows ?? 0) * profileToneStrength) /
          100);
      const profileWhites =
        (((shouldBypassProfileCpuColor ? 0 : film.whites ?? 0) * profileToneStrength) /
          100);
      const profileBlacks =
        (((shouldBypassProfileCpuColor ? 0 : film.blacks ?? 0) * profileToneStrength) /
          100);
      const userCurveToneCompensation = hasUserCurveAdjustments(userCurves) ? 0.42 : 0;
      const userTonePreWeight = 1 - userCurveToneCompensation;
      const totalHighlightsPre = profileHighlights + (userHighlights / 100) * userTonePreWeight;
      const totalShadowsPre = profileShadows + (userShadows / 100) * userTonePreWeight;
      const totalWhitesPre = profileWhites + (userWhites / 100) * userTonePreWeight;
      const totalBlacksPre = profileBlacks + (userBlacks / 100) * userTonePreWeight;
      const totalHighlightsPost = (userHighlights / 100) * userCurveToneCompensation;
      const totalShadowsPost = (userShadows / 100) * userCurveToneCompensation;
      const totalWhitesPost = (userWhites / 100) * userCurveToneCompensation;
      const totalBlacksPost = (userBlacks / 100) * userCurveToneCompensation;
      const profileDehaze =
        (((shouldBypassProfileCpuColor ? 0 : film.dehaze ?? 0) * profileDetailStrength) /
          140);
      const totalDehaze = profileDehaze + userDehaze / 100;
      const profileClarity =
        (((shouldBypassProfileCpuColor ? 0 : film.clarity ?? 0) * profileDetailStrength) /
          85);
      const totalClarity = profileClarity + userClarity / 100;
      const profileTexture =
        (((shouldBypassProfileCpuColor ? 0 : film.texture ?? 0) * profileDetailStrength) /
          70);
      const isBlackAndWhite = !activeFilm?.previewLutFile && Boolean(film.bw);
      const grayMixer = film.grayMixer ?? null;
      const mappedUserHsl = mapHslStateForResponse(adjustmentsForRender?.userHsl ?? null);
      const mappedUserColorGrade = mapColorGradeStateForResponse(
        adjustmentsForRender?.userColorGrade ?? null
      );
      const mappedUserCalibration = mapCalibrationStateForResponse(
        adjustmentsForRender?.userCalibration ?? null
      );
      const profileRegionalAdjustments = createRegionalAdjustments(
        shouldBypassProfileCpuColor ? null : film.hsl ?? null,
        Math.min(0.92, profileColorStrength * 0.9)
      );
      const userRegionalAdjustments = createRegionalAdjustments(
        mappedUserHsl,
        USER_RESPONSE_SCALE.mixer
      );
      const profileColorGrade = shouldBypassProfileCpuColor ? null : film.colorGrade ?? null;
      const userColorGrade = mappedUserColorGrade;
      const profileColorGradeStrength = Math.min(0.56, profileColorStrength * 0.54);
      const userColorGradeStrength = USER_RESPONSE_SCALE.grading;
      const profileCalibration = createCalibrationAdjustments(
        shouldBypassProfileCpuColor ? null : film.calibration ?? null,
        Math.min(0.64, profileColorStrength * 0.58)
      );
      const userCalibration = createCalibrationAdjustments(
        mappedUserCalibration,
        USER_RESPONSE_SCALE.calibration
      );
      const shouldAbortRender = () =>
        renderToken != null && renderTokenRef.current !== renderToken;
      const applyProfileCalibration =
        !isBlackAndWhite && profileCalibration.enabled;
      const applyUserCalibration = !isBlackAndWhite && userCalibration.enabled;
      const applyProfileRegional =
        !isBlackAndWhite && profileRegionalAdjustments.enabled;
      const applyUserRegional = !isBlackAndWhite && userRegionalAdjustments.enabled;
      const applyProfileColorGrade =
        !isBlackAndWhite &&
        hasColorGradeAdjustments(profileColorGrade);
      const applyUserColorGrade =
        !isBlackAndWhite && hasColorGradeAdjustments(userColorGrade);
      // F0.3: abort more often so superseded renders exit sooner (was 4095 / 16383).
      const abortCheckMask = isInteractivePreview ? 2047 : 8191;
      const sourceStatsForBlackGuard = isRawPipeline
        ? computeSampledRgbaStats(originalSourceData, width, height)
        : null;
      const clippingHighlightThreshold = resolveHighlightClippingThreshold(adjustmentsForRender);
      const clippingShadowThreshold = resolveShadowClippingThreshold(adjustmentsForRender);
      const clippingShadowLumaGate = Math.max(
        CLIPPING_SHADOW_LUMA_FLOOR,
        clippingShadowThreshold * 2.2
      );
      const decodeStats = pipelineInfo?.capabilities?.decodeStats ?? null;
      const rawColorPipeline = pipelineInfo?.capabilities?.colorPipeline ?? null;
      const rawLinearStageEnabled =
        rawLinearStageOverride == null
          ? rawColorPipeline?.linearStageEnabled !== false
          : Boolean(rawLinearStageOverride);
      const decodeMeanLuma = Number(decodeStats?.meanLuma);
      const decodeNonBlackRatio = Number(decodeStats?.nonBlackRatio);
      // RAW startup must stay faithful to the source (no hidden auto tone shaping).
      // Recovery is added only when user/profile tone controls ask for it.
      const rawBaseHighlightRecovery = 0;
      const rawBaseShadowRecovery = 0;
      const rawHighlightRecovery =
        isRawPipeline
          ? clampUnit(
              rawBaseHighlightRecovery +
                Math.max(0, totalHighlightsPre + totalHighlightsPost) * 0.9 +
                Math.max(0, totalWhitesPre + totalWhitesPost) * 0.8
            )
          : 0;
      const rawShadowRecovery =
        isRawPipeline
          ? clampUnit(
              rawBaseShadowRecovery +
                Math.max(0, totalShadowsPre + totalShadowsPost) * 0.9 +
                Math.max(0, totalBlacksPre + totalBlacksPost) * 0.72
            )
          : 0;
      if (String(toneAdj?.depthMapSource ?? 'luminance') !== 'onnx') {
        depthOnnxExternalRef.current = {
          buffer: null,
          digest: '',
          width: 0,
          height: 0,
        };
      }

      const toneAdjForMask =
        String(toneAdj?.depthMapSource ?? 'luminance') === 'onnx' &&
        depthOnnxExternalRef.current?.digest
          ? {
              ...toneAdj,
              depthProxyDigest: depthOnnxExternalRef.current.digest,
            }
          : toneAdj;

      const maskSnap = buildLocalMaskStackSnapshot(
        width,
        height,
        toneAdjForMask,
        brushMaskCacheRef.current
      );
      const brushMaskEnabled = maskSnap.brushMaskEnabled;
      const localMaskStack = maskSnap.localMaskStack;
      const graphOpNorm = maskSnap.graphOpNorm;
      const graphCombineActive = maskSnap.graphCombineActive;
      const graphIdxA = maskSnap.graphIdxA;
      const graphIdxB = maskSnap.graphIdxB;

      const onnxPack = depthOnnxExternalRef.current;
      const onnxBufReady =
        String(toneAdj?.depthMapSource ?? 'luminance') === 'onnx' &&
        onnxPack.buffer instanceof Float32Array &&
        onnxPack.width === width &&
        onnxPack.height === height &&
        onnxPack.buffer.length === width * height;

      let depthLumaScratch = null;
      if (brushMaskEnabled && localMaskStack.some((m) => m.mode === 'depth')) {
        if (onnxBufReady) {
          for (const m of localMaskStack) {
            if (m.mode === 'depth') {
              m.depthProxyBuffer = onnxPack.buffer;
            }
          }
        } else {
          const px = width * height;
          let buf = depthLumaMaterializeRef.current;
          if (!(buf instanceof Float32Array) || buf.length !== px) {
            buf = new Float32Array(px);
            depthLumaMaterializeRef.current = buf;
          }
          depthLumaScratch = buf;
          for (const m of localMaskStack) {
            if (m.mode === 'depth') {
              m.depthProxyBuffer = depthLumaScratch;
            }
          }
        }
      } else {
        for (const m of localMaskStack) {
          if (m.mode === 'depth') {
            m.depthProxyBuffer = null;
          }
        }
      }

      const pixelCount = Math.max(1, width * height);
      let highlightClipCount = 0;
      let shadowClipCount = 0;

      for (let index = 0; index < data.length; index += 4) {
        if ((index & abortCheckMask) === 0 && shouldAbortRender()) {
          return false;
        }
        let red = data[index];
        let green = data[index + 1];
        let blue = data[index + 2];

        if (isRawPipeline && rawLinearStageEnabled) {
          [red, green, blue] = applyRawLinearExposureStage(red, green, blue, {
            gain: totalExp,
            wbR,
            wbG,
            wbB,
            highlightRecovery: rawHighlightRecovery,
            shadowRecovery: rawShadowRecovery,
            sourceMeanLuma: decodeMeanLuma,
            sourceNonBlackRatio: decodeNonBlackRatio,
          });
        } else {
          [red, green, blue] = applyExposureGainWithShoulder(red, green, blue, totalExp);

          // Apply Multiplicative White Balance (Gain)
          red *= wbR;
          green *= wbG;
          blue *= wbB;
        }

        if (
          totalHighlightsPre !== 0 ||
          totalShadowsPre !== 0 ||
          totalWhitesPre !== 0 ||
          totalBlacksPre !== 0
        ) {
          [red, green, blue] = applyToneAdjustments(
            red,
            green,
            blue,
            totalHighlightsPre,
            totalShadowsPre,
            totalWhitesPre,
            totalBlacksPre
          );
        }

        let redIndex = clamp(Math.round(red));
        let greenIndex = clamp(Math.round(green));
        let blueIndex = clamp(Math.round(blue));
        const preCurveLuminance = clampUnit(
          (0.299 * redIndex + 0.587 * greenIndex + 0.114 * blueIndex) / 255
        );
        const shadowProtection = 1 - smoothstep(0.03, 0.18, preCurveLuminance);
        const highlightProtection = smoothstep(0.82, 0.985, preCurveLuminance);
        const shadowColorMask = smoothstep(0.12, 0.3, preCurveLuminance);
        const highlightColorMask = 1 - smoothstep(0.9, 0.99, preCurveLuminance) * 0.18;
        const channelCurveStrength =
          profileChannelCurveStrength *
          shadowColorMask *
          clampUnit(highlightColorMask);
        const masterCurveStrength =
          profileMasterCurveStrength *
          clampUnit(1 - shadowProtection * 0.5 - highlightProtection * 0.58);

        if (hasProfileLut && lutStrength > 0) {
          const [lutRed, lutGreen, lutBlue] = sampleCubeLut(
            profileLut,
            redIndex,
            greenIndex,
            blueIndex
          );

          red = redIndex * (1 - lutStrength) + lutRed * lutStrength;
          green = greenIndex * (1 - lutStrength) + lutGreen * lutStrength;
          blue = blueIndex * (1 - lutStrength) + lutBlue * lutStrength;
        } else if (!waitingForProfileLut) {
          const redDelta = (lut.r[redIndex] - redIndex) * channelCurveStrength;
          const greenDelta = (lut.g[greenIndex] - greenIndex) * channelCurveStrength;
          const blueDelta = (lut.b[blueIndex] - blueIndex) * channelCurveStrength;
          const sharedDelta =
            redDelta * 0.299 + greenDelta * 0.587 + blueDelta * 0.114;

          red += redDelta - sharedDelta;
          green += greenDelta - sharedDelta;
          blue += blueDelta - sharedDelta;

          const masterLuminance = clamp(
            Math.round(0.299 * red + 0.587 * green + 0.114 * blue)
          );
          const masterShift = (lut.rgb[masterLuminance] - masterLuminance) * masterCurveStrength;

          red += masterShift;
          green += masterShift;
          blue += masterShift;
        }

        redIndex = clamp(Math.round(red));
        greenIndex = clamp(Math.round(green));
        blueIndex = clamp(Math.round(blue));

        red = sampleHighResCurveLut(userHighResLut.r, red);
        green = sampleHighResCurveLut(userHighResLut.g, green);
        blue = sampleHighResCurveLut(userHighResLut.b, blue);

        const rgbDirectRed = sampleHighResCurveLut(userHighResLut.rgb, red);
        const rgbDirectGreen = sampleHighResCurveLut(userHighResLut.rgb, green);
        const rgbDirectBlue = sampleHighResCurveLut(userHighResLut.rgb, blue);
        const [lumaSourceY, lumaSourceCb, lumaSourceCr] = rgbToYCbCr(red, green, blue);
        const targetLumaY = sampleHighResCurveLut(userHighResLut.rgb, lumaSourceY);
        const [rgbLuminanceRed, rgbLuminanceGreen, rgbLuminanceBlue] = yCbCrToRgb(
          targetLumaY,
          lumaSourceCb,
          lumaSourceCr
        );

        red = mix(
          rgbDirectRed,
          rgbLuminanceRed,
          curveLumaMix
        );
        green = mix(
          rgbDirectGreen,
          rgbLuminanceGreen,
          curveLumaMix
        );
        blue = mix(
          rgbDirectBlue,
          rgbLuminanceBlue,
          curveLumaMix
        );

        if (
          totalHighlightsPost !== 0 ||
          totalShadowsPost !== 0 ||
          totalWhitesPost !== 0 ||
          totalBlacksPost !== 0
        ) {
          [red, green, blue] = applyToneAdjustments(
            red,
            green,
            blue,
            totalHighlightsPost,
            totalShadowsPost,
            totalWhitesPost,
            totalBlacksPost
          );
        }

        if (isBlackAndWhite) {
          [red, green, blue] = applyBlackAndWhiteMixer(red, green, blue, grayMixer);
        }

        if (totalCon !== 1) {
          red = ((red / 255 - 0.5) * totalCon + 0.5) * 255;
          green = ((green / 255 - 0.5) * totalCon + 0.5) * 255;
          blue = ((blue / 255 - 0.5) * totalCon + 0.5) * 255;
        }

        if (applyProfileCalibration) {
          [red, green, blue] = applyCalibrationAdjustments(
            red,
            green,
            blue,
            profileCalibration
          );
        }

        if (applyUserCalibration) {
          [red, green, blue] = applyCalibrationAdjustments(
            red,
            green,
            blue,
            userCalibration
          );
        }

        if (applyProfileRegional) {
          [red, green, blue] = applyRegionalColorAdjustments(
            red,
            green,
            blue,
            profileRegionalAdjustments
          );
        }

        if (applyUserRegional) {
          [red, green, blue] = applyRegionalColorAdjustments(
            red,
            green,
            blue,
            userRegionalAdjustments
          );
        }

        if (applyProfileColorGrade) {
          [red, green, blue] = applyColorGrading(
            red,
            green,
            blue,
            profileColorGrade,
            profileColorGradeStrength
          );
        }

        if (applyUserColorGrade) {
          [red, green, blue] = applyColorGrading(
            red,
            green,
            blue,
            userColorGrade,
            userColorGradeStrength
          );
        }

        if (totalDehaze !== 0) {
          [red, green, blue] = applyDehazeToRgb(red, green, blue, totalDehaze);
        }

        if (!isBlackAndWhite && (totalSat !== 1 || totalVib !== 0)) {
          const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
          let saturationMix = totalSat;

          if (totalVib !== 0) {
            const maxChannel = Math.max(red, green, blue);
            const minChannel = Math.min(red, green, blue);
            const currentSaturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;
            saturationMix += totalVib * (1 - currentSaturation);
          }

          red = gray + (red - gray) * saturationMix;
          green = gray + (green - gray) * saturationMix;
          blue = gray + (blue - gray) * saturationMix;
        }

        if (fadeAmount > 0) {
          const fadeLevel = fadeAmount * 60;
          red += fadeLevel - red * fadeAmount * 0.15;
          green += fadeLevel - green * fadeAmount * 0.15;
          blue += fadeLevel - blue * fadeAmount * 0.15;
        }

        const pIdx = index >> 2;
        if (depthLumaScratch && !onnxBufReady) {
          depthLumaScratch[pIdx] = rgbRec709LumaUnit(red, green, blue);
        }
        if (graphCombineActive) {
          const entryA = localMaskStack[graphIdxA];
          const entryB = localMaskStack[graphIdxB];
          const driverIdx = Math.max(
            0,
            Math.min(localMaskStack.length - 1, Number(adjustmentsForRender?.activeLocalMaskIndex ?? 0))
          );
          const maskEntry = localMaskStack[driverIdx];
          if (entryA && entryB && maskEntry) {
            const wA = computeLocalMaskWeightAtPixel(entryA, pIdx, red, green, blue);
            const wB = computeLocalMaskWeightAtPixel(entryB, pIdx, red, green, blue);
            const combined = combineLocalMaskGraphWeights(wA, wB, graphOpNorm);
            if (combined > 0.0001) {
              const blendScale =
                maskEntry.blend === 'add' ? 1.35 : maskEntry.blend === 'subtract' ? -1 : 1;
              const localGain = Math.pow(
                2,
                (maskEntry.exposure / 100) * combined * maskEntry.opacity * 0.75 * blendScale
              );
              [red, green, blue] = applyExposureGainWithShoulder(red, green, blue, localGain);
            }
          }
        } else if (localMaskStack.length > 0) {
          for (const maskEntry of localMaskStack) {
            const maskWeight = computeLocalMaskWeightAtPixel(maskEntry, pIdx, red, green, blue);
            if (maskWeight <= 0.0001) continue;
            const blendScale =
              maskEntry.blend === 'add' ? 1.35 : maskEntry.blend === 'subtract' ? -1 : 1;
            const localGain = Math.pow(
              2,
              (maskEntry.exposure / 100) * maskWeight * maskEntry.opacity * 0.75 * blendScale
            );
            [red, green, blue] = applyExposureGainWithShoulder(red, green, blue, localGain);
          }
        }

        if (
          brushMaskEnabled &&
          localMaskStack.length > 0 &&
          Array.isArray(adjustmentsForRender?.recipeLayersV0) &&
          adjustmentsForRender.recipeLayersV0.length > 0
        ) {
          for (const layer of adjustmentsForRender.recipeLayersV0) {
            if (layer?.enabled === false) continue;
            const mi = Math.max(
              0,
              Math.min(localMaskStack.length - 1, Math.round(Number(layer.maskIndex ?? 0)))
            );
            const maskEntry = localMaskStack[mi];
            if (!maskEntry) continue;
            const exp = Number(layer.exposure ?? 0);
            const layerOpacity = Math.max(0, Math.min(1, Number(layer.opacity ?? 100) / 100));
            if (Math.abs(exp) < 0.01 || layerOpacity <= 0.0001) continue;
            const w = computeLocalMaskWeightAtPixel(maskEntry, pIdx, red, green, blue);
            if (w <= 0.0001) continue;
            [red, green, blue] = applyRecipeLayerToneRgb(red, green, blue, w, layer);
          }
        }

        const finalRed = clamp(Math.round(red));
        const finalGreen = clamp(Math.round(green));
        const finalBlue = clamp(Math.round(blue));
        const finalLuma = 0.2126 * finalRed + 0.7152 * finalGreen + 0.0722 * finalBlue;
        const isHighlightClipped =
          finalRed >= clippingHighlightThreshold ||
          finalGreen >= clippingHighlightThreshold ||
          finalBlue >= clippingHighlightThreshold;
        const isShadowClipped =
          finalLuma <= clippingShadowLumaGate &&
          finalRed <= clippingShadowThreshold &&
          finalGreen <= clippingShadowThreshold &&
          finalBlue <= clippingShadowThreshold;

        if (isHighlightClipped) {
          highlightClipCount += 1;
        }

        if (isShadowClipped) {
          shadowClipCount += 1;
        }

        if (showClipping) {
          if (isHighlightClipped) {
            data[index] = 255;
            data[index + 1] = 0;
            data[index + 2] = 0;
          } else if (isShadowClipped) {
            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 255;
          } else {
            data[index] = finalRed;
            data[index + 1] = finalGreen;
            data[index + 2] = finalBlue;
          }
        } else {
          data[index] = finalRed;
          data[index + 1] = finalGreen;
          data[index + 2] = finalBlue;
        }
        data[index + 3] = 255;
      }

      if (depthLumaScratch || onnxBufReady) {
        for (const m of localMaskStack) {
          if (m.mode === 'depth') {
            m.depthProxyBuffer = null;
          }
        }
      }

      if (shouldAbortRender()) {
        return false;
      }

      if (isPreviewQuality) {
        applyOrderedPreviewDither(data, width, height, 0.9);
      }

      const retouchToolNorm = String(adjustmentsForRender?.retouchTool ?? 'none').toLowerCase();
      if (retouchToolNorm === 'heal') {
        const scopeRaw = String(adjustmentsForRender?.retouchScope ?? 'masked').toLowerCase();
        const scope = scopeRaw === 'global' ? 'global' : 'masked';
        const healStr = Number(adjustmentsForRender?.retouchHealStrength ?? 40);
        applyRetouchHealBoxBlurPass(data, width, height, healStr, (pIdx, r, g, b) =>
          computeRetouchMaskWeightAtPixel(maskSnap, pIdx, r, g, b, scope, adjustmentsForRender)
        );
      }

      let blackOutputGuardTriggered = false;
      if (sourceStatsForBlackGuard) {
        const outputStats = computeSampledRgbaStats(data, width, height);
        const sourceLooksBright =
          sourceStatsForBlackGuard.meanLuma >= 24 &&
          sourceStatsForBlackGuard.nonBlackRatio >= 0.22;
        const outputLooksBlack =
          outputStats &&
          outputStats.meanLuma <= 2.2 &&
          outputStats.nonBlackRatio <= 0.012;

        if (sourceLooksBright && outputLooksBlack) {
          data.set(originalSourceData);
          for (let alphaIndex = 3; alphaIndex < data.length; alphaIndex += 4) {
            data[alphaIndex] = 255;
          }
          blackOutputGuardTriggered = true;
          if (import.meta?.env?.DEV) {
            console.warn('[FilmLab] Black output guard restored RAW source frame.', {
              quality,
              sourceStats: sourceStatsForBlackGuard,
              outputStats,
              profileLutStatus,
              hasProfileLut,
            });
          }
        }
      }

      if (
        displayPreviewApproximations &&
        adjustmentsForRender?.cmykSoftProofEnabled
      ) {
        applyCmykSoftProofApproxToRgba(data);
      }

      latestFrameQualityRef.current = {
        quality,
        pixelCount,
        highlightClipRatio: highlightClipCount / pixelCount,
        shadowClipRatio: shadowClipCount / pixelCount,
        blackOutputGuardTriggered,
      };

      if (
        brushMaskEnabled &&
        localMaskStack.some((m) => m.mode === 'depth') &&
        String(toneAdj?.depthMapSource ?? 'luminance') === 'onnx'
      ) {
        depthOnnxIdleCancelRef.current?.();
        depthOnnxIdleCancelRef.current = null;
        clearTimeout(depthOnnxInferTimerRef.current);
        depthOnnxInferTimerRef.current = globalThis.setTimeout(() => {
          depthOnnxInferSeqRef.current += 1;
          const inferSeq = depthOnnxInferSeqRef.current;
          depthOnnxIdleCancelRef.current?.();
          depthOnnxIdleCancelRef.current = scheduleDepthOnnxInferOnIdle(() => {
            const snap = previewSourceRef.current;
            if (!snap?.data || snap.width < 2 || snap.height < 2) {
              return;
            }
            if (String(latestToneAdjForDepthOnnxRef.current?.depthMapSource ?? 'luminance') !== 'onnx') {
              return;
            }
            setDepthOnnxInferenceUi({ phase: 'running', reason: null, via: null });
            inferDepthProxyBufferFromImageData(snap).then((out) => {
              if (inferSeq !== depthOnnxInferSeqRef.current) {
                return;
              }
              const latest = previewSourceRef.current;
              if (!latest?.data || latest.width !== snap.width || latest.height !== snap.height) {
                return;
              }
              if (String(latestToneAdjForDepthOnnxRef.current?.depthMapSource ?? 'luminance') !== 'onnx') {
                setDepthOnnxInferenceUi({ phase: 'idle', reason: null, via: null });
                return;
              }
              if (out.ok && out.buffer instanceof Float32Array && out.buffer.length === latest.width * latest.height) {
                depthOnnxExternalRef.current = {
                  buffer: out.buffer,
                  digest: out.digest,
                  width: latest.width,
                  height: latest.height,
                };
                setDepthOnnxInferenceUi({
                  phase: 'ready',
                  reason: null,
                  via: out.via ?? 'onnx',
                });
                scheduleProgressiveRenderRef.current?.();
                return;
              }
              if (depthOnnxExternalRef.current.buffer || depthOnnxExternalRef.current.digest) {
                depthOnnxExternalRef.current = {
                  buffer: null,
                  digest: '',
                  width: 0,
                  height: 0,
                };
                scheduleProgressiveRenderRef.current?.();
              }
              const reason = out.ok === false ? out.reason : 'wrong_output_length';
              setDepthOnnxInferenceUi({
                phase: 'fallback',
                reason,
                via: null,
              });
            });
          }, { timeoutMs: getDepthOnnxIdleCallbackTimeoutMs() });
        }, 200);
      } else {
        depthOnnxIdleCancelRef.current?.();
        depthOnnxIdleCancelRef.current = null;
        clearTimeout(depthOnnxInferTimerRef.current);
        depthOnnxInferTimerRef.current = null;
      }

      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }
      context.putImageData(imageData, 0, 0);
      applyLevelAndCropTransform(context, canvas, fxCanvasRef, adjustmentsForRender);

      if (blackOutputGuardTriggered) {
        return true;
      }

      if (quality !== 'full') {
        if (!isInteractivePreview || PRESERVE_FULL_EFFECT_STACK_DURING_ADJUST) {
          if (profileTexture !== 0) {
            applyClarity(context, canvas, fxCanvasRef, profileTexture * 0.55, {
              blurScale: 0.006,
              minBlur: 2,
              strengthScale: 0.78,
              midtoneBias: 0.42,
            });
          }

          if (totalClarity !== 0) {
            applyClarity(context, canvas, fxCanvasRef, totalClarity * 0.62, {
              blurScale: 0.01,
              minBlur: 3,
              strengthScale: 1.02,
              midtoneBias: 0.74,
            });
          }

          if ((adjustmentsForRender?.halation ?? 0) > 0) {
            applyHalation(
              context,
              canvas,
              fxCanvasRef,
              ((adjustmentsForRender.halation ?? 0) / 100) * 0.72,
              Math.max(5, (adjustmentsForRender?.halRadius ?? 30) * 0.68),
              mapHalationThreshold(adjustmentsForRender?.halThresh ?? 200),
              adjustmentsForRender?.halHue ?? 0
            );
          }

          if ((adjustmentsForRender?.anamorph ?? 0) > 0) {
            applyAnamorph(
              context,
              canvas,
              fxCanvasRef,
              ((adjustmentsForRender.anamorph ?? 0) / 100) * 0.72,
              Math.max(10, (adjustmentsForRender?.streakLen ?? 50) * 0.74)
            );
          }

          const previewVignette =
            (Math.abs(
              ((shouldBypassProfileCpuColor ? 0 : film.vignette ?? 0) * strength * 0.12)
            ) + (adjustmentsForRender?.userVignette ?? 0)) /
            100;

          if (previewVignette > 0) {
            applyVignette(context, canvas, previewVignette);
          }

          if (adjustmentsForRender?.leak && adjustmentsForRender.leak !== 'none') {
            applyLightLeak(
              context,
              canvas,
              adjustmentsForRender.leak,
              effectSeedRef.current.leak,
              adjustmentsForRender?.leak === 'raw-leakedge'
                ? adjustmentsForRender?.rawLeakVariant ?? null
                : null
            );
          }

          if ((adjustmentsForRender?.chromAb ?? 0) > 0) {
            applyChromAb(context, canvas, Math.min(1, (adjustmentsForRender.chromAb ?? 0) / 100));
          }

          if ((adjustmentsForRender?.bloom ?? 0) > 0) {
            applyBloom(
              context,
              canvas,
              fxCanvasRef,
              Math.min(1, (adjustmentsForRender.bloom ?? 0) / 100)
            );
          }

          const previewGrainAmount = (adjustmentsForRender?.userGrain ?? 0) / 100;

          if (previewGrainAmount > 0) {
            const previewGrainSize = Math.max(0.1, (adjustmentsForRender?.userGrainSize ?? 10) / 100);
            const previewGrainFrequency = Math.max(
              10,
              Number(film?.defaultGrainFrequency ?? film?.grainFrequency ?? 50)
            );

            applyGrain(
              context,
              canvas,
              previewGrainAmount,
              previewGrainSize,
              previewGrainFrequency
            );
          }

          if ((adjustmentsForRender?.dust ?? 0) > 0) {
            applyDust(
              context,
              canvas,
              (adjustmentsForRender.dust ?? 0) / 100,
              effectSeedRef.current.dust,
              adjustmentsForRender?.dustVariant ?? null
            );
          }

          if (
            adjustmentsForRender?.frame &&
            adjustmentsForRender.frame !== 'none' &&
            adjustmentsForRender.frame !== 'raw-sprocket'
          ) {
            applyFrame(
              context,
              canvas,
              adjustmentsForRender.frame,
              effectSeedRef.current.frame,
              adjustmentsForRender.frame === 'filmstrip' ? adjustmentsForRender?.frameVariant ?? null : null
            );
          }
        }

        if (includeCompare && adjustmentsForRender?.compareMode) {
          applyCompare(context, canvas, { data: originalSourceData, width, height });
          applyLevelAndCropTransform(context, canvas, fxCanvasRef, adjustmentsForRender);
        }

        return true;
      }

      if (shouldAbortRender()) {
        return false;
      }

      if (profileTexture !== 0) {
        applyClarity(context, canvas, fxCanvasRef, profileTexture, {
          blurScale: 0.008,
          minBlur: 2,
          strengthScale: 1.05,
          midtoneBias: 0.45,
        });
      }

      if (totalClarity !== 0) {
        applyClarity(context, canvas, fxCanvasRef, totalClarity, {
          blurScale: 0.017,
          minBlur: 5,
          strengthScale: 1.35,
          midtoneBias: 0.85,
        });
      }

      const totalGrain = (adjustmentsForRender?.userGrain ?? 0) / 100;

      if (totalGrain > 0) {
        const totalGrainSize = Math.max(0.1, (adjustmentsForRender?.userGrainSize ?? 10) / 100);
        const totalGrainFrequency = Math.max(
          10,
          Number(film?.defaultGrainFrequency ?? film?.grainFrequency ?? 50)
        );

        applyGrain(context, canvas, totalGrain, totalGrainSize, totalGrainFrequency);
      }

      const totalVignette =
        (Math.abs(((shouldBypassProfileCpuColor ? 0 : film.vignette ?? 0) * strength * 0.12)) +
          (adjustmentsForRender?.userVignette ?? 0)) /
        100;

      if (totalVignette > 0) {
        applyVignette(context, canvas, totalVignette);
      }

      if (adjustmentsForRender?.leak && adjustmentsForRender.leak !== 'none') {
        applyLightLeak(
          context,
          canvas,
          adjustmentsForRender.leak,
          effectSeedRef.current.leak,
          adjustmentsForRender?.leak === 'raw-leakedge'
            ? adjustmentsForRender?.rawLeakVariant ?? null
            : null
        );
      }

      if ((adjustmentsForRender?.chromAb ?? 0) > 0) {
        applyChromAb(context, canvas, (adjustmentsForRender.chromAb ?? 0) / 100);
      }

      if ((adjustmentsForRender?.bloom ?? 0) > 0) {
        applyBloom(context, canvas, fxCanvasRef, (adjustmentsForRender.bloom ?? 0) / 100);
      }

      if ((adjustmentsForRender?.dust ?? 0) > 0) {
        applyDust(
          context,
          canvas,
          (adjustmentsForRender.dust ?? 0) / 100,
          effectSeedRef.current.dust,
          adjustmentsForRender?.dustVariant ?? null
        );
      }

      if ((adjustmentsForRender?.halation ?? 0) > 0) {
        applyHalation(
          context,
          canvas,
          fxCanvasRef,
          (adjustmentsForRender.halation ?? 0) / 100,
          adjustmentsForRender?.halRadius ?? 30,
          mapHalationThreshold(adjustmentsForRender?.halThresh ?? 200),
          adjustmentsForRender?.halHue ?? 0
        );
      }

      if ((adjustmentsForRender?.anamorph ?? 0) > 0) {
        applyAnamorph(
          context,
          canvas,
          fxCanvasRef,
          (adjustmentsForRender.anamorph ?? 0) / 100,
          adjustmentsForRender?.streakLen ?? 50
        );
      }

      if (
        adjustmentsForRender?.frame &&
        adjustmentsForRender.frame !== 'none' &&
        adjustmentsForRender.frame !== 'raw-sprocket'
      ) {
        applyFrame(
          context,
          canvas,
          adjustmentsForRender?.frame ?? null,
          effectSeedRef.current.frame,
          adjustmentsForRender?.frame === 'filmstrip' ? adjustmentsForRender?.frameVariant ?? null : null
        );
      }

      if (includeCompare && adjustmentsForRender?.compareMode) {
        applyCompare(context, canvas, { data: originalSourceData, width, height });
        applyLevelAndCropTransform(context, canvas, fxCanvasRef, adjustmentsForRender);
      }

      return true;
    },
    [
      activeFilm,
      adjustments,
      pipelineInfo?.pipelineKind,
      pipelineInfo?.capabilities?.colorPipeline?.linearStageEnabled,
      profileLut,
      profileLutStatus,
      rawLinearStageOverride,
    ]
  );

  const buildFullResolutionSource = useCallback(async () => {
    if (fullSourceRef.current) {
      return fullSourceRef.current;
    }

    if (fullSourcePromiseRef.current) {
      return fullSourcePromiseRef.current;
    }

    const buildPromise = ingestUploadSource({
      uploadedFile,
      uploadedImage,
      renderIntent: 'full',
      rawBackendPreference,
    })
      .then(({ asset }) => {
        if (!asset?.image) {
          return previewSourceRef.current;
        }

        const { image } = asset;
        const fullCanvas = ensureCanvas(fullCanvasRef, image.width, image.height);
        const fullContext = getCanvasContext(fullCanvas, { willReadFrequently: true });

        if (!fullContext) {
          asset.close?.();
          return previewSourceRef.current;
        }

        fullCanvas.width = image.width;
        fullCanvas.height = image.height;
        fullContext.clearRect(0, 0, image.width, image.height);
        fullContext.imageSmoothingEnabled = true;
        fullContext.imageSmoothingQuality = 'high';
        fullContext.drawImage(image, 0, 0, image.width, image.height);
        const fullSourceData = fullContext.getImageData(0, 0, image.width, image.height);
        const fullAlphaNormalization = normalizeTransparentImageDataInPlace(fullSourceData);
        if (fullAlphaNormalization.adjusted) {
          fullContext.putImageData(fullSourceData, 0, 0);
          if (import.meta?.env?.DEV) {
            console.warn('[FilmLab] Forced opaque full-resolution alpha to avoid transparent RAW full render.', {
              zeroAlphaRatio: fullAlphaNormalization.zeroAlphaRatio,
              nonZeroRgbAtZeroAlphaRatio: fullAlphaNormalization.nonZeroRgbAtZeroAlphaRatio,
            });
          }
        }
        fullSourceRef.current = fullSourceData;
        setImageMeta((current) => {
          if (!current) {
            return current;
          }
          const nextSourceWidth =
            Math.max(
              Number(current.sourceWidth) || 0,
              Number(current.width) || 0,
              Number(image.width) || 0
            ) || 0;
          const nextSourceHeight =
            Math.max(
              Number(current.sourceHeight) || 0,
              Number(current.height) || 0,
              Number(image.height) || 0
            ) || 0;
          if (
            Number(current.sourceWidth) === nextSourceWidth &&
            Number(current.sourceHeight) === nextSourceHeight
          ) {
            return current;
          }
          return {
            ...current,
            sourceWidth: nextSourceWidth,
            sourceHeight: nextSourceHeight,
          };
        });
        asset.close?.();

        return fullSourceRef.current;
      })
      .finally(() => {
        fullSourcePromiseRef.current = null;
      });

    fullSourcePromiseRef.current = buildPromise;
    return buildPromise;
  }, [pipelineInfo?.pipelineKind, rawBackendPreference, uploadedFile, uploadedImage]);

  const cancelScheduledPreviewWork = useCallback((options = {}) => {
    const keepAnimationFrame = Boolean(options.keepAnimationFrame);

    if (!keepAnimationFrame) {
      renderTokenRef.current += 1;
    }

    if (!keepAnimationFrame && animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (previewHydrationFrameRef.current) {
      cancelAnimationFrame(previewHydrationFrameRef.current);
      previewHydrationFrameRef.current = null;
    }

    if (proxyWorkerRafRef.current) {
      cancelAnimationFrame(proxyWorkerRafRef.current);
      proxyWorkerRafRef.current = null;
    }
    proxyWorkerQueuedPayloadRef.current = null;

    cancelIdleCallbackSafe(deferredRenderRef.current);
    deferredRenderRef.current = null;
  }, []);

  const ensurePreviewSourceData = useCallback(() => {
    if (previewSourceRef.current) {
      return previewSourceRef.current;
    }

    const sourceCanvas = sourceCanvasRef.current;

    if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
      return null;
    }

    const sourceContext = getCanvasContext(sourceCanvas, {
      willReadFrequently: true,
    });

    if (!sourceContext) {
      return null;
    }

    previewSourceRef.current = sourceContext.getImageData(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height
    );

    return previewSourceRef.current;
  }, []);

  const renderFastPreview = useCallback(
    ({ showProcessing = false, coalesce = true } = {}) => {
      const visibleCanvas = canvasRef.current;
      const sourceCanvas = sourceCanvasRef.current;

      if (!visibleCanvas || !sourceCanvas) {
        return false;
      }

      const visibleContext = getCanvasContext(visibleCanvas, {
        willReadFrequently: true,
      });

      if (!visibleContext) {
        return false;
      }

      if (!fastPreviewRendererRef.current) {
        const created = createFastPreviewRenderer();
        fastPreviewRendererRef.current = created;
        if (created?.contextApi) {
          setRenderDebugInfo((current) => ({
            ...current,
            fastPreviewGlContext: created.contextApi,
            fastPreviewFloatPipeline: created.floatPipeline ?? 'off',
            fastPreviewLutAtlasTexFormat: created.lutAtlasTexFormat ?? 'rgba8',
            fastPreviewGradingPrecision: created.gradingFragmentPrecision ?? 'mediump',
          }));
        }
      }

      const renderer = fastPreviewRendererRef.current;

      if (coalesce && (animationFrameRef.current || fastRenderInFlightRef.current)) {
        previewRerunRequestedRef.current = true;
        return Boolean(renderer);
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (showProcessing) {
        setIsProcessing(true);
      }

      const renderToken = ++renderTokenRef.current;

      let fastPreviewAdjustments = null;
      try {
        fastPreviewAdjustments = buildFastPreviewAdjustments(
          activeFilm,
          adjustments,
          profileLutStatus
        );
      } catch (error) {
        console.error('[FilmLab] fast preview adjustments failed, fallback to CPU preview', error);
        setIsProcessing(false);
        return false;
      }
      fastPreviewAdjustments.fastSeed = sourceVersionRef.current * 37.7;
      fastPreviewAdjustments.fastPivot = adaptivePivotRef.current;

      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = null;

        if (renderTokenRef.current !== renderToken) {
          return;
        }

        const hostSchedRafMs = isEnvE2eHostSchedRaf()
          ? takePreviewE2eHostSchedToRafMs(previewE2eHostSchedRafT0Ref)
          : null;

        const fastRenderStart = nowMs();
        fastRenderInFlightRef.current = true;
        let processedCanvas = null;
        let usedMainThreadWebGpuAb = false;
        let usedMainThreadWebGpuAbSourceTexFormat = null;
        const runFastPath = async () => {
          const abArmed =
            ENABLE_MAIN_PREVIEW_WEBGPU_AB &&
            String(renderDebugInfo?.mainThreadWebGpuPreviewAbDecision ?? '').startsWith('armed_probe_ok');
          if (abArmed) {
            const sourceContext = getCanvasContext(sourceCanvas, { willReadFrequently: true });
            const sourceImage = sourceContext?.getImageData?.(0, 0, sourceCanvas.width, sourceCanvas.height) ?? null;
            if (sourceImage?.data?.length) {
              try {
                const dev = await getOrCreatePersistentWebGpuDevice({ label: 'ml-film-lab-main-preview' });
                const plSize =
                  profileLut && Number(profileLut.size) > 1 ? Math.floor(Number(profileLut.size)) : 0;
                const plData = profileLut?.srgbData ?? profileLut?.data ?? null;
                const lookN = normalizeFastLookLutForWorker(fastPreviewAdjustments?.fastLookLut);
                const uFull = buildProxyWebGpuUBlockFloat32({
                  film: activeFilm || {},
                  adjustments: {
                    ...buildWorkerAdjustmentsPayload(adjustments, profileLutStatus),
                    pivot: adjustments?.pivot ?? 0.18,
                  },
                  profileLutSize: plSize,
                  profileLutData: plData,
                  lookLut: lookN,
                  targetWidth: sourceCanvas.width,
                  targetHeight: sourceCanvas.height,
                  outputTile: null,
                });
                const tr = await renderMainThreadWebGpuHostSourceRgba8ToCanvas(
                  dev,
                  sourceCanvas.width,
                  sourceCanvas.height,
                  sourceImage.data,
                  {
                    uBlock: uFull,
                    profileLutSize: plSize,
                    profileLutData: plData,
                    lookLut: lookN,
                  }
                );
                if (tr != null && typeof tr === 'object' && tr.pass === true && tr.canvas) {
                  processedCanvas = tr.canvas;
                  usedMainThreadWebGpuAb = true;
                  usedMainThreadWebGpuAbSourceTexFormat =
                    tr.sourceTexFormat != null ? String(tr.sourceTexFormat) : 'rgba8unorm';
                } else {
                  setRenderDebugInfo((current) => ({
                    ...current,
                    mainThreadWebGpuPreviewAbDecision: 'armed_runtime_fallback',
                  }));
                }
              } catch {
                setRenderDebugInfo((current) => ({
                  ...current,
                  mainThreadWebGpuPreviewAbDecision: 'armed_runtime_error',
                }));
              }
            }
          }

          if (!processedCanvas) {
            processedCanvas = renderer
              ? renderer.render({
                  source: sourceCanvas,
                  sourceKey: sourceVersionRef.current,
                  lut: profileLut,
                  lutFile: activeFilm?.previewLutFile ?? null,
                  width: sourceCanvas.width,
                  height: sourceCanvas.height,
                  adjustments: fastPreviewAdjustments,
                })
              : null;
          }
        };
        runFastPath()
          .catch((error) => {
            console.error('[FilmLab] fast renderer failed, fallback to CPU preview', error);
            processedCanvas = null;
          })
          .finally(() => {
            fastRenderInFlightRef.current = false;

            if (!processedCanvas) {
              setIsProcessing(false);
              return;
            }

            const presentation = getPresentationDimensions(
              sourceCanvas.width,
              sourceCanvas.height,
              adjustments?.rotation ?? 0
            );

            if (visibleCanvas.width !== presentation.width) {
              visibleCanvas.width = presentation.width;
            }
            if (visibleCanvas.height !== presentation.height) {
              visibleCanvas.height = presentation.height;
            }
            visibleContext.clearRect(0, 0, presentation.width, presentation.height);

            drawPresentedImage(
              visibleContext,
              processedCanvas,
              sourceCanvas.width,
              sourceCanvas.height,
              adjustments?.rotation ?? 0,
              adjustments?.flipped
            );

            if (adjustments?.compareMode) {
              visibleContext.clearRect(0, 0, presentation.width, presentation.height);
              drawPresentedImage(
                visibleContext,
                sourceCanvas,
                sourceCanvas.width,
                sourceCanvas.height,
                adjustments?.rotation ?? 0,
                adjustments?.flipped
              );
            } else if (adjustments?.cmykSoftProofEnabled) {
              try {
                const cmykId = visibleContext.getImageData(
                  0,
                  0,
                  presentation.width,
                  presentation.height
                );
                applyCmykSoftProofApproxToRgba(cmykId.data);
                visibleContext.putImageData(cmykId, 0, 0);
              } catch {
                /* ignore readback failures */
              }
            }

        if ((adjustments?.dust ?? 0) > 0) {
          applyDust(
            visibleContext,
            visibleCanvas,
            (adjustments.dust ?? 0) / 100,
            effectSeedRef.current.dust,
            adjustments?.dustVariant ?? null
          );
        }

        if (adjustments?.leak && adjustments.leak !== 'none') {
          applyLightLeak(
            visibleContext,
            visibleCanvas,
            adjustments.leak,
            effectSeedRef.current.leak,
            adjustments?.leak === 'raw-leakedge' ? adjustments?.rawLeakVariant ?? null : null
          );
        }

        if (
          adjustments?.frame &&
          adjustments.frame !== 'none' &&
          adjustments.frame !== 'raw-sprocket'
        ) {
          applyFrame(
            visibleContext,
            visibleCanvas,
            adjustments.frame,
            effectSeedRef.current.frame,
            adjustments.frame === 'filmstrip' ? adjustments?.frameVariant ?? null : null
          );
        }

        applyLevelAndCropTransform(visibleContext, visibleCanvas, fxCanvasRef, adjustments);

        if (renderTokenRef.current !== renderToken) {
          return;
        }

        setIsProcessing(false);
        const fastRenderElapsedMs = roundTimingMs(nowMs() - fastRenderStart);
        const fastPointerE2eMs = takePreviewE2ePointerToPresentMs(
          isAdjustingSnapshotRef,
          isPanningSnapshotRef
        );
        const fastE2ePath = usedMainThreadWebGpuAb ? 'fast-main-webgpu-ab' : 'fast-webgl';
        const fastE2eMs = computePreviewE2eIntentToPresentMs(previewE2eIntentT0Ref);
        const fastE2eMedian = computeE2ePathMedianSnapshot(
          previewE2eSamplesByPathRef,
          fastE2ePath,
          fastE2eMs,
        );
        const fastFrameCostSnap = computeE2eFrameCostMedianSnapshot(
          previewE2eFrameCostSamplesByPathRef,
          fastE2ePath,
          fastRenderElapsedMs,
        );
            setRenderDebugInfo((current) => {
              const total = ENABLE_MAIN_PREVIEW_WEBGPU_AB
                ? Number(current?.mainThreadWebGpuPreviewAbFramesTotal ?? 0) + 1
                : Number(current?.mainThreadWebGpuPreviewAbFramesTotal ?? 0);
              const webgpuMain =
                ENABLE_MAIN_PREVIEW_WEBGPU_AB && usedMainThreadWebGpuAb
                  ? Number(current?.mainThreadWebGpuPreviewAbFramesWebGpuMain ?? 0) + 1
                  : Number(current?.mainThreadWebGpuPreviewAbFramesWebGpuMain ?? 0);
              const webglFallback =
                ENABLE_MAIN_PREVIEW_WEBGPU_AB && !usedMainThreadWebGpuAb
                  ? Number(current?.mainThreadWebGpuPreviewAbFramesWebGlFallback ?? 0) + 1
                  : Number(current?.mainThreadWebGpuPreviewAbFramesWebGlFallback ?? 0);
              const ratio = total > 0 ? Number((webgpuMain / total).toFixed(4)) : null;
              const rolloutHealth = computeMainPreviewAbRolloutHealth(total, webglFallback);
              return withPreviewE2eFrameCostGate({
                ...current,
                lastRenderPath: fastE2ePath,
                fastRenderMs: fastRenderElapsedMs,
                mainThreadWebGpuPreviewAbPath: ENABLE_MAIN_PREVIEW_WEBGPU_AB
                  ? usedMainThreadWebGpuAb
                    ? 'webgpu-main'
                    : 'webgl-fallback'
                  : 'none',
                mainThreadWebGpuPreviewAbRenderMs: ENABLE_MAIN_PREVIEW_WEBGPU_AB
                  ? fastRenderElapsedMs
                  : null,
                mainThreadWebGpuPreviewAbSourceTexFormat: ENABLE_MAIN_PREVIEW_WEBGPU_AB
                  ? usedMainThreadWebGpuAb
                    ? usedMainThreadWebGpuAbSourceTexFormat ?? 'rgba8unorm'
                    : null
                  : null,
                mainThreadWebGpuPreviewAbFramesTotal: total,
                mainThreadWebGpuPreviewAbFramesWebGpuMain: webgpuMain,
                mainThreadWebGpuPreviewAbFramesWebGlFallback: webglFallback,
                mainThreadWebGpuPreviewAbWebGpuRatio: ratio,
                mainThreadWebGpuPreviewAbHealthState: rolloutHealth.state,
                mainThreadWebGpuPreviewAbFallbackRate: rolloutHealth.fallbackRate,
                mainThreadWebGpuPreviewAbHealthFrames: rolloutHealth.totalFrames,
                previewE2eIntentToPresentMs: fastE2eMs,
                previewE2ePath: fastE2ePath,
                previewE2eMedianMs: fastE2eMedian.medianMs,
                previewE2eKpiTargetMs: PREVIEW_E2E_KPI_TARGET_MS,
                previewE2eKpiState: fastE2eMedian.kpiState,
                previewE2ePerPathStats: fastE2eMedian.pathStats,
                previewE2eDragToPresentMs: computePreviewE2eDragToPresentMs(
                  previewE2eDragT0Ref,
                  isAdjustingSnapshotRef.current
                ),
                previewE2ePointerToPresentMs: fastPointerE2eMs,
                previewE2eHostSchedToRafMs: hostSchedRafMs,
                previewE2eFrameCostMs: fastRenderElapsedMs,
                previewE2eFrameCostMedianMs: fastFrameCostSnap.medianMs,
                previewE2eFrameCostKpiTargetMs: PREVIEW_E2E_FRAME_COST_TARGET_MS,
                previewE2eFrameCostKpiState: fastFrameCostSnap.kpiState,
                previewE2eFrameCostPerPathStats: fastFrameCostSnap.pathStats,
              });
            });
            setRenderVersion((value) => value + 1);

        if (previewRerunRequestedRef.current && adjustments?.isAdjusting) {
          previewRerunRequestedRef.current = false;
          const rerun = scheduleProgressiveRenderRef.current;
          if (typeof rerun === 'function') {
            requestAnimationFrame(() => {
              rerun();
            });
          }
        }
          });
      });

      return Boolean(renderer);
    },
    [
      activeFilm,
      activeFilm?.previewLutFile,
      adjustments,
      profileLut,
      profileLutStatus,
      renderDebugInfo?.mainThreadWebGpuPreviewAbDecision,
    ]
  );

  const renderPreview = useCallback(
    ({ quality = 'full', showProcessing = false, coalesce = false } = {}) => {
    if (!canvasRef.current) {
      return;
    }

    const previewSource = ensurePreviewSourceData();

    if (!previewSource) {
      return;
    }

    let renderSource = previewSource;
    if (preferFullResPreviewRef.current) {
      if (fullSourceRef.current) {
        renderSource = fullSourceRef.current;
      } else if (!fullSourcePromiseRef.current) {
        buildFullResolutionSource()
          .then((fullSource) => {
            if (!preferFullResPreviewRef.current || !fullSource) {
              return;
            }
            const rerun = scheduleProgressiveRenderRef.current;
            if (typeof rerun === 'function') {
              rerun({ quality: 'full', showProcessing: false, coalesce: false });
            }
          })
          .catch((error) => {
            if (import.meta?.env?.DEV) {
              console.warn('[FilmLab] Full-resolution preview hydration failed, using preview source.', error);
            }
          });
      }
    }

    const canvas = canvasRef.current;
    const context = getCanvasContext(canvas, { willReadFrequently: true });

    if (!context) {
      return;
    }

    if (coalesce && (animationFrameRef.current || cpuRenderInFlightRef.current)) {
      if (adjustments?.isAdjusting && cpuRenderInFlightRef.current) {
        // Abort stale in-flight CPU frame quickly and prioritize latest drag value.
        renderTokenRef.current += 1;
      }
      previewRerunRequestedRef.current = true;
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (showProcessing) {
      setIsProcessing(true);
    }

    const renderToken = ++renderTokenRef.current;

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;

      if (renderTokenRef.current !== renderToken) {
        return;
      }

      const hostSchedRafMs = isEnvE2eHostSchedRaf()
        ? takePreviewE2eHostSchedToRafMs(previewE2eHostSchedRafT0Ref)
        : null;

      const cpuRenderStart = nowMs();
      let didRender = false;
      cpuRenderInFlightRef.current = true;
      try {
        const allowTokenAbort = true;
        didRender = renderToContext({
          canvas,
          context,
          source: renderSource,
          includeCompare: true,
          quality,
          renderToken: allowTokenAbort ? renderToken : null,
          showClipping: Boolean(adjustments?.showClipping),
          displayPreviewApproximations: true,
        });
      } finally {
        cpuRenderInFlightRef.current = false;
      }

      // Whether the render completed or was aborted, check for pending reruns.
      // This ensures drag frames are never lost when coalesce aborts an in-flight render.
      if (previewRerunRequestedRef.current && adjustments?.isAdjusting) {
        previewRerunRequestedRef.current = false;
        const rerun = scheduleProgressiveRenderRef.current;

        if (typeof rerun === 'function') {
          requestAnimationFrame(() => {
            rerun();
          });
        }
      }

      if (!didRender || renderTokenRef.current !== renderToken) {
        return;
      }

      setIsProcessing(false);
      const cpuRenderElapsedMs = roundTimingMs(nowMs() - cpuRenderStart);
      const frameQualityStats = latestFrameQualityRef.current ?? null;
      const cpuE2ePath = quality === 'full' ? 'cpu-full' : 'cpu-preview';
      const cpuPointerE2eMs = takePreviewE2ePointerToPresentMs(
        isAdjustingSnapshotRef,
        isPanningSnapshotRef
      );
      const cpuE2eMs = computePreviewE2eIntentToPresentMs(previewE2eIntentT0Ref);
      const cpuE2eMedian = computeE2ePathMedianSnapshot(
        previewE2eSamplesByPathRef,
        cpuE2ePath,
        cpuE2eMs,
      );
      const cpuFrameCostSnap = computeE2eFrameCostMedianSnapshot(
        previewE2eFrameCostSamplesByPathRef,
        cpuE2ePath,
        cpuRenderElapsedMs,
      );
      setRenderDebugInfo((current) =>
        withPreviewE2eFrameCostGate({
          ...current,
          lastRenderPath: cpuE2ePath,
          lastFrameHighlightClipRatio: Number.isFinite(frameQualityStats?.highlightClipRatio)
            ? frameQualityStats.highlightClipRatio
            : null,
          lastFrameShadowClipRatio: Number.isFinite(frameQualityStats?.shadowClipRatio)
            ? frameQualityStats.shadowClipRatio
            : null,
          lastFramePixelCount: Number.isFinite(frameQualityStats?.pixelCount)
            ? frameQualityStats.pixelCount
            : null,
          lastFrameBlackGuardTriggered: Boolean(frameQualityStats?.blackOutputGuardTriggered),
          previewE2eIntentToPresentMs: cpuE2eMs,
          previewE2ePath: cpuE2ePath,
          previewE2eMedianMs: cpuE2eMedian.medianMs,
          previewE2eKpiTargetMs: PREVIEW_E2E_KPI_TARGET_MS,
          previewE2eKpiState: cpuE2eMedian.kpiState,
          previewE2ePerPathStats: cpuE2eMedian.pathStats,
          previewE2eDragToPresentMs: computePreviewE2eDragToPresentMs(
            previewE2eDragT0Ref,
            isAdjustingSnapshotRef.current
          ),
          previewE2ePointerToPresentMs: cpuPointerE2eMs,
          previewE2eHostSchedToRafMs: hostSchedRafMs,
          previewE2eFrameCostMs: cpuRenderElapsedMs,
          previewE2eFrameCostMedianMs: cpuFrameCostSnap.medianMs,
          previewE2eFrameCostKpiTargetMs: PREVIEW_E2E_FRAME_COST_TARGET_MS,
          previewE2eFrameCostKpiState: cpuFrameCostSnap.kpiState,
          previewE2eFrameCostPerPathStats: cpuFrameCostSnap.pathStats,
          ...(quality === 'full'
            ? { cpuFullMs: cpuRenderElapsedMs }
            : { cpuPreviewMs: cpuRenderElapsedMs }),
        })
      );
      setRenderVersion((value) => value + 1);
    });
    },
    [
      adjustments?.isAdjusting,
      buildFullResolutionSource,
      ensurePreviewSourceData,
      renderToContext,
    ]
  );

  const renderProxyWithWorker = useCallback(() => {
    if (proxyWorkerFailedRef.current) {
      return false;
    }

    const worker = proxyWorkerRef.current;
    if (!worker || !proxyWorkerSourceReadyRef.current || !proxySourceIdRef.current) {
      return false;
    }

    const requestId = (proxyRequestIdRef.current || 0) + 1;
    proxyRequestIdRef.current = requestId;
    const sourceCanvas = sourceCanvasRef.current;
    const baseProxyMax = getWorkerProxyMaxDimension(
      sourceCanvas?.width || 0,
      sourceCanvas?.height || 0
    );
    const rawProxyMax = adjustments?.isAdjusting
      ? getInteractiveWorkerProxyMaxDimension(
          baseProxyMax,
          adjustments?.interactionKind
        )
      : baseProxyMax;

    const sourceW = sourceCanvas?.width || 0;
    const sourceH = sourceCanvas?.height || 0;
    const { proxyMax, width: nominalW, height: nominalH } = getNominalProxyRenderSize(
      sourceW,
      sourceH,
      rawProxyMax,
      { matchPreviewBuffer: PROXY_MATCH_PREVIEW_BUFFER }
    );
    if (sourceW > 0 && sourceH > 0) {
      setRenderDebugInfo((current) => ({
        ...current,
        proxyWorkerNominalW: nominalW,
        proxyWorkerNominalH: nominalH,
        proxyWorkerProxyMaxEffective: proxyMax,
        proxyInputBufferW: sourceW,
        proxyInputBufferH: sourceH,
      }));
    }

    proxyRenderMetaRef.current = {
      rotation: Number(adjustments?.rotation ?? 0) || 0,
      flipped: Boolean(adjustments?.flipped),
      level: Number(adjustments?.level ?? 0) || 0,
      cropBypass: Boolean(adjustments?.cropBypass),
      cropZoom: Number(adjustments?.cropZoom ?? 100) || 100,
      cropX: Number(adjustments?.cropX ?? 0) || 0,
      cropY: Number(adjustments?.cropY ?? 0) || 0,
      cropRectX: Number(adjustments?.cropRectX),
      cropRectY: Number(adjustments?.cropRectY),
      cropRectW: Number(adjustments?.cropRectW),
      cropRectH: Number(adjustments?.cropRectH),
    };
    
    // Compute fast adjustments within this scope to get the Look-LUT
    const fastPreviewAdjustments = buildFastPreviewAdjustments(
      activeFilm,
      adjustments,
      profileLutStatus
    );

    const workerFastLookLut = normalizeFastLookLutForWorker(fastPreviewAdjustments?.fastLookLut);
    if (!workerFastLookLut && fastPreviewAdjustments?.fastLookLut && import.meta?.env?.DEV) {
      console.warn('[FilmLab] Ignoring invalid fastLookLut payload for worker render request.');
    }

    proxyWorkerQueuedPayloadRef.current = {
      type: 'renderProxy',
      requestId,
      sourceId: proxySourceIdRef.current,
      proxyMax,
      film: buildWorkerFilmPayload(activeFilm),
      adjustments: {
        ...buildWorkerAdjustmentsPayload(adjustments, profileLutStatus),
        fastLookLut: workerFastLookLut,
        pivot: adaptivePivotRef.current,
      },
    };

    if (proxyWorkerRafRef.current) {
      return true;
    }

    proxyWorkerRafRef.current = requestAnimationFrame(() => {
      proxyWorkerRafRef.current = null;
      const queuedPayload = proxyWorkerQueuedPayloadRef.current;
      proxyWorkerQueuedPayloadRef.current = null;

      if (!queuedPayload || proxyWorkerFailedRef.current) {
        return;
      }

      const activeWorker = proxyWorkerRef.current;
      if (!activeWorker || !proxyWorkerSourceReadyRef.current) {
        return;
      }

      if (Number(queuedPayload.sourceId) !== proxySourceIdRef.current) {
        return;
      }

      if (isEnvE2eHostSchedRaf()) {
        const hostMs = takePreviewE2eHostSchedToRafMs(previewE2eHostSchedRafT0Ref);
        if (hostMs != null) {
          const rid = Number(queuedPayload.requestId) || 0;
          const hostMap = proxyE2eHostSchedRafByRequestIdRef.current;
          hostMap.set(rid, hostMs);
          if (hostMap.size > 32) {
            const first = hostMap.keys().next().value;
            if (first != null) {
              hostMap.delete(first);
            }
          }
        }
      }

      try {
        const requestStartTimes = proxyRequestStartTimesRef.current;
        requestStartTimes.set(Number(queuedPayload.requestId), nowMs());
        if (requestStartTimes.size > 24) {
          const staleIds = Array.from(requestStartTimes.keys())
            .sort((left, right) => left - right)
            .slice(0, requestStartTimes.size - 24);
          staleIds.forEach((staleId) => {
            requestStartTimes.delete(staleId);
          });
        }
        activeWorker.postMessage(queuedPayload);
      } catch (error) {
        console.error('[FilmLab] Failed to send proxy render request', error);
        reportRenderPipelineError(
          'WORKER_REQUEST_FAILED',
          error instanceof Error
            ? error.message
            : 'Nie udało się wysłać żądania renderu do workera.',
          { stage: 'worker-request', requestId: queuedPayload?.requestId ?? null }
        );
        proxyWorkerFailedRef.current = true;
      }
    });

    return true;
  }, [activeFilm, adjustments, profileLutStatus, reportRenderPipelineError]);

  const scheduleProgressiveRender = useCallback(() => {
    if (!sourceCanvasRef.current) {
      return;
    }
    const schedT0 = nowMs();
    previewE2eIntentT0Ref.current = schedT0;
    if (isEnvE2eHostSchedRaf()) {
      previewE2eHostSchedRafT0Ref.current = schedT0;
    }

    if (preferFullResPreviewRef.current) {
      cancelScheduledPreviewWork();
      renderPreview({
        quality: 'full',
        showProcessing: false,
        coalesce: Boolean(adjustments?.isAdjusting),
      });
      return;
    }

    const isRawPipeline = pipelineInfo?.pipelineKind === PIPELINE_KIND.RAW;

    if (adjustments?.isAdjusting) {
      // Primary drag path: deterministic fast preview pipeline (WebGL).
      cancelScheduledPreviewWork({ keepAnimationFrame: true });
      const hasActiveProfile =
        !activeFilm?.isInputProfile && (adjustments?.strength ?? 100) > 0.01;
      const profileReadyForFastDrag =
        !hasActiveProfile ||
        !activeFilm?.previewLutFile ||
        profileLutStatus === 'ready';

      // If profile LUT isn't ready yet, keep deterministic CPU preview until hydration completes.
      if (hasActiveProfile && !profileReadyForFastDrag) {
        renderPreview({ quality: 'preview', showProcessing: false, coalesce: true });
        return;
      }

      if (
        !isRawPipeline &&
        profileReadyForFastDrag &&
        canUseFastPreviewPath(activeFilm, adjustments, profileLut, profileLutStatus, {
          allowApproximateDuringAdjust: true,
        }) &&
        renderFastPreview({ showProcessing: false, coalesce: true })
      ) {
        return;
      }

      // Fallback
      if (
        !hasActiveProfile &&
        ENABLE_WORKER_DRAG_PREVIEW &&
        !isRawPipeline &&
        !(PRESERVE_FULL_EFFECT_STACK_DURING_ADJUST && hasDeferredPreviewEffects(activeFilm, adjustments)) &&
        !adjustments?.compareMode &&
        renderProxyWithWorker()
      ) {
        return;
      }

      renderPreview({ quality: 'preview', showProcessing: false, coalesce: true });
      return;
    }

    cancelScheduledPreviewWork();

    const scheduleFullRender = () => {
      deferredRenderRef.current = null;

      if (adjustments?.isAdjusting) {
        return;
      }

      renderPreview({ quality: 'full', showProcessing: false });
    };

    const runCpuPreview = () => {
      deferredRenderRef.current = null;
      renderPreview({ quality: 'preview', showProcessing: false });

      if (adjustments?.isAdjusting || !hasDeferredPreviewEffects(activeFilm, adjustments)) {
        return;
      }

      deferredRenderRef.current = requestIdleCallbackSafe(scheduleFullRender, 24);
    };

    runCpuPreview();
  }, [
    activeFilm,
    adjustments,
    cancelScheduledPreviewWork,
    profileLut,
    profileLutStatus,
    renderFastPreview,
    pipelineInfo?.pipelineKind,
    renderPreview,
    renderProxyWithWorker,
  ]);

  useEffect(() => {
    scheduleProgressiveRenderRef.current = scheduleProgressiveRender;
  }, [scheduleProgressiveRender]);

  useEffect(() => {
    cancelIdleCallbackSafe(fullResPrewarmIdleRef.current);
    fullResPrewarmIdleRef.current = null;

    if ((!uploadedImage && !uploadedFile) || !sourceCanvasRef.current) {
      return undefined;
    }

    if (
      preferFullResPreviewRef.current ||
      fullSourceRef.current ||
      fullSourcePromiseRef.current ||
      adjustments?.isAdjusting
    ) {
      return undefined;
    }

    fullResPrewarmIdleRef.current = requestIdleCallbackSafe(() => {
      fullResPrewarmIdleRef.current = null;

      if (
        preferFullResPreviewRef.current ||
        fullSourceRef.current ||
        fullSourcePromiseRef.current ||
        adjustments?.isAdjusting
      ) {
        return;
      }

      buildFullResolutionSource()
        .then((fullSource) => {
          setRenderDebugInfo((current) => ({
            ...current,
            fullResReady: current.fullResRequested ? Boolean(fullSource) : current.fullResReady,
          }));
        })
        .catch((error) => {
          if (import.meta?.env?.DEV) {
            console.warn('[FilmLab] Full-resolution prewarm failed.', error);
          }
        });
    }, 180);

    return () => {
      cancelIdleCallbackSafe(fullResPrewarmIdleRef.current);
      fullResPrewarmIdleRef.current = null;
    };
  }, [
    adjustments?.isAdjusting,
    buildFullResolutionSource,
    renderVersion,
    uploadedFile,
    uploadedImage,
  ]);

  useEffect(() => {
    if ((!uploadedImage && !uploadedFile) || !canvasRef.current) {
      setRenderPipelineAlert(null);
      cancelScheduledPreviewWork();
      cancelIdleCallbackSafe(fullResPrewarmIdleRef.current);
      fullResPrewarmIdleRef.current = null;
      previewSourceRef.current = null;
      depthOnnxIdleCancelRef.current?.();
      depthOnnxIdleCancelRef.current = null;
      clearTimeout(depthOnnxInferTimerRef.current);
      depthOnnxInferTimerRef.current = null;
      setDepthOnnxInferenceUi({ phase: 'idle', reason: null, via: null });
      depthOnnxExternalRef.current = {
        buffer: null,
        digest: '',
        width: 0,
        height: 0,
      };
      sourceCanvasRef.current = null;
      proxyWorkerSourceReadyRef.current = false;
      proxySourceIdRef.current = 0;
      proxyRequestIdRef.current = 0;
      proxyLastPresentedRequestIdRef.current = 0;
      proxyRequestStartTimesRef.current.clear();
      setRenderDebugInfo((current) => ({
        ...current,
        proxySourceReady: false,
        proxyLastFrameBackend: 'n/a',
        proxyLastFrameGpuImpl: 'n/a',
        proxyWebGpuDeviceLost: false,
        proxyWebGpuDeviceLostAt: null,
        proxyWebGpuDeviceLostMessage: null,
        proxyWebGpuReinitFailedAt: null,
        proxyWebGpuReinitFailedMessage: null,
        proxyWorkerWebGpuCanvasFormat: null,
        proxyWorkerWebGpuDeviceLimits: null,
        proxyWorkerWebGpuSourceTexFormat: null,
        proxyWorkerWebGpuLut3dTexFormat: null,
        proxyWorkerWebGpuReadbackRgba8: null,
        proxyWorkerWebGpuReadbackChroma: null,
        lastRenderPath: 'idle',
        fastRenderMs: null,
        cpuPreviewMs: null,
        cpuFullMs: null,
        workerRenderMs: null,
        proxyWorkerGpuRenderMs: null,
        proxyWorkerCpuRenderMs: null,
        proxyWorkerWebGlMaxTex2d: null,
        proxyWorkerWebGlMaxTex3d: null,
        proxyWorkerWebGlRgba16f: null,
        proxyWorkerWebGlFbo16fBlit: null,
        proxyWorkerWebGl3dLutRgba16f: null,
        proxyWorkerGpuTexW: null,
        proxyWorkerGpuTexH: null,
        proxyWorkerFullSourceW: null,
        proxyWorkerFullSourceH: null,
        proxyWorkerGpuInputDownscaleMs: null,
        proxyWorkerProxyOutputFitted: false,
        proxyWorkerProxyOutputRequestedW: null,
        proxyWorkerProxyOutputRequestedH: null,
        proxyWorkerProxyOutputTargetW: null,
        proxyWorkerProxyOutputTargetH: null,
        proxyWorkerOutputTileCountNominal: null,
        proxyWorkerOutputTileCountTarget: null,
        proxyWorkerCpuFullNominalParity: false,
        proxyWorkerNominalW: null,
        proxyWorkerNominalH: null,
        proxyWorkerProxyMaxEffective: null,
        proxyInputBufferW: null,
        proxyInputBufferH: null,
        lastFrameHighlightClipRatio: null,
        lastFrameShadowClipRatio: null,
        lastFramePixelCount: null,
        lastFrameBlackGuardTriggered: false,
        previewE2eIntentToPresentMs: null,
        previewE2ePath: null,
        previewE2eMedianMs: null,
        previewE2eKpiTargetMs: PREVIEW_E2E_KPI_TARGET_MS,
        previewE2eKpiState: 'n/a',
        previewE2ePerPathStats: null,
        previewE2eDragToPresentMs: null,
        previewE2ePointerToPresentMs: null,
        previewE2eHostSchedToRafMs: null,
        previewE2eFrameCostMs: null,
        previewE2eFrameCostMedianMs: null,
        previewE2eFrameCostKpiTargetMs: PREVIEW_E2E_FRAME_COST_TARGET_MS,
        previewE2eFrameCostKpiState: 'n/a',
        previewE2eFrameCostPerPathStats: null,
        previewE2eFrameCostGateDecision: null,
        previewE2eFrameCostGateReady: false,
        previewE2eFrameCostGateSummary: null,
        mainThreadWebGpuPreviewAbFramesTotal: 0,
        mainThreadWebGpuPreviewAbFramesWebGpuMain: 0,
        mainThreadWebGpuPreviewAbFramesWebGlFallback: 0,
        mainThreadWebGpuPreviewAbWebGpuRatio: null,
        mainThreadWebGpuPreviewAbHealthState: 'n/a',
        mainThreadWebGpuPreviewAbFallbackRate: null,
        mainThreadWebGpuPreviewAbHealthFrames: 0,
        fastPreviewMainThreadSourceTexFormat: FAST_PREVIEW_MAIN_THREAD_SOURCE_TEX_FORMAT,
        fastPreviewGlContext: null,
        fastPreviewFloatPipeline: 'off',
        fastPreviewLutAtlasTexFormat: 'rgba8',
        fastPreviewGradingPrecision: 'mediump',
        cpuParityNominalW: null,
        cpuParityNominalH: null,
        cpuParityProxyMax: null,
        cpuParityBufferW: null,
        cpuParityBufferH: null,
        cpuParityMatchNominal: null,
        cpuParityDownscaled: null,
        isAdjusting: false,
        interactionKind: 'idle',
        e2ePanning: false,
      }));
      previewE2eIntentT0Ref.current = null;
      previewE2eHostSchedRafT0Ref.current = null;
      proxyE2eHostSchedRafByRequestIdRef.current.clear();
      previewE2eDragT0Ref.current = null;
      previewE2eFrameCostSamplesByPathRef.current.clear();
      prevIsAdjustingE2eRef.current = false;
      setFilmLabE2ePointerAuxSession(false);
      clearFilmLabE2ePointerMark();
      try {
        proxyWorkerRef.current?.postMessage?.({ type: 'clearSource' });
      } catch (_error) {
        // Ignore.
      }
      fullSourceRef.current = null;
      fullSourcePromiseRef.current = null;
      setImageMeta(null);
      setPipelineInfo(createIdlePipelineInfo());
      setIsProcessing(false);
      setRenderVersion((value) => value + 1);
      previewRerunRequestedRef.current = false;
      return;
    }

    let cancelled = false;
    setRenderPipelineAlert(null);

    const applyPreviewAsset = (asset, nextPipelineInfo = null) => {
      if (cancelled) {
        asset?.close?.();
        return false;
      }

      if (!asset?.image || !canvasRef.current) {
        return false;
      }

      if (nextPipelineInfo) {
        setPipelineInfo(nextPipelineInfo);
        if (import.meta?.env?.DEV && nextPipelineInfo?.pipelineKind === PIPELINE_KIND.RAW) {
          const capabilities = nextPipelineInfo?.capabilities ?? {};
          console.warn('[FilmLab] RAW decode diagnostics', {
            backend: capabilities?.backend ?? null,
            bridge: capabilities?.bridge ?? null,
            backendPreference: capabilities?.backendPreference ?? null,
            fallbackReason: capabilities?.fallbackReason ?? null,
            fallbackFromBackend: capabilities?.fallbackFromBackend ?? null,
            sourceWidth: capabilities?.sourceWidth ?? null,
            sourceHeight: capabilities?.sourceHeight ?? null,
            decodeStats: capabilities?.decodeStats ?? null,
            fallbackFromDecodeStats: capabilities?.fallbackFromDecodeStats ?? null,
            suspectedBlackFrame: capabilities?.suspectedBlackFrame ?? null,
          });
        }
      }

      const { image } = asset;
      const nativeWidth =
        Number(nextPipelineInfo?.capabilities?.sourceWidth) || Number(image.width) || 0;
      const nativeHeight =
        Number(nextPipelineInfo?.capabilities?.sourceHeight) || Number(image.height) || 0;
      const previewCanvas = canvasRef.current;
      const previewContext = getCanvasContext(previewCanvas, { willReadFrequently: true });

      if (!previewContext) {
        asset.close?.();
        setIsProcessing(false);
        return false;
      }

      fullSourceRef.current = null;
      fullSourcePromiseRef.current = null;
      sourceVersionRef.current += 1;

      const previewMax = getPreviewMaxDimension(image.width, image.height);
      let previewWidth = image.width;
      let previewHeight = image.height;

      if (previewWidth > previewMax || previewHeight > previewMax) {
        const ratio = Math.min(previewMax / previewWidth, previewMax / previewHeight);
        previewWidth *= ratio;
        previewHeight *= ratio;
      }

      previewWidth = Math.round(previewWidth);
      previewHeight = Math.round(previewHeight);

      previewCanvas.width = previewWidth;
      previewCanvas.height = previewHeight;

      previewContext.clearRect(0, 0, previewWidth, previewHeight);
      previewContext.imageSmoothingEnabled = true;
      previewContext.imageSmoothingQuality = 'high';
      previewContext.drawImage(image, 0, 0, previewWidth, previewHeight);
      previewSourceRef.current = null;

      const sourceCanvas = ensureCanvas(sourceCanvasRef, previewWidth, previewHeight);
      const sourceContext = getCanvasContext(sourceCanvas, {
        willReadFrequently: true,
      });

      if (sourceContext) {
        sourceCanvas.width = previewWidth;
        sourceCanvas.height = previewHeight;
        sourceContext.clearRect(0, 0, previewWidth, previewHeight);
        sourceContext.imageSmoothingEnabled = true;
        sourceContext.imageSmoothingQuality = 'high';
        sourceContext.drawImage(image, 0, 0, previewWidth, previewHeight);
        let sourceImageData = null;
        try {
          sourceImageData = sourceContext.getImageData(0, 0, previewWidth, previewHeight);
          const alphaNormalization = normalizeTransparentImageDataInPlace(sourceImageData);
          if (alphaNormalization.adjusted) {
            sourceContext.putImageData(sourceImageData, 0, 0);
            previewContext.putImageData(sourceImageData, 0, 0);
            if (import.meta?.env?.DEV) {
              console.warn('[FilmLab] Forced opaque source alpha to avoid transparent RAW preview.', {
                pipelineKind: nextPipelineInfo?.pipelineKind ?? null,
                sourceKind: nextPipelineInfo?.sourceKind ?? null,
                zeroAlphaRatio: alphaNormalization.zeroAlphaRatio,
                nonZeroRgbAtZeroAlphaRatio: alphaNormalization.nonZeroRgbAtZeroAlphaRatio,
              });
            }
          }
          previewSourceRef.current = sourceImageData;
          adaptivePivotRef.current = computeMedianLuma(sourceImageData);
        } catch (sourceImageError) {
          previewSourceRef.current = null;
          if (import.meta?.env?.DEV) {
            console.warn('[FilmLab] Unable to capture source image data for preview.', sourceImageError);
          }
        }

        if (!proxyWorkerFailedRef.current && proxyWorkerRef.current) {
          try {
            const workerSourceImageData = sourceContext.getImageData(0, 0, previewWidth, previewHeight);
            const transferablePixels = workerSourceImageData.data;
            const sourceId = (proxySourceIdRef.current || 0) + 1;
            const baseProxyForSource = getWorkerProxyMaxDimension(previewWidth, previewHeight);
            const nominalAtSource = getNominalProxyRenderSize(
              previewWidth,
              previewHeight,
              baseProxyForSource,
              { matchPreviewBuffer: PROXY_MATCH_PREVIEW_BUFFER }
            );
            const proxyMaxForSource = nominalAtSource.proxyMax;

            proxySourceIdRef.current = sourceId;
            proxyRequestIdRef.current = 0;
            proxyLastPresentedRequestIdRef.current = 0;
            proxyRequestStartTimesRef.current.clear();
            proxyWorkerSourceReadyRef.current = false;
            setRenderDebugInfo((current) => ({
              ...current,
              proxySourceReady: false,
              proxyLastFrameBackend: 'n/a',
              proxyLastFrameGpuImpl: 'n/a',
              proxyWebGpuDeviceLost: false,
              proxyWebGpuDeviceLostAt: null,
              proxyWebGpuDeviceLostMessage: null,
              proxyWebGpuReinitFailedAt: null,
              proxyWebGpuReinitFailedMessage: null,
              proxyWorkerWebGpuCanvasFormat: null,
              proxyWorkerWebGpuDeviceLimits: null,
              proxyWorkerWebGpuSourceTexFormat: null,
              proxyWorkerWebGpuLut3dTexFormat: null,
              proxyWorkerWebGpuReadbackRgba8: null,
              proxyWorkerWebGpuReadbackChroma: null,
              workerRenderMs: null,
              proxyWorkerGpuRenderMs: null,
              proxyWorkerCpuRenderMs: null,
              proxyWorkerWebGlMaxTex2d: null,
              proxyWorkerWebGlMaxTex3d: null,
              proxyWorkerWebGlRgba16f: null,
              proxyWorkerWebGlFbo16fBlit: null,
              proxyWorkerWebGl3dLutRgba16f: null,
              proxyWorkerGpuTexW: null,
              proxyWorkerGpuTexH: null,
              proxyWorkerFullSourceW: null,
              proxyWorkerFullSourceH: null,
              proxyWorkerGpuInputDownscaleMs: null,
              proxyWorkerProxyOutputFitted: false,
              proxyWorkerProxyOutputRequestedW: null,
              proxyWorkerProxyOutputRequestedH: null,
              proxyWorkerProxyOutputTargetW: null,
              proxyWorkerProxyOutputTargetH: null,
              proxyWorkerOutputTileCountNominal: null,
              proxyWorkerOutputTileCountTarget: null,
              proxyWorkerCpuFullNominalParity: false,
              proxyWorkerNominalW: nominalAtSource.width,
              proxyWorkerNominalH: nominalAtSource.height,
              proxyWorkerProxyMaxEffective: proxyMaxForSource,
              proxyInputBufferW: previewWidth,
              proxyInputBufferH: previewHeight,
            }));
            proxyWorkerRef.current.postMessage(
              {
                type: 'setSource',
                sourceId,
                width: previewWidth,
                height: previewHeight,
                proxyMax: proxyMaxForSource,
                pixels: transferablePixels,
              },
              [transferablePixels.buffer]
            );
          } catch (error) {
            console.error('[FilmLab] Failed to set worker source', error);
            reportRenderPipelineError(
              'WORKER_SET_SOURCE_FAILED',
              error instanceof Error
                ? error.message
                : 'Nie udało się przekazać źródła do workera.',
              { stage: 'set-source' }
            );
            proxyWorkerFailedRef.current = true;
          }
        }
      }

      setImageMeta({
        width: nativeWidth || image.width,
        height: nativeHeight || image.height,
        sourceWidth: nativeWidth || image.width,
        sourceHeight: nativeHeight || image.height,
        previewWidth,
        previewHeight,
      });

      setIsProcessing(false);
      asset.close?.();
      return true;
    };

    setIsProcessing(true);
    ingestUploadSource({
      uploadedFile,
      uploadedImage,
      renderIntent: 'preview',
      rawBackendPreference,
    })
      .then(({ asset, pipelineInfo: nextPipelineInfo }) => {
        if (cancelled) {
          asset?.close?.();
          return;
        }

        const applied = applyPreviewAsset(asset, nextPipelineInfo);

        if (!applied) {
          previewSourceRef.current = null;
          fullSourceRef.current = null;
          fullSourcePromiseRef.current = null;
          setImageMeta(null);
          setIsProcessing(false);
          setRenderVersion((value) => value + 1);
          previewRerunRequestedRef.current = false;

          // When the pipeline reports an error (e.g. RAW decoder couldn't open
          // the file), surface it via the error banner so the user sees
          // feedback instead of a stuck "Przygotowywanie źródła..." spinner.
          if (nextPipelineInfo) {
            setPipelineInfo(nextPipelineInfo);
            if (
              nextPipelineInfo.status === PIPELINE_STATUS.ERROR ||
              nextPipelineInfo.status === PIPELINE_STATUS.DECODER_MISSING
            ) {
              const errorCode =
                nextPipelineInfo.status === PIPELINE_STATUS.DECODER_MISSING
                  ? 'RAW_DECODER_MISSING'
                  : 'RAW_DECODE_FAILED';
              const message =
                nextPipelineInfo.message ||
                'Nie udało się zdekodować tego pliku. Spróbuj innym formatem.';
              console.error('[FilmLab] Pipeline ingest ERROR', {
                status: nextPipelineInfo.status,
                message,
                fileName: nextPipelineInfo.fileName,
              });
              reportRenderPipelineError(errorCode, message, {
                stage: 'ingest-source',
                fileName: nextPipelineInfo.fileName,
              });
            }
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const errorMessage = normalizeUnknownError(
            error,
            'Nie udało się przygotować źródła.'
          );
          console.error('[FilmLab] ingestUploadSource failed', errorMessage, error);
          reportRenderPipelineError(
            'SOURCE_INGEST_FAILED',
            errorMessage,
            { stage: 'ingest-source' }
          );
          previewSourceRef.current = null;
          proxyWorkerSourceReadyRef.current = false;
          proxySourceIdRef.current = 0;
          proxyRequestIdRef.current = 0;
          proxyLastPresentedRequestIdRef.current = 0;
          proxyRequestStartTimesRef.current.clear();
          setRenderDebugInfo((current) => ({
            ...current,
            proxySourceReady: false,
            proxyLastFrameBackend: 'n/a',
            proxyLastFrameGpuImpl: 'n/a',
            proxyWebGpuDeviceLost: false,
            proxyWebGpuDeviceLostAt: null,
            proxyWebGpuDeviceLostMessage: null,
            proxyWebGpuReinitFailedAt: null,
            proxyWebGpuReinitFailedMessage: null,
            proxyWorkerWebGpuCanvasFormat: null,
            proxyWorkerWebGpuDeviceLimits: null,
            proxyWorkerWebGpuSourceTexFormat: null,
            proxyWorkerWebGpuLut3dTexFormat: null,
            proxyWorkerWebGpuReadbackRgba8: null,
            proxyWorkerWebGpuReadbackChroma: null,
            workerRenderMs: null,
            proxyWorkerGpuRenderMs: null,
            proxyWorkerCpuRenderMs: null,
            proxyWorkerWebGlMaxTex2d: null,
            proxyWorkerWebGlMaxTex3d: null,
            proxyWorkerWebGlRgba16f: null,
            proxyWorkerWebGlFbo16fBlit: null,
            proxyWorkerWebGl3dLutRgba16f: null,
            proxyWorkerGpuTexW: null,
            proxyWorkerGpuTexH: null,
            proxyWorkerFullSourceW: null,
            proxyWorkerFullSourceH: null,
            proxyWorkerGpuInputDownscaleMs: null,
            proxyWorkerProxyOutputFitted: false,
            proxyWorkerProxyOutputRequestedW: null,
            proxyWorkerProxyOutputRequestedH: null,
            proxyWorkerProxyOutputTargetW: null,
            proxyWorkerProxyOutputTargetH: null,
            proxyWorkerOutputTileCountNominal: null,
            proxyWorkerOutputTileCountTarget: null,
            proxyWorkerCpuFullNominalParity: false,
            proxyWorkerNominalW: null,
            proxyWorkerNominalH: null,
            proxyWorkerProxyMaxEffective: null,
            proxyInputBufferW: null,
            proxyInputBufferH: null,
          }));
          try {
            proxyWorkerRef.current?.postMessage?.({ type: 'clearSource' });
          } catch (_error) {
            // Ignore.
          }
          fullSourceRef.current = null;
          fullSourcePromiseRef.current = null;
          setImageMeta(null);
          setPipelineInfo({
            ...createIdlePipelineInfo(),
            status: 'error',
            message: error instanceof Error ? error.message : 'Nie udało się przygotować źródła.',
            fileName: uploadedFile?.name ?? '',
          });
          setIsProcessing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    cancelScheduledPreviewWork,
    rawBackendPreference,
    reportRenderPipelineError,
    uploadedFile,
    uploadedImage,
  ]);

  useEffect(() => {
    if (!sourceCanvasRef.current || !imageMeta) {
      return;
    }

    scheduleProgressiveRender();
  }, [imageMeta, scheduleProgressiveRender]);

  const renderCurrentFrameBlob = useCallback(
    async ({ type = 'image/png', quality = 0.96, maxEdge = null } = {}) => {
      try {
        setIsProcessing(true);
        let source =
          fullSourceRef.current ??
          (await buildFullResolutionSource()) ??
          previewSourceRef.current;

        if (!source) {
          setIsProcessing(false);
          return null;
        }

        const normalizedMaxEdge = Number(maxEdge);
        if (
          Number.isFinite(normalizedMaxEdge) &&
          normalizedMaxEdge > 0 &&
          (source.width > normalizedMaxEdge || source.height > normalizedMaxEdge)
        ) {
          const ratio = Math.min(normalizedMaxEdge / source.width, normalizedMaxEdge / source.height);
          const w = Math.max(1, Math.round(source.width * ratio));
          const h = Math.max(1, Math.round(source.height * ratio));

          const scaledCanvas = document.createElement('canvas');
          scaledCanvas.width = w;
          scaledCanvas.height = h;
          const ctx = scaledCanvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
            || scaledCanvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            throw new Error('Brak kontekstu skalowania dla eksportu Crop.');
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = source.width;
          tmpCanvas.height = source.height;
          const tmpCtx = tmpCanvas.getContext('2d');
          if (!tmpCtx) {
            throw new Error('Brak kontekstu bufora skalowania dla eksportu Crop.');
          }
          tmpCtx.putImageData(source, 0, 0);
          ctx.drawImage(tmpCanvas, 0, 0, w, h);
          source = ctx.getImageData(0, 0, w, h);

          tmpCanvas.width = 1;
          tmpCanvas.height = 1;
          scaledCanvas.width = 1;
          scaledCanvas.height = 1;
        }

        const exportCanvas = document.createElement('canvas');
        const exportContext = getCanvasContext(exportCanvas, { willReadFrequently: true });
        if (!exportContext) {
          setIsProcessing(false);
          return null;
        }

        renderToContext({
          canvas: exportCanvas,
          context: exportContext,
          source,
          includeCompare: false,
          showClipping: false,
        });

        const blob = await new Promise((resolve) => {
          exportCanvas.toBlob((result) => resolve(result), type, quality);
        });
        if (!blob) {
          setIsProcessing(false);
          return null;
        }

        setIsProcessing(false);
        return {
          blob,
          width: exportCanvas.width,
          height: exportCanvas.height,
          type: blob.type || type,
        };
      } catch (error) {
        setIsProcessing(false);
        throw error;
      }
    },
    [buildFullResolutionSource, renderToContext]
  );

  const exportImage = useCallback(
    async ({
      sizeProfile = 'full',
      fileFormat = 'jpeg',
      includeLocalMaskPng = false,
      includeBeforeAfter = false,
      includeRecipeJson = false,
      lossyQuality = undefined,
    } = {}) => {
      try {
        setIsProcessing(true);
        const exportSessionId =
          typeof globalThis?.crypto?.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `exp_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
        const pipelineKind = pipelineInfo?.pipelineKind ?? null;
        let source =
          fullSourceRef.current ??
          (await buildFullResolutionSource()) ??
          previewSourceRef.current;

        if (!source) {
          setIsProcessing(false);
          return;
        }

        let maxEdge = null;
        if (sizeProfile === 'social') maxEdge = 1080;
        if (sizeProfile === 'web') maxEdge = 2048;

        if (maxEdge && (source.width > maxEdge || source.height > maxEdge)) {
          const ratio = Math.min(maxEdge / source.width, maxEdge / source.height);
          const w = Math.round(source.width * ratio);
          const h = Math.round(source.height * ratio);

          const scaledCanvas = document.createElement('canvas');
          scaledCanvas.width = w;
          scaledCanvas.height = h;
          const ctx =
            scaledCanvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true }) ||
            scaledCanvas.getContext('2d', { willReadFrequently: true });
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = source.width;
          tmpCanvas.height = source.height;
          const tmpCtx = tmpCanvas.getContext('2d');
          tmpCtx.putImageData(source, 0, 0);
          ctx.drawImage(tmpCanvas, 0, 0, w, h);

          source = ctx.getImageData(0, 0, w, h);

          tmpCanvas.width = 1;
          tmpCanvas.height = 1;
          scaledCanvas.width = 1;
          scaledCanvas.height = 1;
        }

        const exportCanvas = document.createElement('canvas');
        const exportContext = getCanvasContext(exportCanvas, { willReadFrequently: true });

        if (!exportContext) {
          setIsProcessing(false);
          return;
        }

        renderToContext({
          canvas: exportCanvas,
          context: exportContext,
          source,
          includeCompare: false,
          showClipping: Boolean(adjustments?.showClipping),
        });

        let sharpeningStrength = 0.3;
        if (sizeProfile === 'web') sharpeningStrength = 0.45;
        if (sizeProfile === 'social') sharpeningStrength = 0.6;

        const filmName = activeFilm?.name ?? 'Analog Signature';
        const safeFilmName = filmName.replace(/\s+/g, '_');
        const requestedFf =
          typeof fileFormat === 'string' ? fileFormat.trim().toLowerCase() : '';
        const exportAsPsd = requestedFf === 'psd';

        const manifestArtifacts = [];

        const exportEnc = await import('./filmLabExportEncode.js');

        let encoded;
        let ff;

        if (exportAsPsd) {
          applyOutputSharpening(exportContext, exportCanvas.width, exportCanvas.height, sharpeningStrength);
          const { encodeFilmLabExportPsdFromCanvas } = await import('./filmLabExportPsdFromCanvas.js');
          encoded = encodeFilmLabExportPsdFromCanvas(exportCanvas, {
            layerName: `${filmName} export`,
          });
          ff = 'psd';
        } else {
          ff = normalizeFilmLabExportFileFormat(fileFormat);
          encoded = await exportEnc.encodeFilmLabExportCanvas(exportCanvas, exportContext, {
            filmName,
            sizeProfile,
            fileFormat: ff,
            sharpeningStrength,
            lossyQuality,
          });
        }

        const rasterFf = exportAsPsd ? 'jpeg' : ff;

        exportEnc.triggerBrowserDownload(
          encoded.bytes,
          encoded.mimeType,
          `mindfullens_${safeFilmName}.${encoded.extension}`
        );
        const afterArtifactName = `mindfullens_${safeFilmName}.${encoded.extension}`;
        manifestArtifacts.push(
          await buildFilmLabExportManifestArtifactRow({
            variant: 'after',
            artifactRole: 'primary',
            fileName: afterArtifactName,
            mimeType: encoded.mimeType,
            bytes: encoded.bytes,
            exportSessionId,
            pipelineKind,
            sha256HexFromBytes,
          })
        );

        if (includeBeforeAfter) {
          const beforeData = transformSourceImageData(
            source,
            adjustments?.rotation ?? 0,
            Boolean(adjustments?.flipped)
          );
          const beforeEncoded = await exportEnc.encodeFilmLabExportImageData(beforeData, {
            fileFormat: rasterFf,
            lossyQuality,
          });
          exportEnc.triggerBrowserDownload(
            beforeEncoded.bytes,
            beforeEncoded.mimeType,
            `mindfullens_${safeFilmName}_before.${beforeEncoded.extension}`
          );
          manifestArtifacts.push(
            await buildFilmLabExportManifestArtifactRow({
              variant: 'before',
              artifactRole: 'sidecar',
              fileName: `mindfullens_${safeFilmName}_before.${beforeEncoded.extension}`,
              mimeType: beforeEncoded.mimeType,
              bytes: beforeEncoded.bytes,
              exportSessionId,
              pipelineKind,
              sha256HexFromBytes,
            })
          );
          if (includeRecipeJson) {
            const beforeRecipePayload = buildExportRecipeSnapshot({
              activeFilm,
              adjustments,
              renderDebugInfo,
              rawBackendPreference,
              pipelineKind,
              exportSessionId,
              sizeProfile,
              fileFormat: rasterFf,
              lossyQuality,
              variant: 'before',
              artifactName: `mindfullens_${safeFilmName}_before.${beforeEncoded.extension}`,
              artifactMimeType: beforeEncoded.mimeType,
            });
            const beforeRecipeBytes = new TextEncoder().encode(JSON.stringify(beforeRecipePayload, null, 2));
            exportEnc.triggerBrowserDownload(
              beforeRecipeBytes,
              'application/json',
              `mindfullens_${safeFilmName}_before_recipe.json`
            );
            manifestArtifacts.push(
              await buildFilmLabExportManifestArtifactRow({
                variant: 'before_recipe',
                artifactRole: 'sidecar',
                fileName: `mindfullens_${safeFilmName}_before_recipe.json`,
                mimeType: 'application/json',
                bytes: beforeRecipeBytes,
                exportSessionId,
                pipelineKind,
                sha256HexFromBytes,
              })
            );
          }
        }

        if (includeLocalMaskPng) {
          const transformedSource = transformSourceImageData(
            source,
            adjustments?.rotation ?? 0,
            Boolean(adjustments?.flipped)
          );
          const maskData = buildExportMaskGrayscaleImageData(
            transformedSource.width,
            transformedSource.height,
            transformedSource,
            adjustments,
            brushMaskCacheRef.current
          );
          if (maskData) {
            const pngBytes = await exportEnc.imageDataToPngUint8Array(maskData);
            exportEnc.triggerBrowserDownload(pngBytes, 'image/png', `mindfullens_${safeFilmName}_mask.png`);
            manifestArtifacts.push(
              await buildFilmLabExportManifestArtifactRow({
                variant: 'mask',
                artifactRole: 'aux-mask',
                fileName: `mindfullens_${safeFilmName}_mask.png`,
                mimeType: 'image/png',
                bytes: pngBytes,
                exportSessionId,
                pipelineKind,
                sha256HexFromBytes,
              })
            );
            if (includeRecipeJson) {
              const maskRecipePayload = buildExportRecipeSnapshot({
                activeFilm,
                adjustments,
                renderDebugInfo,
                rawBackendPreference,
                pipelineKind,
                exportSessionId,
                sizeProfile,
                fileFormat: rasterFf,
                lossyQuality,
                variant: 'mask',
                artifactName: `mindfullens_${safeFilmName}_mask.png`,
                artifactMimeType: 'image/png',
              });
              const maskRecipeBytes = new TextEncoder().encode(JSON.stringify(maskRecipePayload, null, 2));
              exportEnc.triggerBrowserDownload(
                maskRecipeBytes,
                'application/json',
                `mindfullens_${safeFilmName}_mask_recipe.json`
              );
              manifestArtifacts.push(
                await buildFilmLabExportManifestArtifactRow({
                  variant: 'mask_recipe',
                  artifactRole: 'sidecar',
                  fileName: `mindfullens_${safeFilmName}_mask_recipe.json`,
                  mimeType: 'application/json',
                  bytes: maskRecipeBytes,
                  exportSessionId,
                  pipelineKind,
                  sha256HexFromBytes,
                })
              );
            }
          }
        }

        if (includeRecipeJson) {
          const recipePayload = buildExportRecipeSnapshot({
            activeFilm,
            adjustments,
            renderDebugInfo,
            rawBackendPreference,
            pipelineKind,
            exportSessionId,
            sizeProfile,
            fileFormat: ff,
            variant: 'after',
            artifactName: afterArtifactName,
            artifactMimeType: encoded.mimeType,
          });
          const recipeBytes = new TextEncoder().encode(JSON.stringify(recipePayload, null, 2));
          exportEnc.triggerBrowserDownload(
            recipeBytes,
            'application/json',
            `mindfullens_${safeFilmName}_after_recipe.json`
          );
          manifestArtifacts.push(
            await buildFilmLabExportManifestArtifactRow({
              variant: 'after_recipe',
              artifactRole: 'sidecar',
              fileName: `mindfullens_${safeFilmName}_after_recipe.json`,
              mimeType: 'application/json',
              bytes: recipeBytes,
              exportSessionId,
              pipelineKind,
              sha256HexFromBytes,
            })
          );
        }

        const manifestLossyQ = manifestLossyQualityForFilmLabExport(ff, lossyQuality);
        const manifestPayload = {
          ...buildFilmLabExportManifestRootBase({
            moduleName: 'useFilmLabEngine.exportImage',
            mode: 'single',
            exportSessionId,
            artifactEntries: manifestArtifacts,
            serviceBuildTag: SERVICE_BUILD_TAG,
            serviceBuildLabel: SERVICE_BUILD_LABEL,
            viewportBuildMarker: VIEWPORT_BUILD_MARKER,
          }),
          film: {
            id: activeFilm?.id ?? null,
            name: activeFilm?.name ?? null,
          },
          export: {
            sizeProfile,
            fileFormat: ff,
            pipelineKind,
            includeLocalMaskPng,
            includeBeforeAfter,
            includeRecipeJson,
            ...(manifestLossyQ !== undefined ? { lossyQuality: manifestLossyQ } : {}),
          },
        };
        await attachFilmLabExportManifestDigest(manifestPayload, { sha256HexFromBytes });
        const manifestBytes = new TextEncoder().encode(JSON.stringify(manifestPayload, null, 2));
        exportEnc.triggerBrowserDownload(
          manifestBytes,
          'application/json',
          `mindfullens_${safeFilmName}_manifest.json`
        );

        exportCanvas.width = 1;
        exportCanvas.height = 1;

        setIsProcessing(false);
      } catch (error) {
        setIsProcessing(false);
        console.error(error);
      }
    },
    [
      activeFilm,
      adjustments,
      buildFullResolutionSource,
      renderToContext,
      renderDebugInfo,
      rawBackendPreference,
      pipelineInfo?.pipelineKind,
    ]
  );

  const exportCubeLut = useCallback(async () => {
    const worker = proxyWorkerRef.current;
    if (!worker || proxyWorkerFailedRef.current) {
      throw new Error('Proxy worker unavailable for LUT generation');
    }

    return new Promise((resolve, reject) => {
      // Set a timeout to prevent hanging promise if worker fails
      const timeoutId = setTimeout(() => {
        proxyLutExportCallbackRef.current = null;
        reject(new Error('LUT generation timed out'));
      }, 5000);

      proxyLutExportCallbackRef.current = (lutString) => {
        clearTimeout(timeoutId);
        
        // Trigger browser download mechanism
        try {
          const blob = new Blob([lutString], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const safeFilmName = activeFilm?.id ? activeFilm.id.replace(/[^a-z0-9]/gi, '_') : 'custom';
          link.download = `mindfullens_${safeFilmName}_profile.cube`;
          link.href = url;
          document.body.appendChild(link);
          link.click();
          // cleanup
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }, 100);
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };

      worker.postMessage({
        type: 'generateLutCube',
        requestId: proxyRequestIdRef.current + 1,
        film: activeFilm,
        adjustments: adjustments,
      });
    });
  }, [activeFilm, adjustments]);

  const [batchState, setBatchState] = useState({
    isRunning: false,
    current: 0,
    total: 0,
    currentFile: '',
  });
  const batchAbortRef = useRef(null);

  const processBatch = useCallback(
    async (files, sizeProfileOrOptions = 'full') => {
      if (!files || files.length === 0 || batchState.isRunning) {
        return;
      }

      const legacy = typeof sizeProfileOrOptions === 'string';
      const sizeProfile = legacy ? sizeProfileOrOptions : (sizeProfileOrOptions?.sizeProfile ?? 'full');
      const fileFormat = legacy ? 'jpeg' : (sizeProfileOrOptions?.fileFormat ?? 'jpeg');
      const includeLocalMaskPng = legacy ? false : Boolean(sizeProfileOrOptions?.includeLocalMaskPng);
      const includeBeforeAfter = legacy ? false : Boolean(sizeProfileOrOptions?.includeBeforeAfter);
      const includeRecipeJson = legacy ? false : Boolean(sizeProfileOrOptions?.includeRecipeJson);
      const lossyQuality = legacy ? undefined : sizeProfileOrOptions?.lossyQuality;
      const normalizedFormat = normalizeFilmLabExportFileFormat(fileFormat);
      const exportSessionId =
        typeof globalThis?.crypto?.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `exp_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
      const pipelineKind = pipelineInfo?.pipelineKind ?? null;

      const abortController = new AbortController();
      batchAbortRef.current = abortController;

      setBatchState({
        isRunning: true,
        current: 0,
        total: files.length,
        currentFile: files[0]?.name ?? '',
      });

      const { processBatch: runBatch } = await import('./batchProcessor.js');

      await runBatch({
        files,
        renderToContext,
        filmName: activeFilm?.name ?? 'Analog Signature',
        signal: abortController.signal,
        shuffleSeeds,
        sizeProfile,
        fileFormat: normalizedFormat,
        includeLocalMaskPng,
        includeBeforeAfter,
        includeRecipeJson,
        lossyQuality,
        exportSessionId,
        pipelineKind,
        buildMaskImageData: includeLocalMaskPng
          ? (rawSource) => {
              const transformedSource = transformSourceImageData(
                rawSource,
                adjustments?.rotation ?? 0,
                Boolean(adjustments?.flipped)
              );
              return buildExportMaskGrayscaleImageData(
                transformedSource.width,
                transformedSource.height,
                transformedSource,
                adjustments
              );
            }
          : null,
        buildBeforeImageData: includeBeforeAfter
          ? (rawSource) =>
              transformSourceImageData(
                rawSource,
                adjustments?.rotation ?? 0,
                Boolean(adjustments?.flipped)
              )
          : null,
        buildRecipeObject: includeRecipeJson
          ? ({
              fileName,
              sizeProfile: batchSizeProfile,
              fileFormat: batchFileFormat,
              variant = 'after',
              artifactName = null,
              artifactMimeType = null,
            }) =>
              buildExportRecipeSnapshot({
                activeFilm,
                adjustments,
                renderDebugInfo,
                rawBackendPreference,
                pipelineKind,
                exportSessionId,
                sizeProfile: batchSizeProfile,
                fileFormat: batchFileFormat,
                lossyQuality,
                sourceName: fileName,
                variant,
                artifactName,
                artifactMimeType,
              })
          : null,
        rawBackendPreference,
        onProgress: (current, total, fileName) => {
          setBatchState({
            isRunning: true,
            current,
            total,
            currentFile: fileName,
          });
        },
        onComplete: () => {
          setBatchState({ isRunning: false, current: 0, total: 0, currentFile: '' });
          batchAbortRef.current = null;
        },
        onError: (fileName, error) => {
          console.warn(`[Film-Lab Batch] Error processing ${fileName}:`, error);
        },
        prepareAdjustmentsForBatchFile: adjustments.batchRecomputeAiMasksHeuristic
          ? () => {
              const cropNorm = activeCropRectNormFromAdjustments(adjustments);
              return recomputeAiAssistMasksHeuristic(adjustments, cropNorm);
            }
          : undefined,
        batchAdjustmentsOverrideRef,
      });
    },
    [
      activeFilm,
      adjustments,
      renderToContext,
      batchState.isRunning,
      rawBackendPreference,
      renderDebugInfo,
      pipelineInfo?.pipelineKind,
    ]
  );

  const cancelBatch = useCallback(() => {
    batchAbortRef.current?.abort();
    setBatchState({ isRunning: false, current: 0, total: 0, currentFile: '' });
  }, []);

  const setPreferFullResPreview = useCallback(
    (enabled) => {
      const nextEnabled = Boolean(enabled);
      const previousEnabled = Boolean(preferFullResPreviewRef.current);
      if (previousEnabled === nextEnabled) {
        return;
      }

      preferFullResPreviewRef.current = nextEnabled;
      setRenderDebugInfo((current) => ({
        ...current,
        fullResRequested: nextEnabled,
        fullResReady: nextEnabled ? Boolean(fullSourceRef.current) : false,
      }));

      const rerun = scheduleProgressiveRenderRef.current;

      if (!nextEnabled) {
        if (typeof rerun === 'function') {
          rerun();
        }
        return;
      }

      if (fullSourceRef.current) {
        if (typeof rerun === 'function') {
          rerun();
        }
        return;
      }

      buildFullResolutionSource()
        .then((fullSource) => {
          setRenderDebugInfo((current) => ({
            ...current,
            fullResRequested: Boolean(preferFullResPreviewRef.current),
            fullResReady: Boolean(fullSource),
          }));

          if (!preferFullResPreviewRef.current || !fullSource) {
            return;
          }

          const latestRerun = scheduleProgressiveRenderRef.current;
          if (typeof latestRerun === 'function') {
            latestRerun();
          }
        })
        .catch((error) => {
          if (import.meta?.env?.DEV) {
            console.warn('[FilmLab] Unable to promote preview to full-resolution 1:1 render.', error);
          }
          setRenderDebugInfo((current) => ({
            ...current,
            fullResReady: false,
          }));
        });
    },
    [buildFullResolutionSource]
  );

  return {
    canvasRef,
    isProcessing,
    exportImage,
    renderCurrentFrameBlob,
    imageMeta,
    pipelineInfo,
    renderPipelineAlert,
    clearRenderPipelineAlert,
    renderDebugInfo,
    renderVersion,
    setPreferFullResPreview,
    exportCubeLut,
    processBatch,
    cancelBatch,
    batchState,
    depthOnnxInferenceUi,
  };
}

export const __FILMLAB_INTERNALS = Object.freeze({
  buildWorkerAdjustmentsPayload,
  buildFastPreviewAdjustments,
  resolveCurveLumaMix,
  IDENTITY_CURVES,
});
