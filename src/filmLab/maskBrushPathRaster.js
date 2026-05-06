/**
 * Rasterize brush strokes — dab-wise buildup (Flow / Density / Feather like Lightroom).
 * Coordinates normalized 0–1 in image space.
 */

import { sampleBrushEdgeMagnitude01 } from './maskBrushEdgeSample.js';

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Hard disk 0–1 profile for dab center (cx,cy); feather01 0 = crisp circle.
 */
function dabProfile(dist, radiusPx, feather01) {
  if (radiusPx <= 0.5 || dist >= radiusPx) {
    return 0;
  }
  const f = clamp01(feather01);
  if (f < 0.02) {
    return 1;
  }
  const inner = radiusPx * (1 - f * 0.98);
  if (dist <= inner) {
    return 1;
  }
  const t = (dist - inner) / Math.max(1e-5, radiusPx - inner);
  const w = 1 - t;
  return Math.max(0, Math.min(1, w * w * (3 - 2 * w)));
}

function densifyPolylinePx(pointsNorm, width, height, stepPx) {
  const out = [];
  if (!Array.isArray(pointsNorm) || pointsNorm.length === 0) {
    return out;
  }
  const step = Math.max(1.2, stepPx * 0.55);
  const toPx = (p) => ({
    x: clamp01(p.x) * width,
    y: clamp01(p.y) * height,
  });
  out.push(toPx(pointsNorm[0]));
  for (let i = 1; i < pointsNorm.length; i += 1) {
    const a = toPx(pointsNorm[i - 1]);
    const b = toPx(pointsNorm[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const nSeg = Math.min(480, Math.floor(len / step));
    for (let k = 1; k <= nSeg; k += 1) {
      const t = k / (nSeg + 1);
      out.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
    out.push(b);
  }
  const dedup = [];
  const minD = step * 0.35;
  for (const p of out) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minD) {
      dedup.push(p);
    }
  }
  return dedup.length > 0 ? dedup : out;
}

function accumulateDab(
  mask,
  width,
  height,
  cx,
  cy,
  radiusPx,
  feather01,
  flow01,
  density01,
  erase,
  edgeBoost01 = 1
) {
  const cap = clamp01(density01);
  const flow = clamp01(flow01);
  const r = Math.max(1.5, radiusPx);
  const edgeMul = Math.max(0.18, Math.min(2.65, Number(edgeBoost01)));
  const xMin = Math.max(0, Math.floor(cx - r - 2));
  const xMax = Math.min(width - 1, Math.ceil(cx + r + 2));
  const yMin = Math.max(0, Math.floor(cy - r - 2));
  const yMax = Math.min(height - 1, Math.ceil(cy + r + 2));
  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let raw = dabProfile(dist, r, feather01);
      if (raw <= 1e-8) continue;
      raw *= edgeMul;
      const idx = y * width + x;
      if (erase) {
        const factor = Math.max(0, 1 - raw * flow);
        mask[idx] *= factor;
      } else {
        const m = mask[idx];
        const headroom = cap - m;
        if (headroom <= 1e-8) continue;
        const delta = (raw * flow * headroom) / Math.max(cap, 1e-6);
        mask[idx] = Math.min(cap, m + delta);
      }
    }
  }
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Array<{ erase?: boolean, points: Array<{ x: number, y: number }> }>} paths
 * @param {{ radiusNorm: number, feather01: number, flow01: number, density01: number, edgeSensitivity01?: number, rgbSource?: { data: Uint8ClampedArray, width: number, height: number } }} style
 */
export function rasterizeBrushPathsToFloat32(width, height, paths, style) {
  if (width < 2 || height < 2 || !Array.isArray(paths) || paths.length === 0) {
    return null;
  }
  const radiusNorm = Math.max(0.004, Math.min(0.5, Number(style?.radiusNorm ?? 0.05)));
  const feather01 = clamp01(Number(style?.feather01 ?? 0.65));
  const flow01 = clamp01(Number(style?.flow01 ?? 1));
  const density01 = clamp01(Number(style?.density01 ?? 1));
  const edgeSens = clamp01(Number(style?.edgeSensitivity01 ?? 0));
  const rgb = style?.rgbSource;
  const rgbOk =
    rgb &&
    rgb.data instanceof Uint8ClampedArray &&
    rgb.width === width &&
    rgb.height === height &&
    rgb.data.length >= width * height * 4;
  const maxEdge = Math.max(width, height);
  const lineWidthPx = Math.max(2, radiusNorm * 2 * maxEdge);

  const mask = new Float32Array(width * height).fill(0);
  const stepPx = Math.max(1.4, lineWidthPx * 0.38);

  for (const path of paths) {
    const pts = Array.isArray(path?.points) ? path.points : [];
    if (pts.length === 0) {
      continue;
    }
    const erase = Boolean(path.erase);
    const dabCenters =
      pts.length === 1
        ? [{ x: clamp01(pts[0].x) * width, y: clamp01(pts[0].y) * height }]
        : densifyPolylinePx(pts, width, height, stepPx);

    for (const c of dabCenters) {
      let edgeBoost = 1;
      if (edgeSens > 0.002 && rgbOk) {
        const mag01 = sampleBrushEdgeMagnitude01(rgb.data, width, height, c.x, c.y);
        edgeBoost = 1 + edgeSens * mag01 * 1.55;
      }
      accumulateDab(
        mask,
        width,
        height,
        c.x,
        c.y,
        lineWidthPx * 0.5,
        feather01,
        flow01,
        density01,
        erase,
        edgeBoost
      );
    }
  }

  return mask;
}
