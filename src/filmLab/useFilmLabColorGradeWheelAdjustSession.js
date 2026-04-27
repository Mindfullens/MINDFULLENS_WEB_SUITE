import { useCallback } from 'react';
import { markFilmLabE2ePointerDown } from './previewE2ePointerMark.js';

/**
 * Gradacja (strefa ≠ `global`) — kółko 2D (`ColorWheel`); dopina ten sam rytm co suwaki:
 * undo, `isAdjusting`, `slider:grade-*`, E2E v3, `handleSliderEnd` na zwolnienie.
 */
export function useFilmLabColorGradeWheelAdjustSession({
  activeGradeZone,
  saveUndo,
  setIsAdjusting,
  setInteractionKind,
  handleSliderEnd,
}) {
  const onColorWheelSessionStart = useCallback(() => {
    saveUndo();
    setIsAdjusting(true);
    setInteractionKind(`slider:grade-${activeGradeZone}-wheel`);
    markFilmLabE2ePointerDown();
  }, [activeGradeZone, saveUndo, setIsAdjusting, setInteractionKind]);

  const onColorWheelSessionEnd = useCallback(() => {
    handleSliderEnd();
  }, [handleSliderEnd]);

  return { onColorWheelSessionStart, onColorWheelSessionEnd };
}
