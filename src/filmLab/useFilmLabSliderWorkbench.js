import { useCallback, useRef } from 'react';
import { mapKelvinToTemperature } from '../engine/sliderResponseMap.js';
import { getAdjustmentDefaultValue } from './defaultAdjustments.js';
import { getPointerCoordinates } from './getPointerCoordinates.js';
import { clearFilmLabE2ePointerMark, markFilmLabE2ePointerDown } from './previewE2ePointerMark.js';

export function useFilmLabSliderWorkbench({
  interactionReleaseTimeoutRef,
  sliderDragActivationRef,
  clearSliderReleaseFailsafe,
  stopSliderDragActivationTracking,
  scheduleSliderReleaseFailsafe,
  activateSliderDragIfNeeded,
  saveUndo,
  setAdjustments,
  adjustments,
  isAdjusting,
  setIsAdjusting,
  setInteractionKind,
  activeFilm,
  isInputProfile,
}) {
  const sliderTapTimesRef = useRef({});
  const sliderUpdateFrameRef = useRef(0);
  const pendingSliderUpdatesRef = useRef(new Map());

  const flushSliderUpdates = useCallback(() => {
    sliderUpdateFrameRef.current = 0;
    const queued = Array.from(pendingSliderUpdatesRef.current.values());
    pendingSliderUpdatesRef.current.clear();

    queued.forEach(({ apply, value }) => {
      apply(value);
    });
  }, []);

  const queueSliderUpdate = useCallback(
    (key, apply, value) => {
      pendingSliderUpdatesRef.current.set(key, { apply, value });

      if (sliderUpdateFrameRef.current) {
        return;
      }

      sliderUpdateFrameRef.current = window.requestAnimationFrame(flushSliderUpdates);
    },
    [flushSliderUpdates]
  );

  const updateAdjustment = useCallback(
    (name, value) => {
      setAdjustments((current) => {
        if (current[name] === value) {
          return current;
        }

        return {
          ...current,
          [name]: value,
        };
      });
    },
    [setAdjustments]
  );

  const resetSingleAdjustment = useCallback(
    (name) => {
      saveUndo();
      setAdjustments((current) => ({
        ...current,
        [name]: getAdjustmentDefaultValue(name, activeFilm),
      }));
    },
    [activeFilm, saveUndo, setAdjustments]
  );

  const handleSliderEnd = useCallback(() => {
    clearFilmLabE2ePointerMark();
    clearSliderReleaseFailsafe();
    stopSliderDragActivationTracking();

    if (sliderUpdateFrameRef.current) {
      window.cancelAnimationFrame(sliderUpdateFrameRef.current);
      flushSliderUpdates();
    }

    if (interactionReleaseTimeoutRef.current) {
      clearTimeout(interactionReleaseTimeoutRef.current);
    }
    interactionReleaseTimeoutRef.current = setTimeout(() => {
      setIsAdjusting(false);
      setInteractionKind('idle');
      interactionReleaseTimeoutRef.current = null;
    }, 90);
  }, [
    clearSliderReleaseFailsafe,
    flushSliderUpdates,
    interactionReleaseTimeoutRef,
    setInteractionKind,
    setIsAdjusting,
    stopSliderDragActivationTracking,
  ]);

  const handleSliderStart = useCallback(
    (kind = 'slider', event = null) => {
      saveUndo();
      if (interactionReleaseTimeoutRef.current) {
        clearTimeout(interactionReleaseTimeoutRef.current);
        interactionReleaseTimeoutRef.current = null;
      }
      clearSliderReleaseFailsafe();
      stopSliderDragActivationTracking();

      const point = getPointerCoordinates(event);

      if (point && typeof window !== 'undefined') {
        markFilmLabE2ePointerDown();
      }

      if (!point || typeof window === 'undefined') {
        sliderDragActivationRef.current = {
          ...sliderDragActivationRef.current,
          active: false,
          activated: true,
          kind,
        };
        if (isAdjusting) {
          setInteractionKind(kind);
        }
        return;
      }

      const handleMove = (moveEvent) => {
        activateSliderDragIfNeeded(moveEvent);
        scheduleSliderReleaseFailsafe();
      };
      const handleEnd = () => {
        handleSliderEnd();
      };

      window.addEventListener('mousemove', handleMove, { passive: true });
      window.addEventListener('touchmove', handleMove, { passive: true });
      window.addEventListener('mouseup', handleEnd, { passive: true });
      window.addEventListener('touchend', handleEnd, { passive: true });
      window.addEventListener('touchcancel', handleEnd, { passive: true });
      window.addEventListener('blur', handleEnd, { passive: true });

      sliderDragActivationRef.current = {
        active: true,
        activated: false,
        kind,
        startX: point.x,
        startY: point.y,
        removeListeners: () => {
          window.removeEventListener('mousemove', handleMove);
          window.removeEventListener('touchmove', handleMove);
          window.removeEventListener('mouseup', handleEnd);
          window.removeEventListener('touchend', handleEnd);
          window.removeEventListener('touchcancel', handleEnd);
          window.removeEventListener('blur', handleEnd);
        },
      };

      scheduleSliderReleaseFailsafe();
    },
    [
      activateSliderDragIfNeeded,
      clearSliderReleaseFailsafe,
      handleSliderEnd,
      isAdjusting,
      interactionReleaseTimeoutRef,
      saveUndo,
      scheduleSliderReleaseFailsafe,
      setInteractionKind,
      sliderDragActivationRef,
      stopSliderDragActivationTracking,
    ]
  );

  const handleSliderChange = useCallback(
    (name) => (event) => {
      const nextValue = Number(event.target.value);
      if (Number(adjustments?.[name]) === nextValue) {
        return;
      }
      const dragState = sliderDragActivationRef.current;
      const shouldEnterAdjusting = !dragState.active || dragState.activated;
      if (dragState.active || isAdjusting) {
        scheduleSliderReleaseFailsafe();
      }

      if (shouldEnterAdjusting) {
        setInteractionKind(`slider:${name}`);
        if (!isAdjusting) {
          markFilmLabE2ePointerDown();
          setIsAdjusting(true);
        }
      }
      queueSliderUpdate(
        `adj:${name}`,
        (nextVal) => updateAdjustment(name, nextVal),
        nextValue
      );
    },
    [
      adjustments,
      isAdjusting,
      queueSliderUpdate,
      scheduleSliderReleaseFailsafe,
      setInteractionKind,
      setIsAdjusting,
      sliderDragActivationRef,
      updateAdjustment,
    ]
  );

  const handleTemperatureSliderChange = useCallback(
    (event) => {
      const kelvin = Number(event.target.value);
      const nextValue = mapKelvinToTemperature(kelvin);
      if (Number(adjustments?.temp) === nextValue) {
        return;
      }
      const dragState = sliderDragActivationRef.current;
      const shouldEnterAdjusting = !dragState.active || dragState.activated;
      if (dragState.active || isAdjusting) {
        scheduleSliderReleaseFailsafe();
      }

      if (shouldEnterAdjusting) {
        setInteractionKind('slider:temp');
        if (!isAdjusting) {
          markFilmLabE2ePointerDown();
          setIsAdjusting(true);
        }
      }
      queueSliderUpdate(
        'adj:temp',
        (value) => updateAdjustment('temp', value),
        nextValue
      );
    },
    [
      adjustments?.temp,
      isAdjusting,
      queueSliderUpdate,
      scheduleSliderReleaseFailsafe,
      setInteractionKind,
      setIsAdjusting,
      sliderDragActivationRef,
      updateAdjustment,
    ]
  );

  const handleSliderDoubleClick = useCallback(
    (name) => {
      if (name === 'strength' && isInputProfile) {
        return;
      }

      resetSingleAdjustment(name);
    },
    [isInputProfile, resetSingleAdjustment]
  );

  const handleSliderTouchStart = useCallback(
    (name) => (event) => {
      const now = Date.now();
      const lastTap = sliderTapTimesRef.current[name] ?? 0;

      if (now - lastTap < 320) {
        event.preventDefault();
        sliderTapTimesRef.current[name] = 0;
        handleSliderDoubleClick(name);
        return;
      }

      sliderTapTimesRef.current[name] = now;
      handleSliderStart(`slider:${name}`, event);
    },
    [handleSliderDoubleClick, handleSliderStart]
  );

  const handleCustomSliderTouchStart = useCallback(
    (id, onDoubleTap, interactionKey) => (event) => {
      const now = Date.now();
      const lastTap = sliderTapTimesRef.current[id] ?? 0;

      if (now - lastTap < 320) {
        event.preventDefault();
        sliderTapTimesRef.current[id] = 0;
        onDoubleTap();
        return;
      }

      sliderTapTimesRef.current[id] = now;
      handleSliderStart(interactionKey, event);
    },
    [handleSliderStart]
  );

  return {
    sliderUpdateFrameRef,
    pendingSliderUpdatesRef,
    flushSliderUpdates,
    queueSliderUpdate,
    updateAdjustment,
    resetSingleAdjustment,
    handleSliderStart,
    handleSliderEnd,
    handleSliderChange,
    handleTemperatureSliderChange,
    handleSliderDoubleClick,
    handleSliderTouchStart,
    handleCustomSliderTouchStart,
  };
}
