import { useCallback } from 'react';
import { cloneCurves } from './curvesCanvas.js';
import {
  createZeroCalibrationState,
  createZeroColorGradeState,
  createZeroHslState,
} from './colorGradingState.js';
import { DEFAULT_ADJUSTMENTS, getAdjustmentDefaultValue, getFilmGrainDefaults } from './defaultAdjustments.js';
import { DEFAULT_CURVES } from './defaultCurves.js';
import { getDisplayFilm } from './displayFilm.js';
import {
  DUST_ZIP_DEFAULT_STRENGTH,
  DUST_ZIP_VARIANTS,
  FILMSTRIP_ZIP_VARIANTS,
  getNextRandomVariant,
  RAW_LEAK_ZIP_VARIANTS,
} from './overlayZipVariants.js';
import { FIT_UI_ZOOM } from './viewportZoom.js';

export function useFilmLabWorkbenchUndoAwareActions({
  saveUndo,
  activeFilm,
  activeCurveCh,
  filmStocks,
  setActiveFilmIndex,
  setAdjustments,
  setUserCurves,
  setColorMixer,
  setColorGrading,
  setColorCalibration,
  setPreferFullResPreview,
  zoomRef,
  panOffsetRef,
  setZoom,
  setPanOffset,
  undoAction,
  redoAction,
  updateAdjustment,
}) {
  const resetAdjustments = useCallback(
    (names) => {
      saveUndo();
      setAdjustments((current) => {
        const next = { ...current };

        names.forEach((name) => {
          next[name] = getAdjustmentDefaultValue(name, activeFilm);
        });

        return next;
      });
    },
    [activeFilm, saveUndo, setAdjustments]
  );

  const resetCurves = useCallback(() => {
    saveUndo();
    setUserCurves(cloneCurves(DEFAULT_CURVES));
    setAdjustments((current) => ({
      ...current,
      curveLumaMix: DEFAULT_ADJUSTMENTS.curveLumaMix,
    }));
  }, [saveUndo, setAdjustments, setUserCurves]);

  const resetColorMixer = useCallback(() => {
    saveUndo();
    setColorMixer(createZeroHslState());
  }, [saveUndo, setColorMixer]);

  const resetColorGrading = useCallback(() => {
    saveUndo();
    setColorGrading(createZeroColorGradeState());
  }, [saveUndo, setColorGrading]);

  const resetColorCalibration = useCallback(() => {
    saveUndo();
    setColorCalibration(createZeroCalibrationState());
  }, [saveUndo, setColorCalibration]);

  const resetCurveChannel = useCallback(
    (channel = activeCurveCh) => {
      saveUndo();
      setUserCurves((current) => ({
        ...current,
        [channel]: DEFAULT_CURVES[channel].map((point) => [...point]),
      }));
    },
    [activeCurveCh, saveUndo, setUserCurves]
  );

  const resetToOriginal = useCallback(() => {
    saveUndo();
    const inputFilm = getDisplayFilm(filmStocks[0], 0);
    const grainDefaults = getFilmGrainDefaults(inputFilm);
    const resetPan = { x: 0, y: 0 };
    setActiveFilmIndex(0);
    setAdjustments({
      ...DEFAULT_ADJUSTMENTS,
      userGrain: grainDefaults.amount,
      userGrainSize: grainDefaults.size,
    });
    setUserCurves(cloneCurves(DEFAULT_CURVES));
    setColorMixer(createZeroHslState());
    setColorGrading(createZeroColorGradeState());
    setColorCalibration(createZeroCalibrationState());
    setPreferFullResPreview(false);
    zoomRef.current = FIT_UI_ZOOM;
    panOffsetRef.current = resetPan;
    setZoom(FIT_UI_ZOOM);
    setPanOffset(resetPan);
  }, [
    filmStocks,
    saveUndo,
    setActiveFilmIndex,
    setAdjustments,
    setColorCalibration,
    setColorGrading,
    setColorMixer,
    setPanOffset,
    setPreferFullResPreview,
    setUserCurves,
    setZoom,
    panOffsetRef,
    zoomRef,
  ]);

  const handleToolbarUndo = useCallback(() => {
    undoAction();
  }, [undoAction]);

  const handleToolbarRedo = useCallback(() => {
    redoAction();
  }, [redoAction]);

  const handleToolbarReset = useCallback(() => {
    resetToOriginal();
  }, [resetToOriginal]);

  const setLeak = useCallback(
    (type) => {
      saveUndo();
      updateAdjustment('leak', type);
    },
    [saveUndo, updateAdjustment]
  );

  const triggerDustZip = useCallback(() => {
    saveUndo();
    setAdjustments((current) => ({
      ...current,
      dust: Math.max(current.dust ?? 0, DUST_ZIP_DEFAULT_STRENGTH),
      dustVariant: getNextRandomVariant(current.dustVariant ?? -1, DUST_ZIP_VARIANTS),
      dustCycle: (current.dustCycle ?? 0) + 1,
    }));
  }, [saveUndo, setAdjustments]);

  const disableDustZip = useCallback(() => {
    saveUndo();
    setAdjustments((current) => ({
      ...current,
      dust: 0,
      dustVariant: -1,
    }));
  }, [saveUndo, setAdjustments]);

  const triggerRawLeakZip = useCallback(() => {
    saveUndo();
    setAdjustments((current) => ({
      ...current,
      leak: 'raw-leakedge',
      rawLeakVariant: getNextRandomVariant(current.rawLeakVariant ?? -1, RAW_LEAK_ZIP_VARIANTS),
      rawLeakCycle: (current.rawLeakCycle ?? 0) + 1,
    }));
  }, [saveUndo, setAdjustments]);

  const disableRawLeakZip = useCallback(() => {
    saveUndo();
    setAdjustments((current) => ({
      ...current,
      leak: current.leak === 'raw-leakedge' ? 'none' : current.leak,
      rawLeakVariant: current.leak === 'raw-leakedge' ? -1 : current.rawLeakVariant,
    }));
  }, [saveUndo, setAdjustments]);

  const setFrame = useCallback(
    (type) => {
      saveUndo();

      if (type === 'filmstrip') {
        setAdjustments((current) => ({
          ...current,
          frame: 'filmstrip',
          frameVariant: getNextRandomVariant(current.frameVariant ?? -1, FILMSTRIP_ZIP_VARIANTS),
          frameCycle: (current.frameCycle ?? 0) + 1,
        }));
        return;
      }

      setAdjustments((current) => ({
        ...current,
        frame: type,
        frameVariant: -1,
      }));
    },
    [saveUndo, setAdjustments]
  );

  const resetMixerValue = useCallback(
    (group, key) => {
      saveUndo();
      setColorMixer((current) => ({
        ...current,
        [group]: {
          ...current[group],
          [key]: 0,
        },
      }));
    },
    [saveUndo, setColorMixer]
  );

  const resetColorGradeValue = useCallback(
    (zone, key) => {
      saveUndo();
      setColorGrading((current) => {
        if (zone === 'meta') {
          return {
            ...current,
            [key]: key === 'blending' ? 50 : 0,
          };
        }

        return {
          ...current,
          [zone]: {
            ...current[zone],
            [key]: 0,
          },
        };
      });
    },
    [saveUndo, setColorGrading]
  );

  const resetCalibrationValue = useCallback(
    (channel, key) => {
      saveUndo();
      setColorCalibration((current) => {
        if (channel === 'meta') {
          return {
            ...current,
            [key]: 0,
          };
        }

        return {
          ...current,
          [channel]: {
            ...current[channel],
            [key]: 0,
          },
        };
      });
    },
    [saveUndo, setColorCalibration]
  );

  return {
    resetAdjustments,
    resetCurves,
    resetColorMixer,
    resetColorGrading,
    resetColorCalibration,
    resetCurveChannel,
    resetToOriginal,
    handleToolbarUndo,
    handleToolbarRedo,
    handleToolbarReset,
    setLeak,
    triggerDustZip,
    disableDustZip,
    triggerRawLeakZip,
    disableRawLeakZip,
    setFrame,
    resetMixerValue,
    resetColorGradeValue,
    resetCalibrationValue,
  };
}
