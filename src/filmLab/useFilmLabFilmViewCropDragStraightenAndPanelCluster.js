import { useFilmLabFilmViewCropRectApplyAndDragLayoutCluster } from './useFilmLabFilmViewCropRectApplyAndDragLayoutCluster.js';
import { useFilmLabStraightenDragOutsideCropAndPanelNavigationCluster } from './useFilmLabStraightenDragOutsideCropAndPanelNavigationCluster.js';

/**
 * Film/crop rect apply + drag/layout, then straighten + panel navigation (FilmLabPro cluster).
 * Wires crop handlers into straighten args so callers do not repeat film-view outputs.
 */
export function useFilmLabFilmViewCropDragStraightenAndPanelCluster({
  filmViewCropRectApplyAndDragLayoutArgs,
  straightenPanelArgs,
}) {
  const filmView = useFilmLabFilmViewCropRectApplyAndDragLayoutCluster(filmViewCropRectApplyAndDragLayoutArgs);

  const { straightenDragOutsideCropArgs, panelNavigationArgs, studioWorkspaceArgs } = straightenPanelArgs;

  const straightenPanel = useFilmLabStraightenDragOutsideCropAndPanelNavigationCluster({
    straightenDragOutsideCropArgs: {
      ...straightenDragOutsideCropArgs,
      getCropNormPoint: filmView.getCropNormPoint,
      stopCropDrag: filmView.stopCropDrag,
    },
    panelNavigationArgs,
    studioWorkspaceArgs,
  });

  return {
    ...filmView,
    ...straightenPanel,
  };
}
