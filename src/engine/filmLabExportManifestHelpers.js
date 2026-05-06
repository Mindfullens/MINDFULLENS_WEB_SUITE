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
  if (artifactEntries.some((entry) => entry.variant === 'depth_proxy' || entry.variant === 'depth_proxy_data')) {
    caps.push('export.depth.proxy');
  }
  if (artifactEntries.some((entry) => String(entry.variant).includes('recipe'))) {
    caps.push('manifest.recipe.sidecar');
  }
  return caps;
}

/**
 * @param {Array<{ variant?: string }>} artifactEntries
 */
export function hasFilmLabDepthProxyArtifacts(artifactEntries) {
  return artifactEntries.some((entry) => entry.variant === 'depth_proxy' || entry.variant === 'depth_proxy_data');
}

/**
 * @param {Array<{ variant?: string }>} artifactEntries
 * @returns {'none'|'json'|'json+f32'}
 */
export function computeFilmLabDepthProxyVariant(artifactEntries) {
  const hasJson = artifactEntries.some((entry) => entry.variant === 'depth_proxy');
  const hasF32 = artifactEntries.some((entry) => entry.variant === 'depth_proxy_data');
  if (hasJson && hasF32) {
    return 'json+f32';
  }
  if (hasJson) {
    return 'json';
  }
  if (hasF32) {
    return 'json+f32';
  }
  return 'none';
}

/**
 * Backward-compat parser for older manifests that may miss export.depthProxyVariant.
 * - If variant is missing/invalid, derive from artifacts.
 * - depthProxyPresent is always derived from artifacts for consistency.
 *
 * @param {{ depthProxyVariant?: unknown, depthProxyPresent?: unknown } | null | undefined} exportBlock
 * @param {Array<{ variant?: string }>} artifactEntries
 * @returns {{ depthProxyPresent: boolean, depthProxyVariant: 'none'|'json'|'json+f32' }}
 */
export function resolveFilmLabExportDepthDiagnostics(exportBlock, artifactEntries) {
  const derivedPresent = hasFilmLabDepthProxyArtifacts(artifactEntries);
  const derivedVariant = computeFilmLabDepthProxyVariant(artifactEntries);
  const hasDepthJson = artifactEntries.some((entry) => entry?.variant === 'depth_proxy');
  const hasDepthF32 = artifactEntries.some((entry) => entry?.variant === 'depth_proxy_data');
  const rawVariant = String(exportBlock?.depthProxyVariant ?? '').trim().toLowerCase();
  const rawVariantIsKnown = rawVariant === 'none' || rawVariant === 'json' || rawVariant === 'json+f32';
  let normalizedVariant = rawVariantIsKnown ? rawVariant : derivedVariant;
  if (normalizedVariant === 'none' && derivedPresent) {
    normalizedVariant = derivedVariant;
  }
  if ((normalizedVariant === 'json' || normalizedVariant === 'json+f32') && !derivedPresent) {
    normalizedVariant = derivedVariant;
  }
  if (normalizedVariant === 'json+f32' && hasDepthJson && !hasDepthF32) {
    normalizedVariant = 'json';
  }
  return {
    depthProxyPresent: derivedPresent,
    depthProxyVariant: normalizedVariant,
  };
}

/**
 * Reader-side compatibility validator for depth diagnostics.
 * Returns null when valid; otherwise a string reason.
 *
 * @param {{ export?: { depthProxyVariant?: unknown }, artifacts?: Array<{ variant?: string }> } | null | undefined} manifest
 * @returns {string|null}
 */
export function validateFilmLabExportDepthDiagnosticsCompatibility(manifest) {
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const hasDepthArtifacts = hasFilmLabDepthProxyArtifacts(artifacts);
  const hasDepthJson = artifacts.some((entry) => entry?.variant === 'depth_proxy');
  const hasDepthF32 = artifacts.some((entry) => entry?.variant === 'depth_proxy_data');
  const variant = String(manifest?.export?.depthProxyVariant ?? '').trim().toLowerCase();
  if (variant === 'none' && hasDepthArtifacts) {
    return "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts";
  }
  if ((variant === 'json' || variant === 'json+f32') && !hasDepthArtifacts) {
    return "export.depthProxyVariant='json|json+f32' requires depth_proxy/depth_proxy_data artifacts";
  }
  if (variant === 'json+f32' && hasDepthJson && !hasDepthF32) {
    return "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact";
  }
  return null;
}

