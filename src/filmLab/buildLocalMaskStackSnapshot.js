/**
 * Snapshot stosu masek — ta sama logika co pętla renderu CPU (`useFilmLabEngine`).
 * Wydzielone, aby podgląd rubylith i eksport mogły użyć identycznych buforów geometrycznych.
 */

import { normalizeLocalMaskGraphOp } from './localMaskGraph.js';
import {
  buildBrushMaskBuffer,
  buildBrushMaskPathsSignature,
  buildBrushMaskSignature,
  buildLinearMaskBuffer,
  buildRadialMaskBuffer,
  resampleFloat32Alpha,
} from './maskGeometryBuffers.js';

export function localMaskSlotHasVisibleAdjustments(exposure, tone) {
  if (Math.abs(Number(exposure ?? 0)) >= 0.01) {
    return true;
  }
  const t = tone && typeof tone === 'object' ? tone : {};
  const keys = ['contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temp', 'tint', 'saturation'];
  for (const key of keys) {
    if (Math.abs(Number(t[key] ?? 0)) >= 0.01) {
      return true;
    }
  }
  return false;
}

export function buildMaskBrushPathStyle(adjustments) {
  return {
    radiusNorm: Number(adjustments?.brushMaskRadiusNorm) > 0 ? Number(adjustments.brushMaskRadiusNorm) : undefined,
    feather01: Number(adjustments?.brushMaskFeather ?? 65) / 100,
    fallbackRadiusPx: Number(adjustments?.brushMaskRadius ?? 32),
    flow01: Math.max(1, Math.min(100, Number(adjustments?.brushMaskFlow ?? 100))) / 100,
    density01: Math.max(1, Math.min(100, Number(adjustments?.brushMaskDensity ?? 100))) / 100,
    edgeSensitivity01: Math.max(0, Math.min(1, Number(adjustments?.brushMaskEdgeSensitivity ?? 0) / 100)),
  };
}

export function buildLocalMaskSignature(width, height, adjustments) {
  const mode = String(adjustments?.localMaskMode ?? 'brush');
  if (mode === 'linear') {
    return `linear:${width}x${height}:${Math.round(Number(adjustments?.linearMaskAngle ?? 0) * 10)}:${Math.round(
      Number(adjustments?.linearMaskFeather ?? 55) * 10
    )}:${Math.round(Number(adjustments?.linearMaskOffset ?? 0) * 10)}`;
  }
  if (mode === 'radial') {
    return `radial:${width}x${height}:${Math.round(Number(adjustments?.radialMaskCenterX ?? 50) * 10)}:${Math.round(
      Number(adjustments?.radialMaskCenterY ?? 50) * 10
    )}:${Math.round(Number(adjustments?.radialMaskRadius ?? 35) * 10)}:${Math.round(
      Number(adjustments?.radialMaskFeather ?? 55) * 10
    )}`;
  }
  if (mode === 'luma') {
    return `luma:${Math.round(Number(adjustments?.lumaMaskMin ?? 0) * 10)}:${Math.round(
      Number(adjustments?.lumaMaskMax ?? 100) * 10
    )}:${Math.round(Number(adjustments?.lumaMaskFeather ?? 35) * 10)}`;
  }
  if (mode === 'color') {
    return `color:${Math.round(Number(adjustments?.colorMaskHueCenter ?? 210) * 10)}:${Math.round(
      Number(adjustments?.colorMaskHueWidth ?? 90) * 10
    )}:${Math.round(Number(adjustments?.colorMaskFeather ?? 35) * 10)}:${Math.round(
      Number(adjustments?.colorMaskChromaMin ?? 0) * 10
    )}:${Math.round(Number(adjustments?.colorMaskChromaMax ?? 100) * 10)}`;
  }
  if (mode === 'depth') {
    const digestRaw = adjustments?.depthProxyDigest;
    const digest =
      digestRaw != null && String(digestRaw).trim() !== ''
        ? String(digestRaw).trim().slice(0, 80)
        : 'luma';
    const dms = String(adjustments?.depthMapSource ?? 'luminance').slice(0, 32);
    const fdBrush = `${Math.round(Number(adjustments?.brushMaskFlow ?? 100))}:${Math.round(
      Number(adjustments?.brushMaskDensity ?? 100),
    )}`;
    const pathSeg =
      Array.isArray(adjustments?.brushMaskPaths) &&
      adjustments.brushMaskPaths.some((p) => Array.isArray(p?.points) && p.points.length > 0)
        ? `path:${buildBrushMaskPathsSignature(width, height, adjustments.brushMaskPaths, 'd')}`
        : buildBrushMaskSignature(width, height, adjustments?.brushMaskStrokes);
    const edgeK = Math.round(Number(adjustments?.brushMaskEdgeSensitivity ?? 0));
    return `depth:${Math.round(Number(adjustments?.depthMaskMin ?? 0) * 10)}:${Math.round(
      Number(adjustments?.depthMaskMax ?? 100) * 10
    )}:${Math.round(Number(adjustments?.depthMaskFeather ?? 35) * 10)}:${dms}:${digest}:${pathSeg}:fd:${fdBrush}:edge:${edgeK}`;
  }
  const ra = adjustments?.rasterAlpha;
  if (ra?.data instanceof Float32Array && ra.data.length > 0 && ra.width > 0 && ra.height > 0) {
    const d = ra.data;
    const n = d.length;
    const mid = d[Math.floor(n / 2)] ?? 0;
    const digest = `${ra.width}x${ra.height}:${n}:${Math.round(d[0] * 1e6)}:${Math.round(mid * 1e6)}:${Math.round(
      d[n - 1] * 1e6
    )}`;
    return `brush:ra:${width}x${height}:${digest}`;
  }
  const brushPaths = Array.isArray(adjustments?.brushMaskPaths) ? adjustments.brushMaskPaths : null;
  const fdBrush = `${Math.round(Number(adjustments?.brushMaskFlow ?? 100))}:${Math.round(
    Number(adjustments?.brushMaskDensity ?? 100),
  )}`;
  if (brushPaths && brushPaths.some((p) => Array.isArray(p?.points) && p.points.length > 0)) {
    const rn = Number(adjustments?.brushMaskRadiusNorm ?? 0);
    const rk = rn > 0 ? String(Math.round(rn * 1e6)) : 'auto';
    const edgeK = Math.round(Number(adjustments?.brushMaskEdgeSensitivity ?? 0));
    return `brush:path:${buildBrushMaskPathsSignature(width, height, brushPaths, rk)}:fd:${fdBrush}:edge:${edgeK}`;
  }
  return `brush:${buildBrushMaskSignature(width, height, adjustments?.brushMaskStrokes)}:fd:${fdBrush}`;
}

