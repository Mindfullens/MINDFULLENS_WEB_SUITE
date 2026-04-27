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

export default function FilmLabCanvasPipelineOverlays({
  renderPipelineAlert,
  clearRenderPipelineAlert,
  showRuntimeStatus,
  runtimeStatusBadge,
  qualityStatus,
  fallbackExplanation,
}) {
  const runtimeStatusTone =
    runtimeStatusBadge && String(runtimeStatusBadge).includes('E2E WARN') ? 'warn' : 'ok';
  const e2eWarnSummary = parseE2eWarnFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const abDeltaSummary = parseAbDeltaFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const rolloutHealthSummary = parseRolloutHealthFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const rolloutGateSummary = parseRolloutGateFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const frameCostGateSummary = parseFrameCostGateFromRuntimeBadge(runtimeStatusBadge)?.tooltipLabel ?? null;
  const runtimeStatusTitle = [
    fallbackExplanation || 'Status renderu',
    'KPI E2E: mediana per ścieżka (okno 31 próbek), target 16 ms.',
    e2eWarnSummary != null ? `E2E warn: ${e2eWarnSummary}` : null,
    abDeltaSummary != null ? `A/B delta: ${abDeltaSummary}` : null,
    rolloutHealthSummary != null ? `Rollout health: ${rolloutHealthSummary}` : null,
    rolloutGateSummary != null ? `Rollout gate: ${rolloutGateSummary}` : null,
    frameCostGateSummary != null ? `Koszt klatki (gate): ${frameCostGateSummary}` : null,
    `Thresholds: ${getMainPreviewAbRolloutHealthThresholdsHint()} | ${getMainPreviewAbRolloutGateThresholdsHint()} | ${getPreviewE2eFrameCostGateThresholdsHint()}`,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <>
      {renderPipelineAlert ? (
        <div className="render-pipeline-alert" role="alert" aria-live="assertive">
          <div className="render-pipeline-alert-head">
            <strong>Render Error: {renderPipelineAlert.code}</strong>
            <button
              type="button"
              className="render-pipeline-alert-close"
              onClick={clearRenderPipelineAlert}
            >
              Zamknij
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
              title="Alerty jakościowe podglądu"
            >
              {qualityStatus.text}
            </div>
          ) : null}
          <div
            className="service-build-badge-stack"
            aria-label="Wersja serwisowa"
            title="Wersja serwisowa (build)"
          >
            {SERVICE_BUILD_LABEL}
          </div>
        </div>
      ) : null}
    </>
  );
}
