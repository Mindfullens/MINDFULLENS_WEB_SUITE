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
]);
