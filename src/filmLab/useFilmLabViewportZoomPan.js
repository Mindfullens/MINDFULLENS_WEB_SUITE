import { useCallback, useMemo } from 'react';
import { clearFilmLabE2ePointerMark, markFilmLabE2ePointerDown } from './previewE2ePointerMark.js';
import {
  applyAnchoredZoom,
  clampPanToBoundsForSize,
} from '../engine/previewGeometry.js';
import { clamp } from './crop/cropStraighten.js';
import { useAutoFitOnImageIdentityChange } from './useAutoFitOnImageIdentityChange.js';
import { useFilmLabViewportPanEffects } from './useFilmLabViewportPanEffects.js';
import {
  FIT_DOUBLE_CLICK_THRESHOLD,
  FIT_UI_ZOOM,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  PAN_ACTIVATION_OVERFLOW_PX,
  resolveNextZoomStop,
  WHEEL_MOUSE_NOTCH_DELTA,
  WHEEL_MOUSE_NOTCH_MIN_DELTA,
  WHEEL_TRACKPAD_STEP_DELTA,
  WHEEL_ZOOM_PERCENT_STEP,
  ZOOM_MODE,
  ZOOM_STOPS,
} from './viewportZoom.js';

export function useFilmLabViewportZoomPan({
  resolveFittedSize,
  hasImage,
  devicePixelRatio,
  chromeBox,
  canvasAreaRef,
  canvasStageRef,
  canvasCenterRef,
  canvasStageSize,
  zoom,
  setZoom,
  panOffset,
  setPanOffset,
  zoomRef,
  panOffsetRef,
  zoomAnchorRef,
  panDragRef,
  setIsPanning,
  setPreferFullResPreview,
  setZoomMode,
  imageMeta,
  exifMeta,
  adjustmentsRotation,
  activePanel,
  isStraightenToolArmed,
  acceptCropDraft,
  acceptManualStraighten,
  imageIdentityKey,
  lastAutoFitKeyRef,
}) {
  const canvasViewportSize = useMemo(() => {
    const docElement = typeof document !== 'undefined' ? document.documentElement : null;
    const winW =
      docElement?.clientWidth ??
      (typeof window !== 'undefined' ? Number(window.innerWidth) || 0 : 0);
    const winH =
      docElement?.clientHeight ??
      (typeof window !== 'undefined' ? Number(window.innerHeight) || 0 : 0);
    const computedViewportWidth = Math.max(0, winW - (chromeBox.left + chromeBox.right));
    const computedViewportHeight = Math.max(0, winH - (chromeBox.top + chromeBox.bottom));
    const stageElement = canvasAreaRef.current ?? canvasStageRef.current ?? canvasCenterRef.current;
    const stageRect = stageElement?.getBoundingClientRect?.() ?? null;
    const measuredVisibleWidth = stageRect
      ? Math.max(0, Math.min(stageRect.right, winW) - Math.max(stageRect.left, 0))
      : 0;
    const measuredVisibleHeight = stageRect
      ? Math.max(0, Math.min(stageRect.bottom, winH) - Math.max(stageRect.top, 0))
      : 0;
    const stageViewportWidth =
      Math.max(
        0,
        Number(measuredVisibleWidth) ||
          Number(canvasStageSize.width) ||
          Number(stageElement?.clientWidth ?? 0) ||
          0
      ) || 0;
    const stageViewportHeight =
      Math.max(
        0,
        Number(measuredVisibleHeight) ||
          Number(canvasStageSize.height) ||
          Number(stageElement?.clientHeight ?? 0) ||
          0
      ) || 0;
    const viewportWidth = stageViewportWidth > 0 ? stageViewportWidth : computedViewportWidth;
    const viewportHeight = stageViewportHeight > 0 ? stageViewportHeight : computedViewportHeight;

    return {
      width: viewportWidth,
      height: viewportHeight,
    };
  }, [canvasStageSize.height, canvasStageSize.width, chromeBox.bottom, chromeBox.left, chromeBox.right, chromeBox.top]);

  const fitCanvasRenderSize = useMemo(() => {
    if (!hasImage) {
      return { width: 0, height: 0 };
    }

    const viewportWidth = Number(canvasViewportSize.width) || 0;
    const viewportHeight = Number(canvasViewportSize.height) || 0;

    if (!viewportWidth || !viewportHeight) {
      return { width: viewportWidth, height: viewportHeight };
    }

    const fittedSize = resolveFittedSize(viewportWidth, viewportHeight, 'contain');
    return {
      width: Number(fittedSize.width) || 0,
      height: Number(fittedSize.height) || 0,
    };
  }, [canvasViewportSize.height, canvasViewportSize.width, hasImage, resolveFittedSize]);

  const sourceDisplaySize = useMemo(() => {
    const exifRotation = Number(exifMeta?.orientationTransform?.rotationDegrees ?? 0) || 0;
    const normalizedRotation = ((Number(adjustmentsRotation ?? 0) + exifRotation) % 360 + 360) % 360;
    const decodedSourceWidth =
      Number(imageMeta?.sourceWidth ?? imageMeta?.width ?? imageMeta?.previewWidth ?? 0) || 0;
    const decodedSourceHeight =
      Number(imageMeta?.sourceHeight ?? imageMeta?.height ?? imageMeta?.previewHeight ?? 0) || 0;
    const exifSourceWidth = Number(exifMeta?.pixelWidth ?? 0) || 0;
    const exifSourceHeight = Number(exifMeta?.pixelHeight ?? 0) || 0;
    const sourceWidth = decodedSourceWidth > 0 ? decodedSourceWidth : exifSourceWidth;
    const sourceHeight = decodedSourceHeight > 0 ? decodedSourceHeight : exifSourceHeight;
    const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
    const width = isQuarterTurn ? sourceHeight : sourceWidth;
    const height = isQuarterTurn ? sourceWidth : sourceHeight;
    return { width, height };
  }, [
    adjustmentsRotation,
    exifMeta?.orientationTransform?.rotationDegrees,
    exifMeta?.pixelHeight,
    exifMeta?.pixelWidth,
    imageMeta?.sourceHeight,
    imageMeta?.sourceWidth,
    imageMeta?.height,
    imageMeta?.previewHeight,
    imageMeta?.previewWidth,
    imageMeta?.width,
  ]);

  const fitZoom = FIT_UI_ZOOM;

  const zoomOneToOne = useMemo(() => {
    const sourceWidth = Number(sourceDisplaySize.width) || 0;
    const sourceHeight = Number(sourceDisplaySize.height) || 0;
    const renderWidth = Number(fitCanvasRenderSize.width) || 0;
    const renderHeight = Number(fitCanvasRenderSize.height) || 0;
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    if (sourceWidth <= 0 || sourceHeight <= 0 || renderWidth <= 0 || renderHeight <= 0) {
      return fitZoom;
    }
    const ratioX = sourceWidth / (renderWidth * dpr);
    const ratioY = sourceHeight / (renderHeight * dpr);
    const candidate = Math.max(
      Number.isFinite(ratioX) && ratioX > 0 ? ratioX : 0,
      Number.isFinite(ratioY) && ratioY > 0 ? ratioY : 0
    );
    const normalizedCandidate = Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
    return clamp(normalizedCandidate * fitZoom, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM);
  }, [
    fitCanvasRenderSize.height,
    fitCanvasRenderSize.width,
    devicePixelRatio,
    fitZoom,
    sourceDisplaySize.height,
    sourceDisplaySize.width,
  ]);

  const zoomStops = useMemo(() => {
    const oneToOne = Number(zoomOneToOne) || fitZoom;
    const withFit = [...ZOOM_STOPS, fitZoom, oneToOne];
    const uniqueSortedStops = Array.from(
      new Set(
        withFit
          .filter((value) => Number.isFinite(value) && value >= MIN_CANVAS_ZOOM && value <= MAX_CANVAS_ZOOM)
          .map((value) => Math.round(value * 100000) / 100000)
      )
    ).sort((left, right) => left - right);
    return uniqueSortedStops;
  }, [fitZoom, zoomOneToOne]);

  const displayedZoomPercent = useMemo(() => {
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : fitZoom;
    const safeFit = Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : FIT_UI_ZOOM;
    return Math.max(1, Math.round((safeZoom / safeFit) * 100));
  }, [fitZoom, zoom]);

  const resolveRenderScaleForZoom = useCallback(
    (zoomValue) => {
      const safeZoom = Number.isFinite(zoomValue) && zoomValue > 0 ? zoomValue : fitZoom;
      const safeFit = Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : 1;
      return safeZoom / safeFit;
    },
    [fitZoom]
  );

  const effectiveZoom = useMemo(() => resolveRenderScaleForZoom(zoom), [resolveRenderScaleForZoom, zoom]);

  /**
   * EXIF Orientation → CSS `rotate(deg)` na canvas, **wyłącznie** gdy bufor zdekodowany jest
   * w surowej (sensor) orientacji — dotyczy RAW (LibRaw nie rotuje), NIE dotyczy JPEG przez
   * `createImageBitmap({imageOrientation: 'from-image'})` (bitmap już jest w „natural").
   *
   * Detekcja: dla quarter-turn (90/270) porównaj zdekodowane W×H z EXIF `pixelWidth/pixelHeight`.
   * Jeśli pasują do RAW (pre-rotation) → potrzebna CSS rotacja; jeśli pasują do natural → nie.
   * Dla 180° dimensions są równe → zostaw spec'owi rotację 0 (bezpiecznie, nie podwajaj).
   */
  const exifCssRotationDegrees = useMemo(() => {
    const raw = Number(exifMeta?.orientationTransform?.rotationDegrees);
    if (!Number.isFinite(raw)) {
      return 0;
    }
    const norm = ((raw % 360) + 360) % 360;
    if (norm !== 90 && norm !== 270) {
      return 0;
    }
    const exifPixelW = Number(exifMeta?.pixelWidth) || 0;
    const exifPixelH = Number(exifMeta?.pixelHeight) || 0;
    const decodedW =
      Number(imageMeta?.sourceWidth ?? imageMeta?.width ?? imageMeta?.previewWidth) || 0;
    const decodedH =
      Number(imageMeta?.sourceHeight ?? imageMeta?.height ?? imageMeta?.previewHeight) || 0;
    if (!exifPixelW || !exifPixelH || !decodedW || !decodedH) {
      return 0;
    }
    const matchesRawPreRotation =
      Math.abs(decodedW - exifPixelW) <= 4 && Math.abs(decodedH - exifPixelH) <= 4;
    return matchesRawPreRotation ? norm : 0;
  }, [
    exifMeta?.orientationTransform?.rotationDegrees,
    exifMeta?.pixelWidth,
    exifMeta?.pixelHeight,
    imageMeta?.sourceWidth,
    imageMeta?.sourceHeight,
    imageMeta?.width,
    imageMeta?.height,
    imageMeta?.previewWidth,
    imageMeta?.previewHeight,
  ]);

  const exifCssMirrored = false;

  const canvasPresentationStyle = useMemo(
    () => {
      const isQuarterTurn = exifCssRotationDegrees === 90 || exifCssRotationDegrees === 270;
      /**
       * `fitCanvasRenderSize` jest liczone z **portretowego** display (po EXIF) — np. 600×900.
       * Bufor canvasu w silniku jest landscape (np. 6000×4000), więc w CSS dajemy LANDSCAPE
       * box (900×600), a `rotate(90deg)` obraca go wizualnie do portretu w środku wrappera.
       */
      const cssWidthSource = isQuarterTurn ? fitCanvasRenderSize.height : fitCanvasRenderSize.width;
      const cssHeightSource = isQuarterTurn ? fitCanvasRenderSize.width : fitCanvasRenderSize.height;
      const mirrorScale = exifCssMirrored ? -1 : 1;
      return {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width:
          cssWidthSource > 0 ? `${Math.round(cssWidthSource)}px` : '100%',
        height:
          cssHeightSource > 0 ? `${Math.round(cssHeightSource)}px` : '100%',
        objectFit: 'fill',
        objectPosition: 'center center',
        transform: `translate(-50%, -50%) translate(${panOffset.x}px, ${panOffset.y}px) scale(${effectiveZoom * mirrorScale}, ${effectiveZoom}) rotate(${exifCssRotationDegrees}deg)`,
        transformOrigin: 'center center',
        willChange: 'transform',
      };
    },
    [
      effectiveZoom,
      exifCssMirrored,
      exifCssRotationDegrees,
      fitCanvasRenderSize.height,
      fitCanvasRenderSize.width,
      panOffset.x,
      panOffset.y,
    ]
  );

  const canPanAtZoom = useCallback(
    (targetZoom = zoomRef.current) => {
      const safeZoom = Number.isFinite(targetZoom) && targetZoom > 0 ? targetZoom : fitZoom;
      if (safeZoom <= fitZoom + 0.001) {
        return false;
      }

      const viewportWidth = Number(canvasViewportSize.width) || 0;
      const viewportHeight = Number(canvasViewportSize.height) || 0;
      const baseWidth = Number(fitCanvasRenderSize.width) || 0;
      const baseHeight = Number(fitCanvasRenderSize.height) || 0;
      if (!viewportWidth || !viewportHeight || !baseWidth || !baseHeight) {
        return false;
      }

      const renderScale = resolveRenderScaleForZoom(safeZoom);
      const scaledWidth = baseWidth * renderScale;
      const scaledHeight = baseHeight * renderScale;
      return (
        scaledWidth > viewportWidth + PAN_ACTIVATION_OVERFLOW_PX ||
        scaledHeight > viewportHeight + PAN_ACTIVATION_OVERFLOW_PX
      );
    },
    [
      canvasViewportSize.height,
      canvasViewportSize.width,
      fitCanvasRenderSize.height,
      fitCanvasRenderSize.width,
      fitZoom,
      resolveRenderScaleForZoom,
    ]
  );

  const isZoomBeyondFit = useMemo(() => canPanAtZoom(zoom), [canPanAtZoom, zoom]);

  const isPixelPeepZoom = useMemo(() => {
    const oneToOne = Number(zoomOneToOne);
    if (!Number.isFinite(oneToOne) || oneToOne <= 0) {
      return false;
    }
    return zoom >= oneToOne;
  }, [zoom, zoomOneToOne]);

  const clampPanToBounds = useCallback(
    (candidatePan, targetZoom = zoomRef.current) => {
      const safeZoom = Number.isFinite(targetZoom) && targetZoom > 0 ? targetZoom : fitZoom;
      if (safeZoom <= fitZoom + 0.001) {
        return { x: 0, y: 0 };
      }

      const viewportWidth = Number(canvasViewportSize.width) || 0;
      const viewportHeight = Number(canvasViewportSize.height) || 0;
      const baseWidth = Number(fitCanvasRenderSize.width) || 0;
      const baseHeight = Number(fitCanvasRenderSize.height) || 0;
      if (!viewportWidth || !viewportHeight || !baseWidth || !baseHeight) {
        return candidatePan;
      }

      const renderScale = resolveRenderScaleForZoom(safeZoom);
      return clampPanToBoundsForSize(
        candidatePan,
        viewportWidth,
        viewportHeight,
        baseWidth,
        baseHeight,
        renderScale
      );
    },
    [
      canvasViewportSize.height,
      canvasViewportSize.width,
      fitCanvasRenderSize.height,
      fitCanvasRenderSize.width,
      fitZoom,
      resolveRenderScaleForZoom,
    ]
  );

  const applyZoomAtPoint = useCallback(
    (targetZoom, anchorClient = null) => {
      const boundedZoom = clamp(targetZoom, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM);
      const currentZoom = zoomRef.current;

      if (Math.abs(boundedZoom - currentZoom) < 0.0001) {
        return;
      }

      const centerEl = canvasStageRef.current ?? canvasCenterRef.current;
      if (!centerEl) {
        zoomRef.current = boundedZoom;
        setZoom(boundedZoom);
        return;
      }

      const rect = centerEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const anchor = anchorClient ?? { x: centerX, y: centerY };
      const zoomResult = applyAnchoredZoom({
        currentZoom,
        targetZoom: boundedZoom,
        anchorClient: anchor,
        centerClient: { x: centerX, y: centerY },
        currentPan: panOffsetRef.current,
        clampPan: clampPanToBounds,
        minZoom: MIN_CANVAS_ZOOM,
        maxZoom: MAX_CANVAS_ZOOM,
      });

      zoomRef.current = zoomResult.zoom;
      panOffsetRef.current = zoomResult.pan;
      setZoom(zoomResult.zoom);
      setPanOffset(zoomResult.pan);
    },
    [clampPanToBounds]
  );

  const stepZoom = useCallback(
    (direction = 1, anchorClient = null) => {
      const rawTarget = resolveNextZoomStop(zoomRef.current, direction, zoomStops);
      applyZoomAtPoint(rawTarget, anchorClient);
    },
    [applyZoomAtPoint, zoomStops]
  );

  const resetZoomPan = useCallback(() => {
    setPreferFullResPreview(false);
    const resetPan = { x: 0, y: 0 };
    const safeFitZoom = Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : FIT_UI_ZOOM;
    zoomRef.current = safeFitZoom;
    panOffsetRef.current = resetPan;
    setZoom(safeFitZoom);
    setPanOffset(resetPan);
  }, [fitZoom, setPreferFullResPreview]);

  const fitClassic = useCallback(() => {
    setPreferFullResPreview(false);
    setZoomMode(ZOOM_MODE.CLASSIC);
    const resetPan = { x: 0, y: 0 };
    const safeFitZoom = Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : FIT_UI_ZOOM;
    zoomRef.current = safeFitZoom;
    panOffsetRef.current = resetPan;
    setZoom(safeFitZoom);
    setPanOffset(resetPan);
  }, [fitZoom, setPreferFullResPreview]);

  useAutoFitOnImageIdentityChange({
    hasImage,
    imageIdentityKey,
    fitZoom,
    setPreferFullResPreview,
    lastAutoFitKeyRef,
    zoomRef,
    panOffsetRef,
    setZoom,
    setPanOffset,
  });

  const jumpToOneToOne = useCallback(
    (anchorClient = null) => {
      setPreferFullResPreview(false);
      const safeOneToOne = Number.isFinite(zoomOneToOne) && zoomOneToOne > 0 ? zoomOneToOne : fitZoom;
      applyZoomAtPoint(clamp(safeOneToOne, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM), anchorClient);
    },
    [applyZoomAtPoint, fitZoom, setPreferFullResPreview, zoomOneToOne]
  );

  const rememberZoomAnchor = useCallback((event) => {
    zoomAnchorRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  }, []);

  const clearZoomAnchor = useCallback(() => {
    zoomAnchorRef.current = null;
  }, []);

  const nudgePan = useCallback(
    (deltaX, deltaY) => {
      const nextPan = clampPanToBounds(
        {
          x: panOffsetRef.current.x + deltaX,
          y: panOffsetRef.current.y + deltaY,
        },
        zoomRef.current
      );

      panOffsetRef.current = nextPan;
      setPanOffset(nextPan);
    },
    [clampPanToBounds]
  );

  const handleCanvasWheel = useCallback(
    (event) => {
      if (!hasImage) {
        return;
      }

      let delta = Number(event.deltaY);
      if (!Number.isFinite(delta) || delta === 0) {
        delta = Number(event.deltaX) || 0;
      }
      if (!delta) {
        return;
      }

      if (event.deltaMode === 1) {
        delta *= 16;
      } else if (event.deltaMode === 2) {
        const viewportHeight = Number(canvasViewportSize.height) || 800;
        delta *= Math.max(120, viewportHeight);
      }
      if (event.ctrlKey) {
        delta *= 0.5;
      }

      event.preventDefault();
      const anchor = { x: event.clientX, y: event.clientY };
      zoomAnchorRef.current = anchor;

      let steps = 0;
      let stepDirection = 0;
      const absDelta = Math.abs(delta);

      if (absDelta >= WHEEL_MOUSE_NOTCH_MIN_DELTA) {
        steps = Math.max(1, Math.round(absDelta / WHEEL_MOUSE_NOTCH_DELTA));
        stepDirection = delta < 0 ? 1 : -1;
      } else {
        steps = Math.max(1, Math.round(absDelta / WHEEL_TRACKPAD_STEP_DELTA));
        stepDirection = delta < 0 ? 1 : -1;
      }

      const currentZoom =
        Number.isFinite(zoomRef.current) && zoomRef.current > 0 ? zoomRef.current : fitZoom;
      const wheelFactor = Math.pow(1 + WHEEL_ZOOM_PERCENT_STEP, stepDirection * steps);
      if (!Number.isFinite(wheelFactor) || wheelFactor <= 0) {
        return;
      }
      applyZoomAtPoint(currentZoom * wheelFactor, anchor);
    },
    [applyZoomAtPoint, canvasViewportSize.height, fitZoom, hasImage]
  );

  const stopPanDragging = useCallback(() => {
    clearFilmLabE2ePointerMark();
    panDragRef.current.active = false;
    panDragRef.current.pointerId = null;
    setIsPanning(false);
  }, []);

  const handleCanvasPointerDown = useCallback(
    (event) => {
      if (!hasImage) {
        return;
      }

      if (activePanel === 'crop') {
        return;
      }

      if (!canPanAtZoom(zoomRef.current)) {
        return;
      }

      if (event.button !== 0 && event.button !== 1) {
        return;
      }

      event.preventDefault();
      panDragRef.current.active = true;
      panDragRef.current.pointerId = event.pointerId;
      panDragRef.current.startX = event.clientX;
      panDragRef.current.startY = event.clientY;
      panDragRef.current.originX = panOffsetRef.current.x;
      panDragRef.current.originY = panOffsetRef.current.y;
      markFilmLabE2ePointerDown();
      setIsPanning(true);

      if (event.currentTarget?.setPointerCapture && event.pointerId != null) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    [activePanel, canPanAtZoom, hasImage]
  );

  const handleCanvasPointerMove = useCallback(
    (event) => {
      const dragState = panDragRef.current;
      if (!dragState.active) {
        return;
      }

      event.preventDefault();
      const coalescedEvents = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
      const latestEvent =
        coalescedEvents && coalescedEvents.length > 0
          ? coalescedEvents[coalescedEvents.length - 1]
          : event;
      const nextPan = clampPanToBounds(
        {
          x: dragState.originX + (latestEvent.clientX - dragState.startX),
          y: dragState.originY + (latestEvent.clientY - dragState.startY),
        },
        zoomRef.current
      );
      panOffsetRef.current = nextPan;
      setPanOffset(nextPan);
    },
    [clampPanToBounds]
  );

  const handleCanvasPointerUp = useCallback(
    (event) => {
      if (event?.currentTarget?.releasePointerCapture && event.pointerId != null) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* noop */
        }
      }
      stopPanDragging();
    },
    [stopPanDragging]
  );

  const handleCanvasDoubleClick = useCallback(
    (event) => {
      if (!hasImage) {
        return;
      }

      if (activePanel === 'crop') {
        event.preventDefault();
        if (isStraightenToolArmed) {
          acceptManualStraighten();
        } else {
          acceptCropDraft();
        }
        return;
      }

      if (canPanAtZoom(zoomRef.current) || zoomRef.current > FIT_DOUBLE_CLICK_THRESHOLD) {
        resetZoomPan();
        return;
      }

      jumpToOneToOne({ x: event.clientX, y: event.clientY });
    },
    [
      acceptCropDraft,
      acceptManualStraighten,
      activePanel,
      canPanAtZoom,
      hasImage,
      isStraightenToolArmed,
      jumpToOneToOne,
      resetZoomPan,
    ]
  );

  useFilmLabViewportPanEffects({
    fitZoom,
    zoom,
    hasImage,
    isPixelPeepZoom,
    setPreferFullResPreview,
    panOffsetRef,
    setPanOffset,
    setIsPanning,
    panDragRef,
    clampPanToBounds,
    zoomRef,
    setZoom,
    canvasStageSize,
    canvasViewportSize,
  });

  return {
    canvasViewportSize,
    fitCanvasRenderSize,
    sourceDisplaySize,
    fitZoom,
    zoomOneToOne,
    zoomStops,
    displayedZoomPercent,
    resolveRenderScaleForZoom,
    effectiveZoom,
    canvasPresentationStyle,
    canPanAtZoom,
    isZoomBeyondFit,
    isPixelPeepZoom,
    clampPanToBounds,
    applyZoomAtPoint,
    stepZoom,
    resetZoomPan,
    fitClassic,
    jumpToOneToOne,
    rememberZoomAnchor,
    clearZoomAnchor,
    nudgePan,
    handleCanvasWheel,
    stopPanDragging,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleCanvasDoubleClick,
  };
}
