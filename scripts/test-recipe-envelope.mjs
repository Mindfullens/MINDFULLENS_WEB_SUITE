import assert from 'node:assert/strict';
import { buildFilmLabRecipeDocumentFromFlatSnapshot } from '../src/filmLab/recipe/buildFilmLabRecipeDocument.js';
import {
  applySequentialAdjustmentPatches,
  buildSemanticNodesForSlotLike,
  decodeRecipeToFlatSnapshot,
  encodeFlatSnapshotToRecipeDocument,
  FILMLAB_AI_INDEX_SCHEMA,
  FILMLAB_MASK_GRAPH_IR_SCHEMA,
  FILMLAB_RECIPE_ENGINE_ID,
  FILMLAB_RECIPE_FORMAT_VERSION,
  FILMLAB_RECIPE_META_SCHEMA,
  FILMLAB_RECIPE_STATS_SCHEMA,
  fingerprintRecipeDocumentStable,
  isFilmLabRecipeDocumentV1,
  mergeRecipeGlobalAdjustmentsPatch,
  recipeDocumentToJsonString,
  softValidateRecipeDocument,
} from '../src/filmLab/recipe/index.js';
import {
  evaluateMaskGraphProjectionStub,
  FILMLAB_MASK_EVALUATOR_STUB,
} from '../src/filmLab/recipe/filmLabMaskGraphEvaluate.js';
import {
  buildMaskGraphsFromAdjustments,
  FILMLAB_MASK_GRAPH_PROJECTION_SCHEMA,
} from '../src/filmLab/recipe/filmLabRecipeMaskProjection.js';
import {
  createEmptyMaskGraph,
  FILMLAB_MASK_GRAPH_SCHEMA_STUB,
} from '../src/filmLab/recipe/filmLabRecipeStubMask.js';

const flat = {
  activeFilmIndex: 2,
  adjustments: { exposure: -0.25 },
  userCurves: { rgb: [[0, 0],[1, 1]] },
  colorMixer: { stubs: [] },
  colorGrading: {},
  colorCalibration: {},
  zoom: 1.5,
  panOffset: { x: 10, y: -3 },
};

const doc = encodeFlatSnapshotToRecipeDocument(flat);
assert.equal(doc.formatVersion, FILMLAB_RECIPE_FORMAT_VERSION);
assert.equal(doc.engine, FILMLAB_RECIPE_ENGINE_ID);
assert.ok(isFilmLabRecipeDocumentV1(doc));
assert.equal(doc.global.activeFilmIndex, 2);
assert.equal(doc.global.adjustments.exposure, -0.25);
assert.deepEqual(doc.maskGraphs, []);
assert.deepEqual(doc.layers, []);
assert.deepEqual(doc.aiIndex, {});
assert.equal(doc.recipeStats.schema, FILMLAB_RECIPE_STATS_SCHEMA);
assert.equal(doc.recipeStats.brushStrokeCount, 0);
assert.equal(doc.recipeStats.aiMaskCount, 0);
assert.equal(doc.recipeStats.aiAssistKpi100MsOk, null);
assert.equal(doc.recipeStats.generativeStubIntent, false);
assert.equal(doc.meta.schema, FILMLAB_RECIPE_META_SCHEMA);
assert.ok(Array.isArray(doc.history));

const round = decodeRecipeToFlatSnapshot(doc);
assert.equal(round.activeFilmIndex, 2);
assert.equal(round.adjustments.exposure, -0.25);
assert.equal(round.zoom, 1.5);

const legacy = { ...flat, strayMeta: true };
const fromLegacy = decodeRecipeToFlatSnapshot(legacy);
assert.equal(fromLegacy.strayMeta, true);

const stub = createEmptyMaskGraph({ id: 't1', name: 'Test' });
assert.equal(stub.schema, FILMLAB_MASK_GRAPH_SCHEMA_STUB);
assert.ok(Array.isArray(stub.nodes));

assert.ok(isFilmLabRecipeDocumentV1(buildFilmLabRecipeDocumentFromFlatSnapshot(flat)));

const maskAware = encodeFlatSnapshotToRecipeDocument({
  ...flat,
  adjustments: {
    brushMaskEnabled: true,
    brushMaskStrokes: [{ x: 0.1, y: 0.2, radius: 0.05 }],
    localMaskMode: 'brush',
  },
});
assert.equal(maskAware.maskGraphs.length, 1);
assert.equal(maskAware.maskGraphs[0].schema, FILMLAB_MASK_GRAPH_IR_SCHEMA);
assert.equal(maskAware.maskGraphs[0].legacyProjectionSchema, FILMLAB_MASK_GRAPH_PROJECTION_SCHEMA);
assert.ok(maskAware.maskGraphs[0].nodes.some((n) => n.id === 'mask_slot_live'));
assert.ok(maskAware.maskGraphs[0].nodes.some((n) => n.type === 'semantic.brush_strokes.v1'));

