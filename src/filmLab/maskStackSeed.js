/**
 * Shared mask slot factory — used by Mask Studio UI + canvas auto-create.
 */

export function buildEmptyMaskSlot(t, nextId, mode) {
  return {
    name: t('filmLab.localMask.defaultName', { n: nextId }),
    enabled: true,
    mode: String(mode ?? 'brush'),
    opacity: 100,
    blend: 'normal',
    exposure: 20,
    brush: {
      radius: 30,
      feather: 100,
      flow: 20,
      density: 60,
      erase: false,
      edgeSensitivity: 68,
      strokes: [],
      paths: [],
    },
    linear: { angle: 0, feather: 55, offset: 0 },
    radial: { centerX: 50, centerY: 50, radius: 35, feather: 55 },
    luma: { min: 0, max: 100, feather: 35 },
    color: { hueCenter: 210, hueWidth: 90, feather: 35, chromaMin: 0, chromaMax: 100 },
    tone: {
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      temp: 0,
      tint: 0,
      saturation: 0,
    },
  };
}

/**
 * Maps first mask slot into flat adjustments (Film Lab adjustment keys).
 */
export function flatAdjustmentsFromMaskSlot(created) {
  return {
    localMaskName: created.name,
    localMaskEnabled: created.enabled !== false,
    localMaskMode: String(created.mode ?? 'brush'),
    localMaskOpacity: Number(created.opacity ?? 100),
    localMaskBlend: String(created.blend ?? 'normal'),
    brushMaskExposure: Number(created.exposure ?? 20),
    brushMaskContrast: Number(created.tone?.contrast ?? 0),
    brushMaskHighlights: Number(created.tone?.highlights ?? 0),
    brushMaskShadows: Number(created.tone?.shadows ?? 0),
    brushMaskWhites: Number(created.tone?.whites ?? 0),
    brushMaskBlacks: Number(created.tone?.blacks ?? 0),
    brushMaskTemp: Number(created.tone?.temp ?? 0),
    brushMaskTint: Number(created.tone?.tint ?? 0),
    brushMaskSaturation: Number(created.tone?.saturation ?? 0),
    brushMaskRadius: Number(created.brush?.radius ?? 30),
    brushMaskFeather: Number(created.brush?.feather ?? 100),
    brushMaskFlow: Math.max(1, Math.min(100, Number(created.brush?.flow ?? 20))),
    brushMaskDensity: Math.max(1, Math.min(100, Number(created.brush?.density ?? 60))),
    brushMaskErase: Boolean(created.brush?.erase),
    brushMaskEdgeSensitivity: Math.max(0, Math.min(100, Number(created.brush?.edgeSensitivity ?? 68))),
    brushMaskStrokes: [],
    brushMaskPaths: [],
    localMaskRasterAlpha:
      created?.rasterAlpha?.data instanceof Float32Array && created.rasterAlpha.width > 0
        ? created.rasterAlpha
        : null,
    brushMaskRadiusNorm: null,
    linearMaskAngle: Number(created.linear?.angle ?? 0),
    linearMaskFeather: Number(created.linear?.feather ?? 55),
    linearMaskOffset: Number(created.linear?.offset ?? 0),
    radialMaskCenterX: Number(created.radial?.centerX ?? 50),
    radialMaskCenterY: Number(created.radial?.centerY ?? 50),
    radialMaskRadius: Number(created.radial?.radius ?? 35),
    radialMaskFeather: Number(created.radial?.feather ?? 55),
    lumaMaskMin: Number(created.luma?.min ?? 0),
    lumaMaskMax: Number(created.luma?.max ?? 100),
    lumaMaskFeather: Number(created.luma?.feather ?? 35),
    colorMaskHueCenter: Number(created.color?.hueCenter ?? 210),
    colorMaskHueWidth: Number(created.color?.hueWidth ?? 90),
    colorMaskFeather: Number(created.color?.feather ?? 35),
    colorMaskChromaMin: Number(created.color?.chromaMin ?? 0),
    colorMaskChromaMax: Number(created.color?.chromaMax ?? 100),
    depthMaskMin: Number(created.depth?.min ?? 0),
    depthMaskMax: Number(created.depth?.max ?? 100),
    depthMaskFeather: Number(created.depth?.feather ?? 35),
  };
}

/** When layer stack is empty, create Mask 1 (masks workspace brush UX). */
export function seedFirstMaskLayerIfEmpty(current, t, preferredMode) {
  const stack = Array.isArray(current.localMasks) ? current.localMasks : [];
  if (stack.length > 0) {
    return current;
  }
  const mode = String(preferredMode ?? current.localMaskMode ?? 'brush');
  const slot = buildEmptyMaskSlot(t, 1, mode);
  return {
    ...current,
    localMasks: [slot],
    activeLocalMaskIndex: 0,
    localMaskSoloIndex: -1,
    brushMaskEnabled: true,
    ...flatAdjustmentsFromMaskSlot(slot),
  };
}
