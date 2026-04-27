import { useFilmLabCropDragAndLayoutEffectsCluster } from './useFilmLabCropDragAndLayoutEffectsCluster.js';
import { useFilmLabFilmViewAndCropRectApplyCluster } from './useFilmLabFilmViewAndCropRectApplyCluster.js';

/** Film view / crop-rect apply + crop drag and layout effects (FilmLabPro cluster). */
export function useFilmLabFilmViewCropRectApplyAndDragLayoutCluster({
  filmViewAndCropRectApplyArgs,
  cropDragAndLayoutEffectsArgs,
}) {
  const filmView = useFilmLabFilmViewAndCropRectApplyCluster(filmViewAndCropRectApplyArgs);

  const cropDrag = useFilmLabCropDragAndLayoutEffectsCluster({
    ...cropDragAndLayoutEffectsArgs,
    setCropLiveRectSafely: filmView.setCropLiveRectSafely,
    applyCropRect: filmView.applyCropRect,
  });

  return { ...filmView, ...cropDrag };
}
