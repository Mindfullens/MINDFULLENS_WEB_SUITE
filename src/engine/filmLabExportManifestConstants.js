/**
 * Single source of truth for Film Lab PRO export manifest identity strings.
 * Keep in sync with emitters (single + batch) and FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES.
 */

export const FILM_LAB_EXPORT_MANIFEST_SCHEMA = 'filmLab.export.manifest.v1';

export const FILM_LAB_EXPORT_MANIFEST_PROFILE = 'pro-export-audit-v1';

/** URN list emitted on every manifest root */
export const FILM_LAB_EXPORT_MANIFEST_SCHEMA_REFS = Object.freeze([
  'urn:mindfullens:filmLab:exportManifest:v1',
  `urn:mindfullens:filmLab:exportManifestProfile:${FILM_LAB_EXPORT_MANIFEST_PROFILE}`,
]);

export const FILM_LAB_EXPORT_MANIFEST_COMPAT = Object.freeze({
  requiredSchema: FILM_LAB_EXPORT_MANIFEST_SCHEMA,
  minReaderVersion: 1,
});
