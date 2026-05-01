/**
 * Derives portable mask graphs from flat `adjustments` (projection — silnik renderu nadal czyta adjustment keys).
 * Eksportowany dokument używa koperty MaskGraphIR v1 (`migrateProjectionMaskGraphToIrV1`).
 */

import { migrateProjectionMaskGraphToIrV1, normalizeCombineOpToIr } from './filmLabMaskGraphIR.js';
import {
  buildGenerativeStubSemanticNode,
  buildSemanticNodesForSlotLike,
} from './filmLabRecipeSemanticNodes.js';

export const FILMLAB_MASK_GRAPH_PROJECTION_SCHEMA = 'mindfullens.mask-graph.adjustments-projection-v1';

/**
 * @param {object | null | undefined} mask — wpis ze `adjustments.localMasks`
 * @param {number} index
 */
function serializeMaskSlot(mask, index) {
  const m = mask && typeof mask === 'object' ? mask : {};
  return {
    id: `mask_slot_${index}`,
    type: 'mask.slot.v1',
    slotIndex: index,
    name: String(m.name ?? `Mask ${index + 1}`),
    enabled: m.enabled !== false,
    mode: String(m.mode ?? 'brush'),
    opacity: Number(m.opacity ?? 100),
    blend: String(m.blend ?? 'normal'),
    exposure: Number(m.exposure ?? 0),
    source: m.source ?? null,
    brush: m.brush && typeof m.brush === 'object' ? m.brush : {},
    linear: m.linear && typeof m.linear === 'object' ? m.linear : {},
    radial: m.radial && typeof m.radial === 'object' ? m.radial : {},
    luma: m.luma && typeof m.luma === 'object' ? m.luma : {},
    color: m.color && typeof m.color === 'object' ? m.color : {},
    depth: m.depth && typeof m.depth === 'object' ? m.depth : {},
  };
}

/**
 * Odtwarza aktualnie edytowaną maskę z top-level adjustment keys (gdy stack pusty lub niezcommitowany).
 */
function serializeLiveSlotFromAdjustments(adj) {
  return {
    id: 'mask_slot_live',
    type: 'mask.slot.v1',
    slotIndex: null,
    name: String(adj.localMaskName ?? 'Maska'),
    enabled: adj.localMaskEnabled !== false,
    mode: String(adj.localMaskMode ?? 'brush'),
    opacity: Number(adj.localMaskOpacity ?? 100),
    blend: String(adj.localMaskBlend ?? 'normal'),
    exposure: Number(adj.brushMaskExposure ?? 0),
    source: null,
    brush: {
      radius: Number(adj.brushMaskRadius ?? 80),
      feather: Number(adj.brushMaskFeather ?? 65),
      erase: Boolean(adj.brushMaskErase),
      edgeSensitivity: Math.max(0, Math.min(100, Number(adj.brushMaskEdgeSensitivity ?? 0))),
      strokes: Array.isArray(adj.brushMaskStrokes) ? adj.brushMaskStrokes : [],
    },
    linear: {
      angle: Number(adj.linearMaskAngle ?? 0),
      feather: Number(adj.linearMaskFeather ?? 55),
      offset: Number(adj.linearMaskOffset ?? 0),
    },
    radial: {
      centerX: Number(adj.radialMaskCenterX ?? 50),
      centerY: Number(adj.radialMaskCenterY ?? 50),
      radius: Number(adj.radialMaskRadius ?? 35),
      feather: Number(adj.radialMaskFeather ?? 55),
    },
    luma: {
      min: Number(adj.lumaMaskMin ?? 0),
      max: Number(adj.lumaMaskMax ?? 100),
      feather: Number(adj.lumaMaskFeather ?? 35),
    },
    color: {
      hueCenter: Number(adj.colorMaskHueCenter ?? 210),
      hueWidth: Number(adj.colorMaskHueWidth ?? 90),
      feather: Number(adj.colorMaskFeather ?? 35),
      chromaMin: Number(adj.colorMaskChromaMin ?? 0),
      chromaMax: Number(adj.colorMaskChromaMax ?? 100),
    },
    depth: {
      min: Number(adj.depthMaskMin ?? 0),
      max: Number(adj.depthMaskMax ?? 100),
      feather: Number(adj.depthMaskFeather ?? 35),
      mapSource: String(adj.depthMapSource ?? 'luminance'),
    },
  };
}

/**
 * @param {object} adjustments
 * @returns {object[]}
 */
export function buildMaskGraphsFromAdjustments(adjustments) {
  if (!adjustments || typeof adjustments !== 'object') {
    return [];
  }

  const stack = Array.isArray(adjustments.localMasks) ? adjustments.localMasks : [];
  /** @type {object[]} */
  const nodes = [];

  for (let i = 0; i < stack.length; i += 1) {
    const slot = stack[i];
    nodes.push(serializeMaskSlot(slot, i));
    nodes.push(...buildSemanticNodesForSlotLike(slot, `slot_${i}`, i));
  }

  const shouldAttachLiveSlot =
    stack.length === 0 &&
    (Boolean(adjustments.brushMaskEnabled) ||
      (Array.isArray(adjustments.brushMaskStrokes) && adjustments.brushMaskStrokes.length > 0));

  if (shouldAttachLiveSlot) {
    const live = serializeLiveSlotFromAdjustments(adjustments);
    nodes.push(live);
    nodes.push(...buildSemanticNodesForSlotLike(live, 'live', null));
  }

  if (adjustments.localMaskGraphEnabled) {
    const opRaw = adjustments.localMaskGraphOp ?? 'intersect';
    nodes.push({
      id: 'combine_boolean',
      type: 'combine.boolean.v1',
      operator: String(opRaw),
      combineOp: normalizeCombineOpToIr(opRaw),
      slotIndexA: Number(adjustments.localMaskGraphIndexA ?? 0),
      slotIndexB: Number(adjustments.localMaskGraphIndexB ?? 1),
    });
  }

  if (adjustments.generativeAiStubIntent) {
    nodes.push(buildGenerativeStubSemanticNode());
  }

  if (nodes.length === 0) {
    return [];
  }

  return [
    migrateProjectionMaskGraphToIrV1({
      schema: FILMLAB_MASK_GRAPH_PROJECTION_SCHEMA,
      id: 'projection_adjustments_main',
      name: 'Adjustments ↔ graph projection',
      generatedAt: Date.now(),
      nodes,
    }),
  ];
}

/**
 * Warstwy v0 — kopia listy z adjustments (źródło prawdy nadal w global.adjustments.recipeLayersV0).
 *
 * @param {object} adjustments
 * @returns {object[]}
 */
export function buildRecipeLayersEnvelopeFromAdjustments(adjustments) {
  const raw = adjustments?.recipeLayersV0;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((layer, order) => {
    const base = layer && typeof layer === 'object' ? { ...layer } : {};
    const maskIndex = Number.isFinite(Number(base.maskIndex)) ? Math.round(Number(base.maskIndex)) : 0;
    return {
      ...base,
      order,
      layerStackBindingVersion: 1,
      maskGraphNodeId:
        typeof base.maskGraphNodeId === 'string' && base.maskGraphNodeId.trim() !== ''
          ? base.maskGraphNodeId.trim()
          : `mask_slot_${maskIndex}`,
    };
  });
}
