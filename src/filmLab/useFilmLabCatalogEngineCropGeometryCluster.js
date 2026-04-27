import { useFilmLabCropDerivedGeometry } from './useFilmLabCropDerivedGeometry.js';
import { useFilmLabEngineAdjustments } from './useFilmLabEngineAdjustments.js';
import { useFilmLabFilmCatalog } from './useFilmLabFilmCatalog.js';

/** Active film list, engine adjustment payload, then crop overlay geometry (order preserves isInputProfile wiring). */
export function useFilmLabCatalogEngineCropGeometryCluster({
  filmCatalogArgs,
  engineAdjustmentsArgs,
  cropDerivedGeometryArgs,
}) {
  const { activeFilm, isInputProfile, visibleFilms } = useFilmLabFilmCatalog(filmCatalogArgs);
  const { engineAdjustments } = useFilmLabEngineAdjustments({
    ...engineAdjustmentsArgs,
    isInputProfile,
  });
  const cropDerived = useFilmLabCropDerivedGeometry(cropDerivedGeometryArgs);

  return {
    activeFilm,
    isInputProfile,
    visibleFilms,
    engineAdjustments,
    ...cropDerived,
  };
}
