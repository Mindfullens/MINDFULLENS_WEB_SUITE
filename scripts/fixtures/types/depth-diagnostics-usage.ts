import {
  buildDepthDiagnosticsCompatibilityReportFromReason,
  getDepthDiagnosticsCompatibilityReport,
  mapDepthDiagnosticsReasonToCode,
  toHttpDepthDiagnosticsResult,
} from '../../../src/engine';
import type {
  DepthDiagnosticsCompatibilityReport,
  DepthDiagnosticsErrorBody,
  DepthDiagnosticsReasonCode,
  DepthDiagnosticsWarningBody,
} from '../../../src/engine';

const manifestLike: unknown = {
  export: { depthProxyVariant: 'json', depthProxyPresent: true },
  artifacts: [{ variant: 'depth_proxy' }],
};

const report: DepthDiagnosticsCompatibilityReport =
  getDepthDiagnosticsCompatibilityReport(manifestLike);
const mapped = mapDepthDiagnosticsReasonToCode(report.reason);
const http = toHttpDepthDiagnosticsResult(report, { strict: Boolean(mapped) });

if (http.status === 422) {
  const body: DepthDiagnosticsErrorBody = http.body;
  void body.error;
} else {
  const body: DepthDiagnosticsWarningBody = http.body;
  void body.warnings;
}

const strictReport = buildDepthDiagnosticsCompatibilityReportFromReason(
  "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact"
);
const strictCode: DepthDiagnosticsReasonCode | null = strictReport.code;
const strictHttp = toHttpDepthDiagnosticsResult(strictReport, { strict: true });

if (strictHttp.status === 422) {
  const strictBody: DepthDiagnosticsErrorBody = strictHttp.body;
  void strictBody.reason;
  void strictCode;
}

const relaxedReport = buildDepthDiagnosticsCompatibilityReportFromReason(null);
const relaxedHttp = toHttpDepthDiagnosticsResult(relaxedReport, { strict: false });

if (relaxedHttp.status === 200) {
  const relaxedBody: DepthDiagnosticsWarningBody = relaxedHttp.body;
  const warningsCount: number = relaxedBody.warnings.length;
  void warningsCount;
}
