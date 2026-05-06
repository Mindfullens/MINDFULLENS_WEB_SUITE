/**
 * Węzły semantyczne grafu maski — równolegle do `mask.slot.v1`, pod przyszły evaluator (GPU/worker).
 * Parametry zgodne z UI (np. luma 0–100 jak w adjustments).
 */

/**
 * @param {object} slotLike — maska ze stacku lub obiekt jak `serializeLiveSlotFromAdjustments`
 * @param {string} idPrefix
 * @param {number | null} slotIndex
 * @returns {object[]}
 */
export function buildSemanticNodesForSlotLike(slotLike, idPrefix, slotIndex) {
  if (!slotLike || typeof slotLike !== 'object') {
    return [];
  }

  const mode = String(slotLike.mode ?? 'brush');
  const aiNodes = [];
  if (slotLike.source === 'ai-assist') {
    const kind = String(slotLike?.ai?.kind ?? '').toLowerCase();
    const aiKind =
      kind === 'sky' || kind === 'subject' || kind === 'background' ? kind : 'unknown';
    const confidenceRaw = Number(slotLike?.ai?.confidence);
    aiNodes.push({
      id: `${idPrefix}_semantic_ai_hint`,
      type: 'semantic.ai_hint.v1',
      slotIndex,
      kind: aiKind,
      confidence: Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : null,
      backend:
        typeof slotLike?.ai?.backend === 'string' && slotLike.ai.backend.trim() !== ''
          ? slotLike.ai.backend
          : null,
    });
  }

  if (mode === 'brush') {
    const strokes = Array.isArray(slotLike.brush?.strokes) ? slotLike.brush.strokes : [];
    let edgeWeightedStrokeCount = 0;
    for (const st of strokes) {
      if (st && typeof st === 'object' && typeof st.edgeGain === 'number' && Number.isFinite(st.edgeGain)) {
        edgeWeightedStrokeCount += 1;
      }
    }
    return [
      {
        id: `${idPrefix}_semantic_brush`,
        type: 'semantic.brush_strokes.v1',
        slotIndex,
        strokeCount: strokes.length,
        radius: Number(slotLike.brush?.radius ?? 32),
        feather: Number(slotLike.brush?.feather ?? 65),
        erase: Boolean(slotLike.brush?.erase),
        edgeSensitivity: Math.max(0, Math.min(100, Number(slotLike.brush?.edgeSensitivity ?? 0))),
        edgeWeightedStrokeCount,
      },
      ...aiNodes,
    ];
  }

  if (mode === 'linear') {
    const ln = slotLike.linear && typeof slotLike.linear === 'object' ? slotLike.linear : {};
    return [
      {
        id: `${idPrefix}_semantic_linear`,
        type: 'semantic.linear_gradient.v1',
        slotIndex,
        angle: Number(ln.angle ?? 0),
        feather: Number(ln.feather ?? 55),
        offset: Number(ln.offset ?? 0),
      },
      ...aiNodes,
    ];
  }

  if (mode === 'radial') {
    const rd = slotLike.radial && typeof slotLike.radial === 'object' ? slotLike.radial : {};
    return [
      {
        id: `${idPrefix}_semantic_radial`,
        type: 'semantic.radial_gradient.v1',
        slotIndex,
        centerX: Number(rd.centerX ?? 50),
        centerY: Number(rd.centerY ?? 50),
        radius: Number(rd.radius ?? 35),
        feather: Number(rd.feather ?? 55),
      },
      ...aiNodes,
    ];
  }

  if (mode === 'luma') {
    const lm = slotLike.luma && typeof slotLike.luma === 'object' ? slotLike.luma : {};
    return [
      {
        id: `${idPrefix}_semantic_luma`,
        type: 'semantic.luma_range.v1',
        slotIndex,
        min: Number(lm.min ?? 0),
        max: Number(lm.max ?? 100),
        feather: Number(lm.feather ?? 35),
      },
      ...aiNodes,
    ];
  }

  if (mode === 'color' || mode === 'hue') {
    const c = slotLike.color && typeof slotLike.color === 'object' ? slotLike.color : {};
    return [
      {
        id: `${idPrefix}_semantic_hue`,
        type: 'semantic.hue_range.v1',
        slotIndex,
        hueCenter: Number(c.hueCenter ?? 210),
        hueWidth: Number(c.hueWidth ?? 90),
        feather: Number(c.feather ?? 35),
        chromaMin: Number(c.chromaMin ?? 0),
        chromaMax: Number(c.chromaMax ?? 100),
      },
      ...aiNodes,
    ];
  }

  if (mode === 'depth') {
    const strokes = Array.isArray(slotLike.brush?.strokes) ? slotLike.brush.strokes : [];
    let edgeWeightedStrokeCount = 0;
    for (const st of strokes) {
      if (st && typeof st === 'object' && typeof st.edgeGain === 'number' && Number.isFinite(st.edgeGain)) {
        edgeWeightedStrokeCount += 1;
      }
    }
    const d = slotLike.depth && typeof slotLike.depth === 'object' ? slotLike.depth : {};
    const mapSource = String(d.mapSource ?? 'luminance');
    const proxySource = mapSource === 'luminance' ? 'luminance' : mapSource;
    return [
      {
        id: `${idPrefix}_semantic_brush`,
        type: 'semantic.brush_strokes.v1',
        slotIndex,
        strokeCount: strokes.length,
        radius: Number(slotLike.brush?.radius ?? 32),
        feather: Number(slotLike.brush?.feather ?? 65),
        erase: Boolean(slotLike.brush?.erase),
        edgeSensitivity: Math.max(0, Math.min(100, Number(slotLike.brush?.edgeSensitivity ?? 0))),
        edgeWeightedStrokeCount,
      },
      {
        id: `${idPrefix}_semantic_depth`,
        type: 'semantic.depth_range.v1',
        slotIndex,
        min: Number(d.min ?? 0),
        max: Number(d.max ?? 100),
        feather: Number(d.feather ?? 35),
        /** Zgodność wsteczna: dla `luminance` identyczne z mapSource; inaczej np. onnx po integracji. */
        proxySource,
        mapSource,
      },
      ...aiNodes,
    ];
  }

  return aiNodes;
}

/** Węzeł informacyjny dla roadmapy generative (recipe export); evaluator bez silnika = zarezerwowany. */
export function buildGenerativeStubSemanticNode() {
  return {
    id: 'semantic_generative_stub',
    type: 'semantic.generative_stub.v1',
    state: 'reserved',
  };
}
