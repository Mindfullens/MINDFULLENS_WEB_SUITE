/**
 * Wspólna logika z `assertProxyFrameFits*Limits` w renderach WebGL2 / WebGPU (proxy).
 * Gdy `maxTex3d` ≤ 0 — limit nieznany, zwracamy false (zachowanie jak w rendererach: brak wczesnej walidacji).
 */

/**
 * @param {number} profileLutS — rozmiar sześcianu profilu (0 = brak)
 * @param {number} lookLutS — rozmiar sześcianu look (0 = brak)
 * @param {number} maxTex3d
 * @returns {boolean}
 */
export function wouldProxy3dLutsExceedMaxTexEdge(profileLutS, lookLutS, maxTex3d) {
  const M = Math.max(0, Math.floor(Number(maxTex3d) || 0));
  if (M < 1) {
    return false;
  }
  const pS = Math.floor(Number(profileLutS) || 0);
  const lS = Math.floor(Number(lookLutS) || 0);
  return (pS > 1 && pS > M) || (lS > 1 && lS > M);
}
