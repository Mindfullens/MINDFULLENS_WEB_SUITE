import {
  decodeRawWithConfiguredAdapter,
  getRawDecodeAdapterIdFromEnv,
  RAW_DECODE_ADAPTER_LIBRAW_WASM,
} from './rawDecodeAdapter.js';
import { computeDecodeStats } from './rawDecodePreviewStats.js';

const FALLBACK_CAPABILITIES = {
  decoderInstalled: false,
  workerReady: true,
  backend: 'none',
  supportedFormats: [
    'dng',
    'nef',
    'nrw',
    'cr2',
    'cr3',
    'arw',
    'raf',
    'rw2',
    'orf',
    'pef',
    'iiq',
  ],
  colorPipeline: {
    stage: 'srgb-linear-srgb-v1',
    inputEncoding: 'display-srgb',
    workingEncoding: 'scene-linear',
    outputEncoding: 'display-srgb',
    linearStageEnabled: true,
  },
};

const RAW_BRIDGES = [
  {
    id: 'vite-node-bridge',
    probePath: '__raw/probe',
    decodePath: '__raw/decode',
  },
  // NOTE: php-bridge is intentionally disabled in dev because Vite serves
  // public/*.php files as static text (Content-Type empty, body is PHP source),
  // which masquerades as a successful decode response. If a PHP runtime is
  // deployed in production behind a reverse proxy, re-enable it there via env.
  // {
  //   id: 'php-bridge',
  //   probePath: 'raw/probe.php',
  //   decodePath: 'raw/decode.php',
  // },
];

const BLACK_FRAME_MEAN_LUMA_THRESHOLD = 0.9;
const BLACK_FRAME_NON_BLACK_RATIO_THRESHOLD = 0.0012;
const BLACK_FRAME_OPAQUE_RATIO_THRESHOLD = 0.01;
const AB_SCORE_SWITCH_THRESHOLD = 2.4;
const AB_HEATMAP_MAX_EDGE = 80;
const DEFAULT_RAW_COLOR_PIPELINE = Object.freeze({
  stage: 'srgb-linear-srgb-v1',
  inputEncoding: 'display-srgb',
  workingEncoding: 'scene-linear',
  outputEncoding: 'display-srgb',
  linearStageEnabled: true,
});
const DEFAULT_RAW_2D_RECOVERY = Object.freeze({
  enabled: false,
  highlightStrength: 0.35,
  shadowStrength: 0.25,
  highlightPivot: 0.72,
  shadowPivot: 0.28,
});

function withRawDecodeAdapterTelemetry(capabilities) {
  if (!capabilities || typeof capabilities !== 'object') {
    return { rawDecodeAdapter: getRawDecodeAdapterIdFromEnv() };
  }
  return {
    ...capabilities,
    rawDecodeAdapter: getRawDecodeAdapterIdFromEnv(),
  };
}

function finalizeProbeCapabilities(capabilities) {
  const base =
    capabilities && typeof capabilities === 'object' ? { ...capabilities } : { ...FALLBACK_CAPABILITIES };
  const recoverySettings = getRaw2dRecoverySettings();
  base.rawRecovery2d = {
    enabled: Boolean(recoverySettings.enabled),
    highlightStrength: recoverySettings.highlightStrength,
    shadowStrength: recoverySettings.shadowStrength,
  };

  if (getRawDecodeAdapterIdFromEnv() === RAW_DECODE_ADAPTER_LIBRAW_WASM) {
    const hadBridge = Boolean(base.bridge);
    base.decoderInstalled = true;
    base.workerReady = true;
    base.rawDecodeInlineWasm = true;
    if (hadBridge && base.backend && base.backend !== 'none') {
      base.backend = `${base.backend} · LibRaw WASM`;
    } else {
      base.backend = 'LibRaw (WASM)';
    }
  }

  return withRawDecodeAdapterTelemetry(base);
}

function detectImageMimeFromMagicBytes(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12) {
    return null;
  }
  const bytes = new Uint8Array(buffer, 0, 12);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function parsePositiveIntHeader(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    return '/';
  }

  let normalized = baseUrl.trim();

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  if (!normalized.endsWith('/')) {
    normalized += '/';
  }

  return normalized;
}

