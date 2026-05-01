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
    const cropTopPercent = crop.y * 100;
    const cropHeightPercent = crop.h * 100;
    const offset = clamp(-24 - cropTopPercent * 0.45 + (100 - cropHeightPercent) * 0.2, -80, 40);
    return {
      name: `AI Sky ${maskIndex}`,
      source: 'ai-assist',
      ai: { kind: 'sky' },
      enabled: true,
      mode: 'linear',
      opacity: 100,
      blend: 'normal',
      exposure: -18,
      brush: { radius: 80, feather: 65, erase: false, strokes: [] },
      linear: { angle: -90, feather: 72, offset },
      radial: { centerX, centerY, radius: 35, feather: 55 },
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
    brush: { radius: 80, feather: 65, erase: false, strokes: [] },
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
      : clamp(0.7 + estimatedSubjectCoverage * 0.22, 0.52, 0.96);
  return buildAiAssistMaskWithConfidence({ kind, maskIndex, activeCropRectNorm }, confidence);
}
