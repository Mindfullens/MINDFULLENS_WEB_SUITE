/**
 * Timeout `requestIdleCallback` (ms) — domyślnie 480; `VITE_FILMLAB_DEPTH_ONNX_IDLE_TIMEOUT_MS`.
 *
 * @returns {number}
 */
export function getDepthOnnxIdleCallbackTimeoutMs() {
  const raw = import.meta.env?.VITE_FILMLAB_DEPTH_ONNX_IDLE_TIMEOUT_MS;
  const n =
    typeof raw === 'string'
      ? Number(raw.trim())
      : typeof raw === 'number'
        ? Number(raw)
        : NaN;
  if (Number.isFinite(n) && n >= 0 && n <= 120_000) {
    return Math.floor(n);
  }
  return 480;
}

/**
 * Odkłada start inferencji ONNX (WASM na głównym wątku) na moment „idle”,
 * żeby przeglądarka zdążyła pomalować klatkę po interakcji / zmianie podglądu.
 * Pełny offload do Web Workera = osobna iteracja (bundle ort + transfer).
 *
 * @param {() => void} fn
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {() => void} anuluj zaplanowane wywołanie (idle lub timeout)
 */
export function scheduleDepthOnnxInferOnIdle(fn, opts = {}) {
  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs) && opts.timeoutMs >= 0
      ? opts.timeoutMs
      : getDepthOnnxIdleCallbackTimeoutMs();

  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(
      () => {
        fn();
      },
      { timeout: timeoutMs }
    );
    return () => {
      if (typeof globalThis.cancelIdleCallback === 'function') {
        globalThis.cancelIdleCallback(id);
      }
    };
  }

  const t = globalThis.setTimeout(fn, 0);
  return () => globalThis.clearTimeout(t);
}