export const FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES = Object.freeze({
  NONE_WITH_ARTIFACTS: 'DEPTH_VARIANT_NONE_WITH_ARTIFACTS',
  JSON_OR_JSONF32_WITHOUT_ARTIFACTS: 'DEPTH_VARIANT_JSON_WITHOUT_ARTIFACTS',
  JSONF32_WITHOUT_F32: 'DEPTH_VARIANT_JSONF32_WITHOUT_F32',
});

/**
 * @typedef {Object} DepthDiagnosticsWarningItem
 * @property {'DEPTH_DIAGNOSTICS_WARNING'} type
 * @property {string|null} reason
 * @property {string|null} code
 */

/**
 * @typedef {Object} DepthDiagnosticsErrorBody
 * @property {'DEPTH_DIAGNOSTICS_INCOMPATIBLE'} error
 * @property {string|null} reason
 * @property {string|null} code
 */

/**
 * @typedef {Object} DepthDiagnosticsWarningBody
 * @property {true} ok
 * @property {DepthDiagnosticsWarningItem[]} warnings
 */

/**
 * Maps validator reason strings to stable machine-readable codes.
 *
 * @param {string|null|undefined} reason
 * @returns {string|null}
 */
export function mapDepthDiagnosticsReasonToCode(reason) {
  if (!reason) {
    return null;
  }
  const msg = String(reason);
  if (msg === "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts") {
    return FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.NONE_WITH_ARTIFACTS;
  }
  if (msg === "export.depthProxyVariant='json|json+f32' requires depth_proxy/depth_proxy_data artifacts") {
    return FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.JSON_OR_JSONF32_WITHOUT_ARTIFACTS;
  }
  if (msg === "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact") {
    return FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.JSONF32_WITHOUT_F32;
  }
  return null;
}

/**
 * Builds machine-readable report from any reason string (including unknown/custom).
 *
 * @param {string|null|undefined} reason
 * @returns {{ reason: string|null, code: string|null, isStrictFailure: boolean }}
 */
export function buildDepthDiagnosticsCompatibilityReportFromReason(reason) {
  const normalizedReason = reason == null ? null : String(reason);
  return {
    reason: normalizedReason,
    code: mapDepthDiagnosticsReasonToCode(normalizedReason),
    isStrictFailure: Boolean(normalizedReason),
  };
}

/**
 * Machine-readable compatibility report for backend/API integrations.
 *
 * @param {{ export?: { depthProxyVariant?: unknown }, artifacts?: Array<{ variant?: string }> } | null | undefined} manifest
 * @returns {{ reason: string|null, code: string|null, isStrictFailure: boolean }}
 */
export function getDepthDiagnosticsCompatibilityReport(manifest) {
  const reason = validateFilmLabExportDepthDiagnosticsCompatibility(manifest);
  return buildDepthDiagnosticsCompatibilityReportFromReason(reason);
}

/**
 * Thin wrapper for strict-failure checks in integrations.
 *
 * @param {{ export?: { depthProxyVariant?: unknown }, artifacts?: Array<{ variant?: string }> } | null | undefined} manifest
 * @returns {boolean}
 */
export function isDepthDiagnosticsStrictFailure(manifest) {
  return getDepthDiagnosticsCompatibilityReport(manifest).isStrictFailure;
}

/**
 * Converts compatibility report into ready-to-return HTTP error payload.
 *
 * @param {{ reason: string|null, code: string|null, isStrictFailure: boolean }} report
 * @returns {{ status: 422, body: DepthDiagnosticsErrorBody }}
 */
export function toHttpDepthDiagnosticsError(report) {
  return {
    status: 422,
    body: {
      error: 'DEPTH_DIAGNOSTICS_INCOMPATIBLE',
      reason: report?.reason ?? null,
      code: report?.code ?? null,
    },
  };
}

