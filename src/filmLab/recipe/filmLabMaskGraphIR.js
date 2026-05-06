/**
 * MaskGraphIR — wersjonowany DAG maski (ENGINE keys). Render nadal czyta `adjustments`;
 * recipe eksportuje ten IR jako źródło prawdy produktowej obok projekcji.
 */

/** @type {1} */
export const FILMLAB_MASK_GRAPH_IR_VERSION = 1;

/** Koperta grafu zapisana w `recipe.maskGraphs[]`. */
export const FILMLAB_MASK_GRAPH_IR_SCHEMA = 'mindfullens.mask-graph.ir-v1';

/** Operacje łączenia (ENGINE) — mapowanie z UI / adjustments.localMaskGraphOp. */
export const MASK_GRAPH_COMBINE_OPS = Object.freeze({
  ADD: 'ADD',
  SUBTRACT: 'SUBTRACT',
  INTERSECT: 'INTERSECT',
  INVERT: 'INVERT',
  REPLACE: 'REPLACE',
  PROTECT: 'PROTECT',
});

const LEGACY_OP_TO_IR = Object.freeze({
  union: MASK_GRAPH_COMBINE_OPS.ADD,
  add: MASK_GRAPH_COMBINE_OPS.ADD,
  subtract: MASK_GRAPH_COMBINE_OPS.SUBTRACT,
  intersection: MASK_GRAPH_COMBINE_OPS.INTERSECT,
  intersect: MASK_GRAPH_COMBINE_OPS.INTERSECT,
  invert: MASK_GRAPH_COMBINE_OPS.INVERT,
  replace: MASK_GRAPH_COMBINE_OPS.REPLACE,
  protect: MASK_GRAPH_COMBINE_OPS.PROTECT,
});

/**
 * @param {unknown} op
 * @returns {string}
 */
export function normalizeCombineOpToIr(op) {
  const k = String(op ?? '')
    .trim()
    .toLowerCase();
  if (Object.values(MASK_GRAPH_COMBINE_OPS).includes(String(op ?? '').toUpperCase())) {
    return String(op).toUpperCase();
  }
  return LEGACY_OP_TO_IR[k] ?? MASK_GRAPH_COMBINE_OPS.INTERSECT;
}

/**
 * @param {unknown} graph
 * @returns {boolean}
 */
export function isMaskGraphIrEnvelope(graph) {
  return (
    graph != null &&
    typeof graph === 'object' &&
    Number(graph.irVersion) === FILMLAB_MASK_GRAPH_IR_VERSION &&
    graph.schema === FILMLAB_MASK_GRAPH_IR_SCHEMA &&
    Array.isArray(graph.nodes)
  );
}

/**
 * Typy węzłów rozpoznawane przy walidacji importu (nie muszą być wyczerpujące).
 */
export const MASK_GRAPH_KNOWN_NODE_TYPES = Object.freeze([
  'mask.slot.v1',
  'combine.boolean.v1',
  'semantic.ai_hint.v1',
  'semantic.brush_strokes.v1',
  'semantic.linear_gradient.v1',
  'semantic.radial_gradient.v1',
  'semantic.luma_range.v1',
  'semantic.hue_range.v1',
  /** Rezerwacja pod mapę głębi (Etap 12+); evaluator bez danych depth = brak wpływu. */
  'semantic.depth_range.v1',
  /** P2 generative — placeholder w IR; renderer bez modelu = brak wpływu. */
  'semantic.generative_stub.v1',
]);

/**
 * @param {object} graph
 * @returns {object}
 */
export function ensureMaskGraphIrEnvelope(graph) {
  const g = graph && typeof graph === 'object' ? { ...graph } : {};
  if (!Array.isArray(g.nodes)) {
    g.nodes = [];
  } else {
    g.nodes = g.nodes.map((n) => cloneNodeWithCombineOp(n));
  }
  if (g.irVersion !== FILMLAB_MASK_GRAPH_IR_VERSION) {
    g.irVersion = FILMLAB_MASK_GRAPH_IR_VERSION;
  }
  if (g.schema !== FILMLAB_MASK_GRAPH_IR_SCHEMA) {
    g.schema = FILMLAB_MASK_GRAPH_IR_SCHEMA;
  }
  return g;
}

/**
 * Stary graf projekcyjny (`mindfullens.mask-graph.adjustments-projection-v1`) → koperta IR v1.
 *
 * @param {object} graph
 * @returns {object}
 */
export function migrateProjectionMaskGraphToIrV1(graph) {
  if (!graph || typeof graph !== 'object') {
    return {
      schema: FILMLAB_MASK_GRAPH_IR_SCHEMA,
      irVersion: FILMLAB_MASK_GRAPH_IR_VERSION,
      id: 'empty',
      name: '',
      generatedAt: Date.now(),
      nodes: [],
    };
  }

  if (isMaskGraphIrEnvelope(graph)) {
    return ensureMaskGraphIrEnvelope(graph);
  }

  const nodes = Array.isArray(graph.nodes) ? graph.nodes.map(cloneNodeWithCombineOp) : [];

  return {
    schema: FILMLAB_MASK_GRAPH_IR_SCHEMA,
    irVersion: FILMLAB_MASK_GRAPH_IR_VERSION,
    id: typeof graph.id === 'string' ? graph.id : 'migrated_graph',
    name: typeof graph.name === 'string' ? graph.name : '',
    generatedAt: Number.isFinite(Number(graph.generatedAt)) ? Number(graph.generatedAt) : Date.now(),
    legacyProjectionSchema:
      typeof graph.schema === 'string' ? graph.schema : 'mindfullens.mask-graph.legacy-unknown',
    nodes,
  };
}

function cloneNodeWithCombineOp(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }
  const n = { ...node };
  if (n.type === 'combine.boolean.v1' && n.operator != null) {
    n.combineOp = normalizeCombineOpToIr(n.operator);
  }
  return n;
}

/**
 * @param {object} doc — koperta v1
 * @returns {object}
 */
export function migrateRecipeDocumentMaskGraphsToIrV1(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.maskGraphs)) {
    return doc;
  }
  return {
    ...doc,
    maskGraphs: doc.maskGraphs.map((g) => migrateProjectionMaskGraphToIrV1(g)),
  };
}
