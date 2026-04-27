import { useMemo } from 'react';
import { PIPELINE_KIND, PIPELINE_STATUS } from '../engine/pipeline/constants.js';
import {
  isProxyWorkerGpuInputTexDownscaled,
  isProxyWorkerProxyOutputFitted,
} from './proxyWorkerGpuInputTelemetry.js';
import {
  getMainPreviewAbRolloutGateInfo,
  getMainPreviewAbRolloutHealthInfo,
  getPreviewE2eFrameCostGateInfo,
} from './rolloutGate.js';

export function useFilmLabRenderDebugStatusLabels({
  renderDebugInfo,
  hasActiveSource,
  pipelineInfo,
  activeFilmName,
}) {
  const previewPathLabel = useMemo(() => {
    if (!renderDebugInfo?.isAdjusting) {
      return 'cpu';
    }
    if (!renderDebugInfo?.workerDragEnabled) {
      return 'cpu (drag)';
    }
    if (!renderDebugInfo?.proxySourceReady) {
      return 'worker (syncing)';
    }
    const back = renderDebugInfo?.proxyLastFrameBackend ?? 'cpu';
    const impl = renderDebugInfo?.proxyLastFrameGpuImpl;
    if (back === 'gpu' && (impl === 'webgpu' || impl === 'webgl')) {
      const segs = [];
      if (isProxyWorkerGpuInputTexDownscaled(renderDebugInfo)) {
        segs.push('wejście do limitu 2D');
      }
      if (isProxyWorkerProxyOutputFitted(renderDebugInfo)) {
        segs.push('wyjście do limitu 2D');
      }
      const extra = segs.length ? ` · ${segs.join(' · ')}` : '';
      return `worker (gpu: ${impl}${extra})`;
    }
    if (isProxyWorkerProxyOutputFitted(renderDebugInfo)) {
      return `worker (${back} · wyjście do limitu 2D)`;
    }
    return `worker (${back})`;
  }, [renderDebugInfo]);

  const fallbackExplanation = useMemo(() => {
    const reason = String(renderDebugInfo?.proxyWorkerReason ?? '').trim();
    if (!reason) {
      return '';
    }

    const knownReasons = {
      'feature-flag-off': 'GPU proxy wyłączony flagą środowiskową.',
      'feature-flags-off': 'Worker/GPU wyłączone flagami środowiskowymi.',
      'forced-cpu-fallback': 'Wymuszony fallback CPU (ustawienie diagnostyczne).',
      'source-not-ready': 'Worker czeka na przygotowanie źródła.',
      'worker init failed': 'Nie udało się uruchomić workera renderującego.',
      'worker runtime error': 'Błąd wykonania workera renderującego.',
    };

    return knownReasons[reason] ?? reason;
  }, [renderDebugInfo?.proxyWorkerReason]);

  const runtimeStatusBadge = useMemo(() => {
    if (!hasActiveSource) {
      return null;
    }

    const rawState =
      pipelineInfo?.pipelineKind === PIPELINE_KIND.RAW
        ? pipelineInfo?.status === PIPELINE_STATUS.READY
          ? 'RAW OK'
          : `RAW ${String(pipelineInfo?.status ?? 'pending').toUpperCase()}`
        : 'BITMAP';

    let renderState = 'CPU';
    const mainAbPath = String(renderDebugInfo?.mainThreadWebGpuPreviewAbPath ?? '');
    if (mainAbPath === 'webgpu-main') {
      renderState = 'Main WebGPU (A/B)';
    } else if (mainAbPath === 'webgl-fallback') {
      renderState = 'Main WebGL (A/B fallback)';
    } else
    if (renderDebugInfo?.proxyGpuEnabled && renderDebugInfo?.proxyWorkerStatus === 'ready') {
      const impl = renderDebugInfo?.proxyLastFrameGpuImpl;
      if (impl === 'webgpu') {
        renderState = 'WebGPU proxy';
      } else if (impl === 'webgl') {
        renderState = 'WebGL2 proxy';
      } else {
        renderState = 'GPU proxy';
      }
    } else if (
      renderDebugInfo?.proxyForceCpuFallback ||
      String(renderDebugInfo?.proxyWorkerStatus ?? '').includes('fallback')
    ) {
      renderState = 'CPU fallback';
    } else if (String(renderDebugInfo?.lastRenderPath ?? '').startsWith('worker')) {
      renderState = 'Worker';
    }

    const e2eWarn =
      renderDebugInfo?.previewE2eKpiState === 'warn' &&
      Number.isFinite(Number(renderDebugInfo?.previewE2eMedianMs))
        ? ` | E2E WARN ${Number(renderDebugInfo.previewE2eMedianMs).toFixed(1)}ms/${Number(
            renderDebugInfo?.previewE2eKpiTargetMs ?? 16
          ).toFixed(0)}`
        : '';

    const perPath = renderDebugInfo?.previewE2ePerPathStats;
    const wgMed = Number(perPath?.['fast-main-webgpu-ab']?.medianMs);
    const glMed = Number(perPath?.['fast-webgl']?.medianMs);
    const abSummary =
      Number.isFinite(wgMed) && Number.isFinite(glMed)
        ? (() => {
            const delta = Number((wgMed - glMed).toFixed(2));
            const faster = delta <= 0 ? 'WGPU' : 'WGL';
            return ` | A/B Δ${Math.abs(delta).toFixed(2)}ms (${faster})`;
          })()
        : '';

    const rolloutTotal = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesTotal);
    const rolloutMain = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGpuMain);
    const rolloutFallback = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGlFallback);
    const rolloutRatio = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbWebGpuRatio);
    const rolloutSummary =
      Number.isFinite(rolloutTotal) && rolloutTotal > 0
        ? ` | rollout ${Number.isFinite(rolloutRatio) ? `${(rolloutRatio * 100).toFixed(1)}%` : 'n/a'} (${Number.isFinite(rolloutMain) ? Math.floor(rolloutMain) : 0}/${Math.floor(rolloutTotal)}; fb:${Number.isFinite(rolloutFallback) ? Math.floor(rolloutFallback) : 0})`
        : '';
    const rolloutHealth = getMainPreviewAbRolloutHealthInfo(renderDebugInfo).badgeSegment;
    const rolloutReady = getMainPreviewAbRolloutGateInfo(renderDebugInfo).badgeSegment;
    const frameCostGate = getPreviewE2eFrameCostGateInfo(renderDebugInfo).badgeSegment;

    const runtimeStatusSegments = [
      `${rawState} | ${renderState} | Profil: ${activeFilmName ?? '—'}`,
      rolloutSummary,
      rolloutHealth,
      rolloutReady,
      frameCostGate,
      abSummary,
      e2eWarn,
    ];
    return runtimeStatusSegments.join('');
  }, [
    activeFilmName,
    hasActiveSource,
    pipelineInfo?.pipelineKind,
    pipelineInfo?.status,
    renderDebugInfo?.lastRenderPath,
    renderDebugInfo?.proxyForceCpuFallback,
    renderDebugInfo?.proxyGpuEnabled,
    renderDebugInfo?.proxyLastFrameGpuImpl,
    renderDebugInfo?.proxyWorkerStatus,
    renderDebugInfo?.mainThreadWebGpuPreviewAbPath,
    renderDebugInfo?.previewE2eKpiState,
    renderDebugInfo?.previewE2eMedianMs,
    renderDebugInfo?.previewE2eKpiTargetMs,
    renderDebugInfo?.previewE2ePerPathStats,
    renderDebugInfo?.mainThreadWebGpuPreviewAbFramesTotal,
    renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGpuMain,
    renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGlFallback,
    renderDebugInfo?.mainThreadWebGpuPreviewAbWebGpuRatio,
    renderDebugInfo?.mainThreadWebGpuPreviewAbHealthState,
    renderDebugInfo?.mainThreadWebGpuPreviewAbFallbackRate,
    renderDebugInfo?.mainThreadWebGpuPreviewAbHealthFrames,
    renderDebugInfo?.mainThreadWebGpuPreviewAbRolloutReady,
    renderDebugInfo?.previewE2eFrameCostPerPathStats,
    renderDebugInfo?.previewE2eFrameCostGateSummary,
  ]);

  return { previewPathLabel, fallbackExplanation, runtimeStatusBadge };
}