function inferBaseUrlFromWorkerLocation() {
  try {
    const href = self?.location?.href;
    if (!href) {
      return '/';
    }

    const url = new URL(href);
    const path = url.pathname || '/';
    const marker = '/assets/';
    const markerIndex = path.indexOf(marker);

    if (markerIndex >= 0) {
      const inferred = path.slice(0, markerIndex + 1);
      return inferred || '/';
    }

    const lastSlash = path.lastIndexOf('/');
    if (lastSlash <= 0) {
      return '/';
    }

    return path.slice(0, lastSlash + 1);
  } catch {
    return '/';
  }
}

function resolveBridgeUrls(path, baseUrl = '/') {
  const cleanPath = String(path ?? '').replace(/^\/+/, '');
  const root = `/${cleanPath}`;
  const baseCandidates = new Set([
    normalizeBaseUrl(baseUrl),
    normalizeBaseUrl(inferBaseUrlFromWorkerLocation()),
  ]);

  const urls = [root];

  for (const baseCandidate of baseCandidates) {
    const prefixed = `${baseCandidate}${cleanPath}`.replace(/\/{2,}/g, '/');
    if (!urls.includes(prefixed)) {
      urls.push(prefixed);
    }
  }

  return urls;
}

async function probeRawDecoder(baseUrl = '/') {
  for (const bridge of RAW_BRIDGES) {
    const probeUrls = resolveBridgeUrls(bridge.probePath, baseUrl);

    for (const probeUrl of probeUrls) {
      try {
        const response = await fetch(probeUrl, {
          cache: 'no-store',
        });

        if (!response.ok) {
          continue;
        }

        const payload = await response.json();
        const colorPipeline =
          payload?.colorPipeline && typeof payload.colorPipeline === 'object'
            ? { ...DEFAULT_RAW_COLOR_PIPELINE, ...payload.colorPipeline }
            : DEFAULT_RAW_COLOR_PIPELINE;
        return finalizeProbeCapabilities({
          ...FALLBACK_CAPABILITIES,
          ...(payload ?? {}),
          colorPipeline,
          bridge: bridge.id,
          bridgeUrl: probeUrl,
        });
      } catch {
        // Try the next bridge URL.
      }
    }
  }

  return finalizeProbeCapabilities(FALLBACK_CAPABILITIES);
}

function normalizeBackendPreference(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'sips' || normalized === 'quicklook') {
    return normalized;
  }
  return null;
}

function inferBackendFamily(backendLabel) {
  const safe = String(backendLabel ?? '')
    .trim()
    .toLowerCase();
  if (!safe) {
    return 'unknown';
  }
  if (safe.includes('quicklook') || safe.includes('qlmanage')) {
    return 'quicklook';
  }
  if (safe.includes('sips') || safe.includes('imageio')) {
    return 'sips';
  }
  return 'unknown';
}

