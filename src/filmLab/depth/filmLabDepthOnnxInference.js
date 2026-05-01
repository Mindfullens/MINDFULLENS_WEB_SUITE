/**
 * Opcjonalna inferencja mapy głębi (ONNX) — bez modelu zwraca null lub fallback z env.
 *
 * Kontrakt modelu (v1): pojedyncze wejście float32 RGB — **NCHW** `[1,3,H,W]` lub **NHWC** `[1,H,W,3]`
 * (wykrywane po metadanych: kanał `3` na pozycji 1 vs ostatniej).
 * Opcjonalnie `VITE_FILMLAB_DEPTH_ONNX_IMAGENET_NORM=1` — normalizacja ImageNet (jak wiele modeli MiDaS).
 * Wyjście: tensor wybierany przez env (`OUTPUT_NAME` / `OUTPUT_INDEX`), domyślnie pierwszy;
 * układ NCHW lub NHWC; wiele kanałów — `DEPTH_CHANNELS=first|mean`. Wartości min–max → [0,1].
 * Domyślnie inferencja ONNX próbuje Web Workera (`filmLabDepthOnnx.worker.js`), przy błędzie — fallback na główny wątek (WASM).
 * Wyłączenie workera: `VITE_FILMLAB_DEPTH_ONNX_MAIN_THREAD_ONLY=1` albo `VITE_FILMLAB_DEPTH_ONNX_USE_WORKER=0`.
 */

import { readEnvFlag, readEnvNegated } from '../runtimeEnv.js';
import { rgbRec709LumaUnit } from '../../engine/colorMathShared.js';
import {
  createOnnxInferenceSessionCached,
  fetchOnnxModelBufferCached,
  getOnnxRuntimeWebLazy,
} from '../onnx/filmLabOnnxRuntimeAdapter.js';
import { hashDepthProxyFloat32 } from './filmLabDepthProxyDigest.js';

/**
 * Worker jest domyślnie włączony gdy `Worker` jest dostępny — mniejsze blokady UI niż WASM na głównym wątku.
 *
 * @returns {boolean}
 */
export function shouldTryDepthOnnxWebWorker() {
  if (typeof globalThis.Worker !== 'function') {
    return false;
  }
  if (readEnvFlag(import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_MAIN_THREAD_ONLY)) {
    return false;
  }
  if (readEnvNegated(import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_USE_WORKER)) {
    return false;
  }
  return true;
}

function getDepthOnnxModelUrl() {
  const u = import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_MODEL_URL;
  return typeof u === 'string' && u.trim() !== '' ? u.trim() : '';
}

function getDepthOnnxOutputNameHint() {
  const s = import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_OUTPUT_NAME;
  return typeof s === 'string' && s.trim() !== '' ? s.trim() : '';
}

function getDepthOnnxOutputIndexHint() {
  const raw = import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_OUTPUT_INDEX;
  const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.floor(n);
}

/**
 * Agregacja kanałów przy wyjściu wielokanałowym NCHW/NHWC: pierwszy kanał lub średnia.
 *
 * @returns {'first' | 'mean'}
 */
export function getDepthChannelAggregate() {
  const v = String(import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_DEPTH_CHANNELS ?? 'first')
    .trim()
    .toLowerCase();
  return v === 'mean' ? 'mean' : 'first';
}

/**
 * Wybór tensora wyjścia po nazwie lub indeksie (domyślnie pierwszy).
 *
 * @param {Record<string, import('onnxruntime-web').Tensor> | null | undefined} outputs
 * @param {import('onnxruntime-web').InferenceSession | null | undefined} session
 * @returns {import('onnxruntime-web').Tensor | null}
 */
export function pickDepthOnnxOutputTensor(outputs, session) {
  if (!outputs || typeof outputs !== 'object') {
    return null;
  }
  const nameHint = getDepthOnnxOutputNameHint();
  if (nameHint && outputs[nameHint] && typeof outputs[nameHint]?.data !== 'undefined') {
    return outputs[nameHint];
  }
  const idx = getDepthOnnxOutputIndexHint();
  const names = session?.outputNames ?? [];
  if (idx != null && idx < names.length) {
    const k = names[idx];
    if (k && outputs[k]) {
      return outputs[k];
    }
  }
  const firstName = names[0] ?? Object.keys(outputs)[0];
  return firstName ? outputs[firstName] ?? null : null;
}

