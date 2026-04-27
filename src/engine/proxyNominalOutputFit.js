import { fitSourceInsideMaxTextureEdge } from './proxySourceDownscale.js';

/**
 * Nominalne wymiary z `computeProxySize` zmniejszane do `maxTextureDimension2D` (WebGL2 / WebGPU).
 * Używane przez worker proxy; czysta funkcja do testów regresji.
 *
 * @param {number} nominalW
 * @param {number} nominalH
 * @param {number} maxTex2d — wynik `min(gl.MAX_TEXTURE_SIZE, …)`; gdy zero lub ujemne — brak znanego limitu.
 * @returns {{ w: number, h: number, max2d: number, fitted: boolean, requestedW: number, requestedH: number }}
 */
export function fitNominalToMaxTexture2dEdge(nominalW, nominalH, maxTex2d) {
  const max2d = Math.max(0, Math.floor(Number(maxTex2d) || 0));
  if (max2d < 1) {
    return {
      w: nominalW,
      h: nominalH,
      max2d,
      fitted: false,
      requestedW: nominalW,
      requestedH: nominalH,
    };
  }
  const f = fitSourceInsideMaxTextureEdge(nominalW, nominalH, max2d);
  return {
    w: f.width,
    h: f.height,
    max2d,
    fitted: f.width !== nominalW || f.height !== nominalH,
    requestedW: nominalW,
    requestedH: nominalH,
  };
}
