import assert from 'node:assert/strict';
import {
  FILMLAB_RECIPE_APPLY_UI_EVENT,
  RECIPE_IMPORT_UI_CODE,
  applyRecipeTextToWorkbench,
  buildMaskEngineWorkerPayload,
  buildMaskGraphsFromAdjustments,
  decodeRecipeToFlatSnapshot,
  dispatchRecipeApplyUiResult,
  encodeFlatSnapshotToRecipeDocument,
  FILMLAB_WORKER_PAYLOAD_SCHEMA,
  isFilmLabRecipeDocumentV1,
  isFilmLabRecipeDropFilename,
  normalizeToRecipeDocumentV1,
  parseRecipeDocumentJson,
  recipeDocumentToJsonString,
  recipeImportUiDetailLine,
} from '../src/filmLab/recipe/index.js';
import { cloneSnapshotSafe } from '../src/filmLab/sessionSnapshot.js';

const minimalFlat = {
  activeFilmIndex: 0,
  adjustments: { exposure: 0.5 },
  userCurves: {},
  colorMixer: {},
  colorGrading: {},
  colorCalibration: {},
  zoom: 1,
  panOffset: { x: 0, y: 0 },
};

const doc = encodeFlatSnapshotToRecipeDocument(minimalFlat);
const json = recipeDocumentToJsonString(doc);
const parsed = parseRecipeDocumentJson(json);
assert.equal(parsed.ok, true);
assert.equal(parsed.document?.formatVersion, 1);
assert.equal(parsed.validEnvelope, true);

const broken = parseRecipeDocumentJson('{');
assert.equal(broken.ok, false);

const flatDecoded = decodeRecipeToFlatSnapshot(parsed.document);
assert.ok(flatDecoded && typeof flatDecoded === 'object');
const clonedBench = cloneSnapshotSafe(flatDecoded);
assert.ok(clonedBench);
assert.equal(Number(clonedBench.adjustments.exposure), 0.5);

const norm = normalizeToRecipeDocumentV1(doc);
assert.equal(norm.formatVersion, 1);

const wp = buildMaskEngineWorkerPayload(doc);
assert.equal(wp.schema, FILMLAB_WORKER_PAYLOAD_SCHEMA);
assert.equal(wp.ok, true);
assert.ok(typeof wp.fingerprint === 'string' && wp.fingerprint.length > 0);
assert.equal(wp.generativeStubIntent, false);
assert.equal(wp.hasGenerativeSemanticStub, false);
assert.equal(wp.hasDepthRangeSemantic, false);
assert.equal(wp.hasBrushEdgeSemantic, false);

const genFlat = {
  ...minimalFlat,
  adjustments: { ...minimalFlat.adjustments, generativeAiStubIntent: true },
};
const genDoc = encodeFlatSnapshotToRecipeDocument(genFlat);
assert.equal(genDoc.recipeStats.generativeStubIntent, true);
assert.ok(genDoc.maskGraphs.length >= 1);
assert.ok(
  genDoc.maskGraphs.some((g) =>
    Array.isArray(g?.nodes) &&
    g.nodes.some((n) => n?.type === 'semantic.generative_stub.v1')
  )
);
const genJson = recipeDocumentToJsonString(genDoc);
const genParsed = parseRecipeDocumentJson(genJson);
assert.equal(genParsed.ok, true);
const genFlatBack = decodeRecipeToFlatSnapshot(genParsed.document);
assert.equal(genFlatBack.adjustments.generativeAiStubIntent, true);
const wpGen = buildMaskEngineWorkerPayload(genDoc);
assert.equal(wpGen.ok, true);
assert.equal(wpGen.generativeStubIntent, true);
assert.equal(wpGen.hasGenerativeSemanticStub, true);
assert.equal(wpGen.hasDepthRangeSemantic, false);
assert.equal(wpGen.hasBrushEdgeSemantic, false);
assert.ok(
  wpGen.graphs.some((g) =>
    Array.isArray(g.semanticKinds) && g.semanticKinds.includes('semantic.generative_stub.v1')
  )
);

let appliedDoc = null;
const applyOk = applyRecipeTextToWorkbench(json, (d) => {
  appliedDoc = d;
  return true;
});
assert.equal(applyOk.ok, true);
assert.ok(appliedDoc && appliedDoc.formatVersion === 1);

