import { useFilmLabCanvasViewportDebugAndCurveWorkbenchShellOverlayCluster } from './useFilmLabCanvasViewportDebugAndCurveWorkbenchShellOverlayCluster.js';
import { useFilmLabWorkbenchChromeCaptureAndFilmCropStraightenPanelCluster } from './useFilmLabWorkbenchChromeCaptureAndFilmCropStraightenPanelCluster.js';

/**
 * Workbench + chrome + capture + film crop/straighten/panel, then canvas viewport debug + curve/shell overlay (FilmLabPro cluster).
 */
export function useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster({
  buildChromeCatalogViewportArgs,
  buildCaptureUploadUndoWorkbenchClipboardArgs,
  buildFilmViewCropStraightenPanelArgs,
  buildCanvasViewportDebugAndCurveWorkbenchShellOverlayArgs,
}) {
  const core = useFilmLabWorkbenchChromeCaptureAndFilmCropStraightenPanelCluster({
    buildChromeCatalogViewportArgs,
    buildCaptureUploadUndoWorkbenchClipboardArgs,
    buildFilmViewCropStraightenPanelArgs,
  });
  const viewportCurveShell = useFilmLabCanvasViewportDebugAndCurveWorkbenchShellOverlayCluster(
    buildCanvasViewportDebugAndCurveWorkbenchShellOverlayArgs(core)
  );

  return {
    ...core,
    ...viewportCurveShell,
  };
}
