/**
 * Single builder for Film Lab export manifest artifact rows (single + batch).
 * Keeps stable field order for JSON.stringify output and audit-friendly diffs.
 * Role validation delegates to `canonicalFilmLabExportManifestArtifactRoleForVariant` in `./filmLabExportManifestCanonicalRoles.js`.
 */

import { canonicalFilmLabExportManifestArtifactRoleForVariant } from './filmLabExportManifestCanonicalRoles.js';

/**
 * @param {object} opts
 * @param {string} opts.variant
 * @param {'primary'|'sidecar'|'aux-mask'} opts.artifactRole
 * @param {string} opts.fileName
 * @param {string} opts.mimeType
 * @param {Uint8Array} opts.bytes
 * @param {string} opts.exportSessionId
 * @param {string} opts.pipelineKind
 * @param {string} [opts.sourceName] batch only — original upload file name
 * @param {(b: Uint8Array) => Promise<string|null>} opts.sha256HexFromBytes
 */
export async function buildFilmLabExportManifestArtifactRow({
  variant,
  artifactRole,
  fileName,
  mimeType,
  bytes,
  exportSessionId,
  pipelineKind,
  sourceName,
  sha256HexFromBytes,
}) {
  const expectedRole = canonicalFilmLabExportManifestArtifactRoleForVariant(variant);
  if (!expectedRole) {
    throw new Error(
      `buildFilmLabExportManifestArtifactRow: unsupported variant ${String(variant)}`
    );
  }
  if (artifactRole !== expectedRole) {
    throw new Error(
      `buildFilmLabExportManifestArtifactRow: variant ${String(variant)} requires artifactRole=${expectedRole}, got ${String(artifactRole)}`
    );
  }

  const row = {
    variant,
    artifactRole,
    fileName,
    mimeType,
    byteLength: bytes.byteLength,
    sha256: await sha256HexFromBytes(bytes),
    exportSessionId,
    pipelineKind,
  };
  if (typeof sourceName === 'string' && sourceName.length > 0) {
    return { sourceName, ...row };
  }
  return row;
}
