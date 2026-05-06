/**
 * Geometry buffers for local masks (brush / linear / radial) — shared by engine + Rubylith overlay.
 * Brush: prefers Canvas2D path rasterization (brushMaskPaths); falls back to legacy stamps + interpolation.
 */

import { clampUnit } from '../engine/colorMathShared.js';
import { rasterizeBrushPathsToFloat32 } from './maskBrushPathRaster.js';

function applySoftDiskToMask(mask, width, height, cx, cy, radiusPx, feather, erase, edgeGain) {
  const softStart = radiusPx * (1 - feather * 0.85);
  const yMin = Math.max(0, cy - radiusPx);
  const yMax = Math.min(height - 1, cy + radiusPx);
  const xMin = Math.max(0, cx - radiusPx);
  const xMax = Math.min(width - 1, cx + radiusPx);
  const eg = Math.max(0.12, Math.min(1, Number(edgeGain ?? 1)));
  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radiusPx) {
        continue;
      }
      let weight = 1;
      if (dist > softStart) {
        const t = (dist - softStart) / Math.max(1e-5, radiusPx - softStart);
        weight = 1 - t;
      }
      const safeWeight = Math.max(0, Math.min(1, weight * eg));
      const idx = y * width + x;
      if (erase) {
        mask[idx] = Math.max(0, mask[idx] - safeWeight);
      } else {
        mask[idx] = Math.max(mask[idx], safeWeight);
      }
    }
  }
}

/**
 * Expand brush stroke points into dense samples along polyline segments (same erase tool).
 */
export function expandBrushStrokeSamples(strokes, width, height) {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return [];
  }
  const out = [];
  const maxInterp = 200;
  for (let i = 0; i < strokes.length; i += 1) {
    const s = strokes[i];
    out.push(s);
    if (i >= strokes.length - 1) {
      continue;
    }
    const t = strokes[i + 1];
    if (Boolean(s.erase) !== Boolean(t.erase)) {
      continue;
    }
    const ax = clampUnit(Number(s.x ?? 0.5)) * (width - 1);
    const ay = clampUnit(Number(s.y ?? 0.5)) * (height - 1);
    const bx = clampUnit(Number(t.x ?? 0.5)) * (width - 1);
    const by = clampUnit(Number(t.y ?? 0.5)) * (height - 1);
    const r0 = Math.max(0.004, Math.min(0.5, Number(s.radius ?? 0.05)));
    const r1 = Math.max(0.004, Math.min(0.5, Number(t.radius ?? 0.05)));
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const radPxA = Math.max(2, Math.round(r0 * Math.max(width, height)));
    const step = Math.max(1, radPxA * 0.2);
    const n = Math.min(maxInterp, Math.floor(dist / step));
    for (let k = 1; k <= n; k += 1) {
      const u = k / (n + 1);
      const r = r0 * (1 - u) + r1 * u;
      const f0 = clampUnit(Number(s.feather ?? 0.65));
      const f1 = clampUnit(Number(t.feather ?? 0.65));
      const f = f0 * (1 - u) + f1 * u;
      const eg0 = Number(s.edgeGain ?? 1);
      const eg1 = Number(t.edgeGain ?? 1);
      out.push({
        x: (ax + dx * u) / Math.max(1, width - 1),
        y: (ay + dy * u) / Math.max(1, height - 1),
        radius: r,
        feather: f,
        erase: s.erase,
        edgeGain: eg0 * (1 - u) + eg1 * u,
      });
    }
  }
  return out;
}

/**
 * @param {{ radiusNorm?: number, feather01?: number, flow01?: number, density01?: number, edgeSensitivity01?: number }} [pathStyle]
 * @param {{ data: Uint8ClampedArray, width: number, height: number } | null} [rgbSourceForEdge] — aligned z width×height (np. transformed ImageData)
 */
export function buildBrushMaskBuffer(width, height, brushStrokes, brushPaths, pathStyle, rgbSourceForEdge = null) {
  if (width < 1 || height < 1) {
    return null;
  }
  if (Array.isArray(brushPaths) && brushPaths.some((p) => Array.isArray(p?.points) && p.points.length > 0)) {
    const rn =
      Number(pathStyle?.radiusNorm) > 0
        ? Math.max(0.004, Math.min(0.5, Number(pathStyle.radiusNorm)))
        : Math.max(0.005, Math.min(0.5, Number(pathStyle?.fallbackRadiusPx ?? 32) / Math.max(width, height)));
    const feather01 = clampUnit(Number(pathStyle?.feather01 ?? 0.65));
    const edge01 = clampUnit(Number(pathStyle?.edgeSensitivity01 ?? 0));
    const rgbOk =
      rgbSourceForEdge &&
      rgbSourceForEdge.data instanceof Uint8ClampedArray &&
      rgbSourceForEdge.width === width &&
      rgbSourceForEdge.height === height;
    return rasterizeBrushPathsToFloat32(width, height, brushPaths, {
      radiusNorm: rn,
      feather01,
      flow01: clampUnit(Number(pathStyle?.flow01 ?? 1)),
      density01: clampUnit(Number(pathStyle?.density01 ?? 1)),
      edgeSensitivity01: edge01,
      rgbSource: rgbOk ? rgbSourceForEdge : undefined,
    });
  }
  if (!Array.isArray(brushStrokes) || brushStrokes.length === 0) {
    return null;
  }
  const samples = expandBrushStrokeSamples(brushStrokes, width, height);
  const mask = new Float32Array(width * height);
  for (const stroke of samples) {
    const cx = Math.round(clampUnit(Number(stroke?.x ?? 0.5)) * (width - 1));
    const cy = Math.round(clampUnit(Number(stroke?.y ?? 0.5)) * (height - 1));
    const radiusNorm = Math.max(0.004, Math.min(0.5, Number(stroke?.radius ?? 0.05)));
    const feather = clampUnit(Number(stroke?.feather ?? 0.65));
    const radiusPx = Math.max(2, Math.round(radiusNorm * Math.max(width, height)));
    applySoftDiskToMask(mask, width, height, cx, cy, radiusPx, feather, Boolean(stroke?.erase), stroke?.edgeGain ?? 1);
  }
  return mask;
}

