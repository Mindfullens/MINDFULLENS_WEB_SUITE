import { isMaskGraphIrEnvelope, MASK_GRAPH_KNOWN_NODE_TYPES } from './filmLabMaskGraphIR.js';
import { isFilmLabRecipeDocumentV1 } from './filmLabRecipeCodec.js';

/**
 * Zbiera identyfikatory węzłów ze wszystkich kopert IR v1 w `maskGraphs`.
 *
 * @param {object} doc
 * @returns {Set<string>}
 */
function collectMaskGraphNodeIds(doc) {
  /** @type {Set<string>} */
  const ids = new Set();
  if (!Array.isArray(doc.maskGraphs)) {
    return ids;
  }
  for (const g of doc.maskGraphs) {
    if (!isMaskGraphIrEnvelope(g) || !Array.isArray(g.nodes)) {
      continue;
    }
    for (const n of g.nodes) {
      if (n && typeof n === 'object' && typeof n.id === 'string' && n.id.trim().length > 0) {
        ids.add(n.id.trim());
      }
    }
  }
  return ids;
}

/**
 * Duplikaty `id` między węzłami (wszystkie grafy) — ryzyko niespójnego resolve przy warstwach.
 *
 * @param {object} doc
 * @returns {string[]}
 */
function collectDuplicateMaskGraphNodeIdWarnings(doc) {
  /** @type {string[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  if (!Array.isArray(doc.maskGraphs)) {
    return out;
  }
  for (let gi = 0; gi < doc.maskGraphs.length; gi += 1) {
    const g = doc.maskGraphs[gi];
    if (!isMaskGraphIrEnvelope(g) || !Array.isArray(g.nodes)) {
      continue;
    }
    for (let j = 0; j < g.nodes.length; j += 1) {
      const n = g.nodes[j];
      const id = n && typeof n === 'object' && typeof n.id === 'string' ? n.id.trim() : '';
      if (!id) {
        continue;
      }
      if (seen.has(id)) {
        out.push(`maskGraph_duplicate_node_id_${gi}_${j}`);
      }
      seen.add(id);
    }
  }
  return out;
}

/**
 * Walidacja miękka — ostrzeżenia bez rzucania (CLI, import sidecar).
 *
 * @param {unknown} doc
 * @returns {{ ok: boolean, warnings: string[] }}
 */
export function softValidateRecipeDocument(doc) {
  /** @type {string[]} */
  const warnings = [];

  if (!doc || typeof doc !== 'object') {
    return { ok: false, warnings: ['not_an_object'] };
  }

  if (!isFilmLabRecipeDocumentV1(doc)) {
    warnings.push('not_recipe_v1_envelope');
    return { ok: false, warnings };
  }

  if (!Array.isArray(doc.maskGraphs)) {
    warnings.push('maskGraphs_not_array');
  } else {
    doc.maskGraphs.forEach((g, i) => {
      if (!isMaskGraphIrEnvelope(g)) {
        warnings.push(`maskGraph_ir_mismatch_${i}`);
      } else {
        g.nodes.forEach((n, j) => {
          if (!n || typeof n !== 'object' || typeof n.id !== 'string' || n.id.length === 0) {
            warnings.push(`maskGraph_node_id_${i}_${j}`);
          }
          if (typeof n.type === 'string' && n.type.length > 0 && !MASK_GRAPH_KNOWN_NODE_TYPES.includes(n.type)) {
            warnings.push(`maskGraph_node_type_unknown_${i}_${j}`);
          }
        });
      }
    });
    warnings.push(...collectDuplicateMaskGraphNodeIdWarnings(doc));
  }
  const maskGraphNodeIds = collectMaskGraphNodeIds(doc);
  if (!Array.isArray(doc.layers)) {
    warnings.push('layers_not_array');
  } else {
    doc.layers.forEach((layer, i) => {
      if (layer && typeof layer === 'object' && layer.layerStackBindingVersion === 1) {
        const mid = typeof layer.maskGraphNodeId === 'string' ? layer.maskGraphNodeId.trim() : '';
        if (!mid) {
          warnings.push(`layer_maskGraphNodeId_${i}`);
        } else if (!maskGraphNodeIds.has(mid)) {
          warnings.push(`layer_maskGraphNodeId_unresolved_${i}`);
        }
      }
    });
  }

  const adjGlobal =
    doc.global?.adjustments && typeof doc.global.adjustments === 'object' ? doc.global.adjustments : {};
  const generativeIntent = Boolean(adjGlobal.generativeAiStubIntent);
  let hasGenerativeStubNode = false;
  if (Array.isArray(doc.maskGraphs)) {
    for (const g of doc.maskGraphs) {
      if (!isMaskGraphIrEnvelope(g) || !Array.isArray(g.nodes)) {
        continue;
      }
      for (const n of g.nodes) {
        if (n?.type === 'semantic.generative_stub.v1') {
          hasGenerativeStubNode = true;
          break;
        }
      }
      if (hasGenerativeStubNode) {
        break;
      }
    }
  }
  if (generativeIntent && !hasGenerativeStubNode) {
    warnings.push('generative_stub_intent_without_node');
  }
  if (!generativeIntent && hasGenerativeStubNode) {
    warnings.push('generative_stub_node_without_intent');
  }

  if (doc.global?.adjustments != null && typeof doc.global.adjustments !== 'object') {
    warnings.push('global_adjustments_not_object');
  }
  if (doc.meta != null && typeof doc.meta !== 'object') {
    warnings.push('meta_not_object');
  }
  if (doc.meta?.fingerprintStable != null && typeof doc.meta.fingerprintStable !== 'string') {
    warnings.push('fingerprint_not_string');
  }

  return { ok: warnings.length === 0, warnings };
}