function roundStat(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseBooleanHeader(value, defaultValue = false) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

function parseBooleanEnv(value, defaultValue = false) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

function parseFiniteEnv(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getRaw2dRecoverySettings() {
  try {
    const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
    return {
      enabled: parseBooleanEnv(env?.VITE_FILMLAB_RAW_RECOVERY_2D, DEFAULT_RAW_2D_RECOVERY.enabled),
      highlightStrength: Math.max(
        0,
        Math.min(1, parseFiniteEnv(env?.VITE_FILMLAB_RAW_RECOVERY_HIGHLIGHT_STRENGTH, DEFAULT_RAW_2D_RECOVERY.highlightStrength))
      ),
      shadowStrength: Math.max(
        0,
        Math.min(1, parseFiniteEnv(env?.VITE_FILMLAB_RAW_RECOVERY_SHADOW_STRENGTH, DEFAULT_RAW_2D_RECOVERY.shadowStrength))
      ),
      highlightPivot: DEFAULT_RAW_2D_RECOVERY.highlightPivot,
      shadowPivot: DEFAULT_RAW_2D_RECOVERY.shadowPivot,
    };
  } catch {
    return { ...DEFAULT_RAW_2D_RECOVERY };
  }
}

async function applyRaw2dRecovery(buffer, mimeType = 'image/png') {
  const settings = getRaw2dRecoverySettings();
  if (!settings.enabled) {
    return {
      changed: false,
      buffer,
      mimeType,
      metrics: {
        enabled: false,
        reason: 'feature-flag-off',
      },
    };
  }
  if (
    typeof createImageBitmap !== 'function' ||
    typeof OffscreenCanvas === 'undefined' ||
    !(buffer instanceof ArrayBuffer)
  ) {
    return {
      changed: false,
      buffer,
      mimeType,
      metrics: {
        enabled: true,
        reason: 'runtime-unsupported',
        ...settings,
      },
    };
  }

  let bitmap = null;
  try {
    const blob = new Blob([buffer], { type: mimeType || 'image/png' });
    bitmap = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
      premultiplyAlpha: 'none',
    });
    if (!bitmap?.width || !bitmap?.height) {
      return {
        changed: false,
        buffer,
        mimeType,
        metrics: {
          enabled: true,
          reason: 'empty-bitmap',
          ...settings,
        },
      };
    }

    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return {
        changed: false,
        buffer,
        mimeType,
        metrics: {
          enabled: true,
          reason: 'no-2d-context',
          ...settings,
        },
      };
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData?.data;
    if (!data?.length) {
      return {
        changed: false,
        buffer,
        mimeType,
        metrics: {
          enabled: true,
          reason: 'empty-pixels',
          ...settings,
        },
      };
    }

    let preHighlight = 0;
    let preShadow = 0;
    let postHighlight = 0;
    let postShadow = 0;
    let changedSamples = 0;
    const sampleCount = width * height;
    const hPivot = settings.highlightPivot;
    const sPivot = settings.shadowPivot;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      if (a <= 0.01) {
        continue;
      }
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      const preL = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (preL >= 0.98) preHighlight += 1;
      if (preL <= 0.02) preShadow += 1;

      const recover = (x) => {
        let out = x;
        if (out > hPivot) {
          const t = (out - hPivot) / (1 - hPivot);
          out = out - settings.highlightStrength * t * t * (1 - hPivot);
        }
        if (out < sPivot) {
          const t = (sPivot - out) / sPivot;
          out = out + settings.shadowStrength * t * t * sPivot;
        }
        return Math.max(0, Math.min(1, out));
      };

      const nr = recover(r);
      const ng = recover(g);
      const nb = recover(b);
      if (Math.abs(nr - r) > 0.001 || Math.abs(ng - g) > 0.001 || Math.abs(nb - b) > 0.001) {
        changedSamples += 1;
      }
      r = nr;
      g = ng;
      b = nb;
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);

      const postL = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (postL >= 0.98) postHighlight += 1;
      if (postL <= 0.02) postShadow += 1;
    }

    context.putImageData(imageData, 0, 0);
    const outBlob = await canvas.convertToBlob({ type: 'image/png' });
    const outBuffer = await outBlob.arrayBuffer();
    return {
      changed: true,
      buffer: outBuffer,
      mimeType: 'image/png',
      metrics: {
        enabled: true,
        reason: 'applied',
        ...settings,
        preHighlightClipRatio: roundStat(preHighlight / sampleCount, 6),
        postHighlightClipRatio: roundStat(postHighlight / sampleCount, 6),
        preShadowClipRatio: roundStat(preShadow / sampleCount, 6),
        postShadowClipRatio: roundStat(postShadow / sampleCount, 6),
        recoveredHighlightRatio: roundStat((preHighlight - postHighlight) / sampleCount, 6),
        recoveredShadowRatio: roundStat((preShadow - postShadow) / sampleCount, 6),
        changedPixelRatio: roundStat(changedSamples / sampleCount, 6),
      },
    };
  } catch {
    return {
      changed: false,
      buffer,
      mimeType,
      metrics: {
        enabled: true,
        reason: 'apply-failed',
        ...settings,
      },
    };
  } finally {
    try {
      bitmap?.close?.();
    } catch {
      // noop
    }
  }
}

