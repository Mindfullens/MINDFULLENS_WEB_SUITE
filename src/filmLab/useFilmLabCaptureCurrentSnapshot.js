import { useCallback } from 'react';
import { cloneSnapshotSafe, createSnapshot } from './sessionSnapshot.js';

export function useFilmLabCaptureCurrentSnapshot({
  activeFilmIndex,
  adjustments,
  userCurves,
  zoomRef,
  panOffsetRef,
  colorMixer,
  colorGrading,
  colorCalibration,
  uploadedFile,
}) {
  return useCallback(() => {
    const snapshot = cloneSnapshotSafe(
      createSnapshot(
        Number.isInteger(activeFilmIndex) ? activeFilmIndex : 0,
        adjustments,
        userCurves,
        zoomRef.current,
        panOffsetRef.current,
        colorMixer,
        colorGrading,
        colorCalibration
      )
    );
    if (snapshot && uploadedFile instanceof File) {
      snapshot.sourceRestoreFile = uploadedFile;
    }
    return snapshot;
  }, [activeFilmIndex, adjustments, colorCalibration, colorGrading, colorMixer, uploadedFile, userCurves]);
}
