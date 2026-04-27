import { useFilmLabEngine } from '../engine/useFilmLabEngine.js';
import { SHOW_RENDER_DEBUG_PANEL } from './runtimeEnv.js';
import { useFilmLabExportDebugReport } from './useFilmLabExportDebugReport.js';
import { useFilmLabMetadataClipboard } from './useFilmLabMetadataClipboard.js';
import { useFilmLabMetadataItems } from './useFilmLabMetadataItems.js';
import { useFilmLabPersistenceEcho } from './useFilmLabPersistenceEcho.js';
import { useFilmLabRawQualitySummaries } from './useFilmLabRawQualitySummaries.js';
import { useFilmLabRenderDebugStatusLabels } from './useFilmLabRenderDebugStatusLabels.js';

export function useFilmLabEngineSidecar({
  imageUrl,
  uploadedFile,
  activeFilm,
  activeFilmIndex,
  engineAdjustments,
  rawBackendPreference,
  rawBackendMode,
  rawLinearStageOverride,
  rawLinearStageMode,
  zoomMode,
  metadataViewMode,
  setMetadataViewMode,
  exifMeta,
  zoom,
  adjustments,
  isInputProfile,
  colorCalibration,
  colorGrading,
  colorMixer,
  interactionKind,
  isAdjusting,
  isPanning,
  userCurves,
}) {
  const {
    canvasRef,
    isProcessing,
    exportImage,
    renderCurrentFrameBlob,
    exportCubeLut,
    processBatch,
    cancelBatch,
    batchState,
    imageMeta,
    pipelineInfo,
    renderPipelineAlert,
    clearRenderPipelineAlert,
    renderDebugInfo,
    renderVersion,
    setPreferFullResPreview,
  } = useFilmLabEngine(imageUrl, uploadedFile, activeFilm, engineAdjustments, {
    rawBackendPreference,
    rawLinearStageOverride,
    e2eIsPanning: Boolean(isPanning),
  });

  const hasActiveSource = Boolean(uploadedFile || imageUrl);
  const hasImage = Boolean(imageMeta);
  const showBlockingProcessing = isProcessing && !hasImage;
  const showInlineProcessing = isProcessing && hasImage;
  const showRenderDebugPanel = SHOW_RENDER_DEBUG_PANEL && hasActiveSource;

  useFilmLabPersistenceEcho({ rawBackendMode, rawLinearStageMode, zoomMode });

  const { previewPathLabel, fallbackExplanation, runtimeStatusBadge } = useFilmLabRenderDebugStatusLabels({
    renderDebugInfo,
    hasActiveSource,
    pipelineInfo,
    activeFilmName: activeFilm?.name,
  });

  const {
    rawDecodeSummary,
    rawBackendAbSummary,
    rawQualityQaSummary,
    isRawDecodeWarning,
    qualityStatus,
  } = useFilmLabRawQualitySummaries({ hasActiveSource, pipelineInfo, renderDebugInfo });

  const { metadataItems, displayedMetadataItems, cycleMetadataViewMode } = useFilmLabMetadataItems({
    metadataViewMode,
    setMetadataViewMode,
    uploadedFile,
    imageMeta,
    exifMeta,
    zoom,
    adjustments,
    activeFilmName: activeFilm?.name,
    isInputProfile,
    pipelineInfo,
    rawLinearStageOverride,
    qualityStatus,
    rawDecodeSummary,
    showInlineProcessing,
    isRawDecodeWarning,
  });

  const { metadataFeedback, copyMetadataToClipboard } = useFilmLabMetadataClipboard({
    metadataItems,
  });

  const { exportDebugReport, debugExportFeedback } = useFilmLabExportDebugReport({
    activeFilm,
    activeFilmIndex,
    adjustments,
    batchState,
    colorCalibration,
    colorGrading,
    colorMixer,
    exifMeta,
    fallbackExplanation,
    imageMeta,
    interactionKind,
    isAdjusting,
    isProcessing,
    pipelineInfo,
    previewPathLabel,
    renderPipelineAlert,
    renderDebugInfo,
    runtimeStatusBadge,
    rawQualityQaSummary,
    rawBackendMode,
    rawBackendPreference,
    rawLinearStageMode,
    rawLinearStageOverride,
    showInlineProcessing,
    uploadedFile,
    userCurves,
  });

  return {
    canvasRef,
    isProcessing,
    exportImage,
    renderCurrentFrameBlob,
    exportCubeLut,
    processBatch,
    cancelBatch,
    batchState,
    imageMeta,
    pipelineInfo,
    renderPipelineAlert,
    clearRenderPipelineAlert,
    renderDebugInfo,
    renderVersion,
    setPreferFullResPreview,
    hasActiveSource,
    hasImage,
    showBlockingProcessing,
    showInlineProcessing,
    showRenderDebugPanel,
    previewPathLabel,
    fallbackExplanation,
    runtimeStatusBadge,
    rawDecodeSummary,
    rawBackendAbSummary,
    rawQualityQaSummary,
    isRawDecodeWarning,
    qualityStatus,
    metadataItems,
    displayedMetadataItems,
    cycleMetadataViewMode,
    metadataFeedback,
    copyMetadataToClipboard,
    exportDebugReport,
    debugExportFeedback,
  };
}
