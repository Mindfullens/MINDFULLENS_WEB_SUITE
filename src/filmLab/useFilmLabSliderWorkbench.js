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
    const entries = Array.from(pendingSliderUpdatesRef.current.entries());
    pendingSliderUpdatesRef.current.clear();
    if (entries.length === 0) {
      return;
    }

    /** Jedna aktualizacja stanu dla wszystkich suwaków `adj:*` w tej klatce — mniej przejść React + silnika. */
    const adjPatches = [];
    const customCalls = [];
    for (const [key, { apply, value }] of entries) {
      if (key.startsWith('adj:')) {
        adjPatches.push({ name: key.slice(4), value });
      } else {
        customCalls.push({ apply, value });
      }
    }

    if (adjPatches.length > 0) {
      setAdjustments((current) => {
        let next = current;
        let mutated = false;
        for (const { name, value: v } of adjPatches) {
          if (current[name] !== v) {
            if (!mutated) {
              next = { ...current };
              mutated = true;
            }
            next[name] = v;
          }
        }
        return mutated ? next : current;
      });
    }

    for (const { apply, value } of customCalls) {
      apply(value);
    }
  }, [setAdjustments]);

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
    (event, name = 'temp') => {
      const kelvin = Number(event.target.value);
      const nextValue = mapKelvinToTemperature(kelvin);
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
      queueSliderUpdate(`adj:${name}`, (value) => updateAdjustment(name, value), nextValue);
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
