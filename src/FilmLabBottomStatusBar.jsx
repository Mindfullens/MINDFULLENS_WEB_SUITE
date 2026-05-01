import { useI18n } from './i18n';

function formatBatchLine(batchState, t, idleLabel) {
  if (!batchState || typeof batchState !== 'object') {
    return idleLabel;
  }
  const total = Number(batchState.total);
  const current = Number(batchState.current);
  const active = Boolean(batchState.active || batchState.running);
  if (active && Number.isFinite(total) && total > 0 && Number.isFinite(current)) {
    return t('filmLab.bottomStatus.batchProgress', {
      current: Math.max(0, Math.floor(current)),
      total: Math.floor(total),
    });
  }
  return idleLabel;
}

export default function FilmLabBottomStatusBar({
  studioWorkspace,
  hasActiveSource,
  runtimeStatusBadge,
  previewPathLabel,
  batchState,
  adjustments,
}) {
  const { t } = useI18n();

  const primary =
    hasActiveSource && runtimeStatusBadge != null && String(runtimeStatusBadge).trim() !== ''
      ? String(runtimeStatusBadge)
      : t('filmLab.bottomStatus.idlePrimary');

  const previewShort =
    previewPathLabel != null && String(previewPathLabel).trim() !== ''
      ? String(previewPathLabel)
      : t('filmLab.bottomStatus.previewPending');

  const batchLine = formatBatchLine(batchState, t, t('filmLab.bottomStatus.batchIdle'));

  const aiLast = Number(adjustments?.aiAssistLastLatencyMs);
  const aiRuns = Number(adjustments?.aiAssistRuns ?? 0);
  const aiLine =
    aiRuns > 0 && Number.isFinite(aiLast)
      ? t('filmLab.bottomStatus.aiLine', { ms: aiLast.toFixed(0) })
      : t('filmLab.bottomStatus.aiIdle');

  const cmykProofLine =
    adjustments?.cmykSoftProofEnabled === true ? t('filmLab.bottomStatus.cmykProofActive') : null;

  const generativeStubLine =
    adjustments?.generativeAiStubIntent === true
      ? t('filmLab.bottomStatus.generativeStubActive')
      : null;
  const generativeStubTitle = t('filmLab.bottomStatus.generativeStubActiveTitle');

  const depthProxyLine =
    String(adjustments?.localMaskMode ?? '') === 'depth' &&
    adjustments?.brushMaskEnabled !== false
      ? t('filmLab.bottomStatus.depthProxyActive')
      : null;
  const depthProxyTitle = t('filmLab.bottomStatus.depthProxyActiveTitle');

  return (
    <footer
      className="film-lab-bottom-status"
      aria-label={t('filmLab.bottomStatus.aria')}
      data-workspace={studioWorkspace}
    >
      <div className="film-lab-bottom-status-inner">
        <span className="film-lab-bottom-status-primary" title={primary}>
          {primary}
        </span>
        <span className="film-lab-bottom-status-sep" aria-hidden>
          ·
        </span>
        <span className="film-lab-bottom-status-meta" title={previewShort}>
          {t('filmLab.bottomStatus.previewLabel')}: {previewShort}
        </span>
        <span className="film-lab-bottom-status-sep" aria-hidden>
          ·
        </span>
        <span className="film-lab-bottom-status-meta">{batchLine}</span>
        <span className="film-lab-bottom-status-sep" aria-hidden>
          ·
        </span>
        <span className="film-lab-bottom-status-meta">{aiLine}</span>
        {cmykProofLine ? (
          <>
            <span className="film-lab-bottom-status-sep" aria-hidden>
              ·
            </span>
            <span className="film-lab-bottom-status-meta" title={cmykProofLine}>
              {cmykProofLine}
            </span>
          </>
        ) : null}
        {generativeStubLine ? (
          <>
            <span className="film-lab-bottom-status-sep" aria-hidden>
              ·
            </span>
            <span className="film-lab-bottom-status-meta" title={generativeStubTitle}>
              {generativeStubLine}
            </span>
          </>
        ) : null}
        {depthProxyLine ? (
          <>
            <span className="film-lab-bottom-status-sep" aria-hidden>
              ·
            </span>
            <span className="film-lab-bottom-status-meta" title={depthProxyTitle}>
              {depthProxyLine}
            </span>
          </>
        ) : null}
      </div>
    </footer>
  );
}
