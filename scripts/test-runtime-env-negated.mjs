import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSharedArrayBufferHostSnapshot,
  getViteEnablePreviewLutsRaw,
  readEnvNegated,
  readEnvFlag,
  isEnvEnablePreviewLuts,
  isEnvE2eHostSchedRaf,
  isEnvCpuPreviewMatchNominal,
} from '../src/filmLab/runtimeEnv.js';

const _root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const _engine = fs.readFileSync(path.join(_root, 'src/engine/useFilmLabEngine.js'), 'utf8');
assert.match(_engine, /from ['"]\.\.\/filmLab\/runtimeEnv\.js['"]/);
assert.doesNotMatch(_engine, /function readEnvFlag\s*\(/);

const _guard = fs.readFileSync(path.join(_root, 'src/security/antiCopyGuard.js'), 'utf8');
assert.match(_guard, /readEnvFlag\(\s*import\.meta\?\.env\?\.VITE_DISABLE_COPY_PROTECTION/);

assert.equal(readEnvNegated(undefined), false);
assert.equal(readEnvNegated(null), false);
assert.equal(readEnvNegated('0'), true);
assert.equal(readEnvNegated('OFF'), true);
assert.equal(readEnvNegated('  no  '), true);
assert.equal(readEnvNegated('1'), false);
assert.equal(readEnvNegated('true'), false);
assert.equal(readEnvFlag('1'), true);
assert.equal(readEnvFlag('0'), false);
assert.equal(readEnvFlag(undefined, true), true);
assert.equal(readEnvFlag(undefined, false), false);
assert.equal(readEnvFlag(null, true), true);
assert.equal(readEnvFlag(undefined), false);
assert.equal(isEnvEnablePreviewLuts(), true);
const _previewLutsVite = getViteEnablePreviewLutsRaw();
assert.ok(_previewLutsVite == null || typeof _previewLutsVite === 'string');

const _profiles = fs.readFileSync(path.join(_root, 'src/engine/filmProfiles.js'), 'utf8');
assert.match(_profiles, /isEnvEnablePreviewLuts/);

assert.equal(isEnvE2eHostSchedRaf(), false);
const _rt = fs.readFileSync(path.join(_root, 'src/filmLab/runtimeEnv.js'), 'utf8');
const _pworker = fs.readFileSync(
  path.join(_root, 'src/engine/workers/proxyRenderWorker.js'),
  'utf8',
);
assert.match(_rt, /VITE_FILMLAB_E2E_HOST_SCHED_RAF/);
assert.match(_rt, /VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL/);
assert.match(_pworker, /VITE_FILMLAB_PROXY_CPU_YIELD_EVERY/);
assert.match(_pworker, /getProxyCpuYieldEveryRowCount/);
assert.equal(isEnvCpuPreviewMatchNominal(), false);

const _sab = getSharedArrayBufferHostSnapshot();
assert.equal(typeof _sab.sabConstructible, 'boolean');
assert.ok('crossOriginIsolated' in _sab);
assert.equal(typeof _sab.detail, 'string');
assert.equal(typeof _sab.policyState, 'string');
assert.equal(typeof _sab.policyReason, 'string');
assert.equal(typeof _sab.smokeBytes, 'number');
assert.equal(typeof _sab.smokeOk, 'boolean');

process.stdout.write('PASS test-runtime-env-negated\n');
