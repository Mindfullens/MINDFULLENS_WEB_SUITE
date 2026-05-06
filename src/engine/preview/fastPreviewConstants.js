/**
 * Metadane ścieżki szybkiego podglądu (główny wątek). Wejście obrazu: `texImage2D` LDR 8 b/k.
 * Przy WebGL2 + FBO `rgba16f` atlas LUT/look może być `RGBA16F` + `HALF_FLOAT` (telemetria: `fastPreviewLutAtlasTexFormat`).
 * Sonda FBO: `webgl2Rgba16fFboProbe.js` — ten sam plik w workerze `proxyGpuRenderer` (§5.1.1.1).
 */
export const FAST_PREVIEW_MAIN_THREAD_SOURCE_TEX_FORMAT = 'rgba8';

/**
 * Pełna powierzchnia klatki w przestrzeni znormalizowanej 0–1 (lewy górny + szerokość/wysokość).
 * Docelowy tor kafelkowy: lista prostokątów ⊂ tej przestrzeni lub indeksy kafelków.
 */
export const FAST_PREVIEW_FULL_DAMAGE_NORM_RECT = Object.freeze({
  x: 0,
  y: 0,
  w: 1,
  h: 1,
});

/** Globalny grading / pełny przebieg — częściowy `damageNormRect` jest ignorowany. */
export const FAST_PREVIEW_DAMAGE_SCOPE_FULL = 'full';

/** Efekty przestrzennie lokalne (maska / pędzel) — przy braku FBO możliwy częściowy viewport. */
export const FAST_PREVIEW_DAMAGE_SCOPE_LOCAL = 'local';

const NORM_DAMAGE_EPS = 1e-5;

/**
 * @param {{ x?: unknown, y?: unknown, w?: unknown, h?: unknown } | null | undefined} rect
 */
export function isApproxFullNormDamageRect(rect) {
  if (!rect || typeof rect !== 'object') {
    return true;
  }
  const x = Number(rect.x);
  const y = Number(rect.y);
  const w = Number(rect.w);
  const h = Number(rect.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) {
    return true;
  }
  return (
    Math.abs(x) <= NORM_DAMAGE_EPS &&
    Math.abs(y) <= NORM_DAMAGE_EPS &&
    Math.abs(w - 1) <= NORM_DAMAGE_EPS &&
    Math.abs(h - 1) <= NORM_DAMAGE_EPS
  );
}

/**
 * Przycina prostokąt do kwadratu jednostkowego; zerowy lub ujemny rozmiar → pełna klatka.
 *
 * @param {{ x?: unknown, y?: unknown, w?: unknown, h?: unknown } | null | undefined} rect
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function clampNormDamageRect(rect) {
  if (!rect || typeof rect !== 'object') {
    return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
  }
  let x = Number(rect.x);
  let y = Number(rect.y);
  let w = Number(rect.w);
  let h = Number(rect.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) {
    return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
  }
  x = Math.min(1, Math.max(0, x));
  y = Math.min(1, Math.max(0, y));
  w = Math.min(1 - x, Math.max(0, w));
  h = Math.min(1 - y, Math.max(0, h));
  if (w <= NORM_DAMAGE_EPS || h <= NORM_DAMAGE_EPS) {
    return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
  }
  return { x, y, w, h };
}

/**
 * Otoczka dla przyszłej listy „brudnych” kafelków.
 *
 * @param {ReadonlyArray<{ x?: unknown, y?: unknown, w?: unknown, h?: unknown }|null|undefined>|null|undefined} rects
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function mergeNormDamageRects(rects) {
  if (!Array.isArray(rects) || rects.length === 0) {
    return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
  }
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const r of rects) {
    const c = clampNormDamageRect(r);
    if (isApproxFullNormDamageRect(c)) {
      return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
    }
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }
  if (minX >= maxX - NORM_DAMAGE_EPS || minY >= maxY - NORM_DAMAGE_EPS) {
    return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
  }
  return clampNormDamageRect({
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  });
}

let devGlobalPartialIgnoredOnce = false;
let devLocalPartialFboForcedFullOnce = false;

/**
 * Heurystyka z `interactionKind` — dopóki mask/pędzel nie ustawia dedykowanych tokenów, zwraca `full`.
 *
 * @param {string} [interactionKind]
 * @returns {typeof FAST_PREVIEW_DAMAGE_SCOPE_FULL | typeof FAST_PREVIEW_DAMAGE_SCOPE_LOCAL}
 */
