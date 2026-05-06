import { useMemo } from 'react';
import { useI18n } from '../i18n';
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
import { resolveRuntimeTier, runtimeTierSourceToI18nLeaf } from './runtimeTier.js';

export function useFilmLabRenderDebugStatusLabels({
  renderDebugInfo,
  hasActiveSource,
  pipelineInfo,
  activeFilmName,
}) {
  const { t } = useI18n();
  const dash = t('filmLab.renderDebug.dashMark');

  const previewPathLabel = useMemo(() => {
    if (!renderDebugInfo?.isAdjusting) {
      return t('filmLab.runtimeStatus.previewCpu');
    }
    if (!renderDebugInfo?.workerDragEnabled) {
      return t('filmLab.runtimeStatus.previewCpuDrag');
    }
    if (!renderDebugInfo?.proxySourceReady) {
      return t('filmLab.runtimeStatus.previewWorkerSync');
    }
    const back = renderDebugInfo?.proxyLastFrameBackend ?? 'cpu';
    const impl = renderDebugInfo?.proxyLastFrameGpuImpl;
    if (back === 'gpu' && (impl === 'webgpu' || impl === 'webgl')) {
      const segs = [];
      if (isProxyWorkerGpuInputTexDownscaled(renderDebugInfo)) {
        segs.push(t('filmLab.runtimeStatus.inputTex2DLimit'));
      }
      if (isProxyWorkerProxyOutputFitted(renderDebugInfo)) {
        segs.push(t('filmLab.runtimeStatus.outputTex2DLimit'));
      }
      const extra = segs.length ? ` · ${segs.join(' · ')}` : '';
      return t('filmLab.runtimeStatus.previewWorkerGpu', { impl, extra });
    }
    if (isProxyWorkerProxyOutputFitted(renderDebugInfo)) {
      return t('filmLab.runtimeStatus.previewWorkerBackendLimit', { back });
    }
    return t('filmLab.runtimeStatus.previewWorkerBackend', { back });
  }, [renderDebugInfo, t]);

  const fallbackExplanation = useMemo(() => {
    const reason = String(renderDebugInfo?.proxyWorkerReason ?? '').trim();
    if (!reason) {
      return '';
    }

    const knownReasons = {
      'feature-flag-off': t('filmLab.runtimeStatus.fallbackFeatureFlagOff'),
      'feature-flags-off': t('filmLab.runtimeStatus.fallbackFeatureFlagsOff'),
      'forced-cpu-fallback': t('filmLab.runtimeStatus.fallbackForcedCpu'),
      'source-not-ready': t('filmLab.runtimeStatus.fallbackSourceNotReady'),
      'worker init failed': t('filmLab.runtimeStatus.fallbackWorkerInitFailed'),
      'worker runtime error': t('filmLab.runtimeStatus.fallbackWorkerRuntimeError'),
      'proxy frame error': t('filmLab.runtimeStatus.fallbackProxyFrameError'),
      'preferred:cpu': t('filmLab.runtimeStatus.fallbackPreferredCpu'),
      'preferred:gpu': t('filmLab.runtimeStatus.fallbackPreferredGpu'),
    };

    return knownReasons[reason] ?? reason;
  }, [renderDebugInfo?.proxyWorkerReason, t]);

  const runtimeStatusBadge = useMemo(() => {
    if (!hasActiveSource) {
      return null;
    }

    const rawState =
      pipelineInfo?.pipelineKind === PIPELINE_KIND.RAW
        ? pipelineInfo?.status === PIPELINE_STATUS.READY
          ? t('filmLab.runtimeStatus.badgeRawOk')
          : t('filmLab.runtimeStatus.badgeRawStatus', {
              status: String(pipelineInfo?.status ?? 'pending').toUpperCase(),
            })
        : t('filmLab.runtimeStatus.badgeBitmap');

    let renderState = t('filmLab.runtimeStatus.renderCpu');
    const mainAbPath = String(renderDebugInfo?.mainThreadWebGpuPreviewAbPath ?? '');
    if (mainAbPath === 'webgpu-main') {
      renderState = t('filmLab.runtimeStatus.renderMainWebGpuAb');
    } else if (mainAbPath === 'webgl-fallback') {
      renderState = t('filmLab.runtimeStatus.renderMainWebGlFallback');
    } else if (renderDebugInfo?.proxyGpuEnabled && renderDebugInfo?.proxyWorkerStatus === 'ready') {
      const impl = renderDebugInfo?.proxyLastFrameGpuImpl;
      if (impl === 'webgpu') {
        renderState = t('filmLab.runtimeStatus.renderWebGpuProxy');
      } else if (impl === 'webgl') {
        renderState = t('filmLab.runtimeStatus.renderWebGl2Proxy');
      } else {
        renderState = t('filmLab.runtimeStatus.renderGpuProxy');
      }
    } else if (
      renderDebugInfo?.proxyForceCpuFallback ||
      String(renderDebugInfo?.proxyWorkerStatus ?? '').includes('fallback')
    ) {
      renderState = t('filmLab.runtimeStatus.renderCpuFallback');
    } else if (String(renderDebugInfo?.lastRenderPath ?? '').startsWith('worker')) {
      renderState = t('filmLab.runtimeStatus.renderWorker');
    }

    const e2eWarn =
      renderDebugInfo?.previewE2eKpiState === 'warn' &&
      Number.isFinite(Number(renderDebugInfo?.previewE2eMedianMs))
        ? t('filmLab.runtimeStatus.e2eWarnSegment', {
            ms: Number(renderDebugInfo.previewE2eMedianMs).toFixed(1),
            targetMs: Number(renderDebugInfo?.previewE2eKpiTargetMs ?? 16).toFixed(0),
          })
        : '';

    const perPath = renderDebugInfo?.previewE2ePerPathStats;
    const wgMed = Number(perPath?.['fast-main-webgpu-ab']?.medianMs);
    const glMed = Number(perPath?.['fast-webgl']?.medianMs);
    const abSummary =
      Number.isFinite(wgMed) && Number.isFinite(glMed)
        ? (() => {
            const delta = Number((wgMed - glMed).toFixed(2));
            const faster = delta <= 0 ? 'WGPU' : 'WGL';
            return t('filmLab.runtimeStatus.abDeltaSegment', {
              deltaMs: Math.abs(delta).toFixed(2),
              faster,
            });
          })()
        : '';

    const rolloutTotal = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesTotal);
    const rolloutMain = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGpuMain);
    const rolloutFallback = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGlFallback);
    const rolloutRatio = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbWebGpuRatio);
    const rolloutSummary =
      Number.isFinite(rolloutTotal) && rolloutTotal > 0
        ? t('filmLab.runtimeStatus.rolloutSegment', {
            ratio: Number.isFinite(rolloutRatio)
              ? `${(rolloutRatio * 100).toFixed(1)}%`
              : t('filmLab.runtimeStatus.rolloutNa'),
            main: Number.isFinite(rolloutMain) ? Math.floor(rolloutMain) : 0,
            total: Math.floor(rolloutTotal),
            fb: Number.isFinite(rolloutFallback) ? Math.floor(rolloutFallback) : 0,
          })
        : '';
    const rolloutOpts = { dashMark: dash };
    const rolloutHealth = getMainPreviewAbRolloutHealthInfo(renderDebugInfo, rolloutOpts).badgeSegment;
    const rolloutReady = getMainPreviewAbRolloutGateInfo(renderDebugInfo, rolloutOpts).badgeSegment;
    const frameCostGate = getPreviewE2eFrameCostGateInfo(renderDebugInfo, rolloutOpts).badgeSegment;
    const runtimeTier = resolveRuntimeTier(renderDebugInfo);
    const tierLeaf = runtimeTierSourceToI18nLeaf(runtimeTier.source);
    const tierSourceLabel =
      tierLeaf === 'unknown'
        ? String(runtimeTier.source)
        : t(`filmLab.runtimeStatus.tierSource.${tierLeaf}`);
    const runtimeTierSegment = t('filmLab.runtimeStatus.runtimeTierSegment', {
      tier: runtimeTier.tier,
      sourceLabel: tierSourceLabel,
    });

    const profileLabel = t('filmLab.runtimeStatus.badgeMainLine', {
      rawState,
      renderState,
      profileName: activeFilmName ?? dash,
    });

    const runtimeStatusSegments = [
      profileLabel,
      rolloutSummary,
      rolloutHealth,
      rolloutReady,
      frameCostGate,
      abSummary,
      e2eWarn,
      runtimeTierSegment,
    ];
    return runtimeStatusSegments.join('');
  }, [
    t,
    dash,
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
