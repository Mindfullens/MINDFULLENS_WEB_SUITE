import { useFilmLabChromeCatalogEngineAndViewportRefsPreviewSprocketCluster } from './useFilmLabChromeCatalogEngineAndViewportRefsPreviewSprocketCluster.js';
import { useFilmLabWorkbenchStateAndRefsSliderDragActivationCluster } from './useFilmLabWorkbenchStateAndRefsSliderDragActivationCluster.js';

/**
 * Workbench state/refs/slider-drag, then chrome + catalog + viewport preview stack (FilmLabPro cluster).
 * `buildChromeCatalogViewportArgs` receives the workbench bundle and returns args for the chrome+viewport cluster.
 */
export function useFilmLabWorkbenchStateRefsAndChromeCatalogViewportPreviewSprocketCluster(
  buildChromeCatalogViewportArgs
) {
  const workbench = useFilmLabWorkbenchStateAndRefsSliderDragActivationCluster();
  const chromeCatalogViewport = useFilmLabChromeCatalogEngineAndViewportRefsPreviewSprocketCluster(
    buildChromeCatalogViewportArgs(workbench)
  );

  return {
    ...workbench,
    ...chromeCatalogViewport,
  };
}