/**
 * @param {Map} maskCache
 * @param {ImageData | null} [rgbSourceForBrushEdge]
 */
export function buildLocalMaskStackSnapshot(width, height, adjustments, maskCache, rgbSourceForBrushEdge) {
  const cache = maskCache instanceof Map ? maskCache : new Map();
  const brushMaskEnabled = Boolean(adjustments?.brushMaskEnabled);
  const stackOuter = Array.isArray(adjustments?.localMasks) ? adjustments.localMasks : [];
  const activeIdx = Math.max(
    0,
    Math.min(stackOuter.length > 0 ? stackOuter.length - 1 : 0, Number(adjustments?.activeLocalMaskIndex ?? 0)),
  );
  const localMaskEntries = (() => {
    const stack = Array.isArray(adjustments?.localMasks) ? adjustments.localMasks : [];
    const soloIndex = Number(adjustments?.localMaskSoloIndex ?? -1);
    const current = {
      enabled: adjustments?.localMaskEnabled !== false,
      mode: String(adjustments?.localMaskMode ?? 'brush'),
      opacity: Number(adjustments?.localMaskOpacity ?? 100),
      blend: String(adjustments?.localMaskBlend ?? 'normal'),
      exposure: Number(adjustments?.brushMaskExposure ?? 0),
      brush: {
        strokes: Array.isArray(adjustments?.brushMaskStrokes) ? adjustments.brushMaskStrokes : [],
        paths: Array.isArray(adjustments?.brushMaskPaths) ? adjustments.brushMaskPaths : [],
        radius: Number(adjustments?.brushMaskRadius ?? 32),
        feather: Number(adjustments?.brushMaskFeather ?? 65),
        flow: Math.max(1, Math.min(100, Number(adjustments?.brushMaskFlow ?? 100))),
        density: Math.max(1, Math.min(100, Number(adjustments?.brushMaskDensity ?? 100))),
      },
      tone: {
        contrast: Number(adjustments?.brushMaskContrast ?? 0),
        highlights: Number(adjustments?.brushMaskHighlights ?? 0),
        shadows: Number(adjustments?.brushMaskShadows ?? 0),
        whites: Number(adjustments?.brushMaskWhites ?? 0),
        blacks: Number(adjustments?.brushMaskBlacks ?? 0),
        temp: Number(adjustments?.brushMaskTemp ?? 0),
        tint: Number(adjustments?.brushMaskTint ?? 0),
        saturation: Number(adjustments?.brushMaskSaturation ?? 0),
      },
      linear: {
        angle: Number(adjustments?.linearMaskAngle ?? 0),
        feather: Number(adjustments?.linearMaskFeather ?? 55),
        offset: Number(adjustments?.linearMaskOffset ?? 0),
      },
      radial: {
        centerX: Number(adjustments?.radialMaskCenterX ?? 50),
        centerY: Number(adjustments?.radialMaskCenterY ?? 50),
        radius: Number(adjustments?.radialMaskRadius ?? 35),
        feather: Number(adjustments?.radialMaskFeather ?? 55),
      },
      luma: {
        min: Number(adjustments?.lumaMaskMin ?? 0),
        max: Number(adjustments?.lumaMaskMax ?? 100),
        feather: Number(adjustments?.lumaMaskFeather ?? 35),
      },
      color: {
        hueCenter: Number(adjustments?.colorMaskHueCenter ?? 210),
        hueWidth: Number(adjustments?.colorMaskHueWidth ?? 90),
        feather: Number(adjustments?.colorMaskFeather ?? 35),
        chromaMin: Number(adjustments?.colorMaskChromaMin ?? 0),
        chromaMax: Number(adjustments?.colorMaskChromaMax ?? 100),
      },
      depth: {
        min: Number(adjustments?.depthMaskMin ?? 0),
        max: Number(adjustments?.depthMaskMax ?? 100),
        feather: Number(adjustments?.depthMaskFeather ?? 35),
        mapSource: String(adjustments?.depthMapSource ?? 'luminance'),
      },
      rasterAlpha:
        adjustments?.localMaskRasterAlpha?.data instanceof Float32Array &&
        adjustments.localMaskRasterAlpha.width > 0 &&
        adjustments.localMaskRasterAlpha.height > 0
          ? adjustments.localMaskRasterAlpha
          : null,
    };
    if (!brushMaskEnabled) {
      return [];
    }
    if (stack.length === 0) {
      return [current];
    }
    const merged = stack.map((entry, idx) =>
      idx === activeIdx
        ? {
            ...entry,
            enabled: current.enabled,
            mode: current.mode,
            opacity: current.opacity,
            blend: current.blend,
            exposure: current.exposure,
            brush: { ...(entry.brush && typeof entry.brush === 'object' ? entry.brush : {}), ...current.brush },
            linear: { ...(entry.linear && typeof entry.linear === 'object' ? entry.linear : {}), ...current.linear },
            radial: { ...(entry.radial && typeof entry.radial === 'object' ? entry.radial : {}), ...current.radial },
            luma: { ...(entry.luma && typeof entry.luma === 'object' ? entry.luma : {}), ...current.luma },
            color: { ...(entry.color && typeof entry.color === 'object' ? entry.color : {}), ...current.color },
            depth: { ...(entry.depth && typeof entry.depth === 'object' ? entry.depth : {}), ...current.depth },
            tone: {
              ...(entry.tone && typeof entry.tone === 'object' ? entry.tone : {}),
              ...(current.tone && typeof current.tone === 'object' ? current.tone : {}),
            },
            rasterAlpha: current.rasterAlpha ?? entry?.rasterAlpha ?? null,
          }
        : entry,
    );
    if (Number.isInteger(soloIndex) && soloIndex >= 0 && soloIndex < merged.length) {
      return [merged[soloIndex]];
    }
    return merged.filter((entry) => entry?.enabled !== false);
  })();

  const localMaskStack = localMaskEntries
    .map((entry, maskIndex) => {
      const exposure = Number(entry?.exposure ?? entry?.brushMaskExposure ?? 0);
      const opacity = Math.max(0, Math.min(1, Number(entry?.opacity ?? entry?.localMaskOpacity ?? 100) / 100));
      const tone = entry?.tone && typeof entry.tone === 'object' ? entry.tone : {};
      if (opacity <= 0.0001 || !localMaskSlotHasVisibleAdjustments(exposure, tone)) {
        return null;
      }
      const mode = String(entry?.mode ?? entry?.localMaskMode ?? 'brush');
      const signature = buildLocalMaskSignature(width, height, {
        ...entry,
        localMaskMode: mode,
        linearMaskAngle: entry?.linear?.angle ?? entry?.linearMaskAngle,
        linearMaskFeather: entry?.linear?.feather ?? entry?.linearMaskFeather,
        linearMaskOffset: entry?.linear?.offset ?? entry?.linearMaskOffset,
        radialMaskCenterX: entry?.radial?.centerX ?? entry?.radialMaskCenterX,
        radialMaskCenterY: entry?.radial?.centerY ?? entry?.radialMaskCenterY,
        radialMaskRadius: entry?.radial?.radius ?? entry?.radialMaskRadius,
        radialMaskFeather: entry?.radial?.feather ?? entry?.radialMaskFeather,
        lumaMaskMin: entry?.luma?.min ?? entry?.lumaMaskMin,
        lumaMaskMax: entry?.luma?.max ?? entry?.lumaMaskMax,
        lumaMaskFeather: entry?.luma?.feather ?? entry?.lumaMaskFeather,
        colorMaskHueCenter: entry?.color?.hueCenter ?? entry?.colorMaskHueCenter,
        colorMaskHueWidth: entry?.color?.hueWidth ?? entry?.colorMaskHueWidth,
        colorMaskFeather: entry?.color?.feather ?? entry?.colorMaskFeather,
        colorMaskChromaMin: entry?.color?.chromaMin ?? entry?.colorMaskChromaMin,
        colorMaskChromaMax: entry?.color?.chromaMax ?? entry?.colorMaskChromaMax,
        depthMaskMin: entry?.depth?.min ?? entry?.depthMaskMin,
        depthMaskMax: entry?.depth?.max ?? entry?.depthMaskMax,
        depthMaskFeather: entry?.depth?.feather ?? entry?.depthMaskFeather,
        depthMapSource: entry?.depth?.mapSource ?? adjustments?.depthMapSource ?? 'luminance',
        depthProxyDigest:
          adjustments?.depthProxyDigest ??
          entry?.depthProxyDigest ??
          (typeof entry?.depth?.digest === 'string' ? entry.depth.digest : null),
        rasterAlpha: entry?.rasterAlpha,
        brushMaskPaths: entry?.brush?.paths,
        brushMaskStrokes: entry?.brush?.strokes ?? entry?.brushMaskStrokes,
        brushMaskRadiusNorm: maskIndex === activeIdx ? adjustments?.brushMaskRadiusNorm : null,
        brushMaskFlow: maskIndex === activeIdx ? adjustments?.brushMaskFlow : entry?.brush?.flow,
        brushMaskDensity: maskIndex === activeIdx ? adjustments?.brushMaskDensity : entry?.brush?.density,
      });
      const cacheKey = `${maskIndex}:${signature}`;
      let buffer = cache.get(cacheKey) ?? null;
      if (!(buffer instanceof Float32Array) || buffer.length !== width * height) {
        const ra = entry?.rasterAlpha;
        if (ra?.data instanceof Float32Array && ra.width > 0 && ra.height > 0) {
          buffer = resampleFloat32Alpha(ra.data, ra.width, ra.height, width, height);
        } else if (mode === 'linear') {
          buffer = buildLinearMaskBuffer(width, height, {
            linearMaskAngle: entry?.linear?.angle ?? entry?.linearMaskAngle,
            linearMaskFeather: entry?.linear?.feather ?? entry?.linearMaskFeather,
            linearMaskOffset: entry?.linear?.offset ?? entry?.linearMaskOffset,
          });
        } else if (mode === 'radial') {
          buffer = buildRadialMaskBuffer(width, height, {
            radialMaskCenterX: entry?.radial?.centerX ?? entry?.radialMaskCenterX,
            radialMaskCenterY: entry?.radial?.centerY ?? entry?.radialMaskCenterY,
            radialMaskRadius: entry?.radial?.radius ?? entry?.radialMaskRadius,
            radialMaskFeather: entry?.radial?.feather ?? entry?.radialMaskFeather,
          });
        } else {
          const paths = Array.isArray(entry?.brush?.paths) ? entry.brush.paths : [];
          const strokes = Array.isArray(entry?.brush?.strokes ?? entry?.brushMaskStrokes)
            ? entry?.brush?.strokes ?? entry?.brushMaskStrokes
            : [];
          const edgeRaw =
            maskIndex === activeIdx
              ? Number(adjustments?.brushMaskEdgeSensitivity ?? 0)
              : Number(entry?.brush?.edgeSensitivity ?? 0);
          const rgbEdge =
            rgbSourceForBrushEdge &&
            rgbSourceForBrushEdge.width === width &&
            rgbSourceForBrushEdge.height === height
              ? rgbSourceForBrushEdge
              : null;
          buffer = buildBrushMaskBuffer(width, height, strokes, paths, {
            radiusNorm:
              maskIndex === activeIdx && Number(adjustments?.brushMaskRadiusNorm) > 0
                ? Number(adjustments.brushMaskRadiusNorm)
                : undefined,
            feather01: Number(entry?.brush?.feather ?? adjustments?.brushMaskFeather ?? 65) / 100,
            fallbackRadiusPx: Number(entry?.brush?.radius ?? adjustments?.brushMaskRadius ?? 32),
            flow01:
              Math.max(1, Math.min(100, Number(entry?.brush?.flow ?? adjustments?.brushMaskFlow ?? 100))) / 100,
            density01:
              Math.max(1, Math.min(100, Number(entry?.brush?.density ?? adjustments?.brushMaskDensity ?? 100))) /
              100,
            edgeSensitivity01: Math.max(0, Math.min(1, edgeRaw / 100)),
          }, rgbEdge);
        }
        if (buffer instanceof Float32Array) {
          cache.set(cacheKey, buffer);
          if (cache.size > 12) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
          }
        }
      }
      return {
        buffer: buffer instanceof Float32Array ? buffer : null,
        exposure,
        opacity,
        mode,
        lumaMin: Number(entry?.luma?.min ?? entry?.lumaMaskMin ?? 0) / 100,
        lumaMax: Number(entry?.luma?.max ?? entry?.lumaMaskMax ?? 100) / 100,
        lumaFeather: Number(entry?.luma?.feather ?? entry?.lumaMaskFeather ?? 35) / 100,
        colorHueCenter: Number(entry?.color?.hueCenter ?? entry?.colorMaskHueCenter ?? 210),
        colorHueWidth: Number(entry?.color?.hueWidth ?? entry?.colorMaskHueWidth ?? 90),
        colorFeather: Number(entry?.color?.feather ?? entry?.colorMaskFeather ?? 35) / 100,
        colorChromaMin: Number(entry?.color?.chromaMin ?? entry?.colorMaskChromaMin ?? 0) / 100,
        colorChromaMax: Number(entry?.color?.chromaMax ?? entry?.colorMaskChromaMax ?? 100) / 100,
        depthMin: Number(entry?.depth?.min ?? entry?.depthMaskMin ?? 0) / 100,
        depthMax: Number(entry?.depth?.max ?? entry?.depthMaskMax ?? 100) / 100,
        depthFeather: Number(entry?.depth?.feather ?? entry?.depthMaskFeather ?? 35) / 100,
        blend: String(entry?.blend ?? entry?.localMaskBlend ?? 'normal'),
        maskContrast: Number(tone.contrast ?? 0),
        maskHighlights: Number(tone.highlights ?? 0),
        maskShadows: Number(tone.shadows ?? 0),
        maskWhites: Number(tone.whites ?? 0),
        maskBlacks: Number(tone.blacks ?? 0),
        maskTemp: Number(tone.temp ?? 0),
        maskTint: Number(tone.tint ?? 0),
        maskSaturation: Number(tone.saturation ?? 0),
        ...(mode === 'depth'
          ? {
              depthProxyBuffer:
                entry?.depthProxyBuffer instanceof Float32Array ? entry.depthProxyBuffer : null,
            }
          : {}),
      };
    })
    .filter(Boolean);

  const graphOpNorm = normalizeLocalMaskGraphOp(adjustments?.localMaskGraphOp);
  let graphCombineActive = false;
  let graphIdxA = 0;
  let graphIdxB = 1;
  if (Boolean(adjustments?.localMaskGraphEnabled) && brushMaskEnabled && localMaskStack.length >= 2) {
    graphIdxA = Math.max(
      0,
      Math.min(localMaskStack.length - 1, Math.round(Number(adjustments?.localMaskGraphIndexA ?? 0))),
    );
    graphIdxB = Math.max(
      0,
      Math.min(localMaskStack.length - 1, Math.round(Number(adjustments?.localMaskGraphIndexB ?? 1))),
    );
    graphCombineActive = graphIdxA !== graphIdxB;
    if (graphCombineActive && (!localMaskStack[graphIdxA] || !localMaskStack[graphIdxB])) {
      graphCombineActive = false;
    }
  }

  return {
    localMaskStack,
    graphCombineActive,
    graphIdxA,
    graphIdxB,
    graphOpNorm,
    brushMaskEnabled,
  };
}