const stacked = buildMaskGraphsFromAdjustments({
  localMasks: [
    {
      name: 'A',
      enabled: true,
      mode: 'luma',
      opacity: 100,
      blend: 'normal',
      exposure: 0,
      brush: { strokes: [] },
      linear: {},
      radial: {},
      luma: { min: 10, max: 90, feather: 20 },
      color: {},
    },
  ],
  activeLocalMaskIndex: 0,
});
assert.equal(stacked.length, 1);
assert.ok(stacked[0].nodes.some((n) => n.type === 'mask.slot.v1'));
assert.ok(stacked[0].nodes.some((n) => n.type === 'semantic.luma_range.v1'));

const genOnly = buildMaskGraphsFromAdjustments({
  generativeAiStubIntent: true,
});
assert.equal(genOnly.length, 1);
assert.ok(
  genOnly[0].nodes.some(
    (n) => n.type === 'semantic.generative_stub.v1' && n.id === 'semantic_generative_stub'
  )
);
const evGenOnly = evaluateMaskGraphProjectionStub({ maskGraphs: genOnly, width: 640, height: 480 });
assert.equal(evGenOnly.hasGenerativeStub, true);
assert.equal(evGenOnly.hasDepthRangeSemantic, false);
assert.equal(evGenOnly.hasBrushEdgeSemantic, false);
assert.ok(evGenOnly.semanticNodeTypes.includes('semantic.generative_stub.v1'));
assert.equal(evGenOnly.nodeCountTotal, genOnly[0].nodes.length);

const depthOnly = buildMaskGraphsFromAdjustments({
  brushMaskEnabled: true,
  localMaskMode: 'depth',
  depthMaskMin: 5,
  depthMaskMax: 95,
  depthMaskFeather: 30,
  brushMaskStrokes: [{ x: 0.5, y: 0.5, radius: 0.05, feather: 0.65, erase: false }],
});
assert.ok(depthOnly[0].nodes.some((n) => n.type === 'semantic.depth_range.v1'));
const evDepthOnly = evaluateMaskGraphProjectionStub({ maskGraphs: depthOnly });
assert.equal(evDepthOnly.hasDepthRangeSemantic, true);
assert.equal(evDepthOnly.hasGenerativeStub, false);
assert.equal(evDepthOnly.hasBrushEdgeSemantic, false);

const brushEdgeOnly = buildMaskGraphsFromAdjustments({
  brushMaskEnabled: true,
  localMaskMode: 'brush',
  brushMaskEdgeSensitivity: 22,
  brushMaskStrokes: [],
});
const evBrushEdge = evaluateMaskGraphProjectionStub({ maskGraphs: brushEdgeOnly });
assert.equal(evBrushEdge.hasBrushEdgeSemantic, true);

const semDirect = buildSemanticNodesForSlotLike(
  {
    mode: 'luma',
    brush: {},
    linear: {},
    radial: {},
    luma: { min: 5, max: 95, feather: 10 },
    color: {},
  },
  'test',
  0
);
assert.equal(semDirect[0].type, 'semantic.luma_range.v1');

const aiDoc = encodeFlatSnapshotToRecipeDocument({
  ...flat,
  adjustments: {
    aiAssistBackend: 'fallback',
    aiAssistRuns: 2,
    aiAssistLastLatencyMs: 88.25,
    aiAssistTotalLatencyMs: 193.5,
    aiAssistBestLatencyMs: 74.4,
    aiAssistWorstLatencyMs: 105.25,
    localMasks: [
      {
        name: 'AI Sky 1',
        source: 'ai-assist',
        ai: { kind: 'sky', confidence: 0.87, backend: 'worker' },
        enabled: true,
        mode: 'linear',
        opacity: 90,
        blend: 'normal',
        exposure: -10,
        brush: { strokes: [] },
        linear: {},
        radial: {},
        luma: {},
        color: {},
      },
    ],
  },
});
assert.equal(aiDoc.aiIndex.schema, FILMLAB_AI_INDEX_SCHEMA);
assert.ok(aiDoc.aiIndex.slotHints?.slot_0);
assert.equal(aiDoc.aiIndex.slotHints?.slot_0?.kind, 'sky');
assert.equal(aiDoc.aiIndex.slotHints?.slot_0?.backend, 'worker');
assert.equal(Number(aiDoc.aiIndex.slotHints?.slot_0?.confidence), 0.87);
assert.equal(Number(aiDoc.aiIndex.latencyMs?.last), 88.25);
assert.equal(Number(aiDoc.aiIndex.latencyMs?.avg), 96.75);
assert.equal(Number(aiDoc.recipeStats.aiMaskCount), 1);
assert.equal(Number(aiDoc.recipeStats.aiAssistLatencyAvgMs), 96.75);
assert.equal(aiDoc.recipeStats.aiAssistKpi100MsOk, true);
assert.ok(aiDoc.maskGraphs[0].nodes.some((n) => n.type === 'semantic.linear_gradient.v1'));
assert.ok(aiDoc.maskGraphs[0].nodes.some((n) => n.type === 'semantic.ai_hint.v1'));

