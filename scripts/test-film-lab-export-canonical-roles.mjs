/**
 * Unit smoke for browser-safe canonical variant→artifactRole mapping.
 */
import assert from 'node:assert/strict';
import { canonicalFilmLabExportManifestArtifactRoleForVariant } from '../src/engine/filmLabExportManifestCanonicalRoles.js';
import {
  defaultFilmLabExportLossyQualityForFormat,
  FILM_LAB_EXPORT_LOSSY_FORMAT_IDS,
  FILM_LAB_EXPORT_RASTER_FORMAT_IDS,
  FILM_LAB_EXPORT_RASTER_FORMAT_SET,
  manifestLossyQualityForFilmLabExport,
  normalizeFilmLabExportFileFormat,
} from '../src/engine/filmLabExportFormats.js';

assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant('after'), 'primary');
assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant('mask'), 'aux-mask');
assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant('before'), 'sidecar');
assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant('after_recipe'), 'sidecar');
assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant('before_recipe'), 'sidecar');

assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant(''), null);
assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant('after_preview'), null);
assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant(null), null);
assert.equal(canonicalFilmLabExportManifestArtifactRoleForVariant(undefined), null);

assert.equal(normalizeFilmLabExportFileFormat('PNG'), 'png');
assert.equal(normalizeFilmLabExportFileFormat('WEBP'), 'webp');
assert.equal(normalizeFilmLabExportFileFormat('TIFF'), 'tiff');
assert.equal(normalizeFilmLabExportFileFormat('bogus'), 'jpeg');
assert.equal(normalizeFilmLabExportFileFormat('bogus', 'png'), 'png');

assert.equal(
  FILM_LAB_EXPORT_RASTER_FORMAT_IDS.length,
  FILM_LAB_EXPORT_RASTER_FORMAT_SET.size,
  'FILM_LAB_EXPORT_RASTER_FORMAT_IDS must have no duplicate ids (array length vs Set size)'
);

assert.equal(FILM_LAB_EXPORT_LOSSY_FORMAT_IDS.length, 3);
assert.equal(defaultFilmLabExportLossyQualityForFormat('jpeg'), 0.95);
assert.equal(defaultFilmLabExportLossyQualityForFormat('webp'), 0.92);
assert.equal(defaultFilmLabExportLossyQualityForFormat('avif'), 0.9);

assert.equal(manifestLossyQualityForFilmLabExport('png', 0.9), undefined);
assert.equal(manifestLossyQualityForFilmLabExport('jpeg', undefined), 0.95);
assert.equal(manifestLossyQualityForFilmLabExport('jpeg', 0.88), 0.88);
assert.equal(manifestLossyQualityForFilmLabExport('jpeg', 0.1), 0.35);

console.log('PASS film-lab export canonical roles');
