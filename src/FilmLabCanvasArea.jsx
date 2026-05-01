import { useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n';
import { FILE_INPUT_ACCEPT } from './engine/pipeline/constants.js';
import FilmLabCropOverlay from './FilmLabCropOverlay.jsx';
import FilmLabCanvasHistogramBar from './FilmLabCanvasHistogramBar.jsx';
import FilmLabCanvasSourcePanels from './FilmLabCanvasSourcePanels.jsx';
import FilmLabCanvasPipelineOverlays from './FilmLabCanvasPipelineOverlays.jsx';
import FilmLabCanvasMetadataPanel from './FilmLabCanvasMetadataPanel.jsx';
import FilmLabRenderDebugPanel from './FilmLabRenderDebugPanel.jsx';
import { sampleLumaSobelMagnitude01 } from './filmLab/canvasLumaSobelSample.js';
import { rgbBytesToHueDegrees } from './filmLab/rgbHueFromBytes.js';

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
}) {
  const { t } = useI18n();
  const brushPointerRef = useRef({ active: false, pointerId: null });
  const localMaskDragRef = useRef({ active: false, pointerId: null, mode: null });
  const [brushCursor, setBrushCursor] = useState(null);
  const isBrushArmed = Boolean(adjustments?.brushMaskEnabled && hasImage);
  const localMaskMode = String(adjustments?.localMaskMode ?? 'brush');
  const maskModePaintsBrushStrokes = localMaskMode === 'brush' || localMaskMode === 'depth';
  const brushStrokes = useMemo(
    () => (Array.isArray(adjustments?.brushMaskStrokes) ? adjustments.brushMaskStrokes : []),
    [adjustments?.brushMaskStrokes]
  );
  const brushRadius = Math.max(8, Number(adjustments?.brushMaskRadius ?? 80));
  const brushFeather = Math.max(0, Math.min(100, Number(adjustments?.brushMaskFeather ?? 65)));
  const showRangeMaskOverlay = Boolean(adjustments?.localMaskShowOverlay);
  const lumaMin = Math.max(0, Math.min(100, Number(adjustments?.lumaMaskMin ?? 0)));
  const lumaMax = Math.max(0, Math.min(100, Number(adjustments?.lumaMaskMax ?? 100)));
  const lumaFeather = Math.max(0, Math.min(100, Number(adjustments?.lumaMaskFeather ?? 35)));
  const depthMin = Math.max(0, Math.min(100, Number(adjustments?.depthMaskMin ?? 0)));
  const depthMax = Math.max(0, Math.min(100, Number(adjustments?.depthMaskMax ?? 100)));
  const depthFeather = Math.max(0, Math.min(100, Number(adjustments?.depthMaskFeather ?? 35)));
  const rangeOverlayMin = localMaskMode === 'depth' ? depthMin : lumaMin;
  const rangeOverlayMax = localMaskMode === 'depth' ? depthMax : lumaMax;
  const rangeOverlayFeather = localMaskMode === 'depth' ? depthFeather : lumaFeather;
  const hueCenter = ((Number(adjustments?.colorMaskHueCenter ?? 210) % 360) + 360) % 360;
  const hueWidth = Math.max(5, Math.min(180, Number(adjustments?.colorMaskHueWidth ?? 90)));
  const hueFeather = Math.max(0, Math.min(100, Number(adjustments?.colorMaskFeather ?? 35)));
  const colorGuideTint = useMemo(() => `hsla(${hueCenter}deg 90% 60% / 0.28)`, [hueCenter]);

  const addBrushStamp = (event) => {
    if (!setAdjustments || !canvasWrapperRef?.current) {
      return;
    }
    const rect = canvasWrapperRef.current.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return;
    }
    const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const radiusNorm = Math.max(0.005, Math.min(0.5, brushRadius / Math.max(rect.width, rect.height)));
    const edgeSens = Math.max(0, Math.min(100, Number(adjustments?.brushMaskEdgeSensitivity ?? 0)));
    let edgeGain = 1;
    if (edgeSens > 0 && canvasRef?.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx && canvas.width > 2 && canvas.height > 2) {
        const mag = sampleLumaSobelMagnitude01(ctx, canvas.width, canvas.height, nx, ny);
        const t = edgeSens / 100;
        edgeGain = Math.max(0.12, Math.min(1, 1 + t * (mag - 1)));
      }
    }
    setAdjustments((current) => {
      const currentStrokes = Array.isArray(current?.brushMaskStrokes) ? current.brushMaskStrokes : [];
      const nextStroke = {
        x: nx,
        y: ny,
        radius: radiusNorm,
        feather: brushFeather / 100,
        erase: Boolean(current?.brushMaskErase),
        ...(edgeSens > 0 ? { edgeGain } : {}),
      };
      const lastStroke = currentStrokes[currentStrokes.length - 1] ?? null;
      if (lastStroke) {
        const dx = Number(lastStroke.x ?? 0) - nextStroke.x;
        const dy = Number(lastStroke.y ?? 0) - nextStroke.y;
        const minSpacing = Math.max(0.0015, nextStroke.radius * 0.12);
        const sameTool = Boolean(lastStroke.erase) === Boolean(nextStroke.erase);
        if (sameTool && dx * dx + dy * dy < minSpacing * minSpacing) {
          return current;
        }
      }
      return {
        ...current,
        brushMaskStrokes: [...currentStrokes.slice(-239), nextStroke],
      };
    });
  };

  const onWrapperPointerDown = (event) => {
    if (
      event.shiftKey &&
      isBrushArmed &&
      localMaskMode === 'color' &&
      event.button === 0 &&
      setAdjustments &&
      canvasRef?.current &&
      canvasWrapperRef?.current &&
      hasImage
    ) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx && rect.width > 1 && rect.height > 1 && canvas.width > 0 && canvas.height > 0) {
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = (event.clientY - rect.top) / rect.height;
        const px = Math.floor(nx * canvas.width);
        const py = Math.floor(ny * canvas.height);
        if (px >= 0 && py >= 0 && px < canvas.width && py < canvas.height) {
          saveUndo?.();
          const d = ctx.getImageData(px, py, 1, 1).data;
          const hueDeg = rgbBytesToHueDegrees(d[0], d[1], d[2]);
          const rounded = Math.round(hueDeg);
          setAdjustments((current) => ({
            ...current,
            colorMaskHueCenter: rounded,
          }));
        }
      }
      event.preventDefault();
      return;
    }
    if (isBrushArmed && localMaskMode === 'radial' && event.button === 0 && setAdjustments && canvasWrapperRef?.current) {
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) {
        localMaskDragRef.current = { active: true, pointerId: event.pointerId, mode: 'radial-center' };
        event.currentTarget?.setPointerCapture?.(event.pointerId);
        const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        setAdjustments((current) => ({
          ...current,
          radialMaskCenterX: Math.round(nx * 100),
          radialMaskCenterY: Math.round(ny * 100),
        }));
      }
      return;
    }
    if (isBrushArmed && localMaskMode === 'linear' && event.button === 0 && setAdjustments && canvasWrapperRef?.current) {
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) {
        localMaskDragRef.current = { active: true, pointerId: event.pointerId, mode: 'linear-offset' };
        event.currentTarget?.setPointerCapture?.(event.pointerId);
      }
      return;
    }
    if (!isBrushArmed || !maskModePaintsBrushStrokes || event.button !== 0) {
      handleCanvasPointerDown(event);
      return;
    }
    saveUndo?.();
    brushPointerRef.current = { active: true, pointerId: event.pointerId };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    addBrushStamp(event);
  };

  const onWrapperPointerMove = (event) => {
    const localDrag = localMaskDragRef.current;
    if (
      localDrag.active &&
      localDrag.pointerId === event.pointerId &&
      setAdjustments &&
      canvasWrapperRef?.current
    ) {
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) {
        const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        if (localDrag.mode === 'radial-center') {
          setAdjustments((current) => ({
            ...current,
            radialMaskCenterX: Math.round(nx * 100),
            radialMaskCenterY: Math.round(ny * 100),
          }));
        } else if (localDrag.mode === 'linear-offset') {
          const angle = ((Number(adjustments?.linearMaskAngle ?? 0) * Math.PI) / 180);
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          const px = nx - 0.5;
          const py = ny - 0.5;
          const proj = px * dirX + py * dirY;
          setAdjustments((current) => ({
            ...current,
            linearMaskOffset: Math.max(-100, Math.min(100, Math.round(proj * 200))),
          }));
        }
      }
      return;
    }
    if (isBrushArmed && canvasWrapperRef?.current) {
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) {
        const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        setBrushCursor({ x: nx, y: ny });
      }
    }
    if (!isBrushArmed || !maskModePaintsBrushStrokes) {
      handleCanvasPointerMove(event);
      return;
    }
    const brushState = brushPointerRef.current;
    if (!brushState.active || brushState.pointerId !== event.pointerId) {
      return;
    }
    addBrushStamp(event);
  };

  const onWrapperPointerUp = (event) => {
    if (localMaskDragRef.current.pointerId === event.pointerId) {
      localMaskDragRef.current = { active: false, pointerId: null, mode: null };
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
      return;
    }
    if (!isBrushArmed || !maskModePaintsBrushStrokes) {
      handleCanvasPointerUp(event);
      return;
    }
    if (brushPointerRef.current.pointerId === event.pointerId) {
      brushPointerRef.current = { active: false, pointerId: null };
    }
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
  };

  const onWrapperPointerLeave = () => {
    setBrushCursor(null);
  };

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
                  display: hasImage ? 'block' : 'none',
                  width: canvasViewportSize.width > 0 ? `${Math.round(canvasViewportSize.width)}px` : '100%',
                  height:
                    canvasViewportSize.height > 0
                      ? `${Math.round(canvasViewportSize.height)}px`
                      : '100%',
                }}
                onPointerDown={onWrapperPointerDown}
                onPointerMove={onWrapperPointerMove}
                onPointerUp={onWrapperPointerUp}
                onPointerCancel={onWrapperPointerUp}
                onPointerLeave={onWrapperPointerLeave}
                onLostPointerCapture={stopPanDragging}
                onDoubleClick={handleCanvasDoubleClick}
              >
                {showBlockingProcessing ? (
                  <div className="canvas-loading">{t('filmLab.canvas.processingBlocking')}</div>
                ) : null}
                {showInlineProcessing ? (
                  <div className="canvas-processing-badge">{t('filmLab.canvas.processingInline')}</div>
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
                {isBrushArmed ? (
                  <div className="brush-mask-overlay" aria-hidden="true">
                    {maskModePaintsBrushStrokes
                      ? brushStrokes.map((stroke, index) => {
                      const diameter = stroke.radius * 200;
                      const featherPx = Math.max(6, diameter * (0.35 + (stroke.feather ?? 0.65) * 0.65));
                      return (
                        <div
                          key={`brush-${index}`}
                          className="brush-mask-stamp"
                          style={{
                            left: `${stroke.x * 100}%`,
                            top: `${stroke.y * 100}%`,
                            width: `${diameter}%`,
                            height: `${diameter}%`,
                            boxShadow: `0 0 0 ${featherPx}px ${
                              stroke.erase ? 'rgba(248,113,113,0.12)' : 'rgba(59,130,246,0.16)'
                            }`,
                            background: stroke.erase ? 'rgba(239,68,68,0.16)' : undefined,
                            borderColor: stroke.erase ? 'rgba(248,113,113,0.48)' : undefined,
                          }}
                        />
                      );
                    })
                      : null}
                    {localMaskMode === 'linear' ? (
                      <div
                        className="brush-mask-linear-guide"
                        style={{
                          '--ml-angle': `${Number(adjustments?.linearMaskAngle ?? 0)}deg`,
                        }}
                      >
                        <div className="brush-mask-linear-axis" />
                        <div className="brush-mask-linear-handle brush-mask-linear-handle-a" />
                        <div className="brush-mask-linear-handle brush-mask-linear-handle-b" />
                      </div>
                    ) : null}
                    {localMaskMode === 'radial' ? (
                      <div
                        className="brush-mask-radial-guide"
                        style={{
                          left: `${Math.max(0, Math.min(100, Number(adjustments?.radialMaskCenterX ?? 50)))}%`,
                          top: `${Math.max(0, Math.min(100, Number(adjustments?.radialMaskCenterY ?? 50)))}%`,
                          width: `${Math.max(5, Number(adjustments?.radialMaskRadius ?? 35)) * 2}%`,
                          height: `${Math.max(5, Number(adjustments?.radialMaskRadius ?? 35)) * 2}%`,
                        }}
                      >
                        <div className="brush-mask-radial-center-handle" />
                      </div>
                    ) : null}
                    {(localMaskMode === 'luma' || localMaskMode === 'depth') && showRangeMaskOverlay ? (
                      <div className="brush-mask-luma-guide">
                        <div className="brush-mask-luma-ramp" />
                        <div
                          className="brush-mask-luma-window"
                          style={{
                            left: `${Math.min(rangeOverlayMin, rangeOverlayMax)}%`,
                            width: `${Math.max(1, Math.abs(rangeOverlayMax - rangeOverlayMin))}%`,
                            '--ml-luma-soft': `${Math.max(6, rangeOverlayFeather * 0.6)}px`,
                          }}
                        />
                      </div>
                    ) : null}
                    {localMaskMode === 'color' && showRangeMaskOverlay ? (
                      <div className="brush-mask-color-guide" style={{ '--ml-hue-tint': colorGuideTint }}>
                        <div className="brush-mask-color-wheel" />
                        <div
                          className="brush-mask-color-window"
                          style={{
                            transform: `rotate(${hueCenter}deg)`,
                            '--ml-hue-width': `${hueWidth}deg`,
                            '--ml-hue-feather': `${Math.max(8, hueFeather * 0.8)}px`,
                          }}
                        />
                      </div>
                    ) : null}
                    {maskModePaintsBrushStrokes && brushCursor ? (
                      <div
                        className={`brush-mask-cursor${adjustments?.brushMaskErase ? ' erase' : ''}`}
                        style={{
                          left: `${brushCursor.x * 100}%`,
                          top: `${brushCursor.y * 100}%`,
                          width: `${Math.max(8, brushRadius) * 2}px`,
                          height: `${Math.max(8, brushRadius) * 2}px`,
                        }}
                      />
                    ) : null}
                  </div>
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

          <input
            ref={fileInputRef}
            id="sourceFileInput"
            data-testid="film-lab-source-file-input"
            name="sourceFileInput"
            type="file"
            accept={FILE_INPUT_ACCEPT}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
    </section>
  );
}
