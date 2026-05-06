import assert from 'node:assert/strict';
import {
  buildFilmLabExportManifestExportBlock,
  buildFilmLabExportManifestRootBase,
  computeFilmLabDepthProxyVariant,
  hasFilmLabDepthProxyArtifacts,
  resolveFilmLabExportDepthDiagnostics,
  upgradeLegacyAfterRecipeDepthTrace,
} from '../src/engine/filmLabExportManifestHelpers.js';

function assertParity(manifestLike, afterRecipeLike, label) {
  const hasDepthArtifacts = hasFilmLabDepthProxyArtifacts(manifestLike.artifacts ?? []);
  const variant = computeFilmLabDepthProxyVariant(manifestLike.artifacts ?? []);
  assert.equal(manifestLike.export.depthProxyPresent, hasDepthArtifacts, `${label}: depthProxyPresent mismatch`);
  assert.equal(manifestLike.export.depthProxyVariant, variant, `${label}: depthProxyVariant mismatch`);

  const hasDepthCapability = (manifestLike.capabilities ?? []).includes('export.depth.proxy');
  if (manifestLike.export.depthProxyPresent) {
    assert.equal(hasDepthCapability, true, `${label}: depthProxyPresent=true requires export.depth.proxy capability`);
    assert.notEqual(afterRecipeLike.export.depthMapSource, null, `${label}: after_recipe.export.depthMapSource must not be null`);
  } else {
    assert.equal(hasDepthCapability, false, `${label}: depthProxyPresent=false forbids export.depth.proxy capability`);
    assert.equal(afterRecipeLike.export.depthMapSource, null, `${label}: after_recipe.export.depthMapSource must be null without depth proxy`);
    assert.equal(afterRecipeLike.export.depthProxyDigest, null, `${label}: after_recipe.export.depthProxyDigest must be null without depth proxy`);
  }
}

const withDepthArtifacts = [
  { variant: 'after', artifactRole: 'primary' },
  { variant: 'depth_proxy', artifactRole: 'sidecar' },
  { variant: 'depth_proxy_data', artifactRole: 'sidecar' },
  { variant: 'after_recipe', artifactRole: 'sidecar' },
];
const withDepthManifest = {
  ...buildFilmLabExportManifestRootBase({
    moduleName: 'test.depth.manifest.parity.single',
    mode: 'single',
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    artifactEntries: withDepthArtifacts,
    serviceBuildTag: 'test-build-tag',
    serviceBuildLabel: 'test-build-label',
    viewportBuildMarker: 'test-marker',
  }),
  export: {
    depthProxyPresent: true,
    depthProxyVariant: 'json+f32',
  },
};
const withDepthAfterRecipe = {
  export: {
    variant: 'after',
    depthMapSource: 'onnx',
    depthProxyDigest: 'abc123',
  },
};
assertParity(withDepthManifest, withDepthAfterRecipe, 'withDepth');

const withoutDepthArtifacts = [
  { variant: 'after', artifactRole: 'primary' },
  { variant: 'after_recipe', artifactRole: 'sidecar' },
];
const withoutDepthManifest = {
  ...buildFilmLabExportManifestRootBase({
    moduleName: 'test.depth.manifest.parity.batch',
    mode: 'batch',
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    artifactEntries: withoutDepthArtifacts,
    serviceBuildTag: 'test-build-tag',
    serviceBuildLabel: 'test-build-label',
    viewportBuildMarker: 'test-marker',
  }),
  export: {
    depthProxyPresent: false,
    depthProxyVariant: 'none',
  },
};
const withoutDepthAfterRecipe = {
  export: {
    variant: 'after',
    depthMapSource: null,
    depthProxyDigest: null,
  },
};
assertParity(withoutDepthManifest, withoutDepthAfterRecipe, 'withoutDepth');

const legacyManifest = {
  ...buildFilmLabExportManifestRootBase({
    moduleName: 'test.depth.manifest.parity.legacy',
    mode: 'single',
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    artifactEntries: [{ variant: 'after', artifactRole: 'primary' }, { variant: 'depth_proxy', artifactRole: 'sidecar' }],
    serviceBuildTag: 'test-build-tag',
    serviceBuildLabel: 'test-build-label',
    viewportBuildMarker: 'test-marker',
  }),
  export: {
    // legacy: no depthProxyVariant/depthProxyPresent
    sizeProfile: 'full',
    fileFormat: 'dng',
  },
};
const legacyAfterRecipe = {
  export: {
    variant: 'after',
    artifactName: 'mindfullens_example_after.dng',
    artifactMimeType: 'image/x-adobe-dng',
  },
};
const legacyDiag = resolveFilmLabExportDepthDiagnostics(legacyManifest.export, legacyManifest.artifacts);
const liftedManifestExport = buildFilmLabExportManifestExportBlock({
  depthProxyVariant: legacyDiag.depthProxyVariant,
  sizeProfile: 'full',
  fileFormat: 'dng',
  pipelineKind: null,
  depthProxyPresent: legacyDiag.depthProxyPresent,
  includeLocalMaskPng: false,
  includeBeforeAfter: false,
  includeRecipeJson: true,
});
const liftedAfterRecipe = upgradeLegacyAfterRecipeDepthTrace(legacyManifest, legacyAfterRecipe);
assert.equal(liftedManifestExport.depthProxyVariant, 'json');
assert.equal(liftedManifestExport.depthProxyPresent, true);
assert.equal(liftedAfterRecipe?.export?.depthMapSource, 'luminance');
assert.equal(liftedAfterRecipe?.export?.depthProxyDigest, '');

console.log('PASS film-lab-export-depth-manifest-recipe-parity');
