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
