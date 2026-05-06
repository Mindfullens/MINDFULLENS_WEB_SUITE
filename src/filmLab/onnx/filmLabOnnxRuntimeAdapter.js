/**
 * ONNX Runtime Web — lazy import, cache modelu/sesji/wyników inferencji dla maski semantycznej.
 * Bez `VITE_FILMLAB_ONNX_MODEL_URL` lub przy błędzie — zwracamy `null` → worker / fallback (`localMaskAiAssist.js`).
 */

import {
  analyzeLocalMaskAiAssistPresetSync,
  buildAiAssistMaskWithConfidence,
} from '../localMaskAiAssistCore.js';

let onnxRuntimeModulePromise = null;
let onnxRuntimeLoadFailed = false;

/** @type {Map<string, Promise<ArrayBuffer>>} */
const modelBufferPromises = new Map();
/** @type {Map<string, Promise<import('onnxruntime-web').InferenceSession>>} */
const inferenceSessionPromises = new Map();

const ONNX_INFERENCE_CACHE_MAX = 32;
/** @type {Map<string, { mask: object, confidence: number, backend: string }>} */
const onnxInferenceResultCache = new Map();

/**
 * @returns {Promise<typeof import('onnxruntime-web') | null>}
 */
export async function getOnnxRuntimeWebLazy() {
  if (onnxRuntimeLoadFailed) {
    return null;
  }
  if (!onnxRuntimeModulePromise) {
    onnxRuntimeModulePromise = import('onnxruntime-web')
      .then((m) => m)
      .catch(() => {
        onnxRuntimeLoadFailed = true;
        return null;
      });
  }
  return onnxRuntimeModulePromise;
}

/**
 * Publiczny URL modelu ONNX (opcjonalny). Bez niego zawsze `null` → fallback.
 */
export function getConfiguredOnnxModelUrl() {
  const u = import.meta.env?.VITE_FILMLAB_ONNX_MODEL_URL;
  return typeof u === 'string' && u.trim() !== '' ? u.trim() : null;
}

/**
 * Rozmiar zastępujący symboliczne / nieznane wymiary wejścia (np. H=W).
 */
export function getConfiguredOnnxDynamicSpatialSize() {
  const raw = import.meta.env?.VITE_FILMLAB_ONNX_DYNAMIC_SPATIAL;
  const n = typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (Number.isFinite(n) && n >= 16 && n <= 4096) {
    return Math.floor(n);
  }
  return 256;
}

/**
 * Stabilny klucz cache dla payloadu + URL modelu (eksportowany pod testy regresji).
 *
 * @param {string} modelUrl
 * @param {{ kind?: string, maskIndex?: number, activeCropRectNorm?: object }} payload
 */
export function buildOnnxSemanticCacheKey(modelUrl, payload) {
  const c = payload?.activeCropRectNorm ?? {};
  const q = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return String(Math.round(n * 10000) / 10000);
  };
  const crop = `${q(c.x)},${q(c.y)},${q(c.w)},${q(c.h)}`;
  return `${modelUrl}\u0000${String(payload?.kind ?? '')}\u0000${Number(payload?.maskIndex ?? 0)}\u0000${crop}`;
}

function trimOnnxInferenceCache() {
  while (onnxInferenceResultCache.size > ONNX_INFERENCE_CACHE_MAX) {
    const firstKey = onnxInferenceResultCache.keys().next().value;
    if (firstKey === undefined) {
      break;
    }
    onnxInferenceResultCache.delete(firstKey);
  }
}

function cloneInferenceResult(entry) {
  return {
    mask: structuredClone(entry.mask),
    confidence: entry.confidence,
    backend: entry.backend,
  };
}

/**
 * @param {string} modelUrl
 * @returns {Promise<ArrayBuffer>}
 */
/** Eksport pod Film Lab depth ONNX (wspólny cache fetch + sesji po URL). */
export async function fetchOnnxModelBufferCached(modelUrl) {
  return fetchModelBufferCached(modelUrl);
}

