import { useCallback } from 'react';
import { markFilmLabE2ePointerDown } from './previewE2ePointerMark.js';
import {
  areStraightenGuidesClose,
  buildStraightenGuideFromCropRect,
  clamp,
  clampNormPoint,
  deriveStraightenLevelFromGuide,
  moveStraightenGuideWithinBounds,
  normalizeStraightenGuide,
} from './crop/cropStraighten.js';
import { SLIDER_DEFS } from './workbenchConstants.js';

export function useFilmLabStraightenDrag({
  straightenGuideRef,
  straightenSessionSnapshotRef,
  straightenSessionLevelRef,
  straightenHasMeaningfulChangeRef,
  straightenDragStateRef,
  straightenDragPendingPointRef,
  straightenDragFrameRef,
  cropOverlayInteractionRef,
  canvasRef,
  activeCropRectNorm,
  setStraightenGuide,
  setInteractionKind,
  setIsAdjusting,
  setIsStraightenToolArmed,
  setAdjustments,
  getCropNormPoint,
  stopCropDrag,
  captureCurrentSnapshot,
  pushUndoSnapshot,
  hasImage,
  activePanel,
  isStraightenToolArmed,
  adjustmentsLevel,
  saveUndo,
}) {
  const setStraightenGuideSafely = useCallback(
    (nextGuide) => {
      const normalizedGuide = normalizeStraightenGuide(nextGuide, activeCropRectNorm);
      setStraightenGuide((current) => {
        if (current && areStraightenGuidesClose(current, normalizedGuide, 0.0015)) {
          return current;
        }
        return normalizedGuide;
      });
    },
    [activeCropRectNorm, setStraightenGuide]
  );

  const applyStraightenDragPoint = useCallback(
    (point) => {
      const dragState = straightenDragStateRef.current;
      if (!dragState.active || !point) {
        return;
      }
      const normalizedPoint = clampNormPoint(point);
      const snapshotGuide = normalizeStraightenGuide(dragState.snapshotGuide, activeCropRectNorm);
      const dx = normalizedPoint.x - dragState.startPoint.x;
      const dy = normalizedPoint.y - dragState.startPoint.y;
      let nextGuide = snapshotGuide;
      if (dragState.mode === 'start') {
        nextGuide = normalizeStraightenGuide(
          {
            start: { x: snapshotGuide.start.x + dx, y: snapshotGuide.start.y + dy },
            end: snapshotGuide.end,
          },
          activeCropRectNorm
        );
      } else if (dragState.mode === 'end') {
        nextGuide = normalizeStraightenGuide(
          {
            start: snapshotGuide.start,
            end: { x: snapshotGuide.end.x + dx, y: snapshotGuide.end.y + dy },
          },
          activeCropRectNorm
        );
      } else if (dragState.mode === 'move') {
        nextGuide = normalizeStraightenGuide(
          moveStraightenGuideWithinBounds(snapshotGuide, dx, dy),
          activeCropRectNorm
        );
      } else if (dragState.mode === 'new') {
        nextGuide = normalizeStraightenGuide(
          {
            start: dragState.startPoint,
            end: normalizedPoint,
          },
          activeCropRectNorm
        );
      }
      setStraightenGuideSafely(nextGuide);
    },
    [activeCropRectNorm, setStraightenGuideSafely]
  );

  const flushStraightenDragFrame = useCallback(() => {
    straightenDragFrameRef.current = 0;
    const pendingPoint = straightenDragPendingPointRef.current;
    straightenDragPendingPointRef.current = null;
    if (!pendingPoint) {
      return;
    }
    applyStraightenDragPoint(pendingPoint);
  }, [applyStraightenDragPoint]);

  const queueStraightenDragFrame = useCallback(() => {
    if (straightenDragFrameRef.current || typeof window === 'undefined') {
      return;
    }
    straightenDragFrameRef.current = window.requestAnimationFrame(flushStraightenDragFrame);
  }, [flushStraightenDragFrame]);

  const stopStraightenDrag = useCallback(
    (event = null) => {
      const dragState = straightenDragStateRef.current;
      if (!dragState.active) {
        return;
      }

      if (straightenDragFrameRef.current && typeof window !== 'undefined') {
        window.cancelAnimationFrame(straightenDragFrameRef.current);
      }
      straightenDragFrameRef.current = 0;

      const pendingPoint = straightenDragPendingPointRef.current;
      straightenDragPendingPointRef.current = null;
      if (pendingPoint) {
        applyStraightenDragPoint(pendingPoint);
      }

      const captureElement =
        dragState.captureElement ?? event?.currentTarget ?? cropOverlayInteractionRef.current;
      if (captureElement?.releasePointerCapture && dragState.pointerId != null) {
        try {
          captureElement.releasePointerCapture(dragState.pointerId);
        } catch {
          /* noop */
        }
      }

      straightenDragStateRef.current = {
        active: false,
        pointerId: null,
        mode: null,
        startPoint: null,
        snapshotGuide: null,
        captureElement: null,
      };
      setInteractionKind('idle');
      setIsAdjusting(false);
    },
    [applyStraightenDragPoint]
  );

  const beginManualStraightenSession = useCallback(() => {
    stopCropDrag();
    const currentLevel = clamp(Number(adjustmentsLevel ?? 0) || 0, SLIDER_DEFS.level.min, SLIDER_DEFS.level.max);
    straightenSessionLevelRef.current = currentLevel;
    straightenSessionSnapshotRef.current = captureCurrentSnapshot();
    straightenHasMeaningfulChangeRef.current = false;
    const baseGuide = normalizeStraightenGuide(
      straightenGuideRef.current ?? buildStraightenGuideFromCropRect(activeCropRectNorm),
      activeCropRectNorm
    );
    setStraightenGuideSafely(baseGuide);
  }, [activeCropRectNorm, adjustmentsLevel, captureCurrentSnapshot, setStraightenGuideSafely, stopCropDrag]);

  const acceptManualStraighten = useCallback(() => {
    stopStraightenDrag();
    const finalGuide = normalizeStraightenGuide(
      straightenGuideRef.current ?? buildStraightenGuideFromCropRect(activeCropRectNorm),
      activeCropRectNorm
    );
    setStraightenGuideSafely(finalGuide);
    const finalLevelRaw = deriveStraightenLevelFromGuide(finalGuide);
    const finalLevel = Number.isFinite(finalLevelRaw)
      ? clamp(finalLevelRaw, SLIDER_DEFS.level.min, SLIDER_DEFS.level.max)
      : clamp(
          Number(adjustmentsLevel ?? straightenSessionLevelRef.current) || straightenSessionLevelRef.current,
          SLIDER_DEFS.level.min,
          SLIDER_DEFS.level.max
        );
    setAdjustments((current) => {
      const currentLevel = Number(current?.level ?? 0) || 0;
      if (Math.abs(currentLevel - finalLevel) < 0.0008) {
        return current;
      }
      return {
        ...current,
        level: finalLevel,
      };
    });
    if (Math.abs(finalLevel - straightenSessionLevelRef.current) > 0.0008) {
      pushUndoSnapshot(straightenSessionSnapshotRef.current);
    }
    setIsStraightenToolArmed(false);
    straightenSessionSnapshotRef.current = null;
    straightenHasMeaningfulChangeRef.current = false;
  }, [
    activeCropRectNorm,
    adjustmentsLevel,
    pushUndoSnapshot,
    setStraightenGuideSafely,
    stopStraightenDrag,
  ]);

  const cancelManualStraighten = useCallback(() => {
    stopStraightenDrag();
    if (isStraightenToolArmed) {
      const restoreLevel = clamp(
        Number(straightenSessionLevelRef.current) || 0,
        SLIDER_DEFS.level.min,
        SLIDER_DEFS.level.max
      );
      setAdjustments((current) => {
        const currentLevel = Number(current?.level ?? 0) || 0;
        if (Math.abs(currentLevel - restoreLevel) < 0.0008) {
          return current;
        }
        return {
          ...current,
          level: restoreLevel,
        };
      });
    }
    setIsStraightenToolArmed(false);
    setStraightenGuide(null);
    straightenSessionSnapshotRef.current = null;
    straightenHasMeaningfulChangeRef.current = false;
  }, [isStraightenToolArmed, stopStraightenDrag]);

  const handleStraightenPointerDown = useCallback(
    (mode, event) => {
      if (!hasImage || activePanel !== 'crop' || !isStraightenToolArmed) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      const startPoint = getCropNormPoint(event);
      if (!startPoint) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (straightenDragStateRef.current.active) {
        stopStraightenDrag(event);
      }

      markFilmLabE2ePointerDown();

      const captureElement = cropOverlayInteractionRef.current ?? event.currentTarget ?? null;
      if (captureElement?.setPointerCapture && event.pointerId != null) {
        try {
          captureElement.setPointerCapture(event.pointerId);
        } catch {
          /* noop */
        }
      }

      const currentGuide = normalizeStraightenGuide(
        straightenGuideRef.current ?? buildStraightenGuideFromCropRect(activeCropRectNorm),
        activeCropRectNorm
      );
      straightenDragStateRef.current = {
        active: true,
        pointerId: event.pointerId ?? null,
        mode,
        startPoint,
        snapshotGuide: currentGuide,
        captureElement,
      };
      if (mode === 'new') {
        const nextGuide = normalizeStraightenGuide(
          {
            start: startPoint,
            end: startPoint,
          },
          activeCropRectNorm
        );
        setStraightenGuideSafely(nextGuide);
      }
      straightenDragPendingPointRef.current = null;
      setInteractionKind('crop-straighten');
      setIsAdjusting(true);
    },
    [
      activeCropRectNorm,
      activePanel,
      getCropNormPoint,
      hasImage,
      isStraightenToolArmed,
      setStraightenGuideSafely,
      stopStraightenDrag,
    ]
  );

  const handleStraightenPointerMove = useCallback(
    (event) => {
      const dragState = straightenDragStateRef.current;
      if (!dragState.active) {
        return;
      }
      if (
        dragState.pointerId != null &&
        event.pointerId != null &&
        dragState.pointerId !== event.pointerId
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const coalescedEvents =
        typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
      const latestEvent =
        coalescedEvents && coalescedEvents.length > 0
          ? coalescedEvents[coalescedEvents.length - 1]
          : event;
      const point = getCropNormPoint(latestEvent);
      if (!point) {
        return;
      }
      straightenDragPendingPointRef.current = point;
      queueStraightenDragFrame();
    },
    [getCropNormPoint, queueStraightenDragFrame]
  );

  const handleStraightenPointerUp = useCallback(
    (event) => {
      const dragState = straightenDragStateRef.current;
      if (!dragState.active) {
        return;
      }
      if (
        dragState.pointerId != null &&
        event.pointerId != null &&
        dragState.pointerId !== event.pointerId
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const coalescedEvents =
        typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
      const latestEvent =
        coalescedEvents && coalescedEvents.length > 0
          ? coalescedEvents[coalescedEvents.length - 1]
          : event;
      const point = getCropNormPoint(latestEvent);
      if (point) {
        straightenDragPendingPointRef.current = point;
      }
      const finishedMode = dragState.mode;
      stopStraightenDrag(event);
      if (finishedMode === 'new') {
        acceptManualStraighten();
      }
    },
    [acceptManualStraighten, getCropNormPoint, stopStraightenDrag]
  );

  const handleStraightenPointerCancel = useCallback(
    (event) => {
      const dragState = straightenDragStateRef.current;
      if (!dragState.active) {
        return;
      }
      if (
        dragState.pointerId != null &&
        event.pointerId != null &&
        dragState.pointerId !== event.pointerId
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      stopStraightenDrag(event);
    },
    [stopStraightenDrag]
  );

  const runAutoStraighten = useCallback(() => {
    if (!hasImage || !canvasRef.current || typeof document === 'undefined') {
      return;
    }

    const sourceCanvas = canvasRef.current;
    const srcWidth = Number(sourceCanvas.width) || 0;
    const srcHeight = Number(sourceCanvas.height) || 0;
    if (srcWidth < 16 || srcHeight < 16) {
      return;
    }

    const proxyWidth = clamp(Math.round(Math.min(384, srcWidth)), 64, 384);
    const proxyHeight = clamp(Math.round((proxyWidth / srcWidth) * srcHeight), 64, 384);
    const proxyCanvas = document.createElement('canvas');
    proxyCanvas.width = proxyWidth;
    proxyCanvas.height = proxyHeight;
    const proxyContext = proxyCanvas.getContext('2d', { willReadFrequently: true });
    if (!proxyContext) {
      return;
    }
    proxyContext.drawImage(sourceCanvas, 0, 0, proxyWidth, proxyHeight);
    const imageData = proxyContext.getImageData(0, 0, proxyWidth, proxyHeight);
    const pixels = imageData.data;

    let sumSin = 0;
    let sumCos = 0;
    let totalWeight = 0;
    let candidateCount = 0;

    const lumaAt = (x, y) => {
      const index = (y * proxyWidth + x) * 4;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    for (let y = 1; y < proxyHeight - 1; y += 1) {
      for (let x = 1; x < proxyWidth - 1; x += 1) {
        const gx =
          -lumaAt(x - 1, y - 1) +
          lumaAt(x + 1, y - 1) -
          2 * lumaAt(x - 1, y) +
          2 * lumaAt(x + 1, y) -
          lumaAt(x - 1, y + 1) +
          lumaAt(x + 1, y + 1);
        const gy =
          lumaAt(x - 1, y - 1) +
          2 * lumaAt(x, y - 1) +
          lumaAt(x + 1, y - 1) -
          lumaAt(x - 1, y + 1) -
          2 * lumaAt(x, y + 1) -
          lumaAt(x + 1, y + 1);
        const magnitude = Math.hypot(gx, gy);
        if (magnitude < 52) {
          continue;
        }

        const lineAngle = (Math.atan2(gy, gx) + Math.PI / 2 + Math.PI) % Math.PI;
        const deviation = ((lineAngle + Math.PI / 4) % (Math.PI / 2)) - Math.PI / 4;
        const weight = magnitude;
        sumSin += weight * Math.sin(2 * deviation);
        sumCos += weight * Math.cos(2 * deviation);
        totalWeight += weight;
        candidateCount += 1;
      }
    }

    if (!candidateCount || totalWeight <= 0) {
      return;
    }

    const deviationHat = 0.5 * Math.atan2(sumSin, sumCos);
    const correctionDeg = clamp(
      (-deviationHat * 180) / Math.PI,
      SLIDER_DEFS.level.min,
      SLIDER_DEFS.level.max
    );
    const confidence = clamp(
      Math.sqrt(sumSin * sumSin + sumCos * sumCos) / totalWeight,
      0,
      1
    );

    saveUndo();
    setAdjustments((current) => ({
      ...current,
      level: correctionDeg,
      autoStraightenConfidence: confidence,
    }));
  }, [canvasRef, hasImage, saveUndo, setAdjustments]);

  return {
    beginManualStraightenSession,
    acceptManualStraighten,
    cancelManualStraighten,
    handleStraightenPointerDown,
    handleStraightenPointerMove,
    handleStraightenPointerUp,
    handleStraightenPointerCancel,
    stopStraightenDrag,
    runAutoStraighten,
  };
}