function arrayBufferToBase64(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    return '';
  }
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function createLumaSample(buffer, mimeType = 'image/png', maxEdge = AB_HEATMAP_MAX_EDGE) {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof OffscreenCanvas === 'undefined' ||
    !(buffer instanceof ArrayBuffer)
  ) {
    return null;
  }

  let bitmap = null;
  try {
    const blob = new Blob([buffer], { type: mimeType || 'image/png' });
    bitmap = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
      premultiplyAlpha: 'none',
    });

    if (!bitmap?.width || !bitmap?.height) {
      return null;
    }

    const sampleWidth = Math.max(1, Math.min(maxEdge, bitmap.width));
    const sampleHeight = Math.max(1, Math.min(maxEdge, bitmap.height));
    const canvas = new OffscreenCanvas(sampleWidth, sampleHeight);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }

    context.clearRect(0, 0, sampleWidth, sampleHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'medium';
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);

    const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imageData?.data;
    if (!data?.length) {
      return null;
    }

    const pixelCount = sampleWidth * sampleHeight;
    const luma = new Float32Array(pixelCount);
    for (let index = 0; index < data.length; index += 4) {
      const pixelIndex = index / 4;
      const red = data[index] || 0;
      const green = data[index + 1] || 0;
      const blue = data[index + 2] || 0;
      const alpha = (data[index + 3] || 0) / 255;
      luma[pixelIndex] = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * alpha;
    }

    return {
      width: sampleWidth,
      height: sampleHeight,
      luma,
    };
  } catch (_error) {
    return null;
  } finally {
    try {
      bitmap?.close?.();
    } catch (_closeError) {
      // noop
    }
  }
}

async function encodeHeatmapToDataUrl(width, height, rgbaPixels) {
  if (
    typeof OffscreenCanvas === 'undefined' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !(rgbaPixels instanceof Uint8ClampedArray)
  ) {
    return null;
  }

  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: false });
    if (!context) {
      return null;
    }

    const imageData = new ImageData(rgbaPixels, width, height);
    context.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    if (!base64) {
      return null;
    }
    return `data:image/png;base64,${base64}`;
  } catch (_error) {
    return null;
  }
}

async function buildDecodeDiffHeatmap(primaryPayload, alternatePayload) {
  const primarySample = await createLumaSample(
    primaryPayload?.buffer,
    primaryPayload?.mimeType || 'image/png'
  );
  const alternateSample = await createLumaSample(
    alternatePayload?.buffer,
    alternatePayload?.mimeType || 'image/png'
  );

  if (!primarySample || !alternateSample) {
    return null;
  }

  const width = Math.min(primarySample.width, alternateSample.width);
  const height = Math.min(primarySample.height, alternateSample.height);
  if (!width || !height) {
    return null;
  }

  const pixelCount = width * height;
  if (!pixelCount) {
    return null;
  }

  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const deltas = new Float32Array(pixelCount);
  let maxDelta = 0;
  let sumDelta = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const delta = Math.abs(primarySample.luma[index] - alternateSample.luma[index]);
    deltas[index] = delta;
    sumDelta += delta;
    if (delta > maxDelta) {
      maxDelta = delta;
    }
  }

  const sorted = Array.from(deltas).sort((left, right) => left - right);
  const p95Delta = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0;
  const maxDenominator = Math.max(maxDelta, 1);

  for (let index = 0; index < pixelCount; index += 1) {
    const intensity = Math.max(0, Math.min(1, deltas[index] / maxDenominator));
    const base = index * 4;
    rgba[base] = Math.round(255 * intensity);
    rgba[base + 1] = Math.round(170 * (1 - intensity));
    rgba[base + 2] = Math.round(255 * (1 - intensity));
    rgba[base + 3] = Math.round(36 + intensity * 219);
  }

  const dataUrl = await encodeHeatmapToDataUrl(width, height, rgba);

  return {
    width,
    height,
    meanDelta: roundStat(sumDelta / pixelCount, 3),
    maxDelta: roundStat(maxDelta, 3),
    p95Delta: roundStat(p95Delta, 3),
    dataUrl,
  };
}

