import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexTypesPath = path.join(root, 'src/engine/index.d.ts');
const source = fs.readFileSync(indexTypesPath, 'utf8').trim();

const expectedSnapshot = `
/**
 * Public depth diagnostics API surface.
 * Keep exports stable; update snapshot test intentionally when changed.
 */
export type {
  DepthDiagnosticsCompatibilityReport,
  DepthDiagnosticsErrorBody,
  DepthDiagnosticsHttpErrorResponse,
  DepthDiagnosticsHttpWarningResponse,
  DepthDiagnosticsReasonCode,
  DepthDiagnosticsWarningBody,
  DepthDiagnosticsWarningItem,
} from './filmLabExportManifestHelpers';

export {
  assertFilmLabExportDepthDiagnosticsCompatibility,
  buildDepthDiagnosticsCompatibilityReportFromReason,
  getDepthDiagnosticsCompatibilityReport,
  isDepthDiagnosticsStrictFailure,
  mapDepthDiagnosticsReasonToCode,
  normalizeLegacyManifestDepthDiagnostics,
  toHttpDepthDiagnosticsError,
  toHttpDepthDiagnosticsResult,
  toHttpDepthDiagnosticsWarning,
  toHttpDepthDiagnosticsWarningOnly,
  warnFilmLabExportDepthDiagnosticsCompatibility,
} from './filmLabExportManifestHelpers';
`.trim();

assert.equal(source, expectedSnapshot);

console.log('PASS engine-index-types-snapshot');
