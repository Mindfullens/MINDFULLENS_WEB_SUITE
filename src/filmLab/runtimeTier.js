/**
 * Runtime tiers for preview/render path selection:
 * - A: WebGPU-capable path active (main A/B winner or proxy WebGPU).
 * - B: GPU fallback path active via WebGL/WebGL2.
 * - C: CPU/worker fallback path.
 */
export const RUNTIME_TIER = Object.freeze({
  A: 'A',
  B: 'B',
  C: 'C',
});

function hasCpuFallbackSignal(renderDebugInfo) {
  if (!renderDebugInfo) return false;
  if (renderDebugInfo.proxyForceCpuFallback) return true;
  const workerStatus = String(renderDebugInfo.proxyWorkerStatus ?? '').toLowerCase();
  if (workerStatus.includes('fallback')) return true;
  const lastPath = String(renderDebugInfo.lastRenderPath ?? '').toLowerCase();
  return lastPath.includes('cpu');
}

export function resolveRuntimeTier(renderDebugInfo) {
  const mainAbPath = String(renderDebugInfo?.mainThreadWebGpuPreviewAbPath ?? '');
  if (mainAbPath === 'webgpu-main') {
    return { tier: RUNTIME_TIER.A, source: 'main-webgpu' };
  }
  if (mainAbPath === 'webgl-fallback') {
    return { tier: RUNTIME_TIER.B, source: 'main-webgl-fallback' };
  }

  const gpuImpl = String(renderDebugInfo?.proxyLastFrameGpuImpl ?? '').toLowerCase();
  if (gpuImpl === 'webgpu') {
    return { tier: RUNTIME_TIER.A, source: 'proxy-webgpu' };
  }
  if (gpuImpl === 'webgl') {
    return { tier: RUNTIME_TIER.B, source: 'proxy-webgl2' };
  }

  if (hasCpuFallbackSignal(renderDebugInfo)) {
    return { tier: RUNTIME_TIER.C, source: 'cpu-fallback' };
  }

  const lastPath = String(renderDebugInfo?.lastRenderPath ?? '').toLowerCase();
  if (lastPath.startsWith('worker')) {
    return { tier: RUNTIME_TIER.C, source: 'worker-path' };
  }
  return { tier: RUNTIME_TIER.C, source: 'default-cpu' };
}

/** Maps internal `source` slugs from {@link resolveRuntimeTier} to `filmLab.runtimeStatus.tierSource.*` leaf keys. */
const RUNTIME_TIER_SOURCE_TO_I18N_LEAF = Object.freeze({
  'main-webgpu': 'mainWebgpu',
  'main-webgl-fallback': 'mainWebglFallback',
  'proxy-webgpu': 'proxyWebgpu',
  'proxy-webgl2': 'proxyWebgl2',
  'cpu-fallback': 'cpuFallback',
  'worker-path': 'workerPath',
  'default-cpu': 'defaultCpu',
});

export function runtimeTierSourceToI18nLeaf(source) {
  const key = RUNTIME_TIER_SOURCE_TO_I18N_LEAF[String(source ?? '')];
  return key ?? 'unknown';
}
