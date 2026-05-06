import { useFilmLabPanelNavigation } from './useFilmLabPanelNavigation.js';
import { useFilmLabStraightenDragAndOutsideCropResetCluster } from './useFilmLabStraightenDragAndOutsideCropResetCluster.js';
import { useFilmLabStudioWorkspace } from './useFilmLabStudioWorkspace.js';

/**
 * Straighten drag + leaving-crop teardown, then last non-crop panel tracking + tab handler (FilmLabPro cluster).
 */
export function useFilmLabStraightenDragOutsideCropAndPanelNavigationCluster({
  straightenDragOutsideCropArgs,
  panelNavigationArgs,
  studioWorkspaceArgs,
}) {
  const straighten = useFilmLabStraightenDragAndOutsideCropResetCluster(straightenDragOutsideCropArgs);
  const panel = useFilmLabPanelNavigation(panelNavigationArgs);
  const studioWorkspaceNav = useFilmLabStudioWorkspace(studioWorkspaceArgs);

  return {
    ...straighten,
    ...panel,
    ...studioWorkspaceNav,
  };
}
