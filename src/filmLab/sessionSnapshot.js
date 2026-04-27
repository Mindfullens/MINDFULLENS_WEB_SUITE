import { cloneCurves } from './curvesCanvas.js';
import {
  cloneCalibrationState,
  cloneColorGradeState,
  cloneHslState,
} from './colorGradingState.js';
import { DEFAULT_ADJUSTMENTS } from './defaultAdjustments.js';
import { DEFAULT_CURVES } from './defaultCurves.js';
import { FIT_UI_ZOOM } from './viewportZoom.js';

export function createSnapshot(
  activeFilmIndex,
  adjustments,
  userCurves,
  zoom,
  panOffset,
  colorMixer,
  colorGrading,
  colorCalibration
) {
  return {
    activeFilmIndex,
    adjustments: { ...adjustments },
    userCurves: cloneCurves(userCurves),
    colorMixer: cloneHslState(colorMixer),
    colorGrading: cloneColorGradeState(colorGrading),
    colorCalibration: cloneCalibrationState(colorCalibration),
    zoom,
    panOffset: { ...panOffset },
  };
}

export function cloneCurvesSafe(curves) {
  try {
    return cloneCurves(curves ?? DEFAULT_CURVES);
  } catch {
    return cloneCurves(DEFAULT_CURVES);
  }
}

export function cloneSnapshotSafe(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const normalizedPan =
    snapshot.panOffset && typeof snapshot.panOffset === 'object'
      ? snapshot.panOffset
      : { x: 0, y: 0 };
  const zoom = Number(snapshot.zoom);
  const clone = {
    activeFilmIndex: Number.isInteger(snapshot.activeFilmIndex) ? snapshot.activeFilmIndex : 0,
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      ...(snapshot.adjustments && typeof snapshot.adjustments === 'object'
        ? snapshot.adjustments
        : {}),
    },
    userCurves: cloneCurvesSafe(snapshot.userCurves),
    colorMixer: cloneHslState(snapshot.colorMixer),
    colorGrading: cloneColorGradeState(snapshot.colorGrading),
    colorCalibration: cloneCalibrationState(snapshot.colorCalibration),
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : FIT_UI_ZOOM,
    panOffset: {
      x: Number.isFinite(Number(normalizedPan.x)) ? Number(normalizedPan.x) : 0,
      y: Number.isFinite(Number(normalizedPan.y)) ? Number(normalizedPan.y) : 0,
    },
  };

  if (snapshot.sourceRestoreFile instanceof File) {
    clone.sourceRestoreFile = snapshot.sourceRestoreFile;
  }

  return clone;
}

export function cloneSnapshotStackSafe(stack, limit = 20) {
  if (!Array.isArray(stack) || !stack.length) {
    return [];
  }

  const normalized = [];
  for (const item of stack) {
    const cloned = cloneSnapshotSafe(item);
    if (cloned) {
      normalized.push(cloned);
    }
  }

  if (normalized.length <= limit) {
    return normalized;
  }

  return normalized.slice(normalized.length - limit);
}
