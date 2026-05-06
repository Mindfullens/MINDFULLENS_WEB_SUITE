/**
 * Integration smoke: buildFilmLabExportManifestArtifactRow enforces canonical variant→role.
 */
import assert from 'node:assert/strict';
import { buildFilmLabExportManifestArtifactRow } from '../src/engine/filmLabExportManifestArtifact.js';

const STUB_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

async function sha256HexFromBytes() {
  return STUB_SHA256;
}

const base = {
  fileName: 'mindfullens_export_after.jpg',
  mimeType: 'image/jpeg',
  bytes: new Uint8Array(0),
  exportSessionId: '00000000-0000-4000-8000-000000000000',
  pipelineKind: 'webgl2',
  sha256HexFromBytes,
};

const primaryRow = await buildFilmLabExportManifestArtifactRow({
  ...base,
  variant: 'after',
  artifactRole: 'primary',
});
assert.equal(primaryRow.variant, 'after');
assert.equal(primaryRow.artifactRole, 'primary');
assert.equal(primaryRow.sha256, STUB_SHA256);
assert.equal(primaryRow.byteLength, 0);

await assert.rejects(
  async () =>
    buildFilmLabExportManifestArtifactRow({
      ...base,
      variant: 'after',
      artifactRole: 'sidecar',
    }),
  /requires artifactRole=primary/
);

await assert.rejects(
  async () =>
    buildFilmLabExportManifestArtifactRow({
      ...base,
      variant: 'not_a_known_variant',
      artifactRole: 'primary',
    }),
  /unsupported variant not_a_known_variant/
);

const sidecarRow = await buildFilmLabExportManifestArtifactRow({
  ...base,
  variant: 'before',
  artifactRole: 'sidecar',
  fileName: 'before.jpg',
  sourceName: 'source.cr3',
});
assert.equal(sidecarRow.sourceName, 'source.cr3');
assert.equal(sidecarRow.variant, 'before');
assert.equal(Object.keys(sidecarRow)[0], 'sourceName', 'batch sourceName stays first for stable JSON order');

console.log('PASS film-lab export manifest artifact row guards');
