import { buildFilmLabShellContainerBundleArgs } from './buildFilmLabShellContainerBundleArgs.js';
import { filmLabFilmLabProClusterArgFactories } from './filmLabFilmLabProClusterArgFactories.js';
import { useFilmLabCatalogProLibraryWorkspace } from './useFilmLabCatalogProLibraryWorkspace.js';
import { useFilmLabLocalMaskWorkbench } from './useFilmLabLocalMaskWorkbench.js';
import { useFilmLabMaskStudioUrlSync } from './useFilmLabMaskStudioUrlSync.js';
import { useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster } from './useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster.js';

/**
 * Full Film Lab Pro workbench + shell bundle wiring (invoked from FilmLabPro.jsx).
 */
export function useFilmLabFilmLabPro() {
  const s = useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster({
    ...filmLabFilmLabProClusterArgFactories,
  });

  const maskWorkbench = useFilmLabLocalMaskWorkbench({
    adjustments: s.adjustments,
    updateAdjustment: s.updateAdjustment,
    resetAdjustments: s.resetAdjustments,
    hasImage: s.hasImage,
    activeCropRectNorm: s.activeCropRectNorm,
    renderSlider: s.renderSlider,
    depthOnnxInferenceUi: s.depthOnnxInferenceUi,
  });
  const libraryWorkspace = useFilmLabCatalogProLibraryWorkspace({
    uploadedFile: s.uploadedFile,
    hasImage: s.hasImage,
    exifMeta: s.exifMeta,
    imageMeta: s.imageMeta,
  });

  useFilmLabMaskStudioUrlSync({
    studioWorkspace: s.studioWorkspace,
    maskStudioBuilderSection: s.adjustments?.maskStudioBuilderSection,
    updateAdjustment: s.updateAdjustment,
  });

  return {
    shellRef: s.shellRef,
    viewMode: s.viewMode,
    isPreviewFullMode: s.isPreviewFullMode,
    bundleArgs: buildFilmLabShellContainerBundleArgs({ ...s, maskWorkbench, libraryWorkspace }),
  };
}
