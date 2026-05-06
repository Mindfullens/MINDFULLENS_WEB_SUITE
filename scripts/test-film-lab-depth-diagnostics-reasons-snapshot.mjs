import assert from 'node:assert/strict';
import {
  toHttpDepthDiagnosticsError,
  toHttpDepthDiagnosticsWarning,
  buildDepthDiagnosticsCompatibilityReportFromReason,
  FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES,
  getDepthDiagnosticsCompatibilityReport,
  isDepthDiagnosticsStrictFailure,
  mapDepthDiagnosticsReasonToCode,
  validateFilmLabExportDepthDiagnosticsCompatibility,
} from '../src/engine/filmLabExportManifestHelpers.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reasonNoneWithArtifacts = validateFilmLabExportDepthDiagnosticsCompatibility({
  artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  export: { depthProxyVariant: 'none' },
});
const reasonJsonWithoutArtifacts = validateFilmLabExportDepthDiagnosticsCompatibility({
  artifacts: [{ variant: 'after' }],
  export: { depthProxyVariant: 'json' },
});
const reasonJsonF32WithoutF32 = validateFilmLabExportDepthDiagnosticsCompatibility({
  artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
  export: { depthProxyVariant: 'json+f32' },
});

assert.equal(
  reasonNoneWithArtifacts,
  "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts"
);
assert.equal(
  reasonJsonWithoutArtifacts,
  "export.depthProxyVariant='json|json+f32' requires depth_proxy/depth_proxy_data artifacts"
);
assert.equal(
  reasonJsonF32WithoutF32,
  "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact"
);

assert.equal(
  mapDepthDiagnosticsReasonToCode(reasonNoneWithArtifacts),
  FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.NONE_WITH_ARTIFACTS
);
assert.equal(
  mapDepthDiagnosticsReasonToCode(reasonJsonWithoutArtifacts),
  FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.JSON_OR_JSONF32_WITHOUT_ARTIFACTS
);
assert.equal(
  mapDepthDiagnosticsReasonToCode(reasonJsonF32WithoutF32),
  FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.JSONF32_WITHOUT_F32
);
assert.equal(mapDepthDiagnosticsReasonToCode('unknown-reason'), null);
assert.deepEqual(
  getDepthDiagnosticsCompatibilityReport({
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
    export: { depthProxyVariant: 'none' },
  }),
  {
    reason: "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts",
    code: FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.NONE_WITH_ARTIFACTS,
    isStrictFailure: true,
  }
);
assert.equal(
  isDepthDiagnosticsStrictFailure({
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
    export: { depthProxyVariant: 'none' },
  }),
  true
);
assert.equal(
  isDepthDiagnosticsStrictFailure({
    artifacts: [{ variant: 'after' }, { variant: 'depth_proxy' }],
    export: { depthProxyVariant: 'json' },
  }),
  false
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unknownReasonFixture = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/fixtures/export-depth-compat/unknown-reason-path.json'), 'utf8')
);
const unknownReport = buildDepthDiagnosticsCompatibilityReportFromReason(unknownReasonFixture.customReason);
assert.deepEqual(unknownReport, {
  reason: 'MANUAL_POLICY_VIOLATION: unrecognized depth diagnostics reason',
  code: null,
  isStrictFailure: true,
});
const unknownNullReport = buildDepthDiagnosticsCompatibilityReportFromReason(null);
assert.deepEqual(unknownNullReport, {
  reason: null,
  code: null,
  isStrictFailure: false,
});
assert.deepEqual(
  FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES,
  {
    NONE_WITH_ARTIFACTS: 'DEPTH_VARIANT_NONE_WITH_ARTIFACTS',
    JSON_OR_JSONF32_WITHOUT_ARTIFACTS: 'DEPTH_VARIANT_JSON_WITHOUT_ARTIFACTS',
    JSONF32_WITHOUT_F32: 'DEPTH_VARIANT_JSONF32_WITHOUT_F32',
  },
  'reason codes enum should remain stable for integrations'
);
assert.deepEqual(
  toHttpDepthDiagnosticsError({
    reason: "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact",
    code: FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.JSONF32_WITHOUT_F32,
    isStrictFailure: true,
  }),
  {
    status: 422,
    body: {
      error: 'DEPTH_DIAGNOSTICS_INCOMPATIBLE',
      reason: "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact",
      code: 'DEPTH_VARIANT_JSONF32_WITHOUT_F32',
    },
  }
);
assert.deepEqual(
  toHttpDepthDiagnosticsWarning({
    reason: "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact",
    code: FILM_LAB_DEPTH_DIAGNOSTICS_REASON_CODES.JSONF32_WITHOUT_F32,
    isStrictFailure: true,
  }),
  {
    status: 200,
    body: {
      ok: true,
      warnings: [
        {
          type: 'DEPTH_DIAGNOSTICS_WARNING',
          reason: "export.depthProxyVariant='json+f32' requires depth_proxy_data artifact",
          code: 'DEPTH_VARIANT_JSONF32_WITHOUT_F32',
        },
      ],
    },
  }
);
assert.deepEqual(
  toHttpDepthDiagnosticsWarning({
    reason: null,
    code: null,
    isStrictFailure: false,
  }),
  {
    status: 200,
    body: {
      ok: true,
      warnings: [],
    },
  }
);

console.log('PASS film-lab-depth-diagnostics-reasons-snapshot');
