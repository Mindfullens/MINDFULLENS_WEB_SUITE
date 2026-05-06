/**
 * Docelowy tor: GPU/worker liczy maskę z grafu. Stub zostawia jawny kontrakt API.
 */

export const FILMLAB_MASK_EVALUATOR_STUB = 'mindfullens.mask-evaluator.stub-v0';

/**
 * True when recipe semantic lists brush edge weighting (Sobel proxy) via sensitivity or stamped strokes.
 *
 * @param {object[] | null | undefined} maskGraphs
 */
export function maskGraphHasBrushEdgeSemantic(maskGraphs) {
  const graphs = Array.isArray(maskGraphs) ? maskGraphs : [];
  for (const g of graphs) {
    const nodes = Array.isArray(g?.nodes) ? g.nodes : [];
    for (const n of nodes) {
      if (n?.type !== 'semantic.brush_strokes.v1') {
        continue;
      }
      const sens = Number(n.edgeSensitivity);
      const cnt = Number(n.edgeWeightedStrokeCount);
      if ((Number.isFinite(sens) && sens > 0) || (Number.isFinite(cnt) && cnt > 0)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {{
 *   maskGraphs?: object[],
 *   width?: number,
 *   height?: number,
 * }} [options]
 */
export function evaluateMaskGraphProjectionStub(options = {}) {
  const maskGraphs = Array.isArray(options.maskGraphs) ? options.maskGraphs : [];
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;

  let nodeCountTotal = 0;
  const semanticTypes = new Set();
  for (const g of maskGraphs) {
    const nodes = Array.isArray(g?.nodes) ? g.nodes : [];
    nodeCountTotal += nodes.length;
    for (const n of nodes) {
      const t = n && typeof n.type === 'string' ? n.type.trim() : '';
      if (t) {
        semanticTypes.add(t);
      }
    }
  }
  const semanticNodeTypes = [...semanticTypes].sort();

  return {
    evaluator: FILMLAB_MASK_EVALUATOR_STUB,
    ok: true,
    width,
    height,
    graphCount: maskGraphs.length,
    nodeCountTotal,
    semanticNodeTypes,
    hasGenerativeStub: semanticTypes.has('semantic.generative_stub.v1'),
    hasDepthRangeSemantic: semanticTypes.has('semantic.depth_range.v1'),
    hasBrushEdgeSemantic: maskGraphHasBrushEdgeSemantic(maskGraphs),
    nodeRasterAvailable: false,
    rasterByNodeId: {},
    note: 'Evaluator stub — rendering still driven by adjustments + engine.',
  };
}