/**
 * Converts compatibility report into ready-to-return warning payload (non-strict mode).
 *
 * @param {{ reason: string|null, code: string|null, isStrictFailure: boolean }} report
 * @returns {{ status: 200, body: DepthDiagnosticsWarningBody }}
 */
export function toHttpDepthDiagnosticsWarning(report) {
  return {
    status: 200,
    body: {
      ok: true,
      warnings: report?.isStrictFailure ? [toHttpDepthDiagnosticsWarningOnly(report)] : [],
    },
  };
}

/**
 * Returns warning object only (without HTTP status wrapper).
 *
 * @param {{ reason: string|null, code: string|null, isStrictFailure: boolean }} report
 * @returns {DepthDiagnosticsWarningItem}
 */
export function toHttpDepthDiagnosticsWarningOnly(report) {
  return {
    type: 'DEPTH_DIAGNOSTICS_WARNING',
    reason: report?.reason ?? null,
    code: report?.code ?? null,
  };
}

/**
 * Unified HTTP response builder for strict/non-strict integrations.
 *
 * @param {{ reason: string|null, code: string|null, isStrictFailure: boolean }} report
 * @param {{ strict?: boolean }} [opts]
 * @returns {{ status: 422, body: DepthDiagnosticsErrorBody } | { status: 200, body: DepthDiagnosticsWarningBody }}
 */
export function toHttpDepthDiagnosticsResult(report, opts = {}) {
  const strict = Boolean(opts.strict);
  if (strict && report?.isStrictFailure) {
    return toHttpDepthDiagnosticsError(report);
  }
  return toHttpDepthDiagnosticsWarning(report);
}

/**
 * Logs a readable warning when depth diagnostics are inconsistent.
 *
 * @param {{ export?: { depthProxyVariant?: unknown }, artifacts?: Array<{ variant?: string }> } | null | undefined} manifest
 * @param {string} moduleName
 * @param {{ silent?: boolean }} [opts]
 * @returns {string|null}
 */
export function warnFilmLabExportDepthDiagnosticsCompatibility(manifest, moduleName = 'filmLab.export', opts = {}) {
  const reason = validateFilmLabExportDepthDiagnosticsCompatibility(manifest);
  if (reason && !opts.silent) {
    // Keep non-throwing behavior: diagnostic warning only.
    console.warn(`[${moduleName}] depth diagnostics compatibility warning: ${reason}`);
  }
  return reason;
}

/**
 * Strict validator for integrators that want hard reject semantics.
 * Throws when diagnostics are inconsistent; otherwise returns true.
 *
 * @param {{ export?: { depthProxyVariant?: unknown }, artifacts?: Array<{ variant?: string }> } | null | undefined} manifest
 * @param {{ label?: string }} [opts]
 * @returns {true}
 */
export function assertFilmLabExportDepthDiagnosticsCompatibility(manifest, opts = {}) {
  const reason = validateFilmLabExportDepthDiagnosticsCompatibility(manifest);
  if (reason) {
    const label = opts.label ? String(opts.label) : 'filmLab.export';
    throw new Error(`[${label}] ${reason}`);
  }
  return true;
}

/**
 * Upgrades legacy after_recipe export block by injecting depth fields from manifest diagnostics.
 *
 * @param {{ export?: Record<string, unknown>, artifacts?: Array<{ variant?: string }> } | null | undefined} manifest
 * @param {{ export?: Record<string, unknown> } | null | undefined} afterRecipePayload
 * @returns {{ export: Record<string, unknown> }|null}
 */
