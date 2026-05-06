/**
 * Single ruleset: optionalScenarios in FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES
 * must align scenario names with export flags, fileFormat tokens, artifact variants/roles,
 * and the minimal export/artifact key shapes documented in readerExamples notes.
 * Used by perf-gates and export manifest contract tests.
 */

import assert from 'node:assert/strict';
import { canonicalFilmLabExportManifestArtifactRoleForVariant } from './filmLabExportManifestCanonicalRoles.js';
import {
  FILM_LAB_EXPORT_LOSSY_FORMAT_SET,
  FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_SET,
} from './filmLabExportFormats.js';

export { canonicalFilmLabExportManifestArtifactRoleForVariant };

const MINIMAL_OPTIONAL_ARTIFACT_KEY_ORDER = ['variant', 'artifactRole', 'fileName', 'mimeType'];
const FORBIDDEN_RUNTIME_ARTIFACT_KEYS = ['byteLength', 'sha256', 'exportSessionId', 'pipelineKind'];
const SORTED_MINIMAL_OPTIONAL_ARTIFACT_KEYS = [...MINIMAL_OPTIONAL_ARTIFACT_KEY_ORDER].sort();

/** Sorted export keys for optional scenarios with fileFormat + include* flags only. */
const OPTIONAL_SCENARIO_EXPORT_KEYS_BASE = Object.freeze([
  'fileFormat',
  'includeBeforeAfter',
  'includeLocalMaskPng',
  'includeRecipeJson',
]);
/** Same as base plus lossyQuality (sorted) for JPEG/WebP/AVIF digest examples. */
const OPTIONAL_SCENARIO_EXPORT_KEYS_WITH_LOSSY = Object.freeze([
  ...OPTIONAL_SCENARIO_EXPORT_KEYS_BASE,
  'lossyQuality',
]);

function sortedKeys(obj) {
  return Object.keys(obj ?? {}).sort();
}

/**
 * @param {Record<string, object>|undefined|null} optionalScenarios
 * @param {{ requireNonEmpty?: boolean }} [opts]
 */
