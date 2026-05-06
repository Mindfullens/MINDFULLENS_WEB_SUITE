/**
 * Bounding box (znormalizowany 0–1, przestrzeń jak `clientToMaskBufferNorm`) dla „damage” fast preview
 * podczas malowania maski pędzlem.
 */

const DEFAULT_MARGIN = 0.02;

/**
 * @param {ReadonlyArray<{ x?: number, y?: number }>|null|undefined} points
 * @param {number} radiusNorm — promień pędzla w przestrzeni norm (jak `brushMaskRadiusNorm`)
 * @param {number} [marginNorm]
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function damageNormRectFromBrushStroke(points, radiusNorm, marginNorm = DEFAULT_MARGIN) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }
  const r = Math.max(0.0005, Number(radiusNorm) || 0.04);
  const m = Math.max(0, Number(marginNorm) || 0);
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) {
      continue;
    }
    const x = Number(p.x);
    const y = Number(p.y);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (minX > maxX || minY > maxY) {
    return null;
  }
  const pad = r + m;
  let x = minX - pad;
  let y = minY - pad;
  let w = maxX - minX + 2 * pad;
  let h = maxY - minY + 2 * pad;
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  w = Math.min(1 - x, Math.max(0.001, w));
  h = Math.min(1 - y, Math.max(0.001, h));
  return { x, y, w, h };
}

/** Stała zgodna z `inferFastPreviewDamageScopeFromInteractionKind` (maski lokalne). */
export const ENGINE_PREVIEW_INTERACTION_MASK_BRUSH = 'mask-brush';