export function upgradeLegacyAfterRecipeDepthTrace(manifest, afterRecipePayload) {
  if (!afterRecipePayload || typeof afterRecipePayload !== 'object') {
    return null;
  }
  const recipeExport = afterRecipePayload.export;
  if (!recipeExport || typeof recipeExport !== 'object') {
    return null;
  }
  if (String(recipeExport.variant ?? '') !== 'after') {
    return { ...afterRecipePayload, export: { ...recipeExport } };
  }
  const diagnostics = resolveFilmLabExportDepthDiagnostics(manifest?.export, manifest?.artifacts ?? []);
  const hasDepthMapSource = Object.prototype.hasOwnProperty.call(recipeExport, 'depthMapSource');
  const hasDepthProxyDigest = Object.prototype.hasOwnProperty.call(recipeExport, 'depthProxyDigest');
  if (hasDepthMapSource && hasDepthProxyDigest) {
    return { ...afterRecipePayload, export: { ...recipeExport } };
  }
  return {
    ...afterRecipePayload,
    export: {
      ...recipeExport,
      depthTraceVersion: 1,
      depthMapSource: diagnostics.depthProxyPresent ? String(recipeExport.depthMapSource ?? 'luminance') : null,
      depthProxyDigest: diagnostics.depthProxyPresent ? String(recipeExport.depthProxyDigest ?? '') : null,
    },
  };
}

/**
 * Canonical export block key order for manifest digest stability.
 *
 * @param {{
 *   depthProxyVariant: 'none'|'json'|'json+f32',
 *   sizeProfile: string,
 *   fileFormat: string,
 *   pipelineKind: string|null,
 *   depthProxyPresent: boolean,
 *   includeLocalMaskPng: boolean,
 *   includeBeforeAfter: boolean,
 *   includeRecipeJson: boolean,
 *   lossyQuality?: number|undefined,
 *   totalSources?: number|undefined,
 *   exportedSources?: number|undefined
 * }} args
 */
export function buildFilmLabExportManifestExportBlock(args) {
  const out = {
    depthProxyVariant: args.depthProxyVariant,
    sizeProfile: args.sizeProfile,
    fileFormat: args.fileFormat,
    pipelineKind: args.pipelineKind,
    depthProxyPresent: Boolean(args.depthProxyPresent),
    includeLocalMaskPng: Boolean(args.includeLocalMaskPng),
    includeBeforeAfter: Boolean(args.includeBeforeAfter),
    includeRecipeJson: Boolean(args.includeRecipeJson),
  };
  if (args.lossyQuality !== undefined) {
    out.lossyQuality = args.lossyQuality;
  }
  if (args.totalSources !== undefined) {
    out.totalSources = args.totalSources;
  }
  if (args.exportedSources !== undefined) {
    out.exportedSources = args.exportedSources;
  }
  return out;
}

/**
 * Public adapter for reader/integrator compatibility:
 * - derives/fixes export depth diagnostics on legacy manifests,
 * - optionally upgrades legacy after_recipe payload depth trace fields.
 *
 * @param {{ export?: Record<string, unknown>, artifacts?: Array<{ variant?: string }> } | null | undefined} manifest
 * @param {{ export?: Record<string, unknown> } | null | undefined} afterRecipePayload
 * @returns {{
 *  manifest: { export?: Record<string, unknown>, artifacts?: Array<{ variant?: string }> }|null,
 *  afterRecipe: { export?: Record<string, unknown> }|null,
 *  compatibilityWarning: string|null
 * }}
 */
export function normalizeLegacyManifestDepthDiagnostics(manifest, afterRecipePayload = null) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      manifest: null,
      afterRecipe: upgradeLegacyAfterRecipeDepthTrace(null, afterRecipePayload),
      compatibilityWarning: null,
    };
  }
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const depthDiag = resolveFilmLabExportDepthDiagnostics(manifest.export, artifacts);
  const nextManifest = {
    ...manifest,
    export: {
      ...(manifest.export && typeof manifest.export === 'object' ? manifest.export : {}),
      depthProxyPresent: depthDiag.depthProxyPresent,
      depthProxyVariant: depthDiag.depthProxyVariant,
    },
  };
  return {
    manifest: nextManifest,
    afterRecipe: upgradeLegacyAfterRecipeDepthTrace(nextManifest, afterRecipePayload),
    compatibilityWarning: warnFilmLabExportDepthDiagnosticsCompatibility(
      nextManifest,
      'manifest.normalizeLegacyManifestDepthDiagnostics',
      { silent: true }
    ),
  };
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
