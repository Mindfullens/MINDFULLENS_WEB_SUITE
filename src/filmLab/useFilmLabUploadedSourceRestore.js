import { useCallback } from 'react';
import { filmStocks } from '../engine/filmProfiles.js';
import {
  cloneCalibrationState,
  cloneColorGradeState,
  cloneHslState,
} from './colorGradingState.js';
import { DEFAULT_ADJUSTMENTS, getFilmGrainDefaults } from './defaultAdjustments.js';
import { getDisplayFilm } from './displayFilm.js';
import { cloneCurvesSafe } from './sessionSnapshot.js';
import { FIT_UI_ZOOM, ZOOM_MODE } from './viewportZoom.js';

export function useFilmLabUploadedSourceRestore({
  restoreSnapshotRef,
  activePanel,
  setUploadedFile,
  setImageUrl,
  setActivePanel,
  setZoomMode,
  setPreferFullResPreview,
  zoomRef,
  panOffsetRef,
  setZoom,
  setPanOffset,
  setAdjustments,
  setActiveFilmIndex,
  setUserCurves,
  setColorMixer,
  setColorGrading,
  setColorCalibration,
}) {
  const applyUploadedSource = useCallback(
    (file, { targetPanel = null, preserveLook = false } = {}) => {
      if (!file) {
        return;
      }

      setUploadedFile(file);
      setImageUrl((currentUrl) => {
        if (currentUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(currentUrl);
        }

        return URL.createObjectURL(file);
      });
      const resetPan = { x: 0, y: 0 };
      if (typeof targetPanel === 'string' && targetPanel.length > 0) {
        setActivePanel(targetPanel);
      }
      setZoomMode(ZOOM_MODE.CLASSIC);
      setPreferFullResPreview(false);
      zoomRef.current = FIT_UI_ZOOM;
      panOffsetRef.current = resetPan;
      setZoom(FIT_UI_ZOOM);
      setPanOffset(resetPan);

      if (preserveLook) {
        setAdjustments((current) => ({
          ...current,
          cropRectX: 0,
          cropRectY: 0,
          cropRectW: 1,
          cropRectH: 1,
          cropZoom: 100,
          cropX: 0,
          cropY: 0,
          rotation: 0,
          flipped: false,
          compareMode: false,
          compareX: 0.5,
        }));
        return;
      }

      const inputFilm = getDisplayFilm(filmStocks[0], 0);
      const grainDefaults = getFilmGrainDefaults(inputFilm);
      setActiveFilmIndex(0);
      setAdjustments({
        ...DEFAULT_ADJUSTMENTS,
        userGrain: grainDefaults.amount,
        userGrainSize: grainDefaults.size,
        rotation: 0,
        compareMode: false,
        compareX: 0.5,
      });
    },
    [setPreferFullResPreview]
  );

  const restoreSnapshot = useCallback(
    (snapshot, { keepCurrentPanel = true, fileTargetPanel = null } = {}) => {
      if (!snapshot) {
        return;
      }
      if (snapshot.sourceRestoreFile instanceof File) {
        const panel =
          typeof fileTargetPanel === 'string' && fileTargetPanel.length > 0
            ? fileTargetPanel
            : keepCurrentPanel
              ? activePanel
              : 'basic';
        applyUploadedSource(snapshot.sourceRestoreFile, {
          targetPanel: panel,
          preserveLook: true,
        });
      }

      setActiveFilmIndex(snapshot.activeFilmIndex);
      setAdjustments(snapshot.adjustments);
      setUserCurves(cloneCurvesSafe(snapshot.userCurves));
      setColorMixer(cloneHslState(snapshot.colorMixer));
      setColorGrading(cloneColorGradeState(snapshot.colorGrading));
      setColorCalibration(cloneCalibrationState(snapshot.colorCalibration));
      zoomRef.current = snapshot.zoom;
      setZoom(snapshot.zoom);
      const restoredPan = snapshot.panOffset ?? { x: 0, y: 0 };
      panOffsetRef.current = restoredPan;
      setPanOffset(restoredPan);
    },
    [activePanel, applyUploadedSource]
  );

  restoreSnapshotRef.current = restoreSnapshot;

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    applyUploadedSource(file, { targetPanel: 'basic' });
  };

  return { applyUploadedSource, restoreSnapshot, handleFileUpload };
}
