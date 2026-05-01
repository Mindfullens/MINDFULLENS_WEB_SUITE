import { useMemo } from 'react';
import { CROP_HANDLE_DEFS } from './crop/cropConstants.js';
import {
  evaluateMaskGraphProjectionStub,
  maskGraphHasBrushEdgeSemantic,
} from './recipe/filmLabMaskGraphEvaluate.js';
import { buildMaskGraphsFromAdjustments } from './recipe/filmLabRecipeMaskProjection.js';

export function useFilmLabShellOverlayProps({
  adjustments,
  imageMeta,
  hasImage,
  uploadedFile,
  shouldRenderCropOverlay,
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
  handleCropHandlePointerDown,
  hasPendingCropChanges,
  acceptCropDraft,
  isOverlayInteractionEnabled,
  showRenderDebugPanel,
  exportDebugReport,
  exportRecipeSidecar,
  copyRecipeDocumentJson,
  debugExportFeedback,
  recipeExportFeedback,
  recipeClipboardFeedback,
  applyRecipeDocument,
  renderDebugInfo,
  previewPathLabel,
  rawBackendAbSummary,
  rawBackendMode,
  setRawBackendMode,
  rawLinearStageMode,
  setRawLinearStageMode,
  rawLinearStageModeLabel,
  rawQualityQaSummary,
}) {
  const cropOverlay = useMemo(
    () => ({
      open: shouldRenderCropOverlay,
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
      cropHandleDefs: CROP_HANDLE_DEFS,
      handleCropHandlePointerDown,
      hasPendingCropChanges,
      acceptCropDraft,
      isOverlayInteractionEnabled,
    }),
    [
      shouldRenderCropOverlay,
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
      handleCropHandlePointerDown,
      hasPendingCropChanges,
      acceptCropDraft,
      isOverlayInteractionEnabled,
    ]
  );

  const renderDebug = useMemo(() => {
    const graphs = buildMaskGraphsFromAdjustments(adjustments);
    const metaW = Number(imageMeta?.width ?? imageMeta?.pixelWidth);
    const metaH = Number(imageMeta?.height ?? imageMeta?.pixelHeight);
    const maskGraphEvaluatorStub = evaluateMaskGraphProjectionStub({
      maskGraphs: graphs,
      width: Number.isFinite(metaW) && metaW > 0 ? metaW : 0,
      height: Number.isFinite(metaH) && metaH > 0 ? metaH : 0,
    });
    const hasGenerativeSemanticStub = graphs.some(
      (g) =>
        Array.isArray(g?.nodes) &&
        g.nodes.some((n) => n?.type === 'semantic.generative_stub.v1')
    );
    const hasDepthRangeSemantic = graphs.some(
      (g) =>
        Array.isArray(g?.nodes) &&
        g.nodes.some((n) => n?.type === 'semantic.depth_range.v1')
    );
    const hasBrushEdgeSemantic = maskGraphHasBrushEdgeSemantic(graphs);
    const maskEnginePayloadHints = {
      generativeStubIntent: Boolean(adjustments?.generativeAiStubIntent),
      hasGenerativeSemanticStub,
      hasDepthRangeSemantic,
      hasBrushEdgeSemantic,
    };

    return {
      open: showRenderDebugPanel,
      adjustments,
      hasImage,
      uploadedFile,
      exportDebugReport,
      exportRecipeSidecar,
      copyRecipeDocumentJson,
      debugExportFeedback,
      recipeExportFeedback,
      recipeClipboardFeedback,
      applyRecipeDocument,
      renderDebugInfo,
      previewPathLabel,
      rawBackendAbSummary,
      rawBackendMode,
      setRawBackendMode,
      rawLinearStageMode,
      setRawLinearStageMode,
      rawLinearStageModeLabel,
      rawQualityQaSummary,
      maskGraphEvaluatorStub,
      maskEnginePayloadHints,
    };
  }, [
    showRenderDebugPanel,
    adjustments,
    imageMeta,
    hasImage,
    uploadedFile,
    exportDebugReport,
    exportRecipeSidecar,
    copyRecipeDocumentJson,
    debugExportFeedback,
    recipeExportFeedback,
    recipeClipboardFeedback,
    applyRecipeDocument,
    renderDebugInfo,
    previewPathLabel,
    rawBackendAbSummary,
    rawBackendMode,
    setRawBackendMode,
    rawLinearStageMode,
    setRawLinearStageMode,
    rawLinearStageModeLabel,
    rawQualityQaSummary,
  ]);

  return { cropOverlay, renderDebug };
}
