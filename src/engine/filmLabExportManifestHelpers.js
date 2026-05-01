/**
 * Shared Film Lab export manifest assembly (capabilities, counts, digest attachment).
 */

import { FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES } from './filmLabExportManifestReaderExamples.js';
import {
  FILM_LAB_EXPORT_MANIFEST_COMPAT,
  FILM_LAB_EXPORT_MANIFEST_PROFILE,
  FILM_LAB_EXPORT_MANIFEST_SCHEMA,
  FILM_LAB_EXPORT_MANIFEST_SCHEMA_REFS,
} from './filmLabExportManifestConstants.js';

export const FILM_LAB_EXPORT_MANIFEST_DIGEST_VALIDATOR_HINTS = Object.freeze([
  'Serialize manifest object with stable JSON.stringify formatting (2-space indent).',
  'Remove manifestDigest field before hashing (scope: payload_without_manifestDigest).',
  'Compute SHA-256 over UTF-8 bytes of that JSON payload.',
  'See readerExamples for minimal artifact rows and root shapes before digest.',
]);

/**
 * @param {Array<{ variant?: string }>} artifactEntries
 */
export function computeFilmLabExportManifestCapabilities(artifactEntries) {
  const caps = [
    'manifest.integrity.sha256',
    'manifest.variant.roles',
    'manifest.runtime.tier',
    'manifest.export.session',
    'manifest.reader.examples',
    'manifest.reader.examples.optional',
  ];
  if (artifactEntries.some((entry) => entry.variant === 'before')) {
    caps.push('export.before');
  }
  if (artifactEntries.some((entry) => entry.variant === 'mask')) {
    caps.push('export.mask.alpha');
  }
  if (artifactEntries.some((entry) => String(entry.variant).includes('recipe'))) {
    caps.push('manifest.recipe.sidecar');
  }
  return caps;
}

/**
 * @param {Array<{ variant?: unknown }>} artifactEntries
 */
export function countFilmLabExportArtifactsByVariant(artifactEntries) {
  return artifactEntries.reduce((acc, entry) => {
    const key = String(entry?.variant ?? 'unknown');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * @param {Array<{ artifactRole?: unknown }>} artifactEntries
 */
export function countFilmLabExportArtifactsByRole(artifactEntries) {
  return artifactEntries.reduce((acc, entry) => {
    const key = String(entry?.artifactRole ?? 'unknown');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * @param {object} args
 * @param {string} args.moduleName
 * @param {'single'|'batch'} args.mode
 * @param {string} args.exportSessionId
 * @param {Array<object>} args.artifactEntries
 * @param {string} args.serviceBuildTag
 * @param {string} args.serviceBuildLabel
 * @param {string} args.viewportBuildMarker
 */
export function buildFilmLabExportManifestRootBase({
  moduleName,
  mode,
  exportSessionId,
  artifactEntries,
  serviceBuildTag,
  serviceBuildLabel,
  viewportBuildMarker,
}) {
  return {
    schema: FILM_LAB_EXPORT_MANIFEST_SCHEMA,
    manifestVersion: 1,
    manifestProfile: FILM_LAB_EXPORT_MANIFEST_PROFILE,
    schemaRefs: [...FILM_LAB_EXPORT_MANIFEST_SCHEMA_REFS],
    compat: { ...FILM_LAB_EXPORT_MANIFEST_COMPAT },
    generator: {
      app: 'MindfulLens Film-Lab',
      module: moduleName,
      version: serviceBuildTag,
    },
    capabilities: computeFilmLabExportManifestCapabilities(artifactEntries),
    generatedAt: new Date().toISOString(),
    mode,
    exportSessionId,
    build: {
      serviceBuildTag,
      serviceBuildLabel,
      viewportBuildMarker,
    },
    artifactsCountByVariant: countFilmLabExportArtifactsByVariant(artifactEntries),
    artifactsCountByRole: countFilmLabExportArtifactsByRole(artifactEntries),
    artifacts: artifactEntries,
  };
}

/**
 * Mutates `manifestWithoutDigest` by assigning `manifestDigest` after hashing the JSON body
 * without that field (stable 2-space indent, UTF-8).
 *
 * @param {Record<string, unknown>} manifestWithoutDigest
 * @param {{ sha256HexFromBytes: (b: Uint8Array) => Promise<string|null> }} deps
 */
export async function attachFilmLabExportManifestDigest(manifestWithoutDigest, { sha256HexFromBytes }) {
  const baseBytes = new TextEncoder().encode(JSON.stringify(manifestWithoutDigest, null, 2));
  const sha256 = await sha256HexFromBytes(baseBytes);
  manifestWithoutDigest.manifestDigest = {
    algorithm: 'sha256',
    digestScope: 'payload_without_manifestDigest',
    digestComputedAt: new Date().toISOString(),
    validatorHints: [...FILM_LAB_EXPORT_MANIFEST_DIGEST_VALIDATOR_HINTS],
    readerExamples: FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES,
    sha256,
  };
  return manifestWithoutDigest;
}
