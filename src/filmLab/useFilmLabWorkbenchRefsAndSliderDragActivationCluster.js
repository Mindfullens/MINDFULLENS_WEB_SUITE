import { useFilmLabSliderDragActivation } from './useFilmLabSliderDragActivation.js';
import { useFilmLabWorkbenchRefs } from './useFilmLabWorkbenchRefs.js';

/** DOM/session refs for the workbench + slider pointer-activation helpers (FilmLabPro cluster). */
export function useFilmLabWorkbenchRefsAndSliderDragActivationCluster({ setIsAdjusting, setInteractionKind }) {
  const refs = useFilmLabWorkbenchRefs();

  const sliderDragActivation = useFilmLabSliderDragActivation({
    interactionReleaseTimeoutRef: refs.interactionReleaseTimeoutRef,
    setIsAdjusting,
    setInteractionKind,
  });

  return { ...refs, ...sliderDragActivation };
}
