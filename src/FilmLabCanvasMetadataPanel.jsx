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
  return (
    <div
      className={`canvas-info${hasImage && isMetadataPanelOpen ? '' : ' hidden'} mode-${metadataViewMode}`}
    >
      <div className="canvas-info-titlebar">
        <div className="canvas-info-title">Metadane zdjęcia</div>
        <div className="canvas-info-actions">
          <button
            type="button"
            className={`canvas-info-mode-btn${metadataViewMode !== 'full' ? ' active' : ''}`}
            onClick={cycleMetadataViewMode}
          >
            Tryb: {metadataViewModeLabels[metadataViewMode] ?? 'Pełny'}
          </button>
          <button type="button" className="canvas-info-copy-btn" onClick={copyMetadataToClipboard}>
            {metadataFeedback === 'copied'
              ? '✓ Skopiowano'
              : metadataFeedback === 'failed'
                ? 'Błąd kopiowania'
                : 'Kopiuj metadane'}
          </button>
        </div>
      </div>
      <div className="canvas-info-grid">
        {displayedMetadataItems.map((item) => (
          <div className={`canvas-info-item${item.warn ? ' warn' : ''}`} key={item.label}>
            <span className="canvas-info-label">{item.label}</span>
            <span className="canvas-info-value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
