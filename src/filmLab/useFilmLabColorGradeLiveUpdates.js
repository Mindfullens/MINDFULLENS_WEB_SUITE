import { useCallback } from 'react';

export function useFilmLabColorGradeLiveUpdates({
  setColorMixer,
  setColorGrading,
  setColorCalibration,
}) {
  const updateMixerValue = useCallback(
    (group, key, value) => {
      setColorMixer((current) => {
        if (current[group]?.[key] === value) {
          return current;
        }

        return {
          ...current,
          [group]: {
            ...current[group],
            [key]: value,
          },
        };
      });
    },
    [setColorMixer]
  );

  const updateColorGradeValue = useCallback(
    (zone, key, value) => {
      setColorGrading((current) => {
        if (zone === 'meta') {
          if (current[key] === value) {
            return current;
          }

          return {
            ...current,
            [key]: value,
          };
        }

        if (current[zone]?.[key] === value) {
          return current;
        }

        return {
          ...current,
          [zone]: {
            ...current[zone],
            [key]: value,
          },
        };
      });
    },
    [setColorGrading]
  );

  const updateCalibrationValue = useCallback(
    (channel, key, value) => {
      setColorCalibration((current) => {
        if (channel === 'meta') {
          if (current[key] === value) {
            return current;
          }

          return {
            ...current,
            [key]: value,
          };
        }

        if (current[channel]?.[key] === value) {
          return current;
        }

        return {
          ...current,
          [channel]: {
            ...current[channel],
            [key]: value,
          },
        };
      });
    },
    [setColorCalibration]
  );

  return { updateMixerValue, updateColorGradeValue, updateCalibrationValue };
}
