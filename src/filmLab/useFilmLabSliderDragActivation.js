import { useCallback, useRef } from 'react';
import { getPointerCoordinates } from './getPointerCoordinates.js';
import {
  SLIDER_DRAG_ACTIVATION_THRESHOLD_PX,
  SLIDER_RELEASE_FAILSAFE_MS,
} from './workbenchConstants.js';

const INITIAL_DRAG_STATE = {
  active: false,
  activated: false,
  kind: 'slider',
  startX: 0,
  startY: 0,
  removeListeners: null,
};

export function useFilmLabSliderDragActivation({
  interactionReleaseTimeoutRef,
  setIsAdjusting,
  setInteractionKind,
}) {
  const sliderReleaseFailsafeTimeoutRef = useRef(null);
  const sliderDragActivationRef = useRef({ ...INITIAL_DRAG_STATE });

  const clearSliderReleaseFailsafe = useCallback(() => {
    if (!sliderReleaseFailsafeTimeoutRef.current) {
      return;
    }

    clearTimeout(sliderReleaseFailsafeTimeoutRef.current);
    sliderReleaseFailsafeTimeoutRef.current = null;
  }, []);

  const stopSliderDragActivationTracking = useCallback(() => {
    const dragState = sliderDragActivationRef.current;

    if (typeof dragState.removeListeners === 'function') {
      dragState.removeListeners();
    }

    sliderDragActivationRef.current = {
      ...dragState,
      active: false,
      activated: false,
      removeListeners: null,
    };
  }, []);

  const scheduleSliderReleaseFailsafe = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    clearSliderReleaseFailsafe();
    sliderReleaseFailsafeTimeoutRef.current = window.setTimeout(() => {
      stopSliderDragActivationTracking();

      if (interactionReleaseTimeoutRef.current) {
        clearTimeout(interactionReleaseTimeoutRef.current);
        interactionReleaseTimeoutRef.current = null;
      }

      setIsAdjusting(false);
      setInteractionKind('idle');
      sliderReleaseFailsafeTimeoutRef.current = null;
    }, SLIDER_RELEASE_FAILSAFE_MS);
  }, [
    clearSliderReleaseFailsafe,
    interactionReleaseTimeoutRef,
    setInteractionKind,
    setIsAdjusting,
    stopSliderDragActivationTracking,
  ]);

  const activateSliderDragIfNeeded = useCallback((event) => {
    const dragState = sliderDragActivationRef.current;

    if (!dragState.active || dragState.activated) {
      return;
    }

    const point = getPointerCoordinates(event);

    if (!point) {
      return;
    }

    const deltaX = point.x - dragState.startX;
    const deltaY = point.y - dragState.startY;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance < SLIDER_DRAG_ACTIVATION_THRESHOLD_PX) {
      return;
    }

    sliderDragActivationRef.current = {
      ...dragState,
      activated: true,
    };

    setInteractionKind(dragState.kind);
    setIsAdjusting(true);
  }, [setInteractionKind, setIsAdjusting]);

  return {
    sliderReleaseFailsafeTimeoutRef,
    sliderDragActivationRef,
    clearSliderReleaseFailsafe,
    scheduleSliderReleaseFailsafe,
    stopSliderDragActivationTracking,
    activateSliderDragIfNeeded,
  };
}