function isLikelyBlackDecodedFrame(stats) {
  if (!stats || typeof stats !== 'object') {
    return false;
  }

  const meanLuma = Number(stats.meanLuma);
  const nonBlackRatio = Number(stats.nonBlackRatio);
  const opaqueRatio = Number(stats.opaqueRatio);

  if (!Number.isFinite(meanLuma) || !Number.isFinite(nonBlackRatio)) {
    return false;
  }

  const nearBlackSignal =
    meanLuma <= BLACK_FRAME_MEAN_LUMA_THRESHOLD &&
    nonBlackRatio <= BLACK_FRAME_NON_BLACK_RATIO_THRESHOLD;

  const mostlyTransparent =
    Number.isFinite(opaqueRatio) &&
    opaqueRatio <= BLACK_FRAME_OPAQUE_RATIO_THRESHOLD &&
    meanLuma <= 2;

  return nearBlackSignal || mostlyTransparent;
}

function computeDecodeQualityScore(stats) {
  if (!stats || typeof stats !== 'object') {
    return null;
  }

  const meanLuma = Number(stats.meanLuma);
  const nonBlackRatio = Number(stats.nonBlackRatio);
  const opaqueRatio = Number(stats.opaqueRatio);
  const zeroAlphaRatio = Number(stats.zeroAlphaRatio);

  if (!Number.isFinite(meanLuma) || !Number.isFinite(nonBlackRatio)) {
    return null;
  }

  const clampedNonBlack = Math.max(0, Math.min(1, nonBlackRatio));
  const clampedOpaque = Number.isFinite(opaqueRatio)
    ? Math.max(0, Math.min(1, opaqueRatio))
    : 1;
  const clampedZeroAlpha = Number.isFinite(zeroAlphaRatio)
    ? Math.max(0, Math.min(1, zeroAlphaRatio))
    : 0;
  const lumaBalance = Math.max(0, 1 - Math.abs(meanLuma - 112) / 112);

  const score =
    clampedNonBlack * 62 +
    clampedOpaque * 20 +
    lumaBalance * 18 -
    clampedZeroAlpha * 24;

  return roundStat(score, 3);
}

function buildBackendAbPayload({
  primaryPayload,
  alternatePayload,
  winner = 'primary',
  reason = 'quality-score',
  alternateError = null,
  diffHeatmap = null,
}) {
  const primaryBackend = primaryPayload?.backend ?? 'unknown';
  const alternateBackend = alternatePayload?.backend ?? null;
  return {
    executed: true,
    winner,
    reason,
    primary: {
      backend: primaryBackend,
      score: computeDecodeQualityScore(primaryPayload?.decodeStats),
      stats: primaryPayload?.decodeStats ?? null,
    },
    alternate: alternatePayload
      ? {
          backend: alternateBackend,
          score: computeDecodeQualityScore(alternatePayload?.decodeStats),
          stats: alternatePayload?.decodeStats ?? null,
        }
      : null,
    alternateError: alternateError
      ? {
          code: alternateError?.code ?? 'RAW_AB_ALTERNATE_FAILED',
          message: alternateError?.message ?? 'Alternatywny backend nie odpowiedział.',
        }
      : null,
    diffHeatmap: diffHeatmap ?? null,
  };
}

function buildBlackFrameCandidate(primaryPayload, fallbackPayload = null) {
  return {
    ok: true,
    payload: {
      ...(primaryPayload ?? {}),
      suspectedBlackFrame: true,
      fallbackAttemptedBackend: fallbackPayload?.backend ?? null,
      fallbackDecodeStats: fallbackPayload?.decodeStats ?? null,
      fallbackReason: 'suspected-black-frame',
      backendAbTest: buildBackendAbPayload({
        primaryPayload,
        alternatePayload: fallbackPayload,
        winner: 'primary',
        reason: 'suspected-black-frame',
      }),
    },
  };
}

