import { MIXER_COLORS } from './mixerConstants.js';

export function createZeroHslState() {
  return {
    hue: Object.fromEntries(MIXER_COLORS.map(({ id }) => [id, 0])),
    saturation: Object.fromEntries(MIXER_COLORS.map(({ id }) => [id, 0])),
    luminance: Object.fromEntries(MIXER_COLORS.map(({ id }) => [id, 0])),
  };
}

export function createZeroColorGradeState() {
  return {
    shadows: { hue: 0, saturation: 0, luminance: 0 },
    midtones: { hue: 0, saturation: 0, luminance: 0 },
    highlights: { hue: 0, saturation: 0, luminance: 0 },
    global: { hue: 0, saturation: 0 },
    blending: 50,
    balance: 0,
  };
}

export function createZeroCalibrationState() {
  return {
    shadowsTint: 0,
    red: { hue: 0, saturation: 0 },
    green: { hue: 0, saturation: 0 },
    blue: { hue: 0, saturation: 0 },
  };
}

export function cloneHslState(hsl) {
  return {
    hue: { ...(hsl?.hue ?? createZeroHslState().hue) },
    saturation: { ...(hsl?.saturation ?? createZeroHslState().saturation) },
    luminance: { ...(hsl?.luminance ?? createZeroHslState().luminance) },
  };
}

export function cloneColorGradeState(colorGrade) {
  return {
    shadows: { ...(colorGrade?.shadows ?? createZeroColorGradeState().shadows) },
    midtones: { ...(colorGrade?.midtones ?? createZeroColorGradeState().midtones) },
    highlights: { ...(colorGrade?.highlights ?? createZeroColorGradeState().highlights) },
    global: { ...(colorGrade?.global ?? createZeroColorGradeState().global) },
    blending: colorGrade?.blending ?? 50,
    balance: colorGrade?.balance ?? 0,
  };
}

export function cloneCalibrationState(calibration) {
  return {
    shadowsTint: calibration?.shadowsTint ?? 0,
    red: { ...(calibration?.red ?? createZeroCalibrationState().red) },
    green: { ...(calibration?.green ?? createZeroCalibrationState().green) },
    blue: { ...(calibration?.blue ?? createZeroCalibrationState().blue) },
  };
}
