/**
 * Pomniejszanie wejścia (RGBA8) do limitu 2D GPU — wspólne dla `proxyRenderWorker` i testów regresji.
 * Bez zależności od workera / DOM.
 */

/**
 * Szer. × wys. w obu osiach ≤ `maxEdge` (ten sam wzorzec co `computeProxySize` w workera).
 * @param {number} sw
 * @param {number} sh
 * @param {number} maxEdge
 * @returns {{ width: number, height: number }}
 */
export function fitSourceInsideMaxTextureEdge(sw, sh, maxEdge) {
  const m = Math.max(1, Math.floor(maxEdge));
  if (sw <= m && sh <= m) {
    return { width: sw, height: sh };
  }
  const ratio = Math.min(m / sw, m / sh);
  return {
    width: Math.max(1, Math.round(sw * ratio)),
    height: Math.max(1, Math.round(sh * ratio)),
  };
}

/**
 * Maks. liczba pikseli w buforze po downscale (RGBA8) — poniżej typowego progu OOM w workerze (~0,8–1G).
 * Gdy `fit` daje więcej, worker nie alokuje; render pada na ścieżkę CPU.
 */
export const MAX_DOWNSCALE_OUTPUT_PIXELS = 200_000_000;

/**
 * Czy wynik `fit` mieści się w bufcie worker-safe (piksele × 4 bajty).
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
export function isDownscaleOutputWithinPixelBudget(width, height) {
  const w = Math.max(0, Math.floor(Number(width) || 0));
  const h = Math.max(0, Math.floor(Number(height) || 0));
  const p = w * h;
  if (p > Number.MAX_SAFE_INTEGER || p < 1) {
    return false;
  }
  return p <= MAX_DOWNSCALE_OUTPUT_PIXELS;
}

/**
 * Pobiliniowe RGBA8 do zadanego rozmiaru.
 * @param {() => boolean} isCancelled
 * @returns {Uint8ClampedArray | null}
 */
export function downscaleRgba8Bilinear(src, sw, sh, dw, dh, isCancelled) {
  if (sw === dw && sh === dh) {
    if (src.length !== sw * sh * 4) {
      return null;
    }
    return new Uint8ClampedArray(src);
  }
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xRatio = sw / dw;
  const yRatio = sh / dh;
  for (let y = 0; y < dh; y += 1) {
    if ((y & 15) === 0 && isCancelled()) {
      return null;
    }
    const sy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(sh - 1, y0 + 1));
    const fy = Math.min(1, Math.max(0, sy - y0));
    const row0 = y0 * sw * 4;
    const row1 = y1 * sw * 4;
    for (let x = 0; x < dw; x += 1) {
      const sx = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(sw - 1, x0 + 1));
      const fx = Math.min(1, Math.max(0, sx - x0));
      const o = (y * dw + x) * 4;
      const a00 = row0 + x0 * 4;
      const a10 = row0 + x1 * 4;
      const a01 = row1 + x0 * 4;
      const a11 = row1 + x1 * 4;
      for (let c = 0; c < 4; c += 1) {
        out[o + c] = Math.round(
          src[a00 + c] * (1 - fx) * (1 - fy) +
            src[a10 + c] * fx * (1 - fy) +
            src[a01 + c] * (1 - fx) * fy +
            src[a11 + c] * fx * fy
        );
      }
    }
  }
  return out;
}

/**
 * Uśrednienie 2×2 → 1 (box half).
 * @param {() => boolean} isCancelled
 * @returns {{ pixels: Uint8ClampedArray, width: number, height: number } | null}
 */
export function downscaleRgba8BoxHalf(src, sw, sh, isCancelled) {
  const dw = Math.max(1, (sw + 1) >> 1);
  const dh = Math.max(1, (sh + 1) >> 1);
  if (dw === sw && dh === sh) {
    if (src.length !== sw * sh * 4) {
      return null;
    }
    return { pixels: new Uint8ClampedArray(src), width: sw, height: sh };
  }
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    if ((y & 7) === 0 && isCancelled()) {
      return null;
    }
    for (let x = 0; x < dw; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        const sy = Math.min(y * 2 + dy, sh - 1);
        for (let dx = 0; dx < 2; dx += 1) {
          const sx = Math.min(x * 2 + dx, sw - 1);
          const i = (sy * sw + sx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
          n += 1;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return { pixels: out, width: dw, height: dh };
}

/**
 * Łańcuch box half, potem finalny bilinear.
 * @param {() => boolean} isCancelled
 * @returns {Uint8ClampedArray | null}
 */
export function downscaleRgba8ToTargetStaged(src, sw, sh, dw, dh, isCancelled) {
  if (sw === dw && sh === dh) {
    if (src.length !== sw * sh * 4) {
      return null;
    }
    return new Uint8ClampedArray(src);
  }
  if (Math.max(sw / dw, sh / dh) <= 2) {
    return downscaleRgba8Bilinear(src, sw, sh, dw, dh, isCancelled);
  }
  let cur = src;
  let cw = sw;
  let ch = sh;
  for (let step = 0; step < 32; step += 1) {
    if (isCancelled()) {
      return null;
    }
    if (Math.max(cw / dw, ch / dh) <= 2) {
      break;
    }
    if (cw <= dw && ch <= dh) {
      break;
    }
    const half = downscaleRgba8BoxHalf(cur, cw, ch, isCancelled);
    if (!half) {
      return null;
    }
    if (half.width === cw && half.height === ch) {
      break;
    }
    cur = half.pixels;
    cw = half.width;
    ch = half.height;
  }
  return downscaleRgba8Bilinear(cur, cw, ch, dw, dh, isCancelled);
}