async function decodeAtBridge(
  bridgeId,
  decodeUrl,
  file,
  renderIntent = 'preview',
  backendPreference = null
) {
  try {
    const preference = normalizeBackendPreference(backendPreference);
    const headers = {
      'x-file-name': file?.name ?? 'upload.raw',
      'x-render-intent': renderIntent,
      'content-type': file?.type || 'application/octet-stream',
    };

    if (preference) {
      headers['x-raw-backend-preference'] = preference;
    }

    const response = await fetch(decodeUrl, {
      method: 'POST',
      headers,
      body: file,
    });

    if (!response.ok) {
      let errorPayload = null;

      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = null;
      }

      return {
        ok: false,
        error: errorPayload?.error ?? {
          code: 'RAW_DECODE_FAILED',
          message: 'Nie udało się zdekodować pliku RAW/DNG.',
        },
        payload: {
          ...FALLBACK_CAPABILITIES,
          ...(errorPayload?.capabilities ?? {}),
          bridge: bridgeId,
          bridgeUrl: decodeUrl,
        },
      };
    }

    const rawContentType = response.headers.get('content-type') || '';
    const headerMime = rawContentType.split(';')[0].trim().toLowerCase();

    if (!headerMime.startsWith('image/')) {
      return {
        ok: false,
        error: {
          code: 'RAW_INVALID_RESPONSE_TYPE',
          message: `Bridge zwrócił nieprawidłowy typ odpowiedzi: "${rawContentType || '(pusty)'}". Oczekiwano image/*. URL: ${decodeUrl}`,
        },
        payload: {
          ...FALLBACK_CAPABILITIES,
          bridge: bridgeId,
          bridgeUrl: decodeUrl,
        },
      };
    }

    const buffer = await response.arrayBuffer();
    const magicMime = detectImageMimeFromMagicBytes(buffer);
    if (!magicMime) {
      return {
        ok: false,
        error: {
          code: 'RAW_INVALID_RESPONSE_BYTES',
          message: `Bridge zwrócił bufor, który nie zawiera rozpoznawalnego obrazu (PNG/JPEG/WebP/GIF). URL: ${decodeUrl}, rozmiar: ${buffer.byteLength}B.`,
        },
        payload: {
          ...FALLBACK_CAPABILITIES,
          bridge: bridgeId,
          bridgeUrl: decodeUrl,
        },
      };
    }

    const mimeType = magicMime;
    const decodeStats = await computeDecodeStats(buffer, mimeType);
    const colorStage = response.headers.get('x-raw-color-stage') || DEFAULT_RAW_COLOR_PIPELINE.stage;
    const inputEncoding =
      response.headers.get('x-raw-input-encoding') || DEFAULT_RAW_COLOR_PIPELINE.inputEncoding;
    const outputEncoding =
      response.headers.get('x-raw-output-encoding') || DEFAULT_RAW_COLOR_PIPELINE.outputEncoding;
    const linearStageEnabled = parseBooleanHeader(
      response.headers.get('x-raw-linear-stage-enabled'),
      DEFAULT_RAW_COLOR_PIPELINE.linearStageEnabled
    );
    const sourceWidth = parsePositiveIntHeader(response.headers.get('x-raw-source-width'));
    const sourceHeight = parsePositiveIntHeader(response.headers.get('x-raw-source-height'));

    return {
      ok: true,
      payload: {
        buffer,
        mimeType,
        backend: response.headers.get('x-raw-backend') || 'unknown',
        bridge: bridgeId,
        bridgeUrl: decodeUrl,
        fileName: file?.name ?? '',
        backendPreference: preference ?? 'auto',
        sourceWidth,
        sourceHeight,
        decodeStats,
        colorPipeline: {
          stage: colorStage,
          inputEncoding,
          workingEncoding: DEFAULT_RAW_COLOR_PIPELINE.workingEncoding,
          outputEncoding,
          linearStageEnabled,
        },
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: 'RAW_BRIDGE_UNAVAILABLE',
        message: 'Mostek RAW jest chwilowo niedostępny.',
      },
      payload: {
        ...FALLBACK_CAPABILITIES,
        bridge: bridgeId,
        bridgeUrl: decodeUrl,
      },
    };
  }
}

