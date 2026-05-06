import { useMemo } from 'react';

export function useFilmLabEngineAdjustments({
  activePanel,
  adjustments,
  userCurves,
  colorMixer,
  colorGrading,
  colorCalibration,
  isAdjusting,
  interactionKind,
  isInputProfile,
}) {
  const engineAdjustments = useMemo(
    () => ({
      ...adjustments,
      strength: isInputProfile ? 0 : adjustments.strength,
      userCurves,
      userHsl: colorMixer,
      userColorGrade: colorGrading,
      userCalibration: colorCalibration,
      // In crop panel we preview against the full frame and edit the crop box non-destructively.
      cropBypass: activePanel === 'crop',
      isAdjusting,
      interactionKind:
        adjustments?.enginePreviewInteractionKind ??
        (isAdjusting ? interactionKind : 'idle'),
    }),
    [
      activePanel,
      adjustments,
      colorCalibration,
      colorGrading,
      colorMixer,
      interactionKind,
      isAdjusting,
      isInputProfile,
      userCurves,
    ]
  );

  return { engineAdjustments };
}
