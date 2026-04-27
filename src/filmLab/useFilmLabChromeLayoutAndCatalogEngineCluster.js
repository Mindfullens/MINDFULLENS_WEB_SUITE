import { useFilmLabCatalogCropGeometryAndEngineSidecarCluster } from './useFilmLabCatalogCropGeometryAndEngineSidecarCluster.js';
import { useFilmLabChromeLayoutAndCropStraightenRefCluster } from './useFilmLabChromeLayoutAndCropStraightenRefCluster.js';

/**
 * Chrome layout + crop/straighten live refs, then catalog/crop geometry + engine sidecar (FilmLabPro cluster).
 * Chrome runs first so layout measurement stays aligned with the same render as live crop/straighten refs.
 */
export function useFilmLabChromeLayoutAndCatalogEngineCluster({
  chromeLayoutStraightenArgs,
  catalogCropGeometryEngineSidecarArgs,
}) {
  const chromeLayout = useFilmLabChromeLayoutAndCropStraightenRefCluster(chromeLayoutStraightenArgs);
  const catalogEngine = useFilmLabCatalogCropGeometryAndEngineSidecarCluster(catalogCropGeometryEngineSidecarArgs);

  return {
    ...chromeLayout,
    ...catalogEngine,
  };
}
