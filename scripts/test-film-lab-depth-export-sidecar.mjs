import assert from 'node:assert/strict';

import {
  buildDepthProxyBinaryBytes,
  buildDepthProxySidecarJsonBytes,
} from '../src/engine/filmLabDepthExportSidecar.js';

const jsonBytes = buildDepthProxySidecarJsonBytes({
  dngVariant: 'b',
  depthMapSource: 'onnx',
  depthProxyDigest: 'deadbeef',
  width: 640,
  height: 360,
  pipelineKind: 'raw',
  hasBinaryProxy: true,
});
const payload = JSON.parse(new TextDecoder().decode(jsonBytes));
assert.equal(payload.schema, 'mindfullens.depth-proxy.sidecar.v1');
assert.equal(payload.dngVariant, 'b');
assert.equal(payload.depthMapSource, 'onnx');
assert.equal(payload.depthProxyDigest, 'deadbeef');
assert.equal(payload.width, 640);
assert.equal(payload.height, 360);
assert.equal(payload.pipelineKind, 'raw');
assert.equal(payload.hasBinaryProxy, true);

const src = new Float32Array([0.1, 0.2, 0.3, 0.4]);
const bin = buildDepthProxyBinaryBytes(src);
assert.ok(bin instanceof Uint8Array);
assert.equal(bin.byteLength, src.byteLength);
assert.equal(buildDepthProxyBinaryBytes(null), null);

console.log('PASS film-lab-depth-export-sidecar');
