/**
 * Nominal 2D output size of the worker proxy before GPU 2D/3D limit fitting.
 * Used by `proxyRenderWorker` — single source of truth (§5.1 plan: CPU/proxy alignment).
 */
export const DEFAULT_PROXY_MAX = 1024;

/**
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} proxyMax — long-edge budget (from `getWorkerProxyMaxDimension` + interactive scaling)
 * @returns {{ width: number, height: number }}
 */
export function computeProxySize(sourceWidth, sourceHeight, proxyMax) {
  const maxEdge = Math.max(320, Math.round(proxyMax || DEFAULT_PROXY_MAX));

  if (sourceWidth <= maxEdge && sourceHeight <= maxEdge) {
    return {
      width: sourceWidth,
      height: sourceHeight,
    };
  }

  const ratio = Math.min(maxEdge / sourceWidth, maxEdge / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * ratio)),
    height: Math.max(1, Math.round(sourceHeight * ratio)),
  };
}

/**
 * Optional: bump `proxyMax` so that {@link computeProxySize} does not shrink below the
 * preview `sourceCanvas` (main thread and worker then share the same working resolution
 * before GPU 2D/3D limits). Heavier during drag. Enable with `VITE_FILMLAB_PROXY_MATCH_PREVIEW=1`.
 *
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} baseProxyMax from `getWorkerProxyMaxDimension` (after interactive scale when dragging)
 * @param {{ matchPreviewBuffer?: boolean }} [options]
 * @returns {number}
 */
export function resolveProxyMaxForPreviewBuffer(
  sourceWidth,
  sourceHeight,
  baseProxyMax,
  options = {}
) {
  const { matchPreviewBuffer = false } = options;
  const sw = Math.max(0, Math.round(Number(sourceWidth) || 0));
  const sh = Math.max(0, Math.round(Number(sourceHeight) || 0));
  const base = Math.max(0, Number(baseProxyMax) || 0);
  if (!matchPreviewBuffer || sw <= 0 || sh <= 0) {
    return base;
  }
  return Math.max(Math.max(sw, sh), base);
}

/**
 * Wspólny wynik: `proxyMax` (po ewent. match bufora) + nominalne `width`×`height` jak w `proxyRenderWorker` / workbench.
 * Do telemetrii CPU (§5.1.1.2) i jednego miejsca wywołań w silniku.
 *
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} baseProxyMax z `getWorkerProxyMaxDimension` (+ interakcja, jeśli stosowana wcześniej)
 * @param {{ matchPreviewBuffer?: boolean }} [options]
 * @returns {{ width: number, height: number, proxyMax: number }}
 */
export function getNominalProxyRenderSize(sourceWidth, sourceHeight, baseProxyMax, options = {}) {
  const proxyMax = resolveProxyMaxForPreviewBuffer(
    sourceWidth,
    sourceHeight,
    baseProxyMax,
    options
  );
  const { width, height } = computeProxySize(sourceWidth, sourceHeight, proxyMax);
  return { width, height, proxyMax };
}