const applyFail = applyRecipeTextToWorkbench('not json', () => true);
assert.equal(applyFail.ok, false);
assert.equal(applyFail.detail, 'json_parse_error');

const applyRejected = applyRecipeTextToWorkbench(json, () => false);
assert.equal(applyRejected.ok, false);
assert.equal(applyRejected.detail, RECIPE_IMPORT_UI_CODE.APPLY_REJECTED);

const applyNoHandler = applyRecipeTextToWorkbench(json, undefined);
assert.equal(applyNoHandler.ok, false);
assert.equal(applyNoHandler.detail, RECIPE_IMPORT_UI_CODE.APPLY_MISSING_HANDLER);

assert.equal(
  recipeImportUiDetailLine(RECIPE_IMPORT_UI_CODE.CLIPBOARD_READ_FAILED, 'x'),
  `${RECIPE_IMPORT_UI_CODE.CLIPBOARD_READ_FAILED} — x`,
);

const depthRecipeAdj = {
  brushMaskEnabled: true,
  localMaskMode: 'depth',
  depthMaskMin: 12,
  depthMaskMax: 88,
  depthMaskFeather: 40,
  brushMaskRadius: 80,
  brushMaskFeather: 65,
  brushMaskStrokes: [{ x: 0.5, y: 0.5, radius: 0.08, feather: 0.6, erase: false }],
};
const depthGraphs = buildMaskGraphsFromAdjustments(depthRecipeAdj);
assert.ok(depthGraphs.length >= 1);
const depthNodes = depthGraphs[0]?.nodes ?? [];
const depthSemantic = depthNodes.find((n) => n?.type === 'semantic.depth_range.v1');
assert.ok(depthSemantic);
assert.equal(depthSemantic.min, 12);
assert.equal(depthSemantic.max, 88);
assert.equal(depthSemantic.feather, 40);
assert.equal(depthSemantic.proxySource, 'luminance');
assert.equal(depthSemantic.mapSource, 'luminance');
assert.ok(depthNodes.some((n) => n?.type === 'semantic.brush_strokes.v1'));

const depthOnnxAdj = { ...depthRecipeAdj, depthMapSource: 'onnx-mock' };
const graphsOnnx = buildMaskGraphsFromAdjustments(depthOnnxAdj);
const depthOnnxSemantic = graphsOnnx[0]?.nodes?.find((n) => n?.type === 'semantic.depth_range.v1');
assert.ok(depthOnnxSemantic);
assert.equal(depthOnnxSemantic.mapSource, 'onnx-mock');
assert.equal(depthOnnxSemantic.proxySource, 'onnx-mock');

const depthOnnxProdAdj = { ...depthRecipeAdj, depthMapSource: 'onnx' };
const graphsOnnxProd = buildMaskGraphsFromAdjustments(depthOnnxProdAdj);
const depthOnnxProdSemantic = graphsOnnxProd[0]?.nodes?.find((n) => n?.type === 'semantic.depth_range.v1');
assert.ok(depthOnnxProdSemantic);
assert.equal(depthOnnxProdSemantic.mapSource, 'onnx');
assert.equal(depthOnnxProdSemantic.proxySource, 'onnx');

const depthFlatRt = {
  ...minimalFlat,
  adjustments: {
    ...minimalFlat.adjustments,
    brushMaskEnabled: true,
    localMaskMode: 'depth',
    depthMaskMin: 12,
    depthMaskMax: 88,
    depthMaskFeather: 40,
    brushMaskRadius: 80,
    brushMaskFeather: 65,
    brushMaskStrokes: [{ x: 0.5, y: 0.5, radius: 0.08, feather: 0.6, erase: false }],
  },
};
const depthDocRt = encodeFlatSnapshotToRecipeDocument(depthFlatRt);
const wpDepth = buildMaskEngineWorkerPayload(depthDocRt);
assert.equal(wpDepth.ok, true);
assert.equal(wpDepth.hasDepthRangeSemantic, true);
assert.equal(wpDepth.hasBrushEdgeSemantic, false);
assert.ok(
  wpDepth.graphs.some(
    (g) => Array.isArray(g.semanticKinds) && g.semanticKinds.includes('semantic.depth_range.v1'),
  ),
);

