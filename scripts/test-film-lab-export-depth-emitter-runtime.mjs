import assert from 'node:assert/strict';
import {
  buildFilmLabExportManifestRootBase,
  normalizeLegacyManifestDepthDiagnostics,
  resolveFilmLabExportDepthDiagnostics,
  validateFilmLabExportDepthDiagnosticsCompatibility,
} from '../src/engine/filmLabExportManifestHelpers.js';

function buildRuntimeLikeManifest(mode, artifacts) {
  const root = buildFilmLabExportManifestRootBase({
    moduleName: mode === 'single' ? 'useFilmLabEngine.exportImage' : 'batchProcessor.processBatch',
    mode,
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    artifactEntries: artifacts,
    serviceBuildTag: 'test-build-tag',
    serviceBuildLabel: 'test-build-label',
    viewportBuildMarker: 'test-marker',
  });
  const depth = resolveFilmLabExportDepthDiagnostics({}, artifacts);
  return {
    ...root,
    export: {
      depthProxyPresent: depth.depthProxyPresent,
      depthProxyVariant: depth.depthProxyVariant,
    },
  };
}

const singleArtifacts = [
  { variant: 'after', artifactRole: 'primary' },
  { variant: 'depth_proxy', artifactRole: 'sidecar' },
  { variant: 'depth_proxy_data', artifactRole: 'sidecar' },
  { variant: 'after_recipe', artifactRole: 'sidecar' },
];
const singleManifest = buildRuntimeLikeManifest('single', singleArtifacts);
assert.equal(singleManifest.export.depthProxyPresent, true);
assert.equal(singleManifest.export.depthProxyVariant, 'json+f32');

const batchArtifacts = [
  { variant: 'after', artifactRole: 'primary' },
  { variant: 'depth_proxy', artifactRole: 'sidecar' },
  { variant: 'after_recipe', artifactRole: 'sidecar' },
];
const batchManifest = buildRuntimeLikeManifest('batch', batchArtifacts);
assert.equal(batchManifest.export.depthProxyPresent, true);
assert.equal(batchManifest.export.depthProxyVariant, 'json');

const noDepthArtifacts = [
  { variant: 'after', artifactRole: 'primary' },
  { variant: 'after_recipe', artifactRole: 'sidecar' },
];
const noDepthManifest = buildRuntimeLikeManifest('single', noDepthArtifacts);
assert.equal(noDepthManifest.export.depthProxyPresent, false);
assert.equal(noDepthManifest.export.depthProxyVariant, 'none');

assert.equal(validateFilmLabExportDepthDiagnosticsCompatibility(singleManifest), null);
assert.equal(validateFilmLabExportDepthDiagnosticsCompatibility(batchManifest), null);
assert.equal(validateFilmLabExportDepthDiagnosticsCompatibility(noDepthManifest), null);
assert.match(
  String(
    validateFilmLabExportDepthDiagnosticsCompatibility({
      artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
      export: { depthProxyVariant: 'none' },
    }) ?? ''
  ),
  /cannot coexist/
);
const normalizedLegacy = normalizeLegacyManifestDepthDiagnostics(
  {
    export: {},
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  },
  {
    export: { variant: 'after', artifactName: 'mindfullens_example_after.dng' },
  }
);
assert.equal(normalizedLegacy.manifest?.export?.depthProxyVariant, 'json');
assert.equal(normalizedLegacy.manifest?.export?.depthProxyPresent, true);
assert.equal(normalizedLegacy.afterRecipe?.export?.depthMapSource, 'luminance');
assert.equal(normalizedLegacy.afterRecipe?.export?.depthTraceVersion, 1);

const modernManifest = {
  export: { depthProxyPresent: true, depthProxyVariant: 'json' },
  artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
};
const modernAfterRecipe = {
  export: {
    variant: 'after',
    depthTraceVersion: 1,
    depthMapSource: 'onnx',
    depthProxyDigest: 'abc123',
  },
};
const normalizedModern = normalizeLegacyManifestDepthDiagnostics(modernManifest, modernAfterRecipe);
assert.deepEqual(normalizedModern.manifest, modernManifest, 'normalize should be idempotent for modern manifest');
assert.deepEqual(normalizedModern.afterRecipe, modernAfterRecipe, 'normalize should keep modern after_recipe unchanged');

const modernAfterRecipeV2 = {
  export: {
    variant: 'after',
    depthTraceVersion: 2,
    depthMapSource: 'onnx',
    depthProxyDigest: 'future-v2',
  },
};
const normalizedModernV2 = normalizeLegacyManifestDepthDiagnostics(modernManifest, modernAfterRecipeV2);
assert.equal(
  normalizedModernV2.afterRecipe?.export?.depthTraceVersion,
  2,
  'normalize should preserve depthTraceVersion > 1 for forward compatibility'
);

const normalizedHardNullLegacy = normalizeLegacyManifestDepthDiagnostics(
  {
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  },
  {}
);
assert.equal(normalizedHardNullLegacy.manifest?.export?.depthProxyPresent, true);
assert.equal(normalizedHardNullLegacy.manifest?.export?.depthProxyVariant, 'json');
assert.equal(normalizedHardNullLegacy.afterRecipe, null, 'hard-null legacy after_recipe without export stays null');

const normalizedMissingArtifacts = normalizeLegacyManifestDepthDiagnostics(
  {
    export: {},
  },
  {
    export: { variant: 'after' },
  }
);
assert.equal(normalizedMissingArtifacts.manifest?.export?.depthProxyPresent, false);
assert.equal(normalizedMissingArtifacts.manifest?.export?.depthProxyVariant, 'none');
assert.equal(normalizedMissingArtifacts.afterRecipe?.export?.depthTraceVersion, 1);
assert.equal(normalizedMissingArtifacts.afterRecipe?.export?.depthMapSource, null);
assert.equal(normalizedMissingArtifacts.afterRecipe?.export?.depthProxyDigest, null);

const normalizedNullArtifacts = normalizeLegacyManifestDepthDiagnostics(
  {
    export: {},
    artifacts: null,
  },
  {
    export: { variant: 'after' },
  }
);
assert.equal(normalizedNullArtifacts.manifest?.export?.depthProxyPresent, false);
assert.equal(normalizedNullArtifacts.manifest?.export?.depthProxyVariant, 'none');
assert.equal(normalizedNullArtifacts.afterRecipe?.export?.depthMapSource, null);
assert.equal(normalizedNullArtifacts.afterRecipe?.export?.depthProxyDigest, null);

const normalizedAfterRecipeNull = normalizeLegacyManifestDepthDiagnostics(
  {
    export: {},
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  },
  null
);
assert.equal(normalizedAfterRecipeNull.afterRecipe, null);

const normalizedAfterRecipeEmpty = normalizeLegacyManifestDepthDiagnostics(
  {
    export: {},
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  },
  {}
);
assert.equal(normalizedAfterRecipeEmpty.afterRecipe, null);

const normalizedAfterRecipeExportNull = normalizeLegacyManifestDepthDiagnostics(
  {
    export: {},
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  },
  { export: null }
);
assert.equal(normalizedAfterRecipeExportNull.afterRecipe, null);

console.log('PASS film-lab-export-depth-emitter-runtime');