/**
 * @param {Float32Array} data
 * @param {number} h
 * @param {number} w
 * @param {number} c
 * @param {'first' | 'mean'} agg
 */
function fillNchwDepthPlane(data, h, w, c, agg) {
  const plane = new Float32Array(h * w);
  if (agg !== 'mean' || c <= 1) {
    plane.set(data.subarray(0, h * w));
    return plane;
  }
  const stride = h * w;
  for (let p = 0; p < stride; p += 1) {
    let sum = 0;
    for (let ci = 0; ci < c; ci += 1) {
      sum += data[ci * stride + p];
    }
    plane[p] = sum / c;
  }
  return plane;
}

/**
 * @param {Float32Array} data
 * @param {number} h
 * @param {number} w
 * @param {number} c
 * @param {'first' | 'mean'} agg
 */
function fillNhwcInterleavedDepthPlane(data, h, w, c, agg) {
  const plane = new Float32Array(h * w);
  if (c === 1) {
    for (let i = 0; i < h * w; i += 1) {
      plane[i] = data[i];
    }
    return plane;
  }
  if (agg === 'mean') {
    for (let yi = 0; yi < h; yi += 1) {
      for (let xi = 0; xi < w; xi += 1) {
        const p = yi * w + xi;
        let sum = 0;
        for (let cc = 0; cc < c; cc += 1) {
          sum += data[p * c + cc];
        }
        plane[p] = sum / c;
      }
    }
    return plane;
  }
  for (let yi = 0; yi < h; yi += 1) {
    for (let xi = 0; xi < w; xi += 1) {
      const p = yi * w + xi;
      plane[p] = data[p * c];
    }
  }
  return plane;
}

/**
 * Dłuższa krawędź preview nie przekracza tej wartości ( WASM / czas ).
 */
export function getDepthOnnxMaxInferenceSide() {
  const raw = import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_MAX_SIDE;
  const n = typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (Number.isFinite(n) && n >= 32 && n <= 4096) {
    return Math.floor(n);
  }
  return 768;
}

/**
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} maxSide
 * @returns {{ tw: number, th: number }}
 */