export function buildBrushMaskPathsSignature(width, height, brushPaths, radiusNormKey = '') {
  if (!Array.isArray(brushPaths) || brushPaths.length === 0) {
    return `${width}x${height}:p0`;
  }
  let signature = `${width}x${height}:p${brushPaths.length}:${radiusNormKey}`;
  for (let pi = 0; pi < brushPaths.length; pi += 1) {
    const p = brushPaths[pi];
    const pts = Array.isArray(p?.points) ? p.points : [];
    signature += `|${p?.erase ? 1 : 0}:${pts.length}`;
    const cap = Math.min(pts.length, 64);
    for (let i = 0; i < cap; i += 1) {
      signature += `:${Math.round(clampUnit(Number(pts[i]?.x ?? 0)) * 1000)},${Math.round(
        clampUnit(Number(pts[i]?.y ?? 0)) * 1000
      )}`;
    }
  }
  return signature;
}

export function buildBrushMaskSignature(width, height, brushStrokes) {
  if (!Array.isArray(brushStrokes) || brushStrokes.length === 0) {
    return `${width}x${height}:0`;
  }
  let signature = `${width}x${height}:${brushStrokes.length}`;
  for (let i = 0; i < brushStrokes.length; i += 1) {
    const s = brushStrokes[i];
    const x = Math.round(clampUnit(Number(s?.x ?? 0.5)) * 1000);
    const y = Math.round(clampUnit(Number(s?.y ?? 0.5)) * 1000);
    const r = Math.round(Math.max(0, Math.min(0.5, Number(s?.radius ?? 0.05))) * 1000);
    const f = Math.round(clampUnit(Number(s?.feather ?? 0.65)) * 1000);
    const e = s?.erase ? 1 : 0;
    const g = Math.round(Math.max(0, Math.min(1, Number(s?.edgeGain ?? 1))) * 1000);
    signature += `|${x},${y},${r},${f},${e},${g}`;
  }
  return signature;
}

export function buildLinearMaskBuffer(width, height, adjustments) {
  if (width < 1 || height < 1) {
    return null;
  }
  const mask = new Float32Array(width * height);
  const angleDeg = Number(adjustments?.linearMaskAngle ?? 0);
  const angle = (angleDeg * Math.PI) / 180;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const feather = clampUnit(Number(adjustments?.linearMaskFeather ?? 55) / 100);
  const offset = Math.max(-1, Math.min(1, Number(adjustments?.linearMaskOffset ?? 0) / 100));
  const span = Math.max(0.03, 0.25 + feather * 0.5);
  for (let y = 0; y < height; y += 1) {
    const ny = height > 1 ? y / (height - 1) - 0.5 : 0;
    for (let x = 0; x < width; x += 1) {
      const nx = width > 1 ? x / (width - 1) - 0.5 : 0;
      const p = nx * dirX + ny * dirY - offset * 0.5;
      const t = clampUnit((p + span) / (span * 2));
      mask[y * width + x] = t * t * (3 - 2 * t);
    }
  }
  return mask;
}

/** Resize float mask (nearest) — ONNX / AI raster grids */
export function resampleFloat32Alpha(src, srcW, srcH, dstW, dstH) {
  if (!(src instanceof Float32Array) || srcW < 1 || srcH < 1 || dstW < 1 || dstH < 1) {
    return null;
  }
  const dst = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y += 1) {
    const sy = Math.min(srcH - 1, Math.floor((y / Math.max(1, dstH - 1)) * (srcH - 1)));
    for (let x = 0; x < dstW; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor((x / Math.max(1, dstW - 1)) * (srcW - 1)));
      dst[y * dstW + x] = src[sy * srcW + sx];
    }
  }
  return dst;
}

export function buildRadialMaskBuffer(width, height, adjustments) {
  if (width < 1 || height < 1) {
    return null;
  }
  const mask = new Float32Array(width * height);
  const cx = clampUnit(Number(adjustments?.radialMaskCenterX ?? 50) / 100);
  const cy = clampUnit(Number(adjustments?.radialMaskCenterY ?? 50) / 100);
  const radius = Math.max(0.04, Math.min(1, Number(adjustments?.radialMaskRadius ?? 35) / 100));
  const feather = clampUnit(Number(adjustments?.radialMaskFeather ?? 55) / 100);
  const inner = Math.max(0, radius * (1 - feather * 0.92));
  for (let y = 0; y < height; y += 1) {
    const ny = height > 1 ? y / (height - 1) : 0;
    for (let x = 0; x < width; x += 1) {
      const nx = width > 1 ? x / (width - 1) : 0;
      const d = Math.hypot(nx - cx, ny - cy);
      let w = 0;
      if (d <= inner) {
        w = 1;
      } else if (d < radius) {
        const t = 1 - (d - inner) / Math.max(1e-5, radius - inner);
        w = t * t * (3 - 2 * t);
      }
      mask[y * width + x] = w;
    }
  }
  return mask;
}