export function inferFastPreviewDamageScopeFromInteractionKind(interactionKind) {
  const k = String(interactionKind ?? '');
  if (
    k.startsWith('mask-') ||
    k.startsWith('localMask') ||
    k.includes('mask-brush') ||
    k === 'retouch-brush'
  ) {
    return FAST_PREVIEW_DAMAGE_SCOPE_LOCAL;
  }
  return FAST_PREVIEW_DAMAGE_SCOPE_FULL;
}

/**
 * Efektywny prostokąt damage dla `gl.viewport` w fast preview.
 *
 * - **FBO float:** zawsze pełna klatka (offscreen musi być spójny przed blitem).
 * - **scope `full`:** globalny grading — zawsze pełna klatka (częściowy viewport zniszczyłby spójność).
 * - **scope `local`** i **WebGL bez FBO:** częściowy viewport; poza nim zostaje poprzednia zawartość canvas (`preserveDrawingBuffer`).
 *
 * @param {{ x?: unknown, y?: unknown, w?: unknown, h?: unknown } | null | undefined} damageNormRect
 * @param {boolean} useFloatFboRgba16f
 * @param {{ scope?: typeof FAST_PREVIEW_DAMAGE_SCOPE_FULL | typeof FAST_PREVIEW_DAMAGE_SCOPE_LOCAL }} [options]
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function resolveFastPreviewDamageNormRect(damageNormRect, useFloatFboRgba16f, options = {}) {
  const scope =
    options.scope === FAST_PREVIEW_DAMAGE_SCOPE_LOCAL ? FAST_PREVIEW_DAMAGE_SCOPE_LOCAL : FAST_PREVIEW_DAMAGE_SCOPE_FULL;

  if (!damageNormRect || isApproxFullNormDamageRect(damageNormRect)) {
    return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
  }

  if (useFloatFboRgba16f) {
    if (
      import.meta?.env?.DEV &&
      !devLocalPartialFboForcedFullOnce &&
      scope === FAST_PREVIEW_DAMAGE_SCOPE_LOCAL
    ) {
      devLocalPartialFboForcedFullOnce = true;
      console.info(
        '[FilmLab] fast preview: partial damage przy FBO rgba16f → pełny offscreen (wymóg blitu)'
      );
    }
    return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
  }

  if (scope !== FAST_PREVIEW_DAMAGE_SCOPE_LOCAL) {
    if (import.meta?.env?.DEV && !devGlobalPartialIgnoredOnce) {
      devGlobalPartialIgnoredOnce = true;
      console.info(
        '[FilmLab] fast preview: partial `damageNormRect` przy scope globalnym (grading) → pełna klatka'
      );
    }
    return { ...FAST_PREVIEW_FULL_DAMAGE_NORM_RECT };
  }

  return clampNormDamageRect(damageNormRect);
}

/**
 * @param {{ x?: number, y?: number, w?: number, h?: number } | null | undefined} rect
 * @param {number} width
 * @param {number} height
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function normDamageRectToViewportPx(rect, width, height) {
  const r = rect ?? FAST_PREVIEW_FULL_DAMAGE_NORM_RECT;
  const vw = Math.max(1, Math.ceil(Number(r.w) * width));
  const vh = Math.max(1, Math.ceil(Number(r.h) * height));
  const vx = Math.floor(Number(r.x) * width);
  const vy = Math.floor(Number(r.y) * height);
  return { x: vx, y: vy, w: vw, h: vh };
}