export function depthOnnxLetterboxTargetSize(imgW, imgH, maxSide) {
  const w = Math.max(1, Math.floor(imgW));
  const h = Math.max(1, Math.floor(imgH));
  const m = Math.max(w, h);
  const scale = m > maxSide ? maxSide / m : 1;
  return {
    tw: Math.max(1, Math.round(w * scale)),
    th: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * Rozwiązuje wymiary wejścia NCHW; symboliczne H/W → letterbox względem obrazu.
 *
 * @param {readonly (number|string|bigint)[] | null | undefined} rawDims
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} maxSide
 * @returns {{ dims: number[], tw: number, th: number } | null}
 */
function toOnnxDimNum(v) {
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

const nOkPositive = (x) => Number.isFinite(x) && x > 0;

/**
 * Rozpoznanie NCHW `[N,3,H,W]` vs NHWC `[N,H,W,3]` po kształcie metadanych.
 *
 * @param {readonly unknown[] | null | undefined} rawDims
 * @returns {'nchw' | 'nhwc' | null}
 */
export function classifyDepthOnnxRgbLayout(rawDims) {
  if (!Array.isArray(rawDims) || rawDims.length !== 4) {
    return null;
  }
  const d1 = toOnnxDimNum(rawDims[1]);
  const d3 = toOnnxDimNum(rawDims[3]);
  if (d1 === 3) return 'nchw';
  if (d3 === 3) return 'nhwc';
  return null;
}

/**
 * Rozwiązuje wymiary wejścia NCHW; symboliczne H/W → letterbox względem obrazu.
 *
 * @param {readonly (number|string|bigint)[] | null | undefined} rawDims
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} maxSide
 * @returns {{ layout: 'nchw', dims: number[], tw: number, th: number } | null}
 */
export function resolveDepthNchwInputDims(rawDims, imgW, imgH, maxSide) {
  if (!Array.isArray(rawDims) || rawDims.length !== 4) {
    return null;
  }
  const d1 = toOnnxDimNum(rawDims[1]);
  const d2 = toOnnxDimNum(rawDims[2]);
  const d3 = toOnnxDimNum(rawDims[3]);
  let th = nOkPositive(d2) ? Math.floor(d2) : null;
  let tw = nOkPositive(d3) ? Math.floor(d3) : null;
  const lb = depthOnnxLetterboxTargetSize(imgW, imgH, maxSide);
  if (th === null && tw === null) {
    th = lb.th;
    tw = lb.tw;
  } else if (th === null) {
    th = Math.max(1, Math.round((imgH / imgW) * tw));
  } else if (tw === null) {
    tw = Math.max(1, Math.round((imgW / imgH) * th));
  }
  const d0 = toOnnxDimNum(rawDims[0]);
  const n = nOkPositive(d0) ? Math.floor(d0) : 1;
  const c = nOkPositive(d1) ? Math.floor(d1) : 3;
  if (c !== 3) {
    return null;
  }
  return {
    layout: 'nchw',
    dims: [n, c, th, tw],
    tw,
    th,
  };
}

/**
 * Wejście NHWC `[N,H,W,3]`.
 *
 * @param {readonly (number|string|bigint)[] | null | undefined} rawDims
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} maxSide
 * @returns {{ layout: 'nhwc', dims: number[], tw: number, th: number } | null}
 */
export function resolveDepthNhwcInputDims(rawDims, imgW, imgH, maxSide) {
  if (!Array.isArray(rawDims) || rawDims.length !== 4) {
    return null;
  }
  const d1 = toOnnxDimNum(rawDims[1]);
  const d2 = toOnnxDimNum(rawDims[2]);
  const d3 = toOnnxDimNum(rawDims[3]);
  let th = nOkPositive(d1) ? Math.floor(d1) : null;
  let tw = nOkPositive(d2) ? Math.floor(d2) : null;
  const lb = depthOnnxLetterboxTargetSize(imgW, imgH, maxSide);
  if (th === null && tw === null) {
    th = lb.th;
    tw = lb.tw;
  } else if (th === null) {
    th = Math.max(1, Math.round((imgH / imgW) * tw));
  } else if (tw === null) {
    tw = Math.max(1, Math.round((imgW / imgH) * th));
  }
  const d0 = toOnnxDimNum(rawDims[0]);
  const n = nOkPositive(d0) ? Math.floor(d0) : 1;
  const c = nOkPositive(d3) ? Math.floor(d3) : 3;
  if (c !== 3) {
    return null;
  }
  return {
    layout: 'nhwc',
    dims: [n, th, tw, c],
    tw,
    th,
  };
}

function getForcedDepthOnnxInputLayout() {
  const v = String(import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_INPUT_LAYOUT ?? '')
    .trim()
    .toLowerCase();
  if (v === 'nchw' || v === 'nhwc') {
    return v;
  }
  return null;
}

/**
 * @param {readonly (number|string|bigint)[] | null | undefined} rawDims
 * @param {number} imgW
 * @param {number} imgH
 * @param {number} maxSide
 * @returns {{ layout: 'nchw' | 'nhwc', dims: number[], tw: number, th: number } | null}
 */
export function resolveDepthRgbInputDims(rawDims, imgW, imgH, maxSide) {
  const forced = getForcedDepthOnnxInputLayout();
  if (forced === 'nhwc') {
    return resolveDepthNhwcInputDims(rawDims, imgW, imgH, maxSide);
  }
  if (forced === 'nchw') {
    return resolveDepthNchwInputDims(rawDims, imgW, imgH, maxSide);
  }
  const kind = classifyDepthOnnxRgbLayout(rawDims);
  if (kind === 'nhwc') {
    return resolveDepthNhwcInputDims(rawDims, imgW, imgH, maxSide);
  }
  if (kind === 'nchw') {
    return resolveDepthNchwInputDims(rawDims, imgW, imgH, maxSide);
  }
  /** Bez „3” w kształcie (np. same `-1`) — domyślnie NCHW; ewentualnie `VITE_FILMLAB_DEPTH_ONNX_INPUT_LAYOUT=nhwc`. */
  return (
    resolveDepthNchwInputDims(rawDims, imgW, imgH, maxSide) ??
    resolveDepthNhwcInputDims(rawDims, imgW, imgH, maxSide)
  );
}

/**
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} h
 * @param {number} fx
 * @param {number} fy
 * @returns {[number, number, number]}
 */
function sampleBilinearRgb(data, w, h, fx, fy) {
  const x = Math.min(Math.max(fx, 0), w - 1);
  const y = Math.min(Math.max(fy, 0), h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const dx = x - x0;
  const dy = y - y0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const v00 = data[(y0 * w + x0) * 4 + c];
    const v10 = data[(y0 * w + x1) * 4 + c];
    const v01 = data[(y1 * w + x0) * 4 + c];
    const v11 = data[(y1 * w + x1) * 4 + c];
    out[c] = v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy;
  }
  return out;
}

/**
 * @param {ImageData} imageData
 * @param {number} tw
 * @param {number} th
 * @returns {Float32Array}
 */
export function buildNchwRgbFloat32ForDepth(imageData, tw, th) {
  const { data, width: w0, height: h0 } = imageData;
  const useImagenet = readEnvFlag(import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_IMAGENET_NORM);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const out = new Float32Array(3 * th * tw);
  for (let y = 0; y < th; y += 1) {
    for (let x = 0; x < tw; x += 1) {
      const srcX = ((x + 0.5) / tw) * w0 - 0.5;
      const srcY = ((y + 0.5) / th) * h0 - 0.5;
      const rgb = sampleBilinearRgb(data, w0, h0, srcX, srcY);
      for (let c = 0; c < 3; c += 1) {
        let v = rgb[c] / 255;
        if (useImagenet) {
          v = (v - mean[c]) / std[c];
        }
        out[c * th * tw + y * tw + x] = v;
      }
    }
  }
  return out;
}

/**
 * Tensor float32 **NHWC** `[1,H,W,3]` — kolejność pikseli jak TF.js / część ONNX.
 *
 * @param {ImageData} imageData
 * @param {number} tw
 * @param {number} th
 * @returns {Float32Array}
 */
export function buildNhwcRgbFloat32ForDepth(imageData, tw, th) {
  const { data, width: w0, height: h0 } = imageData;
  const useImagenet = readEnvFlag(import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_IMAGENET_NORM);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const out = new Float32Array(th * tw * 3);
  for (let y = 0; y < th; y += 1) {
    for (let x = 0; x < tw; x += 1) {
      const srcX = ((x + 0.5) / tw) * w0 - 0.5;
      const srcY = ((y + 0.5) / th) * h0 - 0.5;
      const rgb = sampleBilinearRgb(data, w0, h0, srcX, srcY);
      const base = (y * tw + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        let v = rgb[c] / 255;
        if (useImagenet) {
          v = (v - mean[c]) / std[c];
        }
        out[base + c] = v;
      }
    }
  }
  return out;
}

/**
 * @param {Float32Array} src
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} dstW
 * @param {number} dstH
 * @returns {Float32Array}
 */
export function resizeFloatMapBilinear(src, srcW, srcH, dstW, dstH) {
  const dst = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const sx = ((x + 0.5) / dstW) * srcW - 0.5;
      const sy = ((y + 0.5) / dstH) * srcH - 0.5;
      const vx = Math.min(Math.max(sx, 0), srcW - 1);
      const vy = Math.min(Math.max(sy, 0), srcH - 1);
      const x0 = Math.floor(vx);
      const y0 = Math.floor(vy);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const dx = vx - x0;
      const dy = vy - y0;
      const v00 = src[y0 * srcW + x0];
      const v10 = src[y0 * srcW + x1];
      const v01 = src[y1 * srcW + x0];
      const v11 = src[y1 * srcW + x1];
      dst[y * dstW + x] = v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy;
    }
  }
  return dst;
}

