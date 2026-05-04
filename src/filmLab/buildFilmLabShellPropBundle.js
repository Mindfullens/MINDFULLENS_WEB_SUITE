import { CROP_ASPECT_PRESETS, CROP_OVERLAY_MODES } from './crop/cropConstants.js';
import { CATEGORY_TABS } from './categoryTabs.js';
import { MIXER_COLORS, MIXER_GROUPS } from './mixerConstants.js';
import { GRADE_ZONES, PANEL_TABS } from './panelAndGradeTabs.js';
import { STUDIO_WORKSPACE_TABS } from './studioWorkspaceTabs.js';
import { filterStudioWorkspaceTabsForUiMode } from './useFilmLabUiMode.js';
import {
  buildFilmLabCanvasAreaProps,
  buildFilmLabExportModalProps,
  buildFilmLabProfilesSidebarProps,
  buildFilmLabRightPanelProps,
  buildFilmLabSessionRestorePromptProps,
  buildFilmLabShortcutHelpProps,
  buildFilmLabToolbarProps,
} from './shellPropBuilders.js';
import { METADATA_VIEW_MODE_LABEL, SLIDER_DEFS } from './workbenchConstants.js';

export function buildFilmLabShellPropBundle(ctx) {
  return {
    maskWorkbench: ctx.maskWorkbench ?? null,
    studioWorkspace: ctx.studioWorkspace,
    studioNavProps: {
      tabs: filterStudioWorkspaceTabsForUiMode(STUDIO_WORKSPACE_TABS, ctx.adjustments?.uiMode),
      activeId: ctx.studioWorkspace,
      onChange: ctx.handleStudioWorkspaceChange,
    },
    libraryWorkspaceProps: {
      collections: ctx.libraryWorkspace?.collections ?? [],
      assets: ctx.libraryWorkspace?.assets ?? [],
      activeCollectionId: ctx.libraryWorkspace?.activeCollectionId ?? 'inbox',
      onCollectionChange: ctx.libraryWorkspace?.setActiveCollectionId,
      studioWorkspace: ctx.studioWorkspace,
      sessionId: ctx.libraryWorkspace?.sessionId ?? 'active-session',
      previewEpoch: ctx.libraryWorkspace?.previewEpoch ?? 0,
      updateCatalogAsset: ctx.libraryWorkspace?.updateCatalogAsset,
      libraryFilterQuery: ctx.libraryWorkspace?.libraryFilterQuery ?? '',
      setLibraryFilterQuery: ctx.libraryWorkspace?.setLibraryFilterQuery,
      filteredAssets: ctx.libraryWorkspace?.filteredAssets ?? [],
      primaryAssetId: ctx.libraryWorkspace?.primaryAssetId,
      selectedAssetIds: ctx.libraryWorkspace?.selectedAssetIds ?? [],
      pickAsset: ctx.libraryWorkspace?.pickAsset,
      selectionAnchorRef: ctx.libraryWorkspace?.selectionAnchorRef,
      fileInputRef: ctx.fileInputRef,
      onOpenAssetInDevelop: ctx.libraryWorkspace?.onOpenAssetInDevelop,
      isMetadataPanelOpen: ctx.isMetadataPanelOpen ?? false,
      onClearLibrary: ctx.libraryWorkspace?.onClearLibrary,
      onRemoveSelectedFromLibrary: ctx.libraryWorkspace?.onRemoveSelectedFromLibrary,
      /** Jak globalny filmstrip w zakładce Biblioteka — wybór + podgląd Develop (FilmLabShell korzysta z ctx). */
      onFilmstripPickAsset: ctx.onFilmstripPickAsset,
    },

    sourceFileInputProps: {
      fileInputRef: ctx.fileInputRef,
      handleFileUpload: ctx.handleFileUpload,
    },

    developFilmstripProps: ctx.libraryWorkspace
      ? (() => {
          /**
           * Ta sama kolejność co siatka stykówek: `filteredAssets` → kolekcja (`stripAssets`) → pełny katalog (`assets`).
           * Bez osobnego fallbacku na sam `catalogDocument` — unikamy jednoklatkowych „zombie” po czyszczeniu.
           */
          const lw = ctx.libraryWorkspace;
          const fromFiltered = Array.isArray(lw?.filteredAssets) ? lw.filteredAssets : [];
          const fromStrip = Array.isArray(lw?.stripAssets) ? lw.stripAssets : [];
          const fromHookAssets = Array.isArray(lw?.assets) ? lw.assets : [];
          const filmstripAssets =
            fromFiltered.length > 0
              ? fromFiltered
              : fromStrip.length > 0
                ? fromStrip
                : fromHookAssets;
          return {
            assets: filmstripAssets,
            sessionId: ctx.libraryWorkspace.sessionId ?? 'active-session',
            previewEpoch: ctx.libraryWorkspace.previewEpoch ?? 0,
            primaryAssetId: ctx.libraryWorkspace.primaryAssetId,
            selectedAssetIds: ctx.libraryWorkspace.selectedAssetIds ?? [],
            onPickAsset: (assetId, modifiers) => {
              const order = filmstripAssets
                .map((a) => String(a?.id ?? ''))
                .filter(Boolean);
              if (typeof ctx.onFilmstripPickAsset === 'function') {
                void ctx.onFilmstripPickAsset(assetId, modifiers, order);
                return;
              }
              ctx.libraryWorkspace.pickAsset?.(assetId, modifiers, order);
            },
          };
        })()
      : null,

    toolbarProps: buildFilmLabToolbarProps({
      toolbarRef: ctx.toolbarRef,
      sessionRestoreNotice: ctx.sessionRestoreNotice,
      setSessionRestoreNotice: ctx.setSessionRestoreNotice,
      fileInputRef: ctx.fileInputRef,
      hasImage: ctx.hasImage,
      adjustments: ctx.adjustments,
      toggleCompare: ctx.toggleCompare,
      toggleFlip: ctx.toggleFlip,
      rotateImage: ctx.rotateImage,
      stepZoom: ctx.stepZoom,
      displayedZoomPercent: ctx.displayedZoomPercent,
      isZoomBeyondFit: ctx.isZoomBeyondFit,
      fitClassic: ctx.fitClassic,
      jumpToOneToOne: ctx.jumpToOneToOne,
      isShortcutHelpOpen: ctx.isShortcutHelpOpen,
      setIsShortcutHelpOpen: ctx.setIsShortcutHelpOpen,
      isPreviewFullMode: ctx.isPreviewFullMode,
      togglePreviewFullMode: ctx.togglePreviewFullMode,
      toggleClipping: ctx.toggleClipping,
      isMetadataPanelOpen: ctx.isMetadataPanelOpen,
      setIsMetadataPanelOpen: ctx.setIsMetadataPanelOpen,
      showRuntimeStatus: ctx.showRuntimeStatus,
      setShowRuntimeStatus: ctx.setShowRuntimeStatus,
      applyAutoExposure: ctx.applyAutoExposure,
      applyAutoColor: ctx.applyAutoColor,
      handleToolbarReset: ctx.handleToolbarReset,
      handleToolbarUndo: ctx.handleToolbarUndo,
      handleToolbarRedo: ctx.handleToolbarRedo,
      redoStackRef: ctx.redoStackRef,
      copyToClipboard: ctx.copyToClipboard,
      pasteFromClipboard: ctx.pasteFromClipboard,
      clipboardFeedback: ctx.clipboardFeedback,
      updateAdjustment: ctx.updateAdjustment,
      exportCubeLut: ctx.exportCubeLut,
      exportDebugReport: ctx.exportDebugReport,
      hasActiveSource: ctx.hasActiveSource,
      debugExportFeedback: ctx.debugExportFeedback,
      batchState: ctx.batchState,
      isRawBackendForced: ctx.isRawBackendForced,
      rawBackendModeLabel: ctx.rawBackendModeLabel,
      batchFileInputRef: ctx.batchFileInputRef,
      setPendingBatchFiles: ctx.setPendingBatchFiles,
      setIsExportModalOpen: ctx.setIsExportModalOpen,
      cancelBatch: ctx.cancelBatch,
    }),

    profilesSidebarProps: buildFilmLabProfilesSidebarProps({
      sidebarRef: ctx.leftSidebarRef,
      categoryTabs: CATEGORY_TABS,
      visibleFilms: ctx.visibleFilms,
      activeFilmIndex: ctx.activeFilmIndex,
      activeCategory: ctx.activeCategory,
      searchQuery: ctx.searchQuery,
      setActiveCategory: ctx.setActiveCategory,
      setSearchQuery: ctx.setSearchQuery,
      selectFilm: ctx.selectFilm,
    }),

    canvasAreaProps: buildFilmLabCanvasAreaProps({
      studioWorkspace: ctx.studioWorkspace,
      canvasAreaRef: ctx.canvasAreaRef,
      hasImage: ctx.hasImage,
      histogramCanvasRef: ctx.histogramCanvasRef,
      canvasCenterRef: ctx.canvasCenterRef,
      canvasStageRef: ctx.canvasStageRef,
      handleCanvasWheel: ctx.handleCanvasWheel,
      rememberZoomAnchor: ctx.rememberZoomAnchor,
      clearZoomAnchor: ctx.clearZoomAnchor,
      hasActiveSource: ctx.hasActiveSource,
      fileInputRef: ctx.fileInputRef,
      pipelineInfo: ctx.pipelineInfo,
      canvasWrapperRef: ctx.canvasWrapperRef,
      isZoomBeyondFit: ctx.isZoomBeyondFit,
      isPanning: ctx.isPanning,
      canvasViewportSize: ctx.canvasViewportSize,
      adjustments: ctx.adjustments,
      setAdjustments: ctx.setAdjustments,
      saveUndo: ctx.saveUndo,
      handleCanvasPointerDown: ctx.handleCanvasPointerDown,
      handleCanvasPointerMove: ctx.handleCanvasPointerMove,
      handleCanvasPointerUp: ctx.handleCanvasPointerUp,
      stopPanDragging: ctx.stopPanDragging,
      handleCanvasDoubleClick: ctx.handleCanvasDoubleClick,
      showBlockingProcessing: ctx.showBlockingProcessing,
      showInlineProcessing: ctx.showInlineProcessing,
      canvasRef: ctx.canvasRef,
      canvasPresentationStyle: ctx.canvasPresentationStyle,
      isPixelPeepZoom: ctx.isPixelPeepZoom,
      cropOverlay: ctx.cropOverlay,
      compareMode: ctx.adjustments.compareMode,
      renderDebug: ctx.renderDebug,
      clearRenderPipelineAlert: ctx.clearRenderPipelineAlert,
      renderPipelineAlert: ctx.renderPipelineAlert,
      showRuntimeStatus: ctx.showRuntimeStatus,
      runtimeStatusBadge: ctx.runtimeStatusBadge,
      qualityStatus: ctx.qualityStatus,
      fallbackExplanation: ctx.fallbackExplanation,
      isMetadataPanelOpen: ctx.isMetadataPanelOpen,
      metadataViewMode: ctx.metadataViewMode,
      metadataViewModeLabels: METADATA_VIEW_MODE_LABEL,
      cycleMetadataViewMode: ctx.cycleMetadataViewMode,
      copyMetadataToClipboard: ctx.copyMetadataToClipboard,
      metadataFeedback: ctx.metadataFeedback,
      displayedMetadataItems: ctx.displayedMetadataItems,
      handleFileUpload: ctx.handleFileUpload,
      developFastPreviewBitmap: ctx.developFastPreviewBitmap ?? null,
      developSmartPreviewBitmap: ctx.developSmartPreviewBitmap ?? null,
      isAdjusting: ctx.isAdjusting ?? false,
    }),

    rightPanelProps: buildFilmLabRightPanelProps({
      rightSidebarRef: ctx.rightSidebarRef,
      panelTabs: PANEL_TABS,
      activePanel: ctx.activePanel,
      onPanelTabChange: ctx.handlePanelTabChange,
      undoAction: ctx.undoAction,
      redoAction: ctx.redoAction,
      undoStackRef: ctx.undoStackRef,
      redoStackRef: ctx.redoStackRef,
      fullHistoryTimeline: ctx.fullHistoryTimeline,
      renderSlider: ctx.renderSlider,
      renderCustomSlider: ctx.renderCustomSlider,
      sliderDefs: SLIDER_DEFS,
      adjustments: ctx.adjustments,
      isInputProfile: ctx.isInputProfile,
      resetAdjustments: ctx.resetAdjustments,
      resetSingleAdjustment: ctx.resetSingleAdjustment,
      updateAdjustment: ctx.updateAdjustment,
      activeCurveCh: ctx.activeCurveCh,
      setActiveCurveCh: ctx.setActiveCurveCh,
      curvesCanvasRef: ctx.curvesCanvasRef,
      handleCurvePointerDown: ctx.handleCurvePointerDown,
      handleCurveDoubleClick: ctx.handleCurveDoubleClick,
      resetCurves: ctx.resetCurves,
      mixerGroups: MIXER_GROUPS,
      mixerColors: MIXER_COLORS,
      activeMixerGroup: ctx.activeMixerGroup,
      setActiveMixerGroup: ctx.setActiveMixerGroup,
      colorMixer: ctx.colorMixer,
      updateMixerValue: ctx.updateMixerValue,
      resetMixerValue: ctx.resetMixerValue,
      resetColorMixer: ctx.resetColorMixer,
      gradeZones: GRADE_ZONES,
      activeGradeZone: ctx.activeGradeZone,
      setActiveGradeZone: ctx.setActiveGradeZone,
      colorGrading: ctx.colorGrading,
      updateColorGradeValue: ctx.updateColorGradeValue,
      resetColorGradeValue: ctx.resetColorGradeValue,
      resetColorGrading: ctx.resetColorGrading,
      saveUndo: ctx.saveUndo,
      setIsAdjusting: ctx.setIsAdjusting,
      setInteractionKind: ctx.setInteractionKind,
      handleSliderEnd: ctx.handleSliderEnd,
      colorCalibration: ctx.colorCalibration,
      updateCalibrationValue: ctx.updateCalibrationValue,
      resetCalibrationValue: ctx.resetCalibrationValue,
      resetColorCalibration: ctx.resetColorCalibration,
      setLeak: ctx.setLeak,
      setFrame: ctx.setFrame,
      triggerDustZip: ctx.triggerDustZip,
      disableDustZip: ctx.disableDustZip,
      triggerRawLeakZip: ctx.triggerRawLeakZip,
      disableRawLeakZip: ctx.disableRawLeakZip,
      cropAspectPresets: CROP_ASPECT_PRESETS,
      activeCropAspectPreset: ctx.activeCropAspectPreset,
      setCropAspectPreset: ctx.setCropAspectPreset,
      activeCropAspect: ctx.activeCropAspect,
      cropOverlayModes: CROP_OVERLAY_MODES,
      activeCropOverlayMode: ctx.activeCropOverlayMode,
      setCropOverlayMode: ctx.setCropOverlayMode,
      cycleCropOverlayMode: ctx.cycleCropOverlayMode,
      rotateCropOverlay: ctx.rotateCropOverlay,
      cancelManualStraighten: ctx.cancelManualStraighten,
      cancelCropDraft: ctx.cancelCropDraft,
      rotateImage: ctx.rotateImage,
      toggleFlip: ctx.toggleFlip,
      isStraightenToolArmed: ctx.isStraightenToolArmed,
      setIsStraightenToolArmed: ctx.setIsStraightenToolArmed,
      beginManualStraightenSession: ctx.beginManualStraightenSession,
      runAutoStraighten: ctx.runAutoStraighten,
      activeCropRectNorm: ctx.activeCropRectNorm,
      hasImage: ctx.hasImage,
      activeFilm: ctx.activeFilm,
    }),

    shortcutHelpProps: buildFilmLabShortcutHelpProps({
      isShortcutHelpOpen: ctx.isShortcutHelpOpen,
      setIsShortcutHelpOpen: ctx.setIsShortcutHelpOpen,
    }),

    sessionRestorePromptProps: buildFilmLabSessionRestorePromptProps({
      sessionRestorePrompt: ctx.sessionRestorePrompt,
      confirmSessionRestore: ctx.confirmSessionRestore,
      declineSessionRestore: ctx.declineSessionRestore,
    }),

    exportModalProps: buildFilmLabExportModalProps({
      isExportModalOpen: ctx.isExportModalOpen,
      pendingBatchFiles: ctx.pendingBatchFiles,
      setIsExportModalOpen: ctx.setIsExportModalOpen,
      setPendingBatchFiles: ctx.setPendingBatchFiles,
      processBatch: ctx.processBatch,
      exportImage: ctx.exportImage,
    }),

    bottomStatusBarProps: {
      studioWorkspace: ctx.studioWorkspace,
      hasActiveSource: ctx.hasActiveSource,
      runtimeStatusBadge: ctx.runtimeStatusBadge,
      previewPathLabel: ctx.previewPathLabel,
      batchState: ctx.batchState,
      adjustments: ctx.adjustments,
    },
  };
}
