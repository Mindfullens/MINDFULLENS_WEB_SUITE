import { SERVICE_BUILD_LABEL } from './filmLab/buildInfo.js';
import {
  parseAbDeltaFromRuntimeBadge,
  getMainPreviewAbRolloutGateThresholdsHint,
  getMainPreviewAbRolloutHealthThresholdsHint,
  getPreviewE2eFrameCostGateThresholdsHint,
  parseE2eWarnFromRuntimeBadge,
  parseFrameCostGateFromRuntimeBadge,
  parseRolloutGateFromRuntimeBadge,
  parseRolloutHealthFromRuntimeBadge,
} from './filmLab/rolloutGate.js';
import { useI18n } from './i18n';

export default function FilmLabCanvasPipelineOverlays({
  renderPipelineAlert,
  clearRenderPipelineAlert,
  showRuntimeStatus,
  runtimeStatusBadge,
  qualityStatus,
  fallbackExplanation,
}) {
  const { t } = useI18n();
  const runtimeStatusTone =
    runtimeStatusBadge && String(runtimeStatusBadge).includes('E2E WARN') ? 'warn' : 'ok';
  const e2eWarnSummary = parseE2eWarnFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const abDeltaSummary = parseAbDeltaFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const rolloutHealthSummary = parseRolloutHealthFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const rolloutGateSummary = parseRolloutGateFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const frameCostGateSummary = parseFrameCostGateFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const runtimeStatusTitle = [
    fallbackExplanation || t('filmLab.pipelineOverlays.statusBase'),
    t('filmLab.pipelineOverlays.e2eKpi'),
    e2eWarnSummary != null ? t('filmLab.pipelineOverlays.e2eWarnLine', { summary: e2eWarnSummary }) : null,
    abDeltaSummary != null ? t('filmLab.pipelineOverlays.abDeltaLine', { summary: abDeltaSummary }) : null,
    rolloutHealthSummary != null
      ? t('filmLab.pipelineOverlays.rolloutHealthLine', { summary: rolloutHealthSummary })
      : null,
    rolloutGateSummary != null ? t('filmLab.pipelineOverlays.rolloutGateLine', { summary: rolloutGateSummary }) : null,
    frameCostGateSummary != null
      ? t('filmLab.pipelineOverlays.frameCostGateLine', { summary: frameCostGateSummary })
      : null,
    t('filmLab.pipelineOverlays.thresholdsLine', {
      health: getMainPreviewAbRolloutHealthThresholdsHint(),
      gate: getMainPreviewAbRolloutGateThresholdsHint(),
      frameCost: getPreviewE2eFrameCostGateThresholdsHint(),
    }),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <>
      {renderPipelineAlert ? (
        <div className="render-pipeline-alert" role="alert" aria-live="assertive">
          <div className="render-pipeline-alert-head">
            <strong>{t('filmLab.pipelineOverlays.renderError', { code: renderPipelineAlert.code })}</strong>
            <button
              type="button"
              className="render-pipeline-alert-close"
              onClick={clearRenderPipelineAlert}
            >
              {t('filmLab.pipelineOverlays.close')}
            </button>
          </div>
          <div className="render-pipeline-alert-body">{renderPipelineAlert.message}</div>
        </div>
      ) : null}
      {showRuntimeStatus ? (
        <div className="runtime-status-stack">
          {runtimeStatusBadge ? (
            <div
              className={`runtime-status-badge tone-${runtimeStatusTone}`}
              title={runtimeStatusTitle}
            >
              {runtimeStatusBadge}
            </div>
          ) : null}
          {qualityStatus ? (
            <div
              className={`quality-status-badge tone-${qualityStatus.tone}`}
              title={t('filmLab.pipelineOverlays.qualityPreviewTitle')}
            >
              {qualityStatus.text}
            </div>
          ) : null}
          <div
            className="service-build-badge-stack"
            aria-label={t('filmLab.pipelineOverlays.serviceBuildAria')}
            title={t('filmLab.pipelineOverlays.serviceBuildTitle')}
          >
            {SERVICE_BUILD_LABEL}
          </div>
        </div>
      ) : null}
    </>
  );
}
