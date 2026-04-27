import { useCallback } from 'react';
import {
  clearFilmLabE2ePointerMark,
  markFilmLabE2ePointerDown,
  setFilmLabE2ePointerAuxSession,
} from './previewE2ePointerMark.js';
import { CROP_MIN_SIZE } from './crop/cropConstants.js';
import { resolveNormalizedCropAspectRatio } from './crop/cropAspectResolve.js';
import {
  areCropRectsClose,
  clampCropRectToBounds,
  computeCropDragRect,
  fitCropRectToAspect,
} from './crop/cropGeometry.js';
import { clamp } from './crop/cropStraighten.js';

export function useFilmLabCropDrag({
  cropDragStateRef,
  cropDragPendingPointRef,
  cropDragFrameRef,
  cropOverlayInteractionRef,
  cropLiveRectRef,
  getPointerCoordinates,
  setCropLiveRectSafely,
  setInteractionKind,
  setIsAdjusting,
  setCropLiveRect,
  hasImage,
  activePanel,
  isStraightenToolArmed,
  activeCropAspectRatio,
  activeCropAspectPreset,
  adjustmentsRotation,
  imageMeta,
  exifMeta,
  activeCropRectNorm,
  cropRectNorm,
  applyCropRect,
  saveUndo,
  lastNonCropPanelRef,
  setActivePanel,
}) {
  const computeDragRectForPoint = useCallback((point) => {
    const dragState = cropDragStateRef.current;
    if (!dragState.active || !point) {
      return null;
    }
    return computeCropDragRect({
      snapshotRect: dragState.snapshotRect,
      startPoint: dragState.startPoint,
      currentPoint: point,
      handle: dragState.handle,
      aspectRatio: dragState.aspectRatio,
      minSize: CROP_MIN_SIZE,
    });
  }, []);

  const getCropNormPoint = useCallback(
    (eventLike) => {
      const pointer = getPointerCoordinates(eventLike);
      if (!pointer) {
        return null;
      }
      const bounds = cropOverlayInteractionRef.current?.getBoundingClientRect?.();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return null;
      }
      return {
        x: clamp((pointer.x - bounds.left) / bounds.width, 0, 1),
        y: clamp((pointer.y - bounds.top) / bounds.height, 0, 1),
      };
    },
    [getPointerCoordinates]
  );

  const applyCropDragPoint = useCallback(
    (point) => {
      const nextRect = computeDragRectForPoint(point);
      if (!nextRect) {
        return;
      }
      setCropLiveRectSafely(nextRect);
    },
    [computeDragRectForPoint, setCropLiveRectSafely]
  );

  const flushCropDragFrame = useCallback(() => {
    cropDragFrameRef.current = 0;
    const pendingPoint = cropDragPendingPointRef.current;
    cropDragPendingPointRef.current = null;
    if (!pendingPoint) {
      return;
    }
    applyCropDragPoint(pendingPoint);
  }, [applyCropDragPoint]);

  const queueCropDragFrame = useCallback(() => {
    if (cropDragFrameRef.current || typeof window === 'undefined') {
      return;
    }
    cropDragFrameRef.current = window.requestAnimationFrame(flushCropDragFrame);
  }, [flushCropDragFrame]);

  const stopCropDrag = useCallback(
    (event = null) => {
      const dragState = cropDragStateRef.current;
      if (!dragState.active) {
        return;
      }

      if (cropDragFrameRef.current && typeof window !== 'undefined') {
        window.cancelAnimationFrame(cropDragFrameRef.current);
      }
      cropDragFrameRef.current = 0;

      const pendingPoint = cropDragPendingPointRef.current;
      cropDragPendingPointRef.current = null;
      if (pendingPoint) {
        const pendingRect = computeDragRectForPoint(pendingPoint);
        if (pendingRect) {
          setCropLiveRectSafely(pendingRect);
        }
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

      cropDragStateRef.current = {
        active: false,
        pointerId: null,
        handle: null,
        aspectRatio: null,
        startPoint: null,
        snapshotRect: null,
        captureElement: null,
      };
      setFilmLabE2ePointerAuxSession(false);
      clearFilmLabE2ePointerMark();
      setInteractionKind('idle');
      setIsAdjusting(false);
    },
    [computeDragRectForPoint, setCropLiveRectSafely]
  );

  const exitCropPanel = useCallback(() => {
    const targetPanel =
      lastNonCropPanelRef.current && lastNonCropPanelRef.current !== 'crop'
        ? lastNonCropPanelRef.current
        : 'basic';
    setActivePanel(targetPanel);
  }, []);

  const acceptCropDraft = useCallback(() => {
    stopCropDrag();
    let draftRect = cropLiveRectRef.current;
    if (!draftRect && activeCropAspectPreset !== 'free' && activeCropAspectRatio != null) {
      const normalizedRatio = resolveNormalizedCropAspectRatio(
        activeCropAspectRatio,
        imageMeta,
        exifMeta,
        { rotation: adjustmentsRotation }
      );
      if (normalizedRatio) {
        draftRect = fitCropRectToAspect(
          clampCropRectToBounds(cropRectNorm, CROP_MIN_SIZE),
          normalizedRatio
        );
      }
    }
    if (!draftRect || areCropRectsClose(draftRect, cropRectNorm, 0.0005)) {
      cropLiveRectRef.current = null;
      setCropLiveRect(null);
      exitCropPanel();
      return;
    }
    const finalRect = clampCropRectToBounds(draftRect, CROP_MIN_SIZE);
    saveUndo();
    applyCropRect(finalRect);
    cropLiveRectRef.current = null;
    setCropLiveRect(null);
    exitCropPanel();
  }, [
    activeCropAspectPreset,
    activeCropAspectRatio,
    adjustmentsRotation,
    applyCropRect,
    cropLiveRectRef,
    cropRectNorm,
    exifMeta,
    exitCropPanel,
    imageMeta,
    saveUndo,
    setCropLiveRect,
    stopCropDrag,
  ]);

  const cancelCropDraft = useCallback(() => {
    stopCropDrag();
    cropLiveRectRef.current = null;
    setCropLiveRect(null);
  }, [cropLiveRectRef, setCropLiveRect, stopCropDrag]);

  const handleCropOverlayDoubleClick = useCallback(
    (event) => {
      if (!hasImage || activePanel !== 'crop' || isStraightenToolArmed) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      acceptCropDraft();
    },
    [acceptCropDraft, activePanel, hasImage, isStraightenToolArmed]
  );

  const handleCropHandlePointerDown = useCallback(
    (handle, event) => {
      if (!hasImage || activePanel !== 'crop' || isStraightenToolArmed) {
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

      if (cropDragStateRef.current.active) {
        stopCropDrag();
      }

      markFilmLabE2ePointerDown();
      setFilmLabE2ePointerAuxSession(true);

      const captureElement = cropOverlayInteractionRef.current ?? event.currentTarget ?? null;
      if (captureElement?.setPointerCapture && event.pointerId != null) {
        try {
          captureElement.setPointerCapture(event.pointerId);
        } catch {
          /* noop */
        }
      }

      cropDragStateRef.current = {
        active: true,
        pointerId: event.pointerId ?? null,
        handle,
        aspectRatio: resolveNormalizedCropAspectRatio(
          activeCropAspectRatio,
          imageMeta,
          exifMeta,
          {
            rotation: adjustmentsRotation,
          }
        ),
        startPoint,
        snapshotRect: clampCropRectToBounds(activeCropRectNorm, CROP_MIN_SIZE),
        captureElement,
      };
      setCropLiveRectSafely(cropDragStateRef.current.snapshotRect);
      cropDragPendingPointRef.current = null;
    },
    [
      activeCropAspectRatio,
      activeCropRectNorm,
      activePanel,
      adjustmentsRotation,
      exifMeta,
      getCropNormPoint,
      hasImage,
      imageMeta,
      isStraightenToolArmed,
      setCropLiveRectSafely,
      stopCropDrag,
    ]
  );

  const handleCropPointerMove = useCallback(
    (event) => {
      const dragState = cropDragStateRef.current;
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
      cropDragPendingPointRef.current = point;
      queueCropDragFrame();
    },
    [getCropNormPoint, queueCropDragFrame]
  );

  const handleCropPointerUp = useCallback(
    (event) => {
      const dragState = cropDragStateRef.current;
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
        cropDragPendingPointRef.current = point;
      }
      stopCropDrag(event);
    },
    [getCropNormPoint, stopCropDrag]
  );

  const handleCropPointerCancel = useCallback(
    (event) => {
      const dragState = cropDragStateRef.current;
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
      stopCropDrag(event);
    },
    [stopCropDrag]
  );

  return {
    getCropNormPoint,
    acceptCropDraft,
    cancelCropDraft,
    handleCropOverlayDoubleClick,
    handleCropHandlePointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    handleCropPointerCancel,
    stopCropDrag,
  };
}
