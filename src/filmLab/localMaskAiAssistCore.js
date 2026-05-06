import { buildSkySemanticAlphaRaster } from './semanticSegmentationRasterFallback.js';

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return min;
  }
  return Math.max(min, Math.min(max, n));
}

function getCropRectNorm(rect) {
  return {
    x: clamp(rect?.x ?? 0, 0, 1),
    y: clamp(rect?.y ?? 0, 0, 1),
    w: clamp(rect?.w ?? 1, 0.05, 1),
    h: clamp(rect?.h ?? 1, 0.05, 1),
  };
}

export function buildLocalMaskAiAssistPreset({ kind, maskIndex, activeCropRectNorm }) {
  const crop = getCropRectNorm(activeCropRectNorm);
  const centerX = clamp((crop.x + crop.w * 0.5) * 100, 0, 100);
  const centerY = clamp((crop.y + crop.h * 0.5) * 100, 0, 100);

  if (kind === 'sky') {
    return {
      name: `AI Sky ${maskIndex}`,
      source: 'ai-assist',
      ai: { kind: 'sky', pipeline: 'onnx-or-heuristic-raster' },
      enabled: true,
      mode: 'brush',
      opacity: 100,
      blend: 'normal',
      exposure: -18,
      brush: { radius: 32, feather: 65, erase: false, strokes: [], paths: [] },
      linear: { angle: 0, feather: 55, offset: 0 },
      radial: { centerX, centerY, radius: 35, feather: 55 },
    };
  }

  if (kind === 'background') {
    const feather = clamp(38 + (1 - Math.min(crop.w, crop.h)) * 28, 28, 72);
    return {
      name: `AI Background ${maskIndex}`,
      source: 'ai-assist',
      ai: { kind: 'background' },
      enabled: true,
      mode: 'luma',
      opacity: 100,
      blend: 'normal',
      exposure: 0,
      brush: { radius: 32, feather: 65, erase: false, strokes: [] },
      linear: { angle: 0, feather: 55, offset: 0 },
      radial: { centerX, centerY, radius: 48, feather: 58 },
      luma: {
        min: 0,
        max: clamp(32 + crop.y * 40, 22, 55),
        feather: Math.round(feather),
      },
      color: { hueCenter: 210, hueWidth: 90, feather: 35, chromaMin: 0, chromaMax: 100 },
    };
  }

  const cropCoverage = Math.min(crop.w, crop.h);
  const radius = clamp(22 + cropCoverage * 34, 18, 56);
  return {
    name: `AI Subject ${maskIndex}`,
    source: 'ai-assist',
    ai: { kind: 'subject' },
    enabled: true,
    mode: 'radial',
    opacity: 100,
    blend: 'normal',
    exposure: 18,
    brush: { radius: 32, feather: 65, erase: false, strokes: [] },
    linear: { angle: 0, feather: 55, offset: 0 },
    radial: { centerX, centerY, radius, feather: 68 },
  };
}

/**
 * Buduje maskę AI-assist z jawnym confidence (np. po ONNX lub heurystyce).
 *
 * @param {{ kind: string, maskIndex: number, activeCropRectNorm?: object }} payload
 * @param {number} confidence surowe 0..1 (clampowane)
 * @returns {{ mask: object, confidence: number }}
 */
export function buildAiAssistMaskWithConfidence(payload, confidence) {
  const baseMask = buildLocalMaskAiAssistPreset(payload);
  const c = clamp(Number(confidence), 0, 1);
  const kind = String(payload?.kind ?? 'subject');
  const adjustedMask =
    kind === 'sky'
      ? {
          ...baseMask,
          ai: {
            ...(baseMask.ai && typeof baseMask.ai === 'object' ? baseMask.ai : {}),
            confidence: c,
          },
          opacity: Math.round(clamp(82 + c * 16, 0, 100)),
        }
      : kind === 'background'
        ? {
            ...baseMask,
            ai: {
              ...(baseMask.ai && typeof baseMask.ai === 'object' ? baseMask.ai : {}),
              confidence: c,
            },
            luma: {
              ...baseMask.luma,
              max: Math.round(
                clamp(Number(baseMask.luma?.max ?? 40) + (c - 0.75) * 12, 15, 62),
              ),
              feather: Math.round(clamp(36 + c * 22, 0, 100)),
            },
          }
        : {
            ...baseMask,
            ai: {
              ...(baseMask.ai && typeof baseMask.ai === 'object' ? baseMask.ai : {}),
              confidence: c,
            },
            radial: {
              ...baseMask.radial,
              feather: Math.round(clamp(62 + c * 18, 0, 100)),
            },
          };
  return {
    mask: adjustedMask,
    confidence: c,
  };
}

export function analyzeLocalMaskAiAssistPresetSync({ kind, maskIndex, activeCropRectNorm }) {
  const crop = getCropRectNorm(activeCropRectNorm);
  const estimatedSubjectCoverage = clamp(crop.w * crop.h, 0.04, 1);
  const confidence =
    kind === 'sky'
      ? clamp(0.76 + (1 - crop.y) * 0.12 - crop.h * 0.08, 0.55, 0.98)
      : kind === 'background'
        ? clamp(0.62 + (1 - estimatedSubjectCoverage) * 0.18 + crop.y * 0.08, 0.48, 0.94)
        : clamp(0.7 + estimatedSubjectCoverage * 0.22, 0.52, 0.96);
  const result = buildAiAssistMaskWithConfidence({ kind, maskIndex, activeCropRectNorm }, confidence);
  if (String(kind) === 'sky') {
    const spatial = buildSkySemanticAlphaRaster(256, 256, crop);
    return {
      ...result,
      mask: {
        ...result.mask,
        mode: 'brush',
        rasterAlpha: spatial,
        brush: {
          ...(result.mask.brush && typeof result.mask.brush === 'object' ? result.mask.brush : {}),
          strokes: [],
          paths: [],
        },
        linear: { angle: 0, feather: 55, offset: 0 },
        ai: {
          ...(result.mask.ai && typeof result.mask.ai === 'object' ? result.mask.ai : {}),
          pipeline: 'heuristic-raster',
        },
      },
    };
  }
  return result;
}
