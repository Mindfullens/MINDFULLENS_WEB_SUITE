import { useEffect } from 'react';

/** On unmount: clear slider/pointer timers, cancel pending slider RAF work, end pan drag, stop straighten drag. */
export function useFilmLabUnmountCleanup({
  interactionReleaseTimeoutRef,
  sliderReleaseFailsafeTimeoutRef,
  stopSliderDragActivationTracking,
  sliderUpdateFrameRef,
  pendingSliderUpdatesRef,
  panDragRef,
  stopStraightenDrag,
}) {
  useEffect(
    () => () => {
      if (interactionReleaseTimeoutRef.current) {
        clearTimeout(interactionReleaseTimeoutRef.current);
      }
      if (sliderReleaseFailsafeTimeoutRef.current) {
        clearTimeout(sliderReleaseFailsafeTimeoutRef.current);
      }
      stopSliderDragActivationTracking();

      if (sliderUpdateFrameRef.current) {
        window.cancelAnimationFrame(sliderUpdateFrameRef.current);
        sliderUpdateFrameRef.current = 0;
      }
      pendingSliderUpdatesRef.current.clear();
      panDragRef.current.active = false;
      stopStraightenDrag();
    },
    [stopStraightenDrag]
  );
}
