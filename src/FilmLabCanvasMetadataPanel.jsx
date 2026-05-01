import { useI18n } from './i18n';

export default function FilmLabCanvasMetadataPanel({
  hasImage,
  isMetadataPanelOpen,
  metadataViewMode,
  metadataViewModeLabels,
  cycleMetadataViewMode,
  copyMetadataToClipboard,
  metadataFeedback,
  displayedMetadataItems,
}) {
  const { t } = useI18n();

  return (
    <div
      className={`canvas-info${hasImage && isMetadataPanelOpen ? '' : ' hidden'} mode-${metadataViewMode}`}
    >
      <div className="canvas-info-titlebar">
        <div className="canvas-info-title">{t('filmLab.metadataPanel.title')}</div>
        <div className="canvas-info-actions">
          <button
            type="button"
            className={`canvas-info-mode-btn${metadataViewMode !== 'full' ? ' active' : ''}`}
            onClick={cycleMetadataViewMode}
          >
            {t('filmLab.metadataPanel.modePrefix')} {metadataViewModeLabels[metadataViewMode] ?? t('filmLab.metadataPanel.modeFallback')}
          </button>
          <button type="button" className="canvas-info-copy-btn" onClick={copyMetadataToClipboard}>
            {metadataFeedback === 'copied'
              ? t('filmLab.metadataPanel.copyCopied')
              : metadataFeedback === 'failed'
                ? t('filmLab.metadataPanel.copyFailed')
                : t('filmLab.metadataPanel.copy')}
          </button>
        </div>
      </div>
      <div className="canvas-info-grid">
        {displayedMetadataItems.map((item) => (
          <div className={`canvas-info-item${item.warn ? ' warn' : ''}`} key={item.id}>
            <span className="canvas-info-label">{item.label}</span>
            <span className="canvas-info-value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
