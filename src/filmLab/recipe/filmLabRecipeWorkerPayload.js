import { fingerprintRecipeDocumentStable } from './filmLabRecipeFingerprint.js';
import { maskGraphHasBrushEdgeSemantic } from './filmLabMaskGraphEvaluate.js';

export const FILMLAB_WORKER_PAYLOAD_SCHEMA = 'mindfullens.mask-engine.worker-payload.v0';

/**
 * Kompaktowy payload do postMessage / przyszłego workera masek (bez pełnych stroke arrays).
 *
 * @param {object | null | undefined} recipeDocument
 */
export function buildMaskEngineWorkerPayload(recipeDocument) {
  if (!recipeDocument || typeof recipeDocument !== 'object') {
    return { schema: FILMLAB_WORKER_PAYLOAD_SCHEMA, ok: false };
  }

  const maskGraphs = Array.isArray(recipeDocument.maskGraphs) ? recipeDocument.maskGraphs : [];
  const graphs = maskGraphs.map((g) => ({
    id: g?.id ?? null,
    schema: g?.schema ?? null,
    nodeCount: Array.isArray(g?.nodes) ? g.nodes.length : 0,
    semanticKinds: Array.isArray(g?.nodes)
      ? [...new Set(g.nodes.map((n) => n?.type).filter(Boolean))]
      : [],
  }));

  const ai = recipeDocument.aiIndex && typeof recipeDocument.aiIndex === 'object' ? recipeDocument.aiIndex : {};
  const adj =
    recipeDocument.global?.adjustments && typeof recipeDocument.global.adjustments === 'object'
      ? recipeDocument.global.adjustments
      : {};
  const hasGenerativeSemanticStub = graphs.some(
    (gr) =>
      Array.isArray(gr?.semanticKinds) && gr.semanticKinds.includes('semantic.generative_stub.v1')
  );
  const hasDepthRangeSemantic = graphs.some(
    (gr) =>
      Array.isArray(gr?.semanticKinds) && gr.semanticKinds.includes('semantic.depth_range.v1')
  );
  const hasBrushEdgeSemantic = maskGraphHasBrushEdgeSemantic(maskGraphs);

  return {
    schema: FILMLAB_WORKER_PAYLOAD_SCHEMA,
    ok: true,
    formatVersion: recipeDocument.formatVersion ?? null,
    fingerprint: fingerprintRecipeDocumentStable(recipeDocument),
    graphs,
    aiIndexKeys: Object.keys(ai),
    generativeStubIntent: Boolean(adj.generativeAiStubIntent),
    hasGenerativeSemanticStub,
    hasDepthRangeSemantic,
    hasBrushEdgeSemantic,
  };
}
