import assert from 'node:assert/strict';
import { __FILMLAB_INTERNALS } from '../src/engine/useFilmLabEngine.js';

const { buildExportRecipeSnapshot } = __FILMLAB_INTERNALS;
assert.equal(typeof buildExportRecipeSnapshot, 'function');

const afterPayload = buildExportRecipeSnapshot({
  activeFilm: { id: 'f1', name: 'Film 1' },
  adjustments: { exposure: 0.1 },
  renderDebugInfo: null,
  rawBackendPreference: null,
  pipelineKind: 'webgl2',
  exportSessionId: 'exp-1',
  sizeProfile: 'full',
  fileFormat: 'dng',
  variant: 'after',
  artifactName: 'mindfullens_example_after.dng',
  artifactMimeType: 'image/x-adobe-dng',
  depthMapSource: 'onnx',
  depthProxyDigest: 'abc123',
  depthProxyPresent: true,
});

assert.equal(afterPayload.export.variant, 'after');
assert.equal(afterPayload.export.depthTraceVersion, 1);
assert.equal(afterPayload.export.depthMapSource, 'onnx');
assert.equal(afterPayload.export.depthProxyDigest, 'abc123');

const beforePayload = buildExportRecipeSnapshot({
  activeFilm: { id: 'f1', name: 'Film 1' },
  adjustments: { exposure: 0.1 },
  renderDebugInfo: null,
  rawBackendPreference: null,
  pipelineKind: 'webgl2',
  exportSessionId: 'exp-1',
  sizeProfile: 'full',
  fileFormat: 'jpeg',
  variant: 'before',
  artifactName: 'mindfullens_example_before.jpg',
  artifactMimeType: 'image/jpeg',
  depthMapSource: 'onnx',
  depthProxyDigest: 'abc123',
});

assert.equal(Object.prototype.hasOwnProperty.call(beforePayload.export, 'depthMapSource'), false);
assert.equal(Object.prototype.hasOwnProperty.call(beforePayload.export, 'depthProxyDigest'), false);
assert.equal(Object.prototype.hasOwnProperty.call(beforePayload.export, 'depthTraceVersion'), false);

const manifestLikeArtifacts = [{ variant: 'after' }, { variant: 'depth_proxy' }, { variant: 'after_recipe' }];
const hasDepthProxy = manifestLikeArtifacts.some((a) => a.variant === 'depth_proxy' || a.variant === 'depth_proxy_data');
if (hasDepthProxy) {
  assert.notEqual(afterPayload.export.depthMapSource, null);
}

console.log('PASS film-lab-export-recipe-depth-trace');
