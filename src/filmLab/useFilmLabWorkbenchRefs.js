import { useRef } from 'react';
import { FIT_UI_ZOOM } from './viewportZoom.js';

export function useFilmLabWorkbenchRefs() {
  const fileInputRef = useRef(null);
  const batchFileInputRef = useRef(null);
  const shellRef = useRef(null);
  const toolbarRef = useRef(null);
  const leftSidebarRef = useRef(null);
  const rightSidebarRef = useRef(null);
  const workspaceFooterRef = useRef(null);
  const canvasAreaRef = useRef(null);
  const canvasCenterRef = useRef(null);
  const canvasStageRef = useRef(null);
  const curvesCanvasRef = useRef(null);
  const histogramCanvasRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  const cropOverlayInteractionRef = useRef(null);
  const zoomRef = useRef(FIT_UI_ZOOM);
  const zoomAnchorRef = useRef(null);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const lastAutoFitKeyRef = useRef(null);
  const skipNextPersistRef = useRef(false);
  const pendingAutosavePayloadRef = useRef(null);
  const restoreSnapshotRef = useRef(null);
  const sessionPersistTimerRef = useRef(null);
  const interactionReleaseTimeoutRef = useRef(null);
  const cropDragStateRef = useRef({
    active: false,
    pointerId: null,
    handle: null,
    aspectRatio: null,
    startPoint: null,
    snapshotRect: null,
    captureElement: null,
  });
  const cropDragPendingPointRef = useRef(null);
  const cropDragFrameRef = useRef(0);
  const cropLiveRectRef = useRef(null);
  const lastCropGeometryKeyRef = useRef('');
  const lastNonCropPanelRef = useRef('basic');
  const straightenGuideRef = useRef(null);
  const straightenSessionSnapshotRef = useRef(null);
  const straightenSessionLevelRef = useRef(0);
  const straightenHasMeaningfulChangeRef = useRef(false);
  const straightenDragStateRef = useRef({
    active: false,
    pointerId: null,
    mode: null,
    startPoint: null,
    snapshotGuide: null,
    captureElement: null,
  });
  const straightenDragPendingPointRef = useRef(null);
  const straightenDragFrameRef = useRef(0);

  return {
    fileInputRef,
    batchFileInputRef,
    shellRef,
    toolbarRef,
    leftSidebarRef,
    rightSidebarRef,
    workspaceFooterRef,
    canvasAreaRef,
    canvasCenterRef,
    canvasStageRef,
    curvesCanvasRef,
    histogramCanvasRef,
    canvasWrapperRef,
    cropOverlayInteractionRef,
    zoomRef,
    zoomAnchorRef,
    panOffsetRef,
    panDragRef,
    lastAutoFitKeyRef,
    skipNextPersistRef,
    pendingAutosavePayloadRef,
    restoreSnapshotRef,
    sessionPersistTimerRef,
    interactionReleaseTimeoutRef,
    cropDragStateRef,
    cropDragPendingPointRef,
    cropDragFrameRef,
    cropLiveRectRef,
    lastCropGeometryKeyRef,
    lastNonCropPanelRef,
    straightenGuideRef,
    straightenSessionSnapshotRef,
    straightenSessionLevelRef,
    straightenHasMeaningfulChangeRef,
    straightenDragStateRef,
    straightenDragPendingPointRef,
    straightenDragFrameRef,
  };
}
