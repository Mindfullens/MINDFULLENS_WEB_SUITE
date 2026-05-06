import {
  mapDepthDiagnosticsReasonToCode,
  toHttpDepthDiagnosticsResult,
} from '../../../src/engine';
import type { DepthDiagnosticsReasonCode } from '../../../src/engine';

const code = mapDepthDiagnosticsReasonToCode(
  "export.depthProxyVariant='none' cannot coexist with depth_proxy/depth_proxy_data artifacts"
);

const typedCode: DepthDiagnosticsReasonCode | null = code;
void typedCode;

// @ts-expect-error invalid reason code literal should be rejected
const invalidCode: DepthDiagnosticsReasonCode = 'DEPTH_VARIANT_BROKEN';
void invalidCode;

// @ts-expect-error strict option must be boolean
toHttpDepthDiagnosticsResult({ reason: null, code: null, isStrictFailure: false }, { strict: 'yes' });