async function decodeRawWithLocalBridge(
  file,
  renderIntent = 'preview',
  baseUrl = '/',
  backendPreference = null
) {
  let lastFailure = null;
  let blackFrameCandidate = null;
  const forcedBackendPreference = normalizeBackendPreference(backendPreference);
  const preservePrimaryGeometry = renderIntent === 'preview' || renderIntent === 'full';

  for (const bridge of RAW_BRIDGES) {
    const decodeUrls = resolveBridgeUrls(bridge.decodePath, baseUrl);

    for (const decodeUrl of decodeUrls) {
      const result = await decodeAtBridge(
        bridge.id,
        decodeUrl,
        file,
        renderIntent,
        forcedBackendPreference
      );

      if (!result.ok) {
        lastFailure = result;
        continue;
      }

      if (forcedBackendPreference) {
        return {
          ok: true,
          payload: {
            ...result.payload,
            backendPreference: forcedBackendPreference,
            fallbackReason: 'forced-backend',
            backendAbTest: {
              executed: false,
              forced: true,
              winner: 'primary',
              reason: 'forced-backend',
              primary: {
                backend: result.payload?.backend ?? forcedBackendPreference,
                score: computeDecodeQualityScore(result.payload?.decodeStats),
                stats: result.payload?.decodeStats ?? null,
              },
              alternate: null,
              alternateError: null,
            },
          },
        };
      }

      const primaryBackendFamily = inferBackendFamily(result.payload?.backend);
      const fallbackPreference =
        primaryBackendFamily === 'quicklook'
          ? 'sips'
          : primaryBackendFamily === 'sips'
            ? 'quicklook'
            : null;

      const primaryLooksBlack = isLikelyBlackDecodedFrame(result.payload?.decodeStats);

      if (!fallbackPreference) {
        if (!primaryLooksBlack) {
          return result;
        }

        blackFrameCandidate = buildBlackFrameCandidate(result.payload, null);
        continue;
      }

      const fallbackResult = await decodeAtBridge(
        bridge.id,
        decodeUrl,
        file,
        renderIntent,
        fallbackPreference
      );

      if (fallbackResult.ok) {
        const diffHeatmap = await buildDecodeDiffHeatmap(result.payload, fallbackResult.payload);
        const fallbackLooksBlack = isLikelyBlackDecodedFrame(fallbackResult.payload?.decodeStats);
        const primaryScore = computeDecodeQualityScore(result.payload?.decodeStats);
        const fallbackScore = computeDecodeQualityScore(fallbackResult.payload?.decodeStats);
        const primaryScoreSafe = Number.isFinite(primaryScore) ? primaryScore : -999;
        const fallbackScoreSafe = Number.isFinite(fallbackScore) ? fallbackScore : -999;
        const scoreDelta = fallbackScoreSafe - primaryScoreSafe;
        let winner = 'primary';
        let reason = 'quality-score';

        if (primaryLooksBlack && !fallbackLooksBlack) {
          winner = 'alternate';
          reason = 'suspected-black-frame';
        } else if (preservePrimaryGeometry && !primaryLooksBlack) {
          winner = 'primary';
          reason = 'geometry-stability';
        } else if (!primaryLooksBlack && fallbackLooksBlack) {
          winner = 'primary';
          reason = 'alternate-black-frame';
        } else if (
          !primaryLooksBlack &&
          !fallbackLooksBlack &&
          scoreDelta >= AB_SCORE_SWITCH_THRESHOLD
        ) {
          winner = 'alternate';
          reason = 'quality-score';
        } else if (
          !primaryLooksBlack &&
          !fallbackLooksBlack &&
          scoreDelta <= -AB_SCORE_SWITCH_THRESHOLD
        ) {
          winner = 'primary';
          reason = 'quality-score';
        } else if (!primaryLooksBlack && !fallbackLooksBlack) {
          winner = primaryScoreSafe >= fallbackScoreSafe ? 'primary' : 'alternate';
          reason = 'quality-tie-break';
        } else {
          winner = fallbackScoreSafe > primaryScoreSafe ? 'alternate' : 'primary';
          reason = 'both-black-frame';
        }

        const winnerPayload = winner === 'alternate' ? fallbackResult.payload : result.payload;
        const loserPayload = winner === 'alternate' ? result.payload : fallbackResult.payload;
        const winnerLooksBlack = isLikelyBlackDecodedFrame(winnerPayload?.decodeStats);
        const winnerWithDiagnostics = {
          ...winnerPayload,
          backendAbTest: buildBackendAbPayload({
            primaryPayload: result.payload,
            alternatePayload: fallbackResult.payload,
            winner,
            reason,
            diffHeatmap,
          }),
        };

        if (!winnerLooksBlack) {
          if (winner === 'alternate') {
            return {
              ok: true,
              payload: {
                ...winnerWithDiagnostics,
                fallbackReason: reason,
                fallbackFromBackend: result.payload?.backend ?? null,
                fallbackFromDecodeStats: result.payload?.decodeStats ?? null,
              },
            };
          }

          return {
            ok: true,
            payload: winnerWithDiagnostics,
          };
        }

        blackFrameCandidate = buildBlackFrameCandidate(winnerWithDiagnostics, loserPayload);
        continue;
      }

      if (!primaryLooksBlack) {
        return {
          ok: true,
          payload: {
            ...result.payload,
            backendAbTest: buildBackendAbPayload({
              primaryPayload: result.payload,
              winner: 'primary',
              reason: 'alternate-failed',
              alternateError: fallbackResult.error ?? null,
              diffHeatmap: null,
            }),
          },
        };
      }

      lastFailure = fallbackResult;
      blackFrameCandidate = buildBlackFrameCandidate(result.payload, fallbackResult.payload);
    }
  }

  return (
    blackFrameCandidate ??
    lastFailure ?? {
      ok: false,
      error: {
        code: 'RAW_DECODER_MISSING',
        message: 'Brak aktywnego dekodera RAW na serwerze.',
      },
      payload: FALLBACK_CAPABILITIES,
    }
  );
}

