/**
 * Wspólna logika z `assertProxyFrameFits*Limits` w renderach WebGL2 / WebGPU (2D):
 * czy `width` × `height` przekraczają maks. krawdź tekstury 2D.
 * Gdy `maxTex2d` ≤ 0 — limit nieznany, zwracamy false.
 *
 * W workerze (ścieżka GPU) wymiary wyjścia są dopasowywane przez
 * `fitSourceInsideMaxTextureEdge` w `renderProxyFrameGpu` — tutaj tylko asercja w renderach.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} maxTex2d
 * @returns {boolean}
 */
export function doesRectExceedMaxTexture2dEdge(width, height, maxTex2d) {
  const M = Math.max(0, Math.floor(Number(maxTex2d) || 0));
  if (M < 1) {
    return false;
  }
  const w = Math.max(0, Math.floor(Number(width) || 0));
  const h = Math.max(0, Math.floor(Number(height) || 0));
  return w > M || h > M;
}