/** Eksport pod Film Lab depth ONNX — ta sama cache co maska semantyczna, osobny URL modelu. */
export async function createOnnxInferenceSessionCached(modelUrl, buffer, ort) {
  return createInferenceSessionCached(modelUrl, buffer, ort);
}

async function fetchModelBufferCached(modelUrl) {
  let p = modelBufferPromises.get(modelUrl);
  if (!p) {
    p = (async () => {
      const res = await fetch(modelUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) {
        throw new Error(`ONNX model fetch failed: ${res.status}`);
      }
      return res.arrayBuffer();
    })();
    modelBufferPromises.set(modelUrl, p);
  }
  return p;
}

/**
 * @param {string} modelUrl
 * @param {ArrayBuffer} buffer
 * @param {typeof import('onnxruntime-web')} ort
 */
async function createInferenceSessionCached(modelUrl, buffer, ort) {
  let p = inferenceSessionPromises.get(modelUrl);
  if (!p) {
    p = ort.InferenceSession.create(new Uint8Array(buffer), {
      executionProviders: ['wasm'],
    });
    inferenceSessionPromises.set(modelUrl, p);
  }
  return p;
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(1, n));
}

/**
 * Best-effort: treat first spatial output as per-pixel mask logits / probabilities (ONNX semantic seg).
 */
function tryExtractSpatialAlphaFromOnnxTensor(tensor) {
  const data = tensor?.data;
  if (!data || typeof data.length !== 'number' || data.length < 4) {
    return null;
  }
  const dims = Array.isArray(tensor.dims) ? tensor.dims.map((d) => (typeof d === 'bigint' ? Number(d) : Number(d))) : [];
  let w = 0;
  let h = 0;
  if (dims.length >= 2) {
    h = Math.floor(dims[dims.length - 2]);
    w = Math.floor(dims[dims.length - 1]);
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2 || w * h > data.length) {
    const n = data.length;
    const s = Math.floor(Math.sqrt(n));
    if (s < 2 || s * s !== n) {
      return null;
    }
    w = s;
    h = s;
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    let v = Number(data[i]);
    if (!Number.isFinite(v)) {
      v = 0;
    }
    if (v < 0 || v > 1) {
      v = clamp01(1 / (1 + Math.exp(-v)));
    } else {
      v = clamp01(v);
    }
    out[i] = v;
  }
  return { width: w, height: h, data: out };
}

/**
 * Skalar pewności z pierwszego wyjścia (średnia z wartości tensora; logity ~ squash).
 *
 * @param {import('onnxruntime-web').Tensor} tensor
 * @returns {number}
 */
