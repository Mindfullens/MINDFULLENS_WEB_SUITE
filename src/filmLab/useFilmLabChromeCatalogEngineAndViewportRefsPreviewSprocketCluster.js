import { useFilmLabChromeLayoutAndCatalogEngineCluster } from './useFilmLabChromeLayoutAndCatalogEngineCluster.js';
import { useFilmLabViewportRefsPreviewSourceSprocketCluster } from './useFilmLabViewportRefsPreviewSourceSprocketCluster.js';

/**
 * Chrome + catalog/engine/sidecar, then viewport ref sync + preview/source effects + sprocket cleanup (FilmLabPro cluster).
 * Injects catalog outputs (canvas ref, image readiness, render epoch) into the preview stack so callers do not thread them manually.
 */
export function useFilmLabChromeCatalogEngineAndViewportRefsPreviewSprocketCluster({
  chromeCatalogEngineArgs,
  viewportRefsPreviewSprocketArgs,
}) {
  const chromeCatalogEngine = useFilmLabChromeLayoutAndCatalogEngineCluster(chromeCatalogEngineArgs);

  useFilmLabViewportRefsPreviewSourceSprocketCluster({
    ...viewportRefsPreviewSprocketArgs,
    canvasRef: chromeCatalogEngine.canvasRef,
    hasImage: chromeCatalogEngine.hasImage,
    renderVersion: chromeCatalogEngine.renderVersion,
  });

  return chromeCatalogEngine;
}
