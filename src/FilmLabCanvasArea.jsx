import { useI18n } from './i18n';
import FilmLabThumbCanvas from './filmLab/FilmLabThumbCanvas.jsx';
import FilmLabCropOverlay from './FilmLabCropOverlay.jsx';
import FilmLabCanvasHistogramBar from './FilmLabCanvasHistogramBar.jsx';
import FilmLabCanvasSourcePanels from './FilmLabCanvasSourcePanels.jsx';
import FilmLabCanvasPipelineOverlays from './FilmLabCanvasPipelineOverlays.jsx';
import FilmLabCanvasMetadataPanel from './FilmLabCanvasMetadataPanel.jsx';
import FilmLabRenderDebugPanel from './FilmLabRenderDebugPanel.jsx';

export default function FilmLabCanvasArea({
  studioWorkspace,
  canvasAreaRef,
  hasImage,
  histogramCanvasRef,
  canvasCenterRef,
  canvasStageRef,
  handleCanvasWheel,
  rememberZoomAnchor,
  clearZoomAnchor,
  hasActiveSource,
  fileInputRef,
  pipelineInfo,
  canvasWrapperRef,
  isZoomBeyondFit,
  isPanning,
  canvasViewportSize,
  adjustments,
  setAdjustments,
  saveUndo,
  handleCanvasPointerDown,
  handleCanvasPointerMove,
  handleCanvasPointerUp,
  stopPanDragging,
  handleCanvasDoubleClick,
  showBlockingProcessing,
  showInlineProcessing,
  canvasRef,
  canvasPresentationStyle,
  isPixelPeepZoom,
  cropOverlay,
  compareMode,
  renderDebug,
  clearRenderPipelineAlert,
  renderPipelineAlert,
  showRuntimeStatus,
  runtimeStatusBadge,
  qualityStatus,
  fallbackExplanation,
  isMetadataPanelOpen,
  metadataViewMode,
  metadataViewModeLabels,
  cycleMetadataViewMode,
  copyMetadataToClipboard,
  metadataFeedback,
  displayedMetadataItems,
  handleFileUpload,
  developFastPreviewBitmap = null,
  developFastPreviewExifOrientation = 1,
  developSmartPreviewBitmap = null,
  isAdjusting = false,
}) {
  void adjustments;
  void setAdjustments;
  void saveUndo;
  void handleFileUpload;
  const { t } = useI18n();

  const isDevelopMain = studioWorkspace === 'develop';

  return (
    <section
      ref={canvasAreaRef}
      className="canvas-area"
      role={isDevelopMain ? 'main' : undefined}
      aria-label={isDevelopMain ? t('filmLab.develop.canvasMainAria') : undefined}
    >
      <FilmLabCanvasHistogramBar hasImage={hasImage} histogramCanvasRef={histogramCanvasRef} />

      <div ref={canvasCenterRef} className="canvas-center">
        <div
          ref={canvasStageRef}
          className="canvas-stage"
          onWheel={handleCanvasWheel}
          onPointerMove={rememberZoomAnchor}
          onPointerLeave={clearZoomAnchor}
        >
          <FilmLabCanvasSourcePanels
            hasActiveSource={hasActiveSource}
            hasImage={hasImage}
            fileInputRef={fileInputRef}
            pipelineInfo={pipelineInfo}
          />

          <div
            ref={canvasWrapperRef}
            data-testid="film-lab-canvas-wrapper"
            className={`canvas-wrapper fit-contain${isZoomBeyondFit ? ' pan-enabled' : ''}${isPanning ? ' is-panning' : ''}`}
            style={{
              display: hasImage || developFastPreviewBitmap ? 'block' : 'none',
              width: canvasViewportSize.width > 0 ? `${Math.round(canvasViewportSize.width)}px` : '100%',
              height:
                canvasViewportSize.height > 0 ? `${Math.round(canvasViewportSize.height)}px` : '100%',
            }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            onLostPointerCapture={stopPanDragging}
            onDoubleClick={handleCanvasDoubleClick}
          >
            {showBlockingProcessing ? (
              <div className="canvas-loading">{t('filmLab.canvas.processingBlocking')}</div>
            ) : null}
            {showInlineProcessing ? (
              <div className="canvas-processing-badge">{t('filmLab.canvas.processingInline')}</div>
            ) : null}
            {developFastPreviewBitmap ? (
              <div className="film-lab-develop-fast-preview-layer" aria-hidden>
                <FilmLabThumbCanvas
                  bitmap={developFastPreviewBitmap}
                  exifOrientation={developFastPreviewExifOrientation}
                  className="film-lab-develop-fast-preview-canvas"
                />
              </div>
            ) : null}
            {developSmartPreviewBitmap && isPixelPeepZoom && isDevelopMain && !isAdjusting ? (
              <div className="film-lab-smart-preview-chip" title={t('filmLab.canvas.smartPreviewChip')} aria-hidden>
                <FilmLabThumbCanvas
                  bitmap={developSmartPreviewBitmap}
                  className="film-lab-smart-preview-chip-canvas"
                />
              </div>
            ) : null}
            <canvas
              ref={canvasRef}
              style={{
                ...canvasPresentationStyle,
                imageRendering: isPixelPeepZoom ? 'pixelated' : 'auto',
              }}
            />
            <FilmLabCropOverlay {...cropOverlay} />
            {compareMode ? (
              <div className="compare-label compare-label-before">{t('filmLab.canvas.compareBefore')}</div>
            ) : null}
          </div>

          <div className="watermark">{t('filmLab.canvas.watermark')}</div>
          <FilmLabRenderDebugPanel {...renderDebug} />
          <FilmLabCanvasPipelineOverlays
            renderPipelineAlert={renderPipelineAlert}
            clearRenderPipelineAlert={clearRenderPipelineAlert}
            showRuntimeStatus={showRuntimeStatus}
            runtimeStatusBadge={runtimeStatusBadge}
            qualityStatus={qualityStatus}
            fallbackExplanation={fallbackExplanation}
          />
        </div>
      </div>

      <FilmLabCanvasMetadataPanel
        hasImage={hasImage}
        isMetadataPanelOpen={isMetadataPanelOpen}
        metadataViewMode={metadataViewMode}
        metadataViewModeLabels={metadataViewModeLabels}
        cycleMetadataViewMode={cycleMetadataViewMode}
        copyMetadataToClipboard={copyMetadataToClipboard}
        metadataFeedback={metadataFeedback}
        displayedMetadataItems={displayedMetadataItems}
      />
    </section>
  );
}