export function onnxOutputTensorToConfidenceScalar(tensor) {
  const data = tensor?.data;
  if (!data || typeof data.length !== 'number' || data.length === 0) {
    return 0.5;
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  const len = data.length;
  for (let i = 0; i < len; i += 1) {
    const v = Number(data[i]);
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / len;
  if (min >= 0 && max <= 1) {
    return clamp01(mean);
  }
  return clamp01(1 / (1 + Math.exp(-mean)));
}

function tensorElementCount(dims) {
  let n = 1;
  for (let i = 0; i < dims.length; i += 1) {
    n *= dims[i];
  }
  return n;
}

function normalizeInputDims(rawDims, spatialDefault) {
  if (!Array.isArray(rawDims) || rawDims.length === 0) {
    return null;
  }
  const out = [];
  for (let i = 0; i < rawDims.length; i += 1) {
    let d = rawDims[i];
    if (typeof d === 'bigint') {
      d = Number(d);
    }
    if (typeof d === 'string') {
      d = Number.NaN;
    }
    const n = Number(d);
    if (!Number.isFinite(n) || n <= 0 || n === -1) {
      if (i === 0) {
        out.push(1);
      } else if (rawDims.length === 4 && i === 1) {
        out.push(3);
      } else {
        out.push(spatialDefault);
      }
    } else {
      out.push(Math.floor(n));
    }
  }
  return out;
}

function deterministicSeed01(payload, salt) {
  const s = `${payload?.kind}|${payload?.maskIndex}|${JSON.stringify(payload?.activeCropRectNorm ?? {})}|${salt}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10001) / 10000;
}

/**
 * @param {typeof import('onnxruntime-web')} ort
 * @param {import('onnxruntime-web').InferenceSession} session
 * @param {{ kind: string, maskIndex: number, activeCropRectNorm?: object }} payload
 */
function buildFeedsForSession(ort, session, payload) {
  const spatial = getConfiguredOnnxDynamicSpatialSize();
  const feeds = {};
  const names = session.inputNames ?? [];
  for (let i = 0; i < names.length; i += 1) {
    const inputName = names[i];
    const meta = session.inputMetadata?.[inputName];
    const rawDims = meta?.dimensions ?? meta?.shape;
    const dims = normalizeInputDims(rawDims, spatial);
    if (!dims) {
      return null;
    }
    const count = tensorElementCount(dims);
    if (count <= 0 || count > 200_000_000) {
      return null;
    }
    const fill = deterministicSeed01(payload, `${inputName}|${i}`);
    const data = new Float32Array(count);
    data.fill(fill);
    feeds[inputName] = new ort.Tensor('float32', data, dims);
  }
  return feeds;
}

function mergeHeuristicAndOnnxConfidence(heuristic, onnxScalar) {
  const h = clamp01(heuristic);
  const o = clamp01(onnxScalar);
  return clamp01(h * 0.35 + o * 0.65);
}

/**
 * @param {{ kind: string, maskIndex: number, activeCropRectNorm?: object }} payload
 * @returns {Promise<{ mask: object, confidence: number, backend: string } | null>}
 */
export async function trySemanticAiMaskOnnxAnalysis(payload) {
  const modelUrl = getConfiguredOnnxModelUrl();
  if (!modelUrl) {
    return null;
  }
  const cacheKey = buildOnnxSemanticCacheKey(modelUrl, payload);
  const cached = onnxInferenceResultCache.get(cacheKey);
  if (cached) {
    return cloneInferenceResult(cached);
  }

  const ort = await getOnnxRuntimeWebLazy();
  if (!ort?.InferenceSession || !ort?.Tensor) {
    return null;
  }

  let buffer;
  try {
    buffer = await fetchModelBufferCached(modelUrl);
  } catch {
    return null;
  }

  let session;
  try {
    session = await createInferenceSessionCached(modelUrl, buffer, ort);
  } catch {
    return null;
  }

  const feeds = buildFeedsForSession(ort, session, payload);
  if (!feeds || Object.keys(feeds).length === 0) {
    return null;
  }

  let outputs;
  try {
    outputs = await session.run(feeds);
  } catch {
    return null;
  }

  const outNames = session.outputNames ?? [];
  const firstOutName = outNames[0] ?? Object.keys(outputs ?? {})[0];
  const firstTensor = firstOutName ? outputs?.[firstOutName] : null;
  if (!firstTensor || typeof firstTensor.data === 'undefined') {
    return null;
  }

  const onnxConf = onnxOutputTensorToConfidenceScalar(firstTensor);
  const sync = analyzeLocalMaskAiAssistPresetSync(payload);
  const merged = mergeHeuristicAndOnnxConfidence(sync.confidence, onnxConf);
  const built = buildAiAssistMaskWithConfidence(payload, merged);
  const spatialAlpha = tryExtractSpatialAlphaFromOnnxTensor(firstTensor);
  if (spatialAlpha) {
    built.mask.rasterAlpha = spatialAlpha;
    built.mask.mode = 'brush';
    built.mask.brush = {
      ...(built.mask.brush && typeof built.mask.brush === 'object' ? built.mask.brush : {}),
      strokes: [],
    };
  }

  const result = {
    mask: built.mask,
    confidence: built.confidence,
    backend: 'onnx',
  };
  onnxInferenceResultCache.set(cacheKey, {
    mask: structuredClone(result.mask),
    confidence: result.confidence,
    backend: result.backend,
  });
  trimOnnxInferenceCache();

  return result;
}
