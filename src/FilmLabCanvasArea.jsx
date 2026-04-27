import { FILE_INPUT_ACCEPT } from './engine/pipeline/constants.js';
import FilmLabCropOverlay from './FilmLabCropOverlay.jsx';
import FilmLabCanvasHistogramBar from './FilmLabCanvasHistogramBar.jsx';
import FilmLabCanvasSourcePanels from './FilmLabCanvasSourcePanels.jsx';
import FilmLabCanvasPipelineOverlays from './FilmLabCanvasPipelineOverlays.jsx';
import FilmLabCanvasMetadataPanel from './FilmLabCanvasMetadataPanel.jsx';
import FilmLabRenderDebugPanel from './FilmLabRenderDebugPanel.jsx';

export default function FilmLabCanvasArea({
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
}) {
  return (
    <section ref={canvasAreaRef} className="canvas-area">
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
                className={`canvas-wrapper fit-contain${isZoomBeyondFit ? ' pan-enabled' : ''}${isPanning ? ' is-panning' : ''}`}
                style={{
                  display: hasImage ? 'block' : 'none',
                  width: canvasViewportSize.width > 0 ? `${Math.round(canvasViewportSize.width)}px` : '100%',
                  height:
                    canvasViewportSize.height > 0
                      ? `${Math.round(canvasViewportSize.height)}px`
                      : '100%',
                }}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onLostPointerCapture={stopPanDragging}
                onDoubleClick={handleCanvasDoubleClick}
              >
                {showBlockingProcessing ? <div className="canvas-loading">Przetwarzanie…</div> : null}
                {showInlineProcessing ? (
                  <div className="canvas-processing-badge">Dopasowywanie podglądu…</div>
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
                  <div className="compare-label compare-label-before">Przed</div>
                ) : null}
              </div>

              <div className="watermark">MINDFULLENS · FILM LAB PRO</div>
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

          <input
            ref={fileInputRef}
            id="sourceFileInput"
            name="sourceFileInput"
            type="file"
            accept={FILE_INPUT_ACCEPT}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
    </section>
  );
}
