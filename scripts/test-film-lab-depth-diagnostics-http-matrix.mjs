import assert from 'node:assert/strict';
import {
  FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES,
  buildDepthDiagnosticsCompatibilityReportFromReason,
  getDepthDiagnosticsCompatibilityReport,
  mapDepthDiagnosticsReasonToCode,
  toHttpDepthDiagnosticsError,
  toHttpDepthDiagnosticsResult,
  toHttpDepthDiagnosticsWarning,
  toHttpDepthDiagnosticsWarningOnly,
} from '../src/engine/filmLabExportManifestHelpers.js';

const REASONS = Object.freeze([
  "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts",
  "export.depthProxyVariant='json|json+f32' requires depth_proxy/depth_proxy_data artifacts",
  "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact",
  null,
]);

const EXPECTED_CODES = Object.freeze({
  [REASONS[0]]: FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.NONE_WITH_ARTIFACTS,
  [REASONS[1]]: FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.JSON_OR_JSONF32_WITHOUT_ARTIFACTS,
  [REASONS[2]]: FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.JSONF32_WITHOUT_F32,
  null: null,
});

for (const reason of REASONS) {
  const report = buildDepthDiagnosticsCompatibilityReportFromReason(reason);
  const expectedCode = EXPECTED_CODES[String(reason)];
  assert.equal(report.reason, reason);
  assert.equal(report.code, expectedCode);
  assert.equal(report.isStrictFailure, Boolean(reason));
  assert.equal(mapDepthDiagnosticsReasonToCode(reason), expectedCode);

  const warnResp = toHttpDepthDiagnosticsWarning(report);
  assert.equal(warnResp.status, 200);
  const warnOnly = toHttpDepthDiagnosticsWarningOnly(report);
  if (reason) {
    assert.equal(warnResp.body.ok, true);
    assert.equal(warnResp.body.warnings.length, 1);
    assert.deepEqual(warnResp.body.warnings[0], warnOnly);
    assert.equal(warnOnly.type, 'DEPTH_DIAGNOSTICS_WARNING');
    assert.equal(warnOnly.reason, reason);
    assert.equal(warnOnly.code, expectedCode);
  } else {
    assert.deepEqual(warnResp.body, { ok: true, warnings: [] });
    assert.deepEqual(warnOnly, {
      type: 'DEPTH_DIAGNOSTICS_WARNING',
      reason: null,
      code: null,
    });
  }

  const errResp = toHttpDepthDiagnosticsError(report);
  assert.equal(errResp.status, 422);
  assert.equal(errResp.body.error, 'DEPTH_DIAGNOSTICS_INCOMPATIBLE');
  assert.equal(errResp.body.reason, reason);
  assert.equal(errResp.body.code, expectedCode);

  const strictResp = toHttpDepthDiagnosticsResult(report, { strict: true });
  if (reason) {
    assert.deepEqual(strictResp, errResp);
  } else {
    assert.deepEqual(strictResp, warnResp);
  }
  const nonStrictResp = toHttpDepthDiagnosticsResult(report, { strict: false });
  assert.deepEqual(nonStrictResp, warnResp);
}

const runtimeReport = getDepthDiagnosticsCompatibilityReport({
  export: { depthProxyVariant: 'none' },
  artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
});
assert.equal(runtimeReport.code, FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.NONE_WITH_ARTIFACTS);

console.log('PASS film-lab-depth-diagnostics-http-matrix');