const brushEdgeAdj = {
  brushMaskEnabled: true,
  localMaskMode: 'brush',
  brushMaskEdgeSensitivity: 40,
  brushMaskRadius: 80,
  brushMaskFeather: 65,
  brushMaskStrokes: [
    {
      x: 0.4,
      y: 0.45,
      radius: 0.07,
      feather: 0.6,
      erase: false,
      edgeGain: 0.85,
    },
  ],
};
const brushEdgeGraphs = buildMaskGraphsFromAdjustments(brushEdgeAdj);
const brushSemantic = brushEdgeGraphs[0]?.nodes?.find((n) => n?.type === 'semantic.brush_strokes.v1');
assert.ok(brushSemantic);
assert.equal(brushSemantic.edgeSensitivity, 40);
assert.equal(brushSemantic.edgeWeightedStrokeCount, 1);
const brushEdgeFlat = {
  ...minimalFlat,
  adjustments: { ...minimalFlat.adjustments, ...brushEdgeAdj },
};
const brushEdgeDoc = encodeFlatSnapshotToRecipeDocument(brushEdgeFlat);
const wpBrushEdge = buildMaskEngineWorkerPayload(brushEdgeDoc);
assert.equal(wpBrushEdge.ok, true);
assert.equal(wpBrushEdge.hasBrushEdgeSemantic, true);
const depthJsonRt = recipeDocumentToJsonString(depthDocRt);
const depthParsedRt = parseRecipeDocumentJson(depthJsonRt);
assert.equal(depthParsedRt.ok, true);
assert.ok(
  depthParsedRt.document.maskGraphs.some(
    (g) =>
      Array.isArray(g.nodes) &&
      g.nodes.some((n) => n.type === 'semantic.depth_range.v1' && n.proxySource === 'luminance'),
  ),
);

const depthFlatOnnxRt = {
  ...minimalFlat,
  adjustments: {
    ...minimalFlat.adjustments,
    brushMaskEnabled: true,
    localMaskMode: 'depth',
    depthMapSource: 'onnx',
    depthMaskMin: 12,
    depthMaskMax: 88,
    depthMaskFeather: 40,
    brushMaskRadius: 80,
    brushMaskFeather: 65,
    brushMaskStrokes: [{ x: 0.5, y: 0.5, radius: 0.08, feather: 0.6, erase: false }],
  },
};
const depthOnnxDocRt = encodeFlatSnapshotToRecipeDocument(depthFlatOnnxRt);
const depthOnnxJsonRt = recipeDocumentToJsonString(depthOnnxDocRt);
const depthOnnxParsedRt = parseRecipeDocumentJson(depthOnnxJsonRt);
assert.equal(depthOnnxParsedRt.ok, true);
const depthOnnxFlatBack = decodeRecipeToFlatSnapshot(depthOnnxParsedRt.document);
assert.equal(String(depthOnnxFlatBack.adjustments.depthMapSource), 'onnx');
assert.ok(
  depthOnnxParsedRt.document.maskGraphs.some(
    (g) =>
      Array.isArray(g.nodes) &&
      g.nodes.some(
        (n) =>
          n.type === 'semantic.depth_range.v1' &&
          n.mapSource === 'onnx' &&
          n.proxySource === 'onnx',
      ),
  ),
);

let clipboardApplyDoc = null;
const clipApply = applyRecipeTextToWorkbench(depthOnnxJsonRt, (doc) => {
  clipboardApplyDoc = doc;
  return true;
});
assert.equal(clipApply.ok, true);
assert.ok(isFilmLabRecipeDocumentV1(clipboardApplyDoc));
assert.equal(
  String(decodeRecipeToFlatSnapshot(clipboardApplyDoc).adjustments.depthMapSource),
  'onnx',
);

assert.equal(FILMLAB_RECIPE_APPLY_UI_EVENT, 'mindfullens-filmlab-recipe-apply-result');
dispatchRecipeApplyUiResult(null);
dispatchRecipeApplyUiResult(undefined);

assert.equal(isFilmLabRecipeDropFilename('film.recipe.json'), true);
assert.equal(isFilmLabRecipeDropFilename('env.json'), true);
assert.equal(isFilmLabRecipeDropFilename('image.jpg'), false);

console.log('OK Recipe import / normalize / worker payload');
