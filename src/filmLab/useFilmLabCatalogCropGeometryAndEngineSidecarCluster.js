import { useFilmLabCatalogEngineCropGeometryCluster } from './useFilmLabCatalogEngineCropGeometryCluster.js';
import { useFilmLabEngineSidecar } from './useFilmLabEngineSidecar.js';

/** Film catalog + crop geometry + rendering/metadata sidecar (FilmLabPro cluster). */
export function useFilmLabCatalogCropGeometryAndEngineSidecarCluster({
  catalogEngineCropGeometryArgs,
  engineSidecarArgs,
}) {
  const catalogCrop = useFilmLabCatalogEngineCropGeometryCluster(catalogEngineCropGeometryArgs);

  const engine = useFilmLabEngineSidecar({
    ...engineSidecarArgs,
    activeFilm: catalogCrop.activeFilm,
    engineAdjustments: catalogCrop.engineAdjustments,
    isInputProfile: catalogCrop.isInputProfile,
  });

  return { ...catalogCrop, ...engine };
}
