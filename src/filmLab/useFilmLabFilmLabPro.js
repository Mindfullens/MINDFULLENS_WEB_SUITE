import { buildFilmLabShellContainerBundleArgs } from './buildFilmLabShellContainerBundleArgs.js';
import { filmLabFilmLabProClusterArgFactories } from './filmLabFilmLabProClusterArgFactories.js';
import { useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster } from './useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster.js';

/**
 * Full Film Lab Pro workbench + shell bundle wiring (invoked from FilmLabPro.jsx).
 */
export function useFilmLabFilmLabPro() {
  const s = useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster({
    ...filmLabFilmLabProClusterArgFactories,
  });

  return {
    shellRef: s.shellRef,
    viewMode: s.viewMode,
    isPreviewFullMode: s.isPreviewFullMode,
    bundleArgs: buildFilmLabShellContainerBundleArgs(s),
  };
}
