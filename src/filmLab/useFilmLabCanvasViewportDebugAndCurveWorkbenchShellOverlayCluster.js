import { useFilmLabCanvasViewportWithDebugKeydownUnmountCluster } from './useFilmLabCanvasViewportWithDebugKeydownUnmountCluster.js';
import { useFilmLabCurveWorkbenchShellOverlayCluster } from './useFilmLabCurveWorkbenchShellOverlayCluster.js';

/**
 * Canvas viewport (identity, overlay, debug/keydown/unmount) then curve workbench + shell overlay (FilmLabPro cluster).
 * Merges viewport-derived overlay fields into shellOverlayPropsArgs so callers do not repeat them.
 */
export function useFilmLabCanvasViewportDebugAndCurveWorkbenchShellOverlayCluster({
  canvasViewportWithDebugArgs,
  curveWorkbenchShellOverlayArgs,
}) {
  const viewport = useFilmLabCanvasViewportWithDebugKeydownUnmountCluster(canvasViewportWithDebugArgs);

  const workbench = useFilmLabCurveWorkbenchShellOverlayCluster({
    ...curveWorkbenchShellOverlayArgs,
    shellOverlayPropsArgs: {
      ...curveWorkbenchShellOverlayArgs.shellOverlayPropsArgs,
      shouldRenderCropOverlay: viewport.shouldRenderCropOverlay,
      canvasPresentationStyle: viewport.canvasPresentationStyle,
      isOverlayInteractionEnabled: viewport.isOverlayInteractionEnabled,
    },
  });

  return {
    ...viewport,
    ...workbench,
  };
}