const ev = evaluateMaskGraphProjectionStub({ maskGraphs: aiDoc.maskGraphs, width: 800, height: 600 });
assert.equal(ev.evaluator, FILMLAB_MASK_EVALUATOR_STUB);
assert.equal(ev.graphCount, aiDoc.maskGraphs.length);
assert.equal(ev.hasGenerativeStub, false);
assert.equal(ev.hasDepthRangeSemantic, false);
assert.equal(ev.hasBrushEdgeSemantic, false);
assert.ok(ev.semanticNodeTypes.includes('semantic.ai_hint.v1'));
assert.ok(Number(ev.nodeCountTotal) >= 1);

const fpA = fingerprintRecipeDocumentStable(aiDoc);
const fpB = fingerprintRecipeDocumentStable(
  encodeFlatSnapshotToRecipeDocument({
    ...flat,
    adjustments: aiDoc.global.adjustments,
  })
);
assert.equal(fpA, fpB);

const patched = mergeRecipeGlobalAdjustmentsPatch(aiDoc, { exposure: 2 });
assert.equal(patched.global.adjustments.exposure, 2);

const seq = applySequentialAdjustmentPatches(doc, [{ exposure: 9 }, { contrast: 4 }]);
assert.equal(seq.global.adjustments.exposure, 9);
assert.equal(seq.global.adjustments.contrast, 4);

const valid = softValidateRecipeDocument(doc);
assert.equal(valid.ok, true);
assert.deepEqual(softValidateRecipeDocument(null).warnings.length > 0, true);

const genIntentDoc = encodeFlatSnapshotToRecipeDocument({
  ...flat,
  adjustments: { ...flat.adjustments, generativeAiStubIntent: true },
});
assert.equal(softValidateRecipeDocument(genIntentDoc).ok, true, 'intent + stub node should validate');
const strippedGenerative = {
  ...genIntentDoc,
  maskGraphs: genIntentDoc.maskGraphs.map((g) => ({
    ...g,
    nodes: Array.isArray(g.nodes)
      ? g.nodes.filter((n) => n?.type !== 'semantic.generative_stub.v1')
      : [],
  })),
};
assert.ok(
  softValidateRecipeDocument(strippedGenerative).warnings.includes('generative_stub_intent_without_node')
);
const noIntentButStub = encodeFlatSnapshotToRecipeDocument({
  ...flat,
  adjustments: { ...flat.adjustments, generativeAiStubIntent: false },
});
const stubOnlyGraphs = buildMaskGraphsFromAdjustments({ generativeAiStubIntent: true });
const orphanGenerative = { ...noIntentButStub, maskGraphs: stubOnlyGraphs };
assert.ok(
  softValidateRecipeDocument(orphanGenerative).warnings.includes('generative_stub_node_without_intent')
);

const coherentLayers = encodeFlatSnapshotToRecipeDocument({
  ...flat,
  adjustments: {
    ...flat.adjustments,
    recipeLayersV0: [{ name: 'Warstwa 1', maskIndex: 0 }],
    localMasks: [
      {
        name: 'Maska',
        enabled: true,
        mode: 'brush',
        opacity: 100,
        blend: 'normal',
        exposure: 0,
        brush: {},
        linear: {},
        radial: {},
        luma: {},
        color: {},
      },
    ],
  },
});
const coherentValid = softValidateRecipeDocument(coherentLayers);
assert.equal(coherentValid.ok, true, coherentValid.warnings.join(','));

const unresolvedLayer = {
  ...encodeFlatSnapshotToRecipeDocument(flat),
  layers: [{ order: 0, layerStackBindingVersion: 1, maskGraphNodeId: 'missing_mask_node' }],
};
const badLayer = softValidateRecipeDocument(unresolvedLayer);
assert.ok(badLayer.warnings.some((w) => w.startsWith('layer_maskGraphNodeId_unresolved_')));

const baseGraph = encodeFlatSnapshotToRecipeDocument({
  ...flat,
  adjustments: {
    exposure: 0,
    localMasks: [
      {
        name: 'M',
        enabled: true,
        mode: 'brush',
        opacity: 100,
        blend: 'normal',
        exposure: 0,
        brush: {},
        linear: {},
        radial: {},
        luma: {},
        color: {},
      },
    ],
  },
}).maskGraphs[0];
const dupNodes = [...baseGraph.nodes];
if (dupNodes.length > 0) {
  dupNodes.push({ ...dupNodes[0], id: dupNodes[0].id });
  const dupDoc = {
    ...encodeFlatSnapshotToRecipeDocument(flat),
    maskGraphs: [{ ...baseGraph, nodes: dupNodes }],
  };
  const dupValid = softValidateRecipeDocument(dupDoc);
  assert.ok(dupValid.warnings.some((w) => w.startsWith('maskGraph_duplicate_node_id_')));
}

const jsonRound = JSON.parse(recipeDocumentToJsonString(doc));
assert.equal(jsonRound.formatVersion, FILMLAB_RECIPE_FORMAT_VERSION);

console.log('OK Recipe envelope codec');
