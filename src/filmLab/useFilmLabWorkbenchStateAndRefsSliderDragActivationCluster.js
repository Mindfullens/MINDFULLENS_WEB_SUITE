import { useFilmLabWorkbenchRefsAndSliderDragActivationCluster } from './useFilmLabWorkbenchRefsAndSliderDragActivationCluster.js';
import { useFilmLabWorkbenchStateAndRawPipelineCluster } from './useFilmLabWorkbenchStateAndRawPipelineCluster.js';

/**
 * Workbench UI/state + RAW pipeline prefs, then refs + slider drag activation (FilmLabPro cluster).
 */
export function useFilmLabWorkbenchStateAndRefsSliderDragActivationCluster() {
  const workbenchState = useFilmLabWorkbenchStateAndRawPipelineCluster();
  const workbenchRefs = useFilmLabWorkbenchRefsAndSliderDragActivationCluster({
    setIsAdjusting: workbenchState.setIsAdjusting,
    setInteractionKind: workbenchState.setInteractionKind,
  });

  return {
    ...workbenchState,
    ...workbenchRefs,
  };
}