/**
 * @param {import('onnxruntime-web').Tensor} tensor
 * @param {'first' | 'mean'} [channelAggregate] domyślnie z env (`DEPTH_CHANNELS`)
 * @returns {{ plane: Float32Array, h: number, w: number } | null}
 */
export function extractDepthPlaneFromOnnxTensor(tensor, channelAggregate) {
  const agg = channelAggregate ?? getDepthChannelAggregate();
  const dimsRaw = tensor?.dims;
  if (!dimsRaw || typeof tensor?.data === 'undefined') {
    return null;
  }
  const dims = dimsRaw.map((v) => (typeof v === 'bigint' ? Number(v) : Number(v)));
  const raw = tensor.data;
  const data = raw instanceof Float32Array ? raw : new Float32Array(raw);

  let h = 0;
  let w = 0;

  if (dims.length === 4) {
    const d1 = Math.floor(dims[1]);
    const d2 = Math.floor(dims[2]);
    const d3 = Math.floor(dims[3]);
    const smallChannelDim = (x) => x >= 1 && x <= 4;
    const spatialOk = (a, b) => a >= 2 && b >= 2;

    /**
     * Priorytet: jawny kanał torch `[N,1,H,W]` / `[N,3,H,W]` vs TF `[N,H,W,1]` / `[N,H,W,3]`,
     * potem konflikt `[N,4,4,3]` → kanał na końcu (NHWC).
     */
    const tryNchw =
      (d1 === 3 || d1 === 1) && spatialOk(d2, d3) && data.length >= d1 * d2 * d3;
    const tryNhwc =
      (d3 === 3 || d3 === 1) && spatialOk(d1, d2) && data.length >= d1 * d2 * d3;

    if (tryNhwc && !(tryNchw && (d1 === 3 || d1 === 1))) {
      const c = Math.max(1, d3);
      h = d1;
      w = d2;
      if (h <= 0 || w <= 0 || data.length < h * w * c) {
        return null;
      }
      const plane = fillNhwcInterleavedDepthPlane(data, h, w, c, agg);
      return { plane, h, w };
    }

    if (tryNchw || (smallChannelDim(d1) && spatialOk(d2, d3) && !(spatialOk(d1, d2) && smallChannelDim(d3)))) {
      const c = Math.max(1, d1);
      h = d2;
      w = d3;
      if (h <= 0 || w <= 0 || data.length < c * h * w) {
        return null;
      }
      const plane = fillNchwDepthPlane(data, h, w, c, agg);
      return { plane, h, w };
    }

    if (spatialOk(d1, d2) && smallChannelDim(d3) && data.length >= d1 * d2 * d3) {
      const c = Math.max(1, d3);
      h = d1;
      w = d2;
      const plane = fillNhwcInterleavedDepthPlane(data, h, w, c, agg);
      return { plane, h, w };
    }

    return null;
  }

  if (dims.length === 3) {
    h = Math.floor(dims[1]);
    w = Math.floor(dims[2]);
    if (h <= 0 || w <= 0 || data.length < h * w) {
      return null;
    }
    const plane = new Float32Array(h * w);
    plane.set(data.subarray(0, h * w));
    return { plane, h, w };
  }

  if (dims.length === 2) {
    h = Math.floor(dims[0]);
    w = Math.floor(dims[1]);
    if (h <= 0 || w <= 0 || data.length < h * w) {
      return null;
    }
    const plane = new Float32Array(h * w);
    plane.set(data.subarray(0, h * w));
    return { plane, h, w };
  }

  return null;
}

