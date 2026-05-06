export type DepthDiagnosticsWarningItem = {
  type: 'DEPTH_DIAGNOSTICS_WARNING';
  reason: string | null;
  code: string | null;
};

export type DepthDiagnosticsReasonCode =
  | 'DEPTH_VARIANT_NONE_WITH_ARTIFACTS'
  | 'DEPTH_VARIANT_JSON_WITHOUT_ARTIFACTS'
  | 'DEPTH_VARIANT_JSONF32_WITHOUT_F32';

export type DepthDiagnosticsErrorBody = {
  error: 'DEPTH_DIAGNOSTICS_INCOMPATIBLE';
  reason: string | null;
  code: string | null;
};

export type DepthDiagnosticsWarningBody = {
  ok: true;
  warnings: DepthDiagnosticsWarningItem[];
};

export type DepthDiagnosticsCompatibilityReport = {
  reason: string | null;
  code: DepthDiagnosticsReasonCode | null;
  isStrictFailure: boolean;
};

export type DepthDiagnosticsHttpErrorResponse = {
  status: 422;
  body: DepthDiagnosticsErrorBody;
};

export type DepthDiagnosticsHttpWarningResponse = {
  status: 200;
  body: DepthDiagnosticsWarningBody;
};

export declare function mapDepthDiagnosticsReasonToCode(
  reason: string | null
): DepthDiagnosticsReasonCode | null;

export declare function buildDepthDiagnosticsCompatibilityReportFromReason(
  reason: string | null
): DepthDiagnosticsCompatibilityReport;

export declare function getDepthDiagnosticsCompatibilityReport(
  manifest: unknown
): DepthDiagnosticsCompatibilityReport;

export declare function isDepthDiagnosticsStrictFailure(manifest: unknown): boolean;

export declare function toHttpDepthDiagnosticsError(
  report: DepthDiagnosticsCompatibilityReport
): DepthDiagnosticsHttpErrorResponse;

export declare function toHttpDepthDiagnosticsWarning(
  report: DepthDiagnosticsCompatibilityReport
): DepthDiagnosticsHttpWarningResponse;

export declare function toHttpDepthDiagnosticsWarningOnly(
  report: DepthDiagnosticsCompatibilityReport
): DepthDiagnosticsWarningItem;

export declare function toHttpDepthDiagnosticsResult(
  report: DepthDiagnosticsCompatibilityReport,
  opts?: { strict?: boolean }
): DepthDiagnosticsHttpErrorResponse | DepthDiagnosticsHttpWarningResponse;

export declare function warnFilmLabExportDepthDiagnosticsCompatibility(
  manifest: { export?: { depthProxyVariant?: unknown }; artifacts?: Array<{ variant?: string }> } | null | undefined,
  moduleName?: string,
  opts?: { silent?: boolean }
): string | null;

export declare function assertFilmLabExportDepthDiagnosticsCompatibility(
  manifest: { export?: { depthProxyVariant?: unknown }; artifacts?: Array<{ variant?: string }> } | null | undefined,
  opts?: { label?: string }
): true;

export declare function normalizeLegacyManifestDepthDiagnostics(
  manifest: { export?: Record<string, unknown>; artifacts?: Array<{ variant?: string }> } | null | undefined,
  afterRecipePayload?: { export?: Record<string, unknown> } | null | undefined
): {
  manifest: { export?: Record<string, unknown>; artifacts?: Array<{ variant?: string }> } | null;
  afterRecipe: { export?: Record<string, unknown> } | null;
  compatibilityWarning: string | null;
};
