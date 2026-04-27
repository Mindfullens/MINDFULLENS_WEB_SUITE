const RESPONSE_SAMPLE_POINTS = [0, 25, 50, 75, 100];

const EXTREME_RESPONSE_BOOST = Object.freeze({
  highlights: 0.12,
  whites: 0.18,
  blacks: 0.18,
  clarity: 0.12,
  hslHue: 0.1,
  hslSaturation: 0.22,
  hslLuminance: 0.2,
  calibrationTint: 0.24,
  calibrationHue: 0.24,
  calibrationSaturation: 0.24,
});

export const LIGHTROOM_RESPONSE_CURVES = Object.freeze({
  default: [0, 11, 26, 50, 100],
  exposure: [0, 13, 30, 56, 100],
  contrast: [0, 10, 24, 48, 100],
  highlights: [0, 5, 15, 36, 100],
  shadows: [0, 6, 18, 42, 100],
  whites: [0, 4, 12, 28, 100],
  blacks: [0, 4, 12, 28, 100],
  clarity: [0, 4, 11, 27, 100],
  dehaze: [0, 7, 16, 37, 100],
  fade: [0, 10, 24, 46, 100],
  temperature: [0, 11, 25, 50, 100],
  tint: [0, 11, 25, 50, 100],
  saturation: [0, 8, 20, 43, 100],
  vibrance: [0, 14, 32, 62, 100],
  hslHue: [0, 22, 46, 73, 100],
  hslSaturation: [0, 10, 24, 48, 100],
  hslLuminance: [0, 4, 10, 25, 100],
  gradingSaturation: [0, 8, 20, 46, 100],
  gradingLuminance: [0, 8, 20, 44, 100],
  gradingBalance: [0, 12, 30, 58, 100],
  calibrationTint: [0, 7, 18, 42, 100],
  calibrationHue: [0, 7, 18, 42, 100],
  calibrationSaturation: [0, 7, 18, 42, 100],
});

function clamp(value, min = 0, max = 100) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function resolveCurve(curveName) {
  const curve = LIGHTROOM_RESPONSE_CURVES[curveName];

  if (!Array.isArray(curve) || curve.length !== RESPONSE_SAMPLE_POINTS.length) {
    return LIGHTROOM_RESPONSE_CURVES.default;
  }

  return curve;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function applyExtremeEndpointBoost(mappedValue, inputMagnitude, curveName) {
  const boostStrength = EXTREME_RESPONSE_BOOST[curveName];

  if (!boostStrength || inputMagnitude <= 82) {
    return mappedValue;
  }

  const t = clamp((inputMagnitude - 82) / 18, 0, 1);
  const boosted = mappedValue * (1 + boostStrength * t * t);

  return boosted;
}

export function mapUnsignedSliderForResponse(value, curveName = 'default') {
  const curve = resolveCurve(curveName);
  const magnitude = clamp(Number(value) || 0, 0, 100);

  for (let index = 1; index < RESPONSE_SAMPLE_POINTS.length; index += 1) {
    const x0 = RESPONSE_SAMPLE_POINTS[index - 1];
    const x1 = RESPONSE_SAMPLE_POINTS[index];

    if (magnitude <= x1) {
      const t = (magnitude - x0) / (x1 - x0);
      const mappedValue = lerp(curve[index - 1], curve[index], t);
      return applyExtremeEndpointBoost(mappedValue, magnitude, curveName);
    }
  }

  return applyExtremeEndpointBoost(curve[curve.length - 1], magnitude, curveName);
}

export function mapSignedSliderForResponse(value, curveName = 'default') {
  const numericValue = Number(value) || 0;
  const sign = numericValue < 0 ? -1 : 1;
  const magnitude = mapUnsignedSliderForResponse(Math.abs(numericValue), curveName);

  return sign * magnitude;
}

function mapSignedMap(record, curveName) {
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      mapSignedSliderForResponse(value, curveName),
    ])
  );
}

export function mapHslStateForResponse(userHsl) {
  if (!userHsl) {
    return null;
  }

  return {
    hue: mapSignedMap(userHsl.hue, 'hslHue'),
    saturation: mapSignedMap(userHsl.saturation, 'hslSaturation'),
    luminance: mapSignedMap(userHsl.luminance, 'hslLuminance'),
  };
}

export function mapTemperatureToKelvin(normalizedValue) {
  const t = clamp(Number(normalizedValue) || 0, -100, 100);
  if (t < 0) {
    return 5500 + t * 35;
  }
  return 5500 + t * 45;
}

export function mapKelvinToTemperature(kelvin) {
  const k = clamp(Number(kelvin) || 5500, 2000, 10000);
  if (k < 5500) {
    return clamp((k - 5500) / 35, -100, 100);
  }
  return clamp((k - 5500) / 45, -100, 100);
}

export function mapColorGradeStateForResponse(userColorGrade) {
  if (!userColorGrade) {
    return null;
  }

  const mapZone = (zone) => ({
    ...(zone ?? {}),
    saturation: mapUnsignedSliderForResponse(zone?.saturation ?? 0, 'gradingSaturation'),
    luminance: mapSignedSliderForResponse(zone?.luminance ?? 0, 'gradingLuminance'),
  });

  return {
    ...userColorGrade,
    shadows: mapZone(userColorGrade.shadows),
    midtones: mapZone(userColorGrade.midtones),
    highlights: mapZone(userColorGrade.highlights),
    global: {
      ...(userColorGrade.global ?? {}),
      saturation: mapUnsignedSliderForResponse(
        userColorGrade?.global?.saturation ?? 0,
        'gradingSaturation'
      ),
    },
    balance: mapSignedSliderForResponse(userColorGrade.balance ?? 0, 'gradingBalance'),
  };
}

export function mapCalibrationStateForResponse(userCalibration) {
  if (!userCalibration) {
    return null;
  }

  const mapChannel = (channel) => ({
    hue: mapSignedSliderForResponse(channel?.hue ?? 0, 'calibrationHue'),
    saturation: mapSignedSliderForResponse(
      channel?.saturation ?? 0,
      'calibrationSaturation'
    ),
  });

  return {
    ...userCalibration,
    shadowsTint: mapSignedSliderForResponse(
      userCalibration.shadowsTint ?? 0,
      'calibrationTint'
    ),
    red: mapChannel(userCalibration.red),
    green: mapChannel(userCalibration.green),
    blue: mapChannel(userCalibration.blue),
  };
}