/**
 * @param {Float32Array} buf in-place
 */
export function normalizeDepthPlane01(buf) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < buf.length; i += 1) {
    const v = buf[i];
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    buf.fill(0.5);
    return buf;
  }
  const inv = 1 / (max - min);
  for (let i = 0; i < buf.length; i += 1) {
    buf[i] = Math.max(0, Math.min(1, (buf[i] - min) * inv));
  }
  return buf;
}

/**
 * Materializacja proxy z luminancji sceny (test toru ONNX / ten sam kształt co produkcja).
 *
 * @param {ImageData} imageData
 * @returns {{ buffer: Float32Array, digest: string }}
 */
export function buildLuminanceDepthProxyFromImageData(imageData) {
  const { data, width, height } = imageData;
  const buf = new Float32Array(width * height);
  for (let p = 0; p < buf.length; p += 1) {
    const i = p * 4;
    buf[p] = rgbRec709LumaUnit(data[i], data[i + 1], data[i + 2]);
  }
  return {
    buffer: buf,
    digest: hashDepthProxyFloat32(buf),
  };
}

/**
 * @typedef {{ ok: true, buffer: Float32Array, digest: string, via: 'onnx' | 'onnx_worker' | 'luma_env' }} DepthOnnxInferOk
 * @typedef {{ ok: false, reason: string }} DepthOnnxInferErr
 * Rdzeń ONNX na bieżącym wątku (w tym worker — ten sam kod co wcześniej w `inferDepthProxyBufferFromImageData`).
 *
 * @param {ImageData | { data: Uint8ClampedArray, width: number, height: number }} imageData
 * @returns {Promise<DepthOnnxInferOk | DepthOnnxInferErr>}
 */
