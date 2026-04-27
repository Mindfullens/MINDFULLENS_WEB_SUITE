export default function FilmLabCropOverlay({
  open,
  canvasPresentationStyle,
  cropMaskPath,
  cropRectPercent,
  activeCropOverlayMode,
  activeCropOverlayOrientation,
  cropGuideTransform,
  cropOverlayGuideElements,
  isStraightenToolArmed,
  handleStraightenPointerDown,
  straightenGuidePercent,
  cropOverlayInteractionRef,
  acceptManualStraighten,
  handleCropOverlayDoubleClick,
  handleStraightenPointerMove,
  handleStraightenPointerUp,
  handleStraightenPointerCancel,
  handleCropPointerMove,
  handleCropPointerUp,
  handleCropPointerCancel,
  cropMoveZoneRect,
  cropHandles,
  cropHandleHitboxes,
  cropHandleDefs,
  handleCropHandlePointerDown,
  hasPendingCropChanges,
  acceptCropDraft,
  isOverlayInteractionEnabled,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="crop-overlay-root" style={canvasPresentationStyle}>
      <div className="crop-overlay-layer">
        <svg className="crop-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d={cropMaskPath} className="crop-overlay-mask" fillRule="evenodd" />
          <rect
            x={cropRectPercent.x.toFixed(3)}
            y={cropRectPercent.y.toFixed(3)}
            width={cropRectPercent.w.toFixed(3)}
            height={cropRectPercent.h.toFixed(3)}
            className="crop-overlay-frame"
          />
          {activeCropOverlayMode !== 'none' ? (
            <g transform={cropGuideTransform}>
              <g transform={`rotate(${activeCropOverlayOrientation * 90} 50 50)`}>
                {cropOverlayGuideElements}
              </g>
            </g>
          ) : null}
          {isStraightenToolArmed && straightenGuidePercent ? (
            <g className="straighten-guide-visual">
              <line
                x1={straightenGuidePercent.start.x.toFixed(3)}
                y1={straightenGuidePercent.start.y.toFixed(3)}
                x2={straightenGuidePercent.end.x.toFixed(3)}
                y2={straightenGuidePercent.end.y.toFixed(3)}
                className="straighten-guide-line-shadow"
              />
              <line
                x1={straightenGuidePercent.start.x.toFixed(3)}
                y1={straightenGuidePercent.start.y.toFixed(3)}
                x2={straightenGuidePercent.end.x.toFixed(3)}
                y2={straightenGuidePercent.end.y.toFixed(3)}
                className="straighten-guide-line"
              />
            </g>
          ) : null}
        </svg>
      </div>
      <div className={`crop-overlay-interaction-layer${isOverlayInteractionEnabled ? ' active' : ''}`}>
        <svg
          ref={cropOverlayInteractionRef}
          className="crop-overlay-interaction-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onDoubleClick={(event) => {
            if (isStraightenToolArmed) {
              event.preventDefault();
              event.stopPropagation();
              acceptManualStraighten();
              return;
            }
            handleCropOverlayDoubleClick(event);
          }}
          onPointerMove={isStraightenToolArmed ? handleStraightenPointerMove : handleCropPointerMove}
          onPointerUp={isStraightenToolArmed ? handleStraightenPointerUp : handleCropPointerUp}
          onPointerCancel={isStraightenToolArmed ? handleStraightenPointerCancel : handleCropPointerCancel}
          onLostPointerCapture={isStraightenToolArmed ? handleStraightenPointerCancel : handleCropPointerCancel}
        >
          {isStraightenToolArmed && straightenGuidePercent ? (
            <>
              <rect
                x="0"
                y="0"
                width="100"
                height="100"
                className="straighten-surface-hit"
                onPointerDown={(event) => handleStraightenPointerDown('new', event)}
              />
              {[
                { id: 'start', point: straightenGuidePercent.start },
                { id: 'end', point: straightenGuidePercent.end },
              ].map(({ id, point }) => (
                <g key={id} className="straighten-endpoint-marker">
                  <circle cx={point.x.toFixed(3)} cy={point.y.toFixed(3)} r="0.54" className="straighten-endpoint-ring" />
                  <circle cx={point.x.toFixed(3)} cy={point.y.toFixed(3)} r="0.26" className="straighten-endpoint-core" />
                </g>
              ))}
            </>
          ) : (
            <>
              {cropMoveZoneRect.w > 0.05 && cropMoveZoneRect.h > 0.05 ? (
                <rect
                  x={cropMoveZoneRect.x.toFixed(3)}
                  y={cropMoveZoneRect.y.toFixed(3)}
                  width={cropMoveZoneRect.w.toFixed(3)}
                  height={cropMoveZoneRect.h.toFixed(3)}
                  className="crop-move-zone"
                  onDoubleClick={handleCropOverlayDoubleClick}
                  onPointerDown={(event) => handleCropHandlePointerDown('move', event)}
                />
              ) : null}
              {cropHandleDefs.map((handleDef) => {
                const point = cropHandles[handleDef.id];
                const hitbox = cropHandleHitboxes[handleDef.id];
                if (!point) {
                  return null;
                }
                const isHorizontalEdge = handleDef.id === 'n' || handleDef.id === 's';
                const isVerticalEdge = handleDef.id === 'e' || handleDef.id === 'w';
                const markerWidth = isHorizontalEdge ? 2.06 : isVerticalEdge ? 0.34 : 0.9;
                const markerHeight = isHorizontalEdge ? 0.34 : isVerticalEdge ? 2.06 : 0.9;
                return (
                  <g key={handleDef.id}>
                    <rect
                      x={hitbox.x.toFixed(3)}
                      y={hitbox.y.toFixed(3)}
                      width={hitbox.w.toFixed(3)}
                      height={hitbox.h.toFixed(3)}
                      rx="0.9"
                      className="crop-handle-hit"
                      style={{ cursor: handleDef.cursor }}
                      onDoubleClick={handleCropOverlayDoubleClick}
                      onPointerDown={(event) => handleCropHandlePointerDown(handleDef.id, event)}
                    />
                    <rect
                      x={(point.x - markerWidth / 2).toFixed(3)}
                      y={(point.y - markerHeight / 2).toFixed(3)}
                      width={markerWidth.toFixed(3)}
                      height={markerHeight.toFixed(3)}
                      rx="0.16"
                      className={`crop-handle-marker${isHorizontalEdge || isVerticalEdge ? ' edge' : ' corner'}`}
                    />
                  </g>
                );
              })}
              {hasPendingCropChanges ? (
                <g
                  className="crop-accept-widget"
                  transform={`translate(${(cropRectPercent.x + cropRectPercent.w * 0.5).toFixed(3)} ${(cropRectPercent.y + cropRectPercent.h * 0.5).toFixed(3)})`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    acceptCropDraft();
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    acceptCropDraft();
                  }}
                >
                  <circle cx="0" cy="0" r="1.74" className="crop-accept-btn-ring" />
                  <circle cx="0" cy="0" r="1.38" className="crop-accept-btn-fill" />
                  <path d="M-0.52 0.03 L-0.12 0.44 L0.62 -0.40" className="crop-accept-btn-check" />
                </g>
              ) : null}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
