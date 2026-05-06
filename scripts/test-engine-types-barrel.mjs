import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const barrelPath = path.join(root, 'src/engine/index.d.ts');
const helpersTypesPath = path.join(root, 'src/engine/filmLabExportManifestHelpers.d.ts');

const barrelSource = fs.readFileSync(barrelPath, 'utf8');
const helperTypesSource = fs.readFileSync(helpersTypesPath, 'utf8');

assert.match(barrelSource, /DepthDiagnosticsCompatibilityReport/);
assert.match(barrelSource, /DepthDiagnosticsErrorBody/);
assert.match(barrelSource, /DepthDiagnosticsWarningBody/);
assert.match(barrelSource, /DepthDiagnosticsReasonCode/);
assert.match(barrelSource, /getDepthDiagnosticsCompatibilityReport/);
assert.match(barrelSource, /toHttpDepthDiagnosticsResult/);
assert.match(barrelSource, /toHttpDepthDiagnosticsWarningOnly/);
assert.match(barrelSource, /warnFilmLabExportDepthDiagnosticsCompatibility/);
assert.match(barrelSource, /assertFilmLabExportDepthDiagnosticsCompatibility/);
assert.match(barrelSource, /normalizeLegacyManifestDepthDiagnostics/);

assert.match(helperTypesSource, /export type DepthDiagnosticsCompatibilityReport/);
assert.match(helperTypesSource, /export declare function getDepthDiagnosticsCompatibilityReport/);
assert.match(helperTypesSource, /export declare function toHttpDepthDiagnosticsResult/);
assert.match(helperTypesSource, /export declare function warnFilmLabExportDepthDiagnosticsCompatibility/);
assert.match(helperTypesSource, /export declare function assertFilmLabExportDepthDiagnosticsCompatibility/);
assert.match(helperTypesSource, /export declare function normalizeLegacyManifestDepthDiagnostics/);

console.log('PASS engine-types-barrel-smoke');
