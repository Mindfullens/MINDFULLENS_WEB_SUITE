/**
 * Regresja: tier A/B/C + slug źródła dla {@link resolveRuntimeTier} (Etap 4).
 */
import assert from 'node:assert/strict';
import {
  resolveRuntimeTier,
  runtimeTierSourceToI18nLeaf,
  RUNTIME_TIER,
} from '../src/filmLab/runtimeTier.js';

assert.equal(resolveRuntimeTier(null).tier, RUNTIME_TIER.C);
assert.equal(resolveRuntimeTier(null).source, 'default-cpu');

assert.deepEqual(resolveRuntimeTier({ mainThreadWebGpuPreviewAbPath: 'webgpu-main' }), {
  tier: RUNTIME_TIER.A,
  source: 'main-webgpu',
});

assert.deepEqual(resolveRuntimeTier({ mainThreadWebGpuPreviewAbPath: 'webgl-fallback' }), {
  tier: RUNTIME_TIER.B,
  source: 'main-webgl-fallback',
});

assert.deepEqual(resolveRuntimeTier({ proxyLastFrameGpuImpl: 'webgpu' }), {
  tier: RUNTIME_TIER.A,
  source: 'proxy-webgpu',
});

assert.deepEqual(resolveRuntimeTier({ proxyLastFrameGpuImpl: 'webgl' }), {
  tier: RUNTIME_TIER.B,
  source: 'proxy-webgl2',
});

assert.deepEqual(resolveRuntimeTier({ proxyForceCpuFallback: true }), {
  tier: RUNTIME_TIER.C,
  source: 'cpu-fallback',
});

assert.deepEqual(resolveRuntimeTier({ lastRenderPath: 'worker-fast' }), {
  tier: RUNTIME_TIER.C,
  source: 'worker-path',
});

assert.equal(runtimeTierSourceToI18nLeaf('main-webgpu'), 'mainWebgpu');
assert.equal(runtimeTierSourceToI18nLeaf('bogus'), 'unknown');

console.log('OK runtime tier resolution');
