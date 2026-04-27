import { useFilmLabStraightenDrag } from './useFilmLabStraightenDrag.js';
import { useFilmLabStraightenOutsideCropReset } from './useFilmLabStraightenOutsideCropReset.js';

/**
 * Straighten pointer drag + teardown when leaving crop (FilmLabPro cluster).
 */
export function useFilmLabStraightenDragAndOutsideCropResetCluster({
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
  const straightenDrag = useFilmLabStraightenDrag({
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
  });

  useFilmLabStraightenOutsideCropReset({
    activePanel,
    hasImage,
    stopStraightenDrag: straightenDrag.stopStraightenDrag,
    setIsStraightenToolArmed,
    setStraightenGuide,
    straightenSessionSnapshotRef,
    straightenHasMeaningfulChangeRef,
  });

  return straightenDrag;
}
