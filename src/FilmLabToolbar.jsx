import { FILE_INPUT_ACCEPT } from './engine/pipeline/constants.js';
import { SHORTCUT_KEYS } from './engine/shortcutActions.js';
import { useI18n } from './i18n';

export function ToolButton({ active = false, children, ...props }) {
  return (
    <button type="button" className={`tool-btn${active ? ' active' : ''}`} {...props}>
      {children}
    </button>
  );
}

export default function FilmLabToolbar({
  toolbarRef,
  sessionRestoreNotice,
  onDismissSessionNotice,
  fileInputRef,
  hasImage,
  adjustments,
  toggleCompare,
  toggleFlip,
  rotateImage,
  stepZoom,
  displayedZoomPercent,
  isZoomBeyondFit,
  fitClassic,
  jumpToOneToOne,
  isShortcutHelpOpen,
  onToggleShortcutHelp,
  isPreviewFullMode,
  togglePreviewFullMode,
  toggleClipping,
  toggleClipLimiterPreview,
  isMetadataPanelOpen,
  onToggleMetadataPanel,
  showRuntimeStatus,
  onToggleRuntimeStatus,
  applyAutoExposure,
  applyAutoColor,
  onToolbarReset,
  onToolbarUndo,
  onToolbarRedo,
  redoDisabled,
  copyToClipboard,
  pasteFromClipboard,
  clipboardFeedback,
  exportCubeLut,
  exportDebugReport,
  hasActiveSource,
  debugExportFeedback,
  batchState,
  isRawBackendForced,
  rawBackendModeLabel,
  batchFileInputRef,
  onBatchFilesPicked,
  onOpenExportModal,
  cancelBatch,
  updateAdjustment,
}) {
  const { t } = useI18n();

  return (
    <div className="toolbar-stack">
      {sessionRestoreNotice ? (
        <div className="session-autosave-banner" role="status">
          <span className="session-autosave-banner-text">{sessionRestoreNotice}</span>
          <button
            type="button"
            className="session-autosave-banner-dismiss"
            onClick={onDismissSessionNotice}
            aria-label={t('filmLab.toolbar.dismissBanner')}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="toolbar" ref={toolbarRef}>
        <div className="toolbar-left">
          {hasImage ? (
            <ToolButton onClick={() => fileInputRef.current?.click()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10" />
                <path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
              </svg>
              {t('filmLab.toolbar.change')}
            </ToolButton>
          ) : null}

          <div className="tool-divider" />

          <ToolButton
            active={adjustments.compareMode}
            onClick={toggleCompare}
            title={t('filmLab.toolbar.compareTitle', {
              primary: SHORTCUT_KEYS.compare.primary,
              fallback: SHORTCUT_KEYS.compare.fallback,
            })}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M12 3v18" />
            </svg>
            {t('filmLab.toolbar.compare')}
          </ToolButton>

          <ToolButton active={adjustments.flipped} onClick={toggleFlip}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
              <path d="M12 3v18" />
            </svg>
            {t('filmLab.toolbar.flip')}
          </ToolButton>

          <ToolButton onClick={rotateImage}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15A9 9 0 1 1 18 7.5L23 10" />
            </svg>
            {t('filmLab.toolbar.rotate')}
          </ToolButton>
        </div>

        <div className="toolbar-center">
          <ToolButton onClick={() => stepZoom(-1)} title={t('filmLab.toolbar.zoomOutTitle')}>
            −
          </ToolButton>
          <div className="zoom-display">{displayedZoomPercent}%</div>
          <ToolButton onClick={() => stepZoom(1)} title={t('filmLab.toolbar.zoomInTitle')}>
            +
          </ToolButton>
          <ToolButton active={!isZoomBeyondFit} onClick={fitClassic} title={t('filmLab.toolbar.fitTitle')}>
            {t('filmLab.toolbar.fit')}
          </ToolButton>
          <ToolButton onClick={() => jumpToOneToOne(null)} title={t('filmLab.toolbar.oneToOneTitle')}>
            1:1
          </ToolButton>
          <ToolButton active={isShortcutHelpOpen} onClick={onToggleShortcutHelp} title={t('filmLab.toolbar.shortcutsTitle')}>
            {t('filmLab.toolbar.shortcuts')}
          </ToolButton>
          <ToolButton
            active={isPreviewFullMode}
            onClick={togglePreviewFullMode}
            title={t('filmLab.toolbar.fullTitle', { key: SHORTCUT_KEYS.full })}
          >
            {t('filmLab.toolbar.full')}
          </ToolButton>
        </div>

        <div className="toolbar-right">
          <ToolButton
            active={adjustments.showClipping}
            onClick={toggleClipping}
            title={t('filmLab.toolbar.clippingTitle', { key: SHORTCUT_KEYS.clipping })}
          >
            {t('filmLab.toolbar.clipping')}
          </ToolButton>
          <ToolButton
            active={Boolean(adjustments?.clipLimiterPreview)}
            onClick={toggleClipLimiterPreview}
            title={t('filmLab.toolbar.clipLimiterTitle')}
          >
            {t('filmLab.toolbar.clipLimiter')}
          </ToolButton>
          <ToolButton
            active={Boolean(adjustments?.cmykSoftProofEnabled)}
            onClick={() =>
              updateAdjustment?.('cmykSoftProofEnabled', !adjustments?.cmykSoftProofEnabled)
            }
            title={t('filmLab.toolbar.cmykSoftProofTitle')}
          >
            {t('filmLab.toolbar.cmykSoftProof')}
          </ToolButton>
          <ToolButton
            active={isMetadataPanelOpen}
            onClick={onToggleMetadataPanel}
            title={t('filmLab.toolbar.metadataTitle', { key: SHORTCUT_KEYS.metadata })}
          >
            {t('filmLab.toolbar.metadata')}
          </ToolButton>
          <ToolButton
            active={showRuntimeStatus}
            onClick={onToggleRuntimeStatus}
            title={t('filmLab.toolbar.statusTitle')}
          >
            {t('filmLab.toolbar.status')}
          </ToolButton>
          <ToolButton
            onClick={applyAutoExposure}
            title={t('filmLab.toolbar.autoExpTitle', { key: SHORTCUT_KEYS.autoExposure })}
          >
            {t('filmLab.toolbar.autoExp')}
          </ToolButton>
          <ToolButton
            onClick={applyAutoColor}
            title={t('filmLab.toolbar.autoColorTitle', { key: SHORTCUT_KEYS.autoColor })}
          >
            {t('filmLab.toolbar.autoColor')}
          </ToolButton>

          <ToolButton onClick={onToolbarReset}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.7 2.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            {t('filmLab.toolbar.reset')}
          </ToolButton>

          <ToolButton onClick={onToolbarUndo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6" />
              <path d="M3.5 15A9 9 0 1 0 8.6 4.3L1 10" />
            </svg>
            {t('filmLab.toolbar.undo')}
          </ToolButton>
          <ToolButton onClick={onToolbarRedo} disabled={redoDisabled}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M20.5 15A9 9 0 1 1 15.4 4.3L23 10" />
            </svg>
            {t('filmLab.toolbar.redo')}
          </ToolButton>

          <ToolButton onClick={copyToClipboard} title={t('filmLab.toolbar.copyTitle')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {clipboardFeedback === 'copied' ? t('filmLab.toolbar.copied') : t('filmLab.toolbar.copy')}
          </ToolButton>

          <ToolButton onClick={pasteFromClipboard} title={t('filmLab.toolbar.pasteTitle')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            {clipboardFeedback === 'pasted' ? t('filmLab.toolbar.pasted') : t('filmLab.toolbar.paste')}
          </ToolButton>

          <button
            className="btn-export-top"
            type="button"
            onClick={exportCubeLut}
            style={{ background: '#3b82f6', borderColor: '#2563eb', marginRight: '8px' }}
          >
            {t('filmLab.toolbar.exportLut')}
          </button>

          <button
            className="btn-export-top"
            type="button"
            onClick={exportDebugReport}
            disabled={!hasActiveSource}
            title={
              hasActiveSource ? t('filmLab.toolbar.debugReadyTitle') : t('filmLab.toolbar.debugNeedImageTitle')
            }
            style={{
              background: '#334155',
              borderColor: '#475569',
              marginRight: '8px',
              opacity: hasActiveSource ? 1 : 0.55,
              cursor: hasActiveSource ? 'pointer' : 'not-allowed',
            }}
          >
            {debugExportFeedback === 'saved'
              ? t('filmLab.toolbar.diagOk')
              : debugExportFeedback === 'error'
                ? t('filmLab.toolbar.diagErr')
                : t('filmLab.toolbar.diagJson')}
          </button>

          <div className="tool-divider" />

          <label
            className="btn-export-top"
            htmlFor="batchFileInput"
            style={{
              background: '#8b5cf6',
              borderColor: '#7c3aed',
              marginRight: '8px',
              cursor: 'pointer',
              display: 'inline-block',
              opacity: batchState.isRunning ? 0.5 : 1,
              pointerEvents: batchState.isRunning ? 'none' : 'auto',
            }}
            role="button"
            tabIndex={0}
          >
            {batchState.isRunning
              ? t('filmLab.toolbar.batchProgress', {
                  current: batchState.current,
                  total: batchState.total,
                })
              : t('filmLab.toolbar.batchPhotos')}
          </label>
          <span
            className={`batch-backend-indicator${isRawBackendForced ? ' forced' : ' auto'}`}
            title={t('filmLab.toolbar.batchBackendTitle')}
          >
            RAW: {rawBackendModeLabel}
          </span>
          <input
            id="batchFileInput"
            ref={batchFileInputRef}
            type="file"
            multiple
            accept={FILE_INPUT_ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                onBatchFilesPicked(Array.from(files));
              }
              e.target.value = '';
            }}
          />
          <button
            className="btn-export-top"
            type="button"
            title={t('filmLab.toolbar.saveTitle')}
            aria-label={hasActiveSource ? undefined : t('filmLab.toolbar.saveDisabledAria')}
            aria-keyshortcuts={hasActiveSource ? 'Control+E Meta+E' : undefined}
            disabled={!hasActiveSource}
            onClick={onOpenExportModal}
          >
            {t('filmLab.toolbar.save')}
          </button>
        </div>

        {batchState.isRunning ? (
          <div className="batch-progress-bar-container">
            <div className="batch-progress-text">
              <div className="batch-progress-info">
                <span>
                  {t('filmLab.toolbar.batchProcessing')} {batchState.currentFile}
                </span>
                <span>
                  {batchState.current}/{batchState.total}
                </span>
              </div>
              <div className={`batch-progress-meta${isRawBackendForced ? ' forced' : ' auto'}`}>
                {t('filmLab.toolbar.batchRawBackend')} <strong>{rawBackendModeLabel}</strong>
              </div>
            </div>
            <div className="batch-progress-track">
              <div
                className="batch-progress-fill"
                style={{
                  width: `${batchState.total > 0 ? (batchState.current / batchState.total) * 100 : 0}%`,
                }}
              />
            </div>
            <button className="batch-cancel-btn" type="button" onClick={cancelBatch}>
              {t('filmLab.toolbar.batchCancel')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
