import assert from 'node:assert/strict';
import { buildFilmLabExportManifestExportBlock } from '../src/engine/filmLabExportManifestHelpers.js';

const singleExport = buildFilmLabExportManifestExportBlock({
  depthProxyVariant: 'json+f32',
  sizeProfile: 'full',
  fileFormat: 'dng',
  pipelineKind: 'webgl2',
  depthProxyPresent: true,
  includeLocalMaskPng: false,
  includeBeforeAfter: false,
  includeRecipeJson: true,
});

const batchExport = buildFilmLabExportManifestExportBlock({
  depthProxyVariant: 'json',
  sizeProfile: 'web',
  fileFormat: 'dng',
  pipelineKind: 'raw',
  depthProxyPresent: true,
  includeLocalMaskPng: true,
  includeBeforeAfter: true,
  includeRecipeJson: true,
  totalSources: 12,
  exportedSources: 11,
});

const singleSnapshot = JSON.stringify(singleExport);
const batchSnapshot = JSON.stringify(batchExport);

assert.equal(
  singleSnapshot,
  '{"depthProxyVariant":"json+f32","sizeProfile":"full","fileFormat":"dng","pipelineKind":"webgl2","depthProxyPresent":true,"includeLocalMaskPng":false,"includeBeforeAfter":false,"includeRecipeJson":true}'
);
assert.equal(
  batchSnapshot,
  '{"depthProxyVariant":"json","sizeProfile":"web","fileFormat":"dng","pipelineKind":"raw","depthProxyPresent":true,"includeLocalMaskPng":true,"includeBeforeAfter":true,"includeRecipeJson":true,"totalSources":12,"exportedSources":11}'
);

console.log('PASS film-lab-export-manifest-export-snapshot');
