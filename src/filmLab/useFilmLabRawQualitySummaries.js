import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { PIPELINE_KIND } from '../engine/pipeline/constants.js';
import { formatRatioPercent } from './displayFormat.js';
import { RAW_QA_THRESHOLDS } from './workbenchConstants.js';

export function useFilmLabRawQualitySummaries({ hasActiveSource, pipelineInfo, renderDebugInfo }) {
  const { t } = useI18n();

  const rawDecodeSummary = useMemo(() => {
    if (pipelineInfo?.pipelineKind !== PIPELINE_KIND.RAW) {
      return null;
    }

    const capabilities = pipelineInfo?.capabilities ?? {};
    const decodeStats = capabilities?.decodeStats ?? null;
    const parts = [];

    if (capabilities?.backend) {
      parts.push(String(capabilities.backend));
    }

    if (capabilities?.rawDecodeAdapter) {
      parts.push(t('filmLab.rawQuality.adapterPrefix', { name: String(capabilities.rawDecodeAdapter) }));
    }

    const probeSnap = capabilities?.rawProbeSnapshot;
    if (probeSnap?.rawDecodeInlineWasm) {
      parts.push(t('filmLab.rawQuality.probeWasm'));
    }

    const lr = capabilities?.librawMetadataSummary;
    if (lr && typeof lr === 'object') {
      const cam = [lr.make, lr.model].filter(Boolean).join(' ').trim();
      if (cam) {
        parts.push(cam);
      }
    }

    const meanLuma = Number(decodeStats?.meanLuma);
    if (Number.isFinite(meanLuma)) {
      parts.push(`L ${meanLuma.toFixed(2)}`);
    }

    const nonBlackRatio = Number(decodeStats?.nonBlackRatio);
    if (Number.isFinite(nonBlackRatio)) {
      parts.push(`NB ${(nonBlackRatio * 100).toFixed(2)}%`);
    }

    if (capabilities?.fallbackReason) {
      parts.push(t('filmLab.rawQuality.fallbackReason', { reason: String(capabilities.fallbackReason) }));
    }

    const backendAbTest = capabilities?.backendAbTest ?? null;
    if (backendAbTest?.executed) {
      const winner = String(backendAbTest?.winner ?? '').trim();
      const winnerBackend =
        winner === 'alternate'
          ? backendAbTest?.alternate?.backend
          : backendAbTest?.primary?.backend;
      const decisionReason = String(backendAbTest?.reason ?? '').trim();
      if (winnerBackend) {
        parts.push(
          t('filmLab.rawQuality.abWinner', {
            winner: winnerBackend,
            reasonPart: decisionReason ? ` (${decisionReason})` : '',
          }),
        );
      }
    }

    if (capabilities?.suspectedBlackFrame) {
      parts.push(t('filmLab.rawQuality.suspectedBlack'));
    }
    const recovery = capabilities?.rawRecovery2d;
    if (recovery?.enabled) {
      const changed = Number(recovery?.changedPixelRatio);
      const recH = Number(recovery?.recoveredHighlightRatio);
      const recS = Number(recovery?.recoveredShadowRatio);
      const recoveryParts = [
        t('filmLab.rawQuality.recovery2dOn'),
        Number.isFinite(changed) ? t('filmLab.rawQuality.recoveryChanged', { p: (changed * 100).toFixed(1) }) : null,
        Number.isFinite(recH) ? t('filmLab.rawQuality.recoveryH', { p: (recH * 100).toFixed(2) }) : null,
        Number.isFinite(recS) ? t('filmLab.rawQuality.recoveryS', { p: (recS * 100).toFixed(2) }) : null,
      ].filter(Boolean);
      parts.push(recoveryParts.join(' · '));
    }

    return parts.length ? parts.join(' · ') : t('filmLab.rawQuality.decodeEmpty');
  }, [pipelineInfo, t]);

  const rawBackendAbSummary = useMemo(() => {
    if (pipelineInfo?.pipelineKind !== PIPELINE_KIND.RAW) {
      return null;
    }

    const backendAbTest = pipelineInfo?.capabilities?.backendAbTest ?? null;
    if (!backendAbTest?.executed) {
      return null;
    }

    const winner = String(backendAbTest?.winner ?? '').trim();
    const winnerBackend =
      winner === 'alternate'
        ? backendAbTest?.alternate?.backend
        : backendAbTest?.primary?.backend;
    const primaryScore = Number(backendAbTest?.primary?.score);
    const alternateScore = Number(backendAbTest?.alternate?.score);
    const scoreDelta =
      Number.isFinite(primaryScore) && Number.isFinite(alternateScore)
        ? alternateScore - primaryScore
        : null;
    const decisionReason = String(backendAbTest?.reason ?? '').trim();
    const winnerBackendNormalized = String(winnerBackend ?? '').toLowerCase();
    const winnerMode = winnerBackendNormalized.includes('quicklook')
      ? 'quicklook'
      : winnerBackendNormalized.includes('sips')
        ? 'sips'
        : null;
    const scoreQualityTone =
      backendAbTest?.forced || decisionReason === 'forced-backend'
        ? 'neutral'
        : decisionReason.includes('black-frame')
          ? 'risky'
          : Number.isFinite(scoreDelta) && Math.abs(scoreDelta) >= 3
            ? 'good'
            : Number.isFinite(scoreDelta) && Math.abs(scoreDelta) >= 1.2
              ? 'neutral'
              : 'risky';
    const diffHeatmapRaw =
      backendAbTest?.diffHeatmap && typeof backendAbTest.diffHeatmap === 'object'
        ? backendAbTest.diffHeatmap
        : null;
    const diffHeatmap = diffHeatmapRaw
      ? {
          width: Number(diffHeatmapRaw.width) || 0,
          height: Number(diffHeatmapRaw.height) || 0,
          meanDelta: Number.isFinite(Number(diffHeatmapRaw.meanDelta))
            ? Number(diffHeatmapRaw.meanDelta)
            : null,
          p95Delta: Number.isFinite(Number(diffHeatmapRaw.p95Delta))
            ? Number(diffHeatmapRaw.p95Delta)
            : null,
          maxDelta: Number.isFinite(Number(diffHeatmapRaw.maxDelta))
            ? Number(diffHeatmapRaw.maxDelta)
            : null,
          dataUrl:
            typeof diffHeatmapRaw.dataUrl === 'string' && diffHeatmapRaw.dataUrl.startsWith('data:image/')
              ? diffHeatmapRaw.dataUrl
              : null,
        }
      : null;

    return {
      winnerBackend: winnerBackend || '—',
      winnerLabel: winner || 'primary',
      scoreDelta: Number.isFinite(scoreDelta) ? scoreDelta : null,
      reason: decisionReason || 'n/a',
      primaryScore: Number.isFinite(primaryScore) ? primaryScore : null,
      alternateScore: Number.isFinite(alternateScore) ? alternateScore : null,
      winnerMode,
      scoreQualityTone,
      isForced: Boolean(backendAbTest?.forced || decisionReason === 'forced-backend'),
      diffHeatmap,
    };
  }, [pipelineInfo]);

  const rawQualityQaSummary = useMemo(() => {
    if (pipelineInfo?.pipelineKind !== PIPELINE_KIND.RAW || !hasActiveSource) {
      return null;
    }

    const decodeStats = pipelineInfo?.capabilities?.decodeStats ?? null;
    const highlightClipRatio = Number(renderDebugInfo?.lastFrameHighlightClipRatio);
    const shadowClipRatio = Number(renderDebugInfo?.lastFrameShadowClipRatio);
    const blackOutputGuardTriggered = Boolean(renderDebugInfo?.lastFrameBlackGuardTriggered);
    const suspectedBlackFrame = Boolean(pipelineInfo?.capabilities?.suspectedBlackFrame);
    const sampledPixelCount = Number(renderDebugInfo?.lastFramePixelCount);
    const meanLuma = Number(decodeStats?.meanLuma);
    const nonBlackRatio = Number(decodeStats?.nonBlackRatio);
    const opaqueRatio = Number(decodeStats?.opaqueRatio);
    const abMeanDelta = Number(rawBackendAbSummary?.diffHeatmap?.meanDelta);
    const recovery = pipelineInfo?.capabilities?.rawRecovery2d ?? null;
    const recoveryResidualHighlight = Number(recovery?.postHighlightClipRatio);
    const recoveryResidualShadow = Number(recovery?.postShadowClipRatio);
    const recoveryChanged = Number(recovery?.changedPixelRatio);
    const issues = [];
    let riskScore = 0;

    if (blackOutputGuardTriggered) {
      issues.push(t('filmLab.rawQuality.issueBlackGuard'));
      riskScore += 2;
    }
    if (suspectedBlackFrame) {
      issues.push(t('filmLab.rawQuality.issueSuspectedDarkFrame'));
      riskScore += 2;
    }
    if (Number.isFinite(highlightClipRatio) && highlightClipRatio >= RAW_QA_THRESHOLDS.highlightFail) {
      issues.push(
        t('filmLab.rawQuality.issueHighlightClipStrong', { ratio: formatRatioPercent(highlightClipRatio, 1) }),
      );
      riskScore += 2;
    } else if (
      Number.isFinite(highlightClipRatio) &&
      highlightClipRatio >= RAW_QA_THRESHOLDS.highlightWarn
    ) {
      issues.push(t('filmLab.rawQuality.issueHighlightClip', { ratio: formatRatioPercent(highlightClipRatio, 1) }));
      riskScore += 1;
    }
    if (Number.isFinite(shadowClipRatio) && shadowClipRatio >= RAW_QA_THRESHOLDS.shadowFail) {
      issues.push(
        t('filmLab.rawQuality.issueShadowCrushStrong', { ratio: formatRatioPercent(shadowClipRatio, 1) }),
      );
      riskScore += 2;
    } else if (Number.isFinite(shadowClipRatio) && shadowClipRatio >= RAW_QA_THRESHOLDS.shadowWarn) {
      issues.push(t('filmLab.rawQuality.issueShadowCrush', { ratio: formatRatioPercent(shadowClipRatio, 1) }));
      riskScore += 1;
    }
    if (Number.isFinite(abMeanDelta) && abMeanDelta >= RAW_QA_THRESHOLDS.abMeanDeltaFail) {
      issues.push(t('filmLab.rawQuality.issueAbDeltaHigh', { delta: abMeanDelta.toFixed(1) }));
      riskScore += 2;
    } else if (Number.isFinite(abMeanDelta) && abMeanDelta >= RAW_QA_THRESHOLDS.abMeanDeltaWarn) {
      issues.push(t('filmLab.rawQuality.issueAbDeltaMed', { delta: abMeanDelta.toFixed(1) }));
      riskScore += 1;
    }
    if (recovery?.enabled) {
      if (Number.isFinite(recoveryResidualHighlight) && recoveryResidualHighlight >= RAW_QA_THRESHOLDS.highlightWarn) {
        issues.push(
          t('filmLab.rawQuality.issueRecoveryHighlights', {
            ratio: formatRatioPercent(recoveryResidualHighlight, 1),
          }),
        );
        riskScore += 1;
      }
      if (Number.isFinite(recoveryResidualShadow) && recoveryResidualShadow >= RAW_QA_THRESHOLDS.shadowWarn) {
        issues.push(
          t('filmLab.rawQuality.issueRecoveryShadows', {
            ratio: formatRatioPercent(recoveryResidualShadow, 1),
          }),
        );
        riskScore += 1;
      }
    }

    const tone = riskScore >= 3 ? 'risky' : riskScore >= 1 ? 'neutral' : 'good';
    const label =
      tone === 'risky'
        ? t('filmLab.rawQuality.toneRisky')
        : tone === 'neutral'
          ? t('filmLab.rawQuality.toneNeutral')
          : t('filmLab.rawQuality.toneGood');
    const statusText = issues.length ? issues.join(' · ') : t('filmLab.rawQuality.signalsOk');

    return {
      tone,
      label,
      statusText,
      riskScore,
      issues,
      metrics: {
        highlightClipRatio: Number.isFinite(highlightClipRatio) ? highlightClipRatio : null,
        shadowClipRatio: Number.isFinite(shadowClipRatio) ? shadowClipRatio : null,
        blackOutputGuardTriggered,
        suspectedBlackFrame,
        sampledPixelCount: Number.isFinite(sampledPixelCount) ? sampledPixelCount : null,
        meanLuma: Number.isFinite(meanLuma) ? meanLuma : null,
        nonBlackRatio: Number.isFinite(nonBlackRatio) ? nonBlackRatio : null,
        opaqueRatio: Number.isFinite(opaqueRatio) ? opaqueRatio : null,
        abMeanDelta: Number.isFinite(abMeanDelta) ? abMeanDelta : null,
        rawRecovery2dEnabled: Boolean(recovery?.enabled),
        rawRecovery2dReason: recovery?.reason ?? null,
        rawRecovery2dChangedPixelRatio: Number.isFinite(recoveryChanged) ? recoveryChanged : null,
        rawRecovery2dPostHighlightClipRatio: Number.isFinite(recoveryResidualHighlight)
          ? recoveryResidualHighlight
          : null,
        rawRecovery2dPostShadowClipRatio: Number.isFinite(recoveryResidualShadow)
          ? recoveryResidualShadow
          : null,
      },
    };
  }, [
    t,
    hasActiveSource,
    pipelineInfo?.capabilities?.decodeStats,
    pipelineInfo?.capabilities?.rawRecovery2d,
    pipelineInfo?.capabilities?.suspectedBlackFrame,
    pipelineInfo?.pipelineKind,
    rawBackendAbSummary?.diffHeatmap?.meanDelta,
    renderDebugInfo?.lastFrameBlackGuardTriggered,
    renderDebugInfo?.lastFrameHighlightClipRatio,
    renderDebugInfo?.lastFramePixelCount,
    renderDebugInfo?.lastFrameShadowClipRatio,
  ]);

  const isRawDecodeWarning = useMemo(
    () =>
      Boolean(
        pipelineInfo?.pipelineKind === PIPELINE_KIND.RAW &&
          (pipelineInfo?.capabilities?.suspectedBlackFrame ||
            rawDecodeSummary === t('filmLab.rawQuality.decodeEmpty')),
      ),
    [pipelineInfo, rawDecodeSummary, t],
  );

  const qualityStatus = useMemo(() => {
    if (!hasActiveSource) {
      return null;
    }

    const highlightClipRatio = Number(renderDebugInfo?.lastFrameHighlightClipRatio ?? 0);
    const shadowClipRatio = Number(renderDebugInfo?.lastFrameShadowClipRatio ?? 0);
    const blackGuard = Boolean(renderDebugInfo?.lastFrameBlackGuardTriggered);
    const alerts = [];

    if (blackGuard) {
      alerts.push(t('filmLab.rawQuality.alertBlackGuard'));
    }

    if (Number.isFinite(highlightClipRatio) && highlightClipRatio >= 0.018) {
      alerts.push(t('filmLab.rawQuality.alertHighlights', { percent: (highlightClipRatio * 100).toFixed(1) }));
    }

    if (Number.isFinite(shadowClipRatio) && shadowClipRatio >= 0.024) {
      alerts.push(t('filmLab.rawQuality.alertShadowCrush', { percent: (shadowClipRatio * 100).toFixed(1) }));
    }

    if (
      pipelineInfo?.pipelineKind === PIPELINE_KIND.RAW &&
      pipelineInfo?.capabilities?.suspectedBlackFrame
    ) {
      alerts.push(t('filmLab.rawQuality.alertSuspectedDecode'));
    }

    if (!alerts.length) {
      return {
        tone: 'ok',
        text: t('filmLab.rawQuality.qualityOk'),
      };
    }

    return {
      tone: 'warn',
      text: alerts.join(' · '),
    };
  }, [
    t,
    hasActiveSource,
    pipelineInfo?.capabilities?.suspectedBlackFrame,
    pipelineInfo?.pipelineKind,
    renderDebugInfo?.lastFrameBlackGuardTriggered,
    renderDebugInfo?.lastFrameHighlightClipRatio,
    renderDebugInfo?.lastFrameShadowClipRatio,
  ]);

  return {
    rawDecodeSummary,
    rawBackendAbSummary,
    rawQualityQaSummary,
    isRawDecodeWarning,
    qualityStatus,
  };
}