self.addEventListener('message', (event) => {
  const { id, type, payload } = event.data ?? {};

  if (!id || !type) {
    return;
  }

  if (type === 'probe') {
    probeRawDecoder(payload?.baseUrl ?? '/').then((capabilities) => {
      self.postMessage({
        id,
        ok: true,
        payload: capabilities,
      });
    });
    return;
  }

  if (type === 'decode') {
    decodeRawWithConfiguredAdapter(
      getRawDecodeAdapterIdFromEnv(),
      payload?.file,
      decodeRawWithLocalBridge,
      {
        renderIntent: payload?.renderIntent ?? 'preview',
        baseUrl: payload?.baseUrl ?? '/',
        backendPreference: payload?.backendPreference ?? null,
      }
    )
      .then((result) => {
        if (result.ok && result.payload?.buffer) {
          return applyRaw2dRecovery(result.payload.buffer, result.payload.mimeType || 'image/png')
            .then(async (recovery) => {
              const nextBuffer = recovery?.buffer instanceof ArrayBuffer ? recovery.buffer : result.payload.buffer;
              const nextMime = recovery?.mimeType || result.payload.mimeType || 'image/png';
              const nextDecodeStats = await computeDecodeStats(nextBuffer, nextMime);
              const nextPayload = {
                ...result.payload,
                buffer: nextBuffer,
                mimeType: nextMime,
                decodeStats: nextDecodeStats ?? result.payload.decodeStats ?? null,
                rawRecovery2d: recovery?.metrics ?? null,
              };
              self.postMessage(
                {
                  id,
                  ok: true,
                  payload: nextPayload,
                },
                [nextPayload.buffer]
              );
            })
            .catch(() => {
              self.postMessage(
                {
                  id,
                  ok: true,
                  payload: result.payload,
                },
                [result.payload.buffer]
              );
            });
        }

        self.postMessage({
          id,
          ok: false,
          error: result.error,
          payload: {
            ...FALLBACK_CAPABILITIES,
            ...(result.payload ?? {}),
            fileName: payload?.fileName ?? '',
          },
        });
      })
      .catch((error) => {
        self.postMessage({
          id,
          ok: false,
          error: {
            code: 'RAW_DECODE_FAILED',
            message:
              error instanceof Error
                ? error.message
                : 'Nie udało się zdekodować pliku RAW/DNG.',
          },
          payload: {
            ...FALLBACK_CAPABILITIES,
            fileName: payload?.fileName ?? '',
          },
        });
      });
  }
});
