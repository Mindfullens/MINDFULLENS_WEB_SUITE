import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDepthDiagnosticsCompatibilityReport,
  assertFilmLabExportDepthDiagnosticsCompatibility,
  normalizeLegacyManifestDepthDiagnostics,
  validateFilmLabExportDepthDiagnosticsCompatibility,
} from '../src/engine/filmLabExportManifestHelpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'scripts/fixtures/export-depth-compat/legacy-manifest.json');
const afterRecipePath = path.join(root, 'scripts/fixtures/export-depth-compat/legacy-after-recipe.json');
const manifestJsonF32Path = path.join(root, 'scripts/fixtures/export-depth-compat/legacy-manifest-json-f32.json');
const modernManifestPath = path.join(root, 'scripts/fixtures/export-depth-compat/modern-manifest.json');
const modernAfterRecipePath = path.join(root, 'scripts/fixtures/export-depth-compat/modern-after-recipe.json');
const legacyEmptyArtifactsPath = path.join(root, 'scripts/fixtures/export-depth-compat/legacy-manifest-empty-artifacts.json');
const inconsistentManifestPath = path.join(root, 'scripts/fixtures/export-depth-compat/inconsistent-manifest-none-with-depth.json');
const inconsistentManifestReversePath = path.join(root, 'scripts/fixtures/export-depth-compat/inconsistent-manifest-json-without-depth.json');
const inconsistentManifestJsonF32Path = path.join(root, 'scripts/fixtures/export-depth-compat/inconsistent-manifest-json-f32-without-f32.json');
const consistentManifestJsonF32Path = path.join(root, 'scripts/fixtures/export-depth-compat/consistent-manifest-json-f32-complete.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const afterRecipe = JSON.parse(fs.readFileSync(afterRecipePath, 'utf8'));

const normalized = normalizeLegacyManifestDepthDiagnostics(manifest, afterRecipe);

assert.equal(normalized.manifest?.export?.depthProxyPresent, true);
assert.equal(normalized.manifest?.export?.depthProxyVariant, 'json');
assert.equal(normalized.afterRecipe?.export?.depthTraceVersion, 1);
assert.equal(normalized.afterRecipe?.export?.depthMapSource, 'luminance');
assert.equal(normalized.afterRecipe?.export?.depthProxyDigest, '');

const manifestJsonF32 = JSON.parse(fs.readFileSync(manifestJsonF32Path, 'utf8'));
const normalizedJsonF32 = normalizeLegacyManifestDepthDiagnostics(manifestJsonF32, afterRecipe);
assert.equal(normalizedJsonF32.manifest?.export?.depthProxyPresent, true);
assert.equal(normalizedJsonF32.manifest?.export?.depthProxyVariant, 'json+f32');

const modernManifest = JSON.parse(fs.readFileSync(modernManifestPath, 'utf8'));
const modernAfterRecipe = JSON.parse(fs.readFileSync(modernAfterRecipePath, 'utf8'));
const normalizedModern = normalizeLegacyManifestDepthDiagnostics(modernManifest, modernAfterRecipe);
assert.deepEqual(normalizedModern.manifest, modernManifest, 'modern manifest fixture should stay unchanged (idempotence)');
assert.deepEqual(normalizedModern.afterRecipe, modernAfterRecipe, 'modern after_recipe fixture should stay unchanged (idempotence)');

const legacyEmptyArtifactsManifest = JSON.parse(fs.readFileSync(legacyEmptyArtifactsPath, 'utf8'));
const normalizedLegacyEmptyArtifacts = normalizeLegacyManifestDepthDiagnostics(legacyEmptyArtifactsManifest, afterRecipe);
assert.equal(normalizedLegacyEmptyArtifacts.manifest?.export?.depthProxyPresent, false);
assert.equal(normalizedLegacyEmptyArtifacts.manifest?.export?.depthProxyVariant, 'none');
assert.equal(normalizedLegacyEmptyArtifacts.afterRecipe?.export?.depthMapSource, null);
assert.equal(normalizedLegacyEmptyArtifacts.afterRecipe?.export?.depthProxyDigest, null);

const inconsistentManifest = JSON.parse(fs.readFileSync(inconsistentManifestPath, 'utf8'));
const incompatReason = validateFilmLabExportDepthDiagnosticsCompatibility(inconsistentManifest);
assert.equal(
  incompatReason,
  "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts"
);

const inconsistentManifestReverse = JSON.parse(fs.readFileSync(inconsistentManifestReversePath, 'utf8'));
const incompatReasonReverse = validateFilmLabExportDepthDiagnosticsCompatibility(inconsistentManifestReverse);
assert.equal(
  incompatReasonReverse,
  "export.depthProxyVariant='json|json+f32' requires depth_proxy/depth_proxy_data artifacts"
);
const normalizedReverse = normalizeLegacyManifestDepthDiagnostics(inconsistentManifestReverse, null);
assert.equal(normalizedReverse.manifest?.export?.depthProxyPresent, false);
assert.equal(normalizedReverse.manifest?.export?.depthProxyVariant, 'none');
assert.equal(normalizedReverse.compatibilityWarning, null);
assert.throws(
  () => assertFilmLabExportDepthDiagnosticsCompatibility(inconsistentManifestReverse, { label: 'fixture.reverse' }),
  /\[fixture\.reverse\].*requires depth_proxy\/depth_proxy_data artifacts/
);

const inconsistentManifestJsonF32 = JSON.parse(fs.readFileSync(inconsistentManifestJsonF32Path, 'utf8'));
const incompatReasonJsonF32 = validateFilmLabExportDepthDiagnosticsCompatibility(inconsistentManifestJsonF32);
assert.equal(
  incompatReasonJsonF32,
  "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact"
);
const normalizedJsonF32Inconsistent = normalizeLegacyManifestDepthDiagnostics(inconsistentManifestJsonF32, null);
assert.equal(normalizedJsonF32Inconsistent.manifest?.export?.depthProxyPresent, true);
assert.equal(
  normalizedJsonF32Inconsistent.manifest?.export?.depthProxyVariant,
  'json',
  'normalizer should degrade json+f32 to json when depth_proxy_data is missing'
);
assert.equal(
  normalizedJsonF32Inconsistent.compatibilityWarning,
  null,
  'normalizer should heal json+f32-without-f32 inconsistency in non-strict flow'
);
assert.throws(
  () => assertFilmLabExportDepthDiagnosticsCompatibility(inconsistentManifestJsonF32, { label: 'fixture.jsonf32' }),
  /\[fixture\.jsonf32\].*requires depth_proxy_data artifact/
);

const consistentManifestJsonF32 = JSON.parse(fs.readFileSync(consistentManifestJsonF32Path, 'utf8'));
assert.equal(validateFilmLabExportDepthDiagnosticsCompatibility(consistentManifestJsonF32), null);
const consistentReport = getDepthDiagnosticsCompatibilityReport(consistentManifestJsonF32);
assert.deepEqual(consistentReport, { reason: null, code: null, isStrictFailure: false });

console.log('PASS film-lab-export-depth-compat-fixture-smoke');