export function assertFilmLabExportOptionalScenariosSemantics(optionalScenarios, opts = {}) {
  const { requireNonEmpty = true } = opts;
  const scenarioNames = Object.keys(optionalScenarios ?? {});
  if (requireNonEmpty) {
    assert.ok(scenarioNames.length > 0, 'optionalScenarios must ship at least one scenario');
  }

  for (const scenarioName of scenarioNames) {
    const scenario = optionalScenarios?.[scenarioName];
    assert.ok(scenario && typeof scenario === 'object', `Optional scenario must be an object: ${scenarioName}`);
    assert.ok(
      scenario.mode === 'single' || scenario.mode === 'batch',
      `Optional scenario must declare mode=single|batch: ${scenarioName}`
    );
    if (scenarioName.startsWith('single')) {
      assert.equal(
        scenario.mode,
        'single',
        `Optional scenario prefix single* must declare mode=single: ${scenarioName}`
      );
    }
    if (scenarioName.startsWith('batch')) {
      assert.equal(
        scenario.mode,
        'batch',
        `Optional scenario prefix batch* must declare mode=batch: ${scenarioName}`
      );
    }

    assert.ok(Array.isArray(scenario.artifacts), `${scenarioName}: optional scenario must declare artifacts array`);

    const includeRecipeJson = Boolean(scenario.export?.includeRecipeJson);
    const includeBeforeAfter = Boolean(scenario.export?.includeBeforeAfter);
    const includeLocalMaskPng = Boolean(scenario.export?.includeLocalMaskPng);
    const variants = scenario.artifacts.map((artifact) => String(artifact?.variant ?? ''));
    const hasBeforeVariant = variants.includes('before');
    const hasMaskVariant = variants.includes('mask');
    const hasRecipeVariant = variants.some((variant) => variant.includes('recipe'));
    const afterArtifacts = scenario.artifacts.filter((artifact) => String(artifact?.variant ?? '') === 'after');

    if (scenarioName.includes('WithRecipe')) {
      assert.equal(
        includeRecipeJson,
        true,
        `${scenarioName}: suffix WithRecipe requires export.includeRecipeJson=true`
      );
      assert.equal(
        hasRecipeVariant,
        true,
        `${scenarioName}: suffix WithRecipe requires at least one recipe artifact variant`
      );
    }
    if (scenarioName.includes('AndRecipe')) {
      assert.equal(
        includeRecipeJson,
        true,
        `${scenarioName}: token AndRecipe requires export.includeRecipeJson=true`
      );
      assert.equal(
        hasRecipeVariant,
        true,
        `${scenarioName}: token AndRecipe requires at least one recipe artifact variant`
      );
    }
    if (scenarioName.includes('NoRecipe')) {
      assert.equal(
        includeRecipeJson,
        false,
        `${scenarioName}: suffix NoRecipe requires export.includeRecipeJson=false`
      );
      assert.equal(
        hasRecipeVariant,
        false,
        `${scenarioName}: suffix NoRecipe requires no recipe artifact variants`
      );
    }
    if (scenarioName.includes('WithBefore')) {
      assert.equal(
        includeBeforeAfter,
        true,
        `${scenarioName}: suffix WithBefore requires export.includeBeforeAfter=true`
      );
      assert.equal(
        hasBeforeVariant,
        true,
        `${scenarioName}: suffix WithBefore requires before artifact variant`
      );
    }
    if (scenarioName.includes('WithMask')) {
      assert.equal(
        includeLocalMaskPng,
        true,
        `${scenarioName}: suffix WithMask requires export.includeLocalMaskPng=true`
      );
      assert.equal(
        hasMaskVariant,
        true,
        `${scenarioName}: suffix WithMask requires mask artifact variant`
      );
    }

    assert.ok(
      afterArtifacts.length > 0,
      `${scenarioName}: optional scenario must include at least one after artifact`
    );

    const hasFileFormat = Object.prototype.hasOwnProperty.call(scenario.export ?? {}, 'fileFormat');
    const fileFormat = hasFileFormat ? String(scenario.export.fileFormat) : null;

    if (scenarioName.includes('Png')) {
      assert.equal(fileFormat, 'png', `${scenarioName}: name token Png requires export.fileFormat=png`);
    }
    if (scenarioName.includes('Avif')) {
      assert.equal(fileFormat, 'avif', `${scenarioName}: name token Avif requires export.fileFormat=avif`);
    }
    if (scenarioName.includes('Webp')) {
      assert.equal(fileFormat, 'webp', `${scenarioName}: name token Webp requires export.fileFormat=webp`);
    }
    if (scenarioName.includes('Tiff')) {
      assert.equal(fileFormat, 'tiff', `${scenarioName}: name token Tiff requires export.fileFormat=tiff`);
    }
    if (scenarioName.includes('Jpeg')) {
      assert.equal(fileFormat, 'jpeg', `${scenarioName}: name token Jpeg requires export.fileFormat=jpeg`);
    }
    if (scenarioName.includes('Psd')) {
      assert.equal(fileFormat, 'psd', `${scenarioName}: name token Psd requires export.fileFormat=psd`);
    }

    if (hasFileFormat) {
      assert.ok(
        FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_SET.has(String(scenario.export.fileFormat)),
        `Optional scenario fileFormat must be in ${[...FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_SET].sort().join(', ')}: ${scenarioName}`
      );
    }

    if (scenarioName === 'singleWithBeforeMaskRecipe' || scenarioName === 'batchWithBeforeMaskRecipe') {
      assert.equal(
        hasFileFormat,
        false,
        `${scenarioName}: include-before+mask+recipe blueprint should omit fileFormat in optional export block`
      );
    }

    assert.ok(
      scenario.export && typeof scenario.export === 'object' && !Array.isArray(scenario.export),
      `${scenarioName}: optional scenario must declare export object`
    );
    const exportKeysSorted = sortedKeys(scenario.export);
    const hasLossyQuality = Object.prototype.hasOwnProperty.call(scenario.export ?? {}, 'lossyQuality');
    if (scenarioName === 'singleWithBeforeMaskRecipe' || scenarioName === 'batchWithBeforeMaskRecipe') {
      assert.deepEqual(
        exportKeysSorted,
        ['includeBeforeAfter', 'includeLocalMaskPng', 'includeRecipeJson'],
        `${scenarioName}: optional scenario export block must only include include* flags`
      );
    } else {
      const keysBaseOk =
        exportKeysSorted.length === OPTIONAL_SCENARIO_EXPORT_KEYS_BASE.length &&
        exportKeysSorted.every((k, i) => k === OPTIONAL_SCENARIO_EXPORT_KEYS_BASE[i]);
      const keysWithLossyOk =
        exportKeysSorted.length === OPTIONAL_SCENARIO_EXPORT_KEYS_WITH_LOSSY.length &&
        exportKeysSorted.every((k, i) => k === OPTIONAL_SCENARIO_EXPORT_KEYS_WITH_LOSSY[i]);
      assert.ok(
        keysBaseOk || keysWithLossyOk,
        `${scenarioName}: optional scenario export block must be fileFormat + include* flags only, optionally with lossyQuality (sorted)`
      );
      if (keysWithLossyOk) {
        const lq = scenario.export.lossyQuality;
        assert.ok(
          typeof lq === 'number' && Number.isFinite(lq) && lq >= 0.35 && lq <= 1,
          `${scenarioName}: lossyQuality must be a finite number in [0.35, 1]`
        );
        assert.ok(
          fileFormat && FILM_LAB_EXPORT_LOSSY_FORMAT_SET.has(String(fileFormat)),
          `${scenarioName}: lossyQuality is only defined for lossy raster formats (jpeg, webp, avif)`
        );
      } else {
        assert.equal(
          hasLossyQuality,
          false,
          `${scenarioName}: optional scenario export without lossyQuality key must not include lossyQuality`
        );
      }
    }

    if (scenarioName.includes('WithLossyQuality')) {
      assert.equal(hasLossyQuality, true, `${scenarioName}: name token WithLossyQuality requires export.lossyQuality`);
    }

    for (const artifact of scenario.artifacts) {
      assert.deepEqual(
        Object.keys(artifact),
        MINIMAL_OPTIONAL_ARTIFACT_KEY_ORDER,
        `${scenarioName}: minimal optional artifact keys must follow stable order ${MINIMAL_OPTIONAL_ARTIFACT_KEY_ORDER.join(', ')}`
      );
      assert.deepEqual(
        sortedKeys(artifact),
        SORTED_MINIMAL_OPTIONAL_ARTIFACT_KEYS,
        `${scenarioName}: minimal optional artifact must not include unknown keys`
      );
      for (const forbidden of FORBIDDEN_RUNTIME_ARTIFACT_KEYS) {
        assert.ok(!(forbidden in artifact), `${scenarioName}: minimal optional artifact must not include ${forbidden}`);
      }
      const expectedRole = canonicalFilmLabExportManifestArtifactRoleForVariant(artifact.variant);
      assert.ok(
        expectedRole,
        `${scenarioName}: unknown variant for canonical artifactRole: ${artifact.variant}`
      );
      assert.equal(
        artifact.artifactRole,
        expectedRole,
        `${scenarioName}: variant ${artifact.variant} must use artifactRole=${expectedRole}`
      );
    }
  }
}

/** Whitelist mirrored in perf-gates / contract tests for export.fileFormat in optional scenarios. */
export const FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMATS =
  FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_SET;

/** Documented minimal artifact row keys for optionalScenarios (stable JSON key order). */
export const FILM_LAB_EXPORT_MANIFEST_MINIMAL_OPTIONAL_ARTIFACT_KEYS = Object.freeze([
  ...MINIMAL_OPTIONAL_ARTIFACT_KEY_ORDER,
]);