export async function runDepthOnnxInferenceFromImageData(imageData) {
  const modelUrl = getDepthOnnxModelUrl();
  if (!modelUrl) {
    return { ok: false, reason: 'no_model_url' };
  }

  const ort = await getOnnxRuntimeWebLazy();
  if (!ort?.InferenceSession || !ort?.Tensor) {
    return { ok: false, reason: 'ort_unavailable' };
  }

  let buffer;
  try {
    buffer = await fetchOnnxModelBufferCached(modelUrl);
  } catch {
    return { ok: false, reason: 'fetch_failed' };
  }

  let session;
  try {
    session = await createOnnxInferenceSessionCached(modelUrl, buffer, ort);
  } catch {
    return { ok: false, reason: 'session_failed' };
  }

  const names = session.inputNames ?? [];
  if (names.length !== 1) {
    return { ok: false, reason: 'inputs_not_supported' };
  }
  const inputName = names[0];
  const meta = session.inputMetadata?.[inputName];
  const rawDims = meta?.dimensions ?? meta?.shape;
  const maxSide = getDepthOnnxMaxInferenceSide();
  const resolved = resolveDepthRgbInputDims(rawDims, imageData.width, imageData.height, maxSide);
  if (!resolved) {
    return { ok: false, reason: 'tensor_layout_failed' };
  }

  let inputData;
  try {
    inputData =
      resolved.layout === 'nhwc'
        ? buildNhwcRgbFloat32ForDepth(imageData, resolved.tw, resolved.th)
        : buildNchwRgbFloat32ForDepth(imageData, resolved.tw, resolved.th);
  } catch {
    return { ok: false, reason: 'tensor_build_failed' };
  }

  const feeds = {
    [inputName]: new ort.Tensor('float32', inputData, resolved.dims),
  };

  let outputs;
  try {
    outputs = await session.run(feeds);
  } catch {
    return { ok: false, reason: 'run_failed' };
  }

  const outTensor = pickDepthOnnxOutputTensor(outputs, session);
  if (!outTensor) {
    return { ok: false, reason: 'output_missing' };
  }
  const channelAgg = getDepthChannelAggregate();
  const extracted = extractDepthPlaneFromOnnxTensor(outTensor, channelAgg);
  if (!extracted) {
    return { ok: false, reason: 'output_extract_failed' };
  }

  const resized = resizeFloatMapBilinear(
    extracted.plane,
    extracted.w,
    extracted.h,
    imageData.width,
    imageData.height
  );
  normalizeDepthPlane01(resized);

  if (resized.length !== imageData.width * imageData.height) {
    return { ok: false, reason: 'wrong_output_length' };
  }

  return {
    ok: true,
    buffer: resized,
    digest: hashDepthProxyFloat32(resized),
    via: 'onnx',
  };
}

/**
 * Wynik dla UI / silnika (nie tylko `null`).
 *
 * @param {ImageData | null | undefined} imageData
 * @returns {Promise<DepthOnnxInferOk | DepthOnnxInferErr>}
 */
export async function inferDepthProxyBufferFromImageData(imageData) {
  if (!imageData?.data || imageData.width < 2 || imageData.height < 2) {
    return { ok: false, reason: 'invalid_input' };
  }

  if (readEnvFlag(import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_USE_LUMA_FALLBACK)) {
    const { buffer, digest } = buildLuminanceDepthProxyFromImageData(imageData);
    return { ok: true, buffer, digest, via: 'luma_env' };
  }

  const modelUrl = getDepthOnnxModelUrl();
  if (!modelUrl) {
    return { ok: false, reason: 'no_model_url' };
  }

  if (shouldTryDepthOnnxWebWorker()) {
    try {
      const { inferDepthProxyBufferFromImageDataViaWorker } = await import('./filmLabDepthOnnxWorkerClient.js');
      const out = await inferDepthProxyBufferFromImageDataViaWorker(imageData);
      return out;
    } catch {
      // fallback: WASM na głównym wątku
    }
  }

  return runDepthOnnxInferenceFromImageData(imageData);
}
