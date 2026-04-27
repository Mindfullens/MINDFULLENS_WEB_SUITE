import { useFilmLabPanelNavigation } from './useFilmLabPanelNavigation.js';
import { useFilmLabStraightenDragAndOutsideCropResetCluster } from './useFilmLabStraightenDragAndOutsideCropResetCluster.js';

/**
 * Straighten drag + leaving-crop teardown, then last non-crop panel tracking + tab handler (FilmLabPro cluster).
 */
export function useFilmLabStraightenDragOutsideCropAndPanelNavigationCluster({
  straightenDragOutsideCropArgs,
  panelNavigationArgs,
}) {
  const straighten = useFilmLabStraightenDragAndOutsideCropResetCluster(straightenDragOutsideCropArgs);
  const panel = useFilmLabPanelNavigation(panelNavigationArgs);

  return {
    ...straighten,
    ...panel,
  };
}
