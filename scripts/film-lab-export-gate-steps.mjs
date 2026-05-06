/**
 * Ordered Film Lab export gate scripts (perf hooks + manifest contracts).
 * Single source of truth — consumed by `run-film-lab-export-gates.mjs`.
 */

export const FILM_LAB_EXPORT_GATE_STEPS = Object.freeze([
  'scripts/film-lab-export-perf-gates.mjs',
  'scripts/test-export-manifest-digest-reader-example.mjs',
  'scripts/test-film-lab-export-canonical-roles.mjs',
  'scripts/test-film-lab-export-manifest-artifact-row.mjs',
  'scripts/test-film-lab-export-format-i18n.mjs',
  'scripts/test-film-lab-export-dng-variant-a.mjs',
  'scripts/test-film-lab-export-dng-variant-b.mjs',
  'scripts/test-film-lab-depth-export-sidecar.mjs',
  'scripts/test-film-lab-export-recipe-depth-trace.mjs',
  'scripts/test-film-lab-export-depth-manifest-recipe-parity.mjs',
  'scripts/test-film-lab-export-depth-emitter-runtime.mjs',
  'scripts/test-film-lab-export-manifest-export-snapshot.mjs',
  'scripts/test-export-manifest-depth-compat-api-doc.mjs',
  'scripts/test-film-lab-export-depth-compat-fixture-smoke.mjs',
  'scripts/test-film-lab-depth-diagnostics-reasons-snapshot.mjs',
  'scripts/test-film-lab-depth-diagnostics-http-matrix.mjs',
  'scripts/test-export-manifest-openapi-snippet-integrity.mjs',
  'scripts/test-engine-types-barrel.mjs',
  'scripts/test-engine-types-usage-tsc.mjs',
]);
