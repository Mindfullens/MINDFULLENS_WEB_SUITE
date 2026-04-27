import { generatedFilmStocks } from './filmProfiles.generated.js';
import { CURATED_PROFILE_ENTRIES } from './profileCatalog.js';
// Keep LUT previews enabled by default so curated profiles keep their intended character.
import { isEnvEnablePreviewLuts } from '../filmLab/runtimeEnv.js';

// Can be disabled for diagnostics with: VITE_FILMLAB_ENABLE_PREVIEW_LUTS=0
const ENABLE_PREVIEW_LUTS = isEnvEnablePreviewLuts();

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function clampSigned(value, maxAbs) {
  return clampNumber(value, -maxAbs, maxAbs);
}

function normalizeTemperature(value) {
  const numeric = Number(value) || 0;

  if (!Number.isFinite(numeric) || numeric === 0) {
    return 0;
  }

  if (Math.abs(numeric) <= 100) {
    return clampSigned(numeric, 20);
  }

  return clampSigned((numeric - 5500) / 40, 20);
}

function buildLUT(points, interpolation = 'smooth') {
  const lut = new Uint8Array(256);

  if (!points || points.length < 2) {
    for (let index = 0; index < 256; index += 1) {
      lut[index] = index;
    }
    return lut;
  }

  const sortedPoints = [...points].sort((left, right) => left[0] - right[0]);
  const useLinearSegments = interpolation === 'linear' || sortedPoints.length === 2;

  for (let index = 0; index < 256; index += 1) {
    if (index <= sortedPoints[0][0]) {
      lut[index] = clampNumber(sortedPoints[0][1], 0, 255);
      continue;
    }

    if (index >= sortedPoints[sortedPoints.length - 1][0]) {
      lut[index] = clampNumber(sortedPoints[sortedPoints.length - 1][1], 0, 255);
      continue;
    }

    for (let pointIndex = 0; pointIndex < sortedPoints.length - 1; pointIndex += 1) {
      const currentPoint = sortedPoints[pointIndex];
      const nextPoint = sortedPoints[pointIndex + 1];

      if (index >= currentPoint[0] && index <= nextPoint[0]) {
        const t = (index - currentPoint[0]) / (nextPoint[0] - currentPoint[0]);
        const mix = useLinearSegments ? t : t * t * (3 - 2 * t);
        const value = currentPoint[1] + (nextPoint[1] - currentPoint[1]) * mix;

        lut[index] = clampNumber(Math.round(value), 0, 255);
        break;
      }
    }
  }

  return lut;
}

function getSwatchStyle(film) {
  if (film.bw) {
    return 'linear-gradient(135deg, #888, #333)';
  }

  const rLut = buildLUT(film.curves?.r, 'smooth');
  const gLut = buildLUT(film.curves?.g, 'smooth');
  const bLut = buildLUT(film.curves?.b, 'smooth');
  const rgbLut = buildLUT(film.curves?.rgb, 'smooth');
  
  const applyMaster = (r, g, b) => {
    const luma = clampNumber(Math.round(0.299 * r + 0.587 * g + 0.114 * b), 0, 255);
    const shift = rgbLut[luma] - luma;
    return [
      clampNumber(r + shift, 0, 255),
      clampNumber(g + shift, 0, 255),
      clampNumber(b + shift, 0, 255)
    ];
  };

  const c1 = applyMaster(rLut[180], gLut[160], bLut[140]);
  const c2 = applyMaster(rLut[80], gLut[90], bLut[100]);

  return `linear-gradient(135deg, rgb(${c1.join(',')}), rgb(${c2.join(',')}))`;
}

function createZeroHsl() {
  return {
    hue: {
      red: 0,
      orange: 0,
      yellow: 0,
      green: 0,
      aqua: 0,
      blue: 0,
      purple: 0,
      magenta: 0,
    },
    saturation: {
      red: 0,
      orange: 0,
      yellow: 0,
      green: 0,
      aqua: 0,
      blue: 0,
      purple: 0,
      magenta: 0,
    },
    luminance: {
      red: 0,
      orange: 0,
      yellow: 0,
      green: 0,
      aqua: 0,
      blue: 0,
      purple: 0,
      magenta: 0,
    },
  };
}

function createZeroColorGrade() {
  return {
    shadows: { hue: 0, saturation: 0, luminance: 0 },
    midtones: { hue: 0, saturation: 0, luminance: 0 },
    highlights: { hue: 0, saturation: 0, luminance: 0 },
    global: { hue: 0, saturation: 0 },
    blending: 50,
    balance: 0,
  };
}

function createZeroCalibration() {
  return {
    shadowsTint: 0,
    red: { hue: 0, saturation: 0 },
    green: { hue: 0, saturation: 0 },
    blue: { hue: 0, saturation: 0 },
  };
}

function inferIsoFromName(name) {
  const normalizedName = String(name ?? '').toUpperCase();

  if (normalizedName.includes('XP2')) {
    return 400;
  }

  if (normalizedName.includes('VISION3 B&W') || normalizedName.includes('VISION3 BW')) {
    return 400;
  }

  const matches = String(name ?? '').match(/\d{2,4}/g);

  if (!matches) {
    return null;
  }

  const candidates = matches
    .map((entry) => Number(entry))
    .filter((value) => Number.isFinite(value) && value >= 25 && value <= 6400);

  if (!candidates.length) {
    return null;
  }

  return candidates[candidates.length - 1];
}

function deriveGrainDefaultsFromIso(isoValue) {
  const iso = Number(isoValue);

  if (!Number.isFinite(iso) || iso <= 0) {
    return {
      amount: 0,
      size: 50,
      frequency: 50,
    };
  }

  const isoStops = Math.log2(iso / 100);
  const positiveStops = Math.max(0, isoStops);
  const amount = clampNumber(Math.round(10 + isoStops * 9), 0, 70);
  const size =
    iso >= 1600
      ? 10
      : clampNumber(Math.round(24 + positiveStops * 8), 14, 80);
  const frequency = clampNumber(Math.round(62 - positiveStops * 7), 20, 90);

  return {
    amount,
    size,
    frequency,
  };
}

function createSafeBitmapFallback(profile) {
  return {
    curves: profile.curves,
    exposure: clampNumber(profile.exposure, -2, 2),
    temperature: normalizeTemperature(profile.temperature),
    tint: clampSigned(profile.tint, 100),
    contrast: clampSigned(profile.contrast, 100),
    highlights: clampSigned(profile.highlights, 100),
    shadows: clampSigned(profile.shadows, 100),
    whites: clampSigned(profile.whites, 100),
    blacks: clampSigned(profile.blacks, 100),
    texture: clampSigned(profile.texture, 100),
    clarity: clampSigned(profile.clarity, 100),
    dehaze: clampSigned(profile.dehaze, 100),
    vibrance: clampSigned(profile.vibrance, 100),
    saturation: clampSigned(profile.saturation, 100),
    grain: clampNumber(profile.grain, 0, 60),
    grainSize: clampNumber(profile.grainSize || 30, 10, 65),
    grainFrequency: clampNumber(profile.grainFrequency || 50, 10, 90),
    vignette: clampSigned(profile.vignette, 20),
    grayMixer: profile.grayMixer ?? null,
  };
}

function createInputProfile() {
  const profile = {
    name: 'Zdjęcie wejściowe',
    sub: 'Bez profilu',
    cat: 'all',
    free: true,
    bw: false,
    isInputProfile: true,
    curves: {
      rgb: [
        [0, 0],
        [255, 255],
      ],
      r: [
        [0, 0],
        [255, 255],
      ],
      g: [
        [0, 0],
        [255, 255],
      ],
      b: [
        [0, 0],
        [255, 255],
      ],
    },
    exposure: 0,
    temperature: 0,
    tint: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    texture: 0,
    clarity: 0,
    dehaze: 0,
    vibrance: 0,
    saturation: 0,
    grain: 0,
    grainSize: 30,
    grainFrequency: 50,
    iso: null,
    defaultGrainAmount: 0,
    defaultGrainSize: 10,
    defaultGrainFrequency: 50,
    vignette: 0,
    hsl: createZeroHsl(),
    colorGrade: createZeroColorGrade(),
    calibration: createZeroCalibration(),
    previewLutFile: null,
  };

  return {
    ...profile,
    swatchStyle: getSwatchStyle(profile),
  };
}

function normalizeProfile(profile) {
  const inferredIso = inferIsoFromName(profile.name);
  const grainDefaults = deriveGrainDefaultsFromIso(inferredIso);
  const normalized = {
    ...createSafeBitmapFallback(profile),
    ...profile,
  };

  const result = {
    ...normalized,
    curves: normalized.curves ?? profile.curves,
    bw: Boolean(normalized.bw),
    exposure: clampNumber(normalized.exposure ?? 0, -2, 2),
    temperature: normalizeTemperature(normalized.temperature),
    tint: clampSigned(normalized.tint ?? 0, 100),
    contrast: clampSigned(normalized.contrast ?? 0, 100),
    highlights: clampSigned(normalized.highlights ?? 0, 100),
    shadows: clampSigned(normalized.shadows ?? 0, 100),
    whites: clampSigned(normalized.whites ?? 0, 100),
    blacks: clampSigned(normalized.blacks ?? 0, 100),
    texture: clampSigned(normalized.texture ?? 0, 100),
    clarity: clampSigned(normalized.clarity ?? 0, 100),
    dehaze: clampSigned(normalized.dehaze ?? 0, 100),
    vibrance: clampSigned(normalized.vibrance ?? 0, 100),
    saturation: clampSigned(normalized.saturation ?? 0, 100),
    grain: clampNumber(normalized.grain ?? 0, 0, 60),
    grainSize: clampNumber(normalized.grainSize || 30, 10, 65),
    grainFrequency: clampNumber(normalized.grainFrequency || 50, 10, 90),
    iso: inferredIso,
    defaultGrainAmount: clampNumber(
      normalized.defaultGrainAmount ?? grainDefaults.amount,
      0,
      100
    ),
    defaultGrainSize: clampNumber(normalized.defaultGrainSize ?? grainDefaults.size, 10, 100),
    defaultGrainFrequency: clampNumber(
      normalized.defaultGrainFrequency ?? grainDefaults.frequency,
      10,
      90
    ),
    vignette: clampSigned(normalized.vignette ?? 0, 20),
    grayMixer: normalized.grayMixer ?? null,
    previewLutFile: (() => {
      if (!ENABLE_PREVIEW_LUTS) {
        return null;
      }

      // Monochrome stocks should never rely on color LUT preview in web pipeline.
      if (normalized.bw) {
        return null;
      }

      return normalized.previewLutFile ?? null;
    })(),
    hsl: normalized.hsl ?? createZeroHsl(),
    colorGrade: normalized.colorGrade ?? createZeroColorGrade(),
    calibration: {
      shadowsTint: clampSigned(normalized.calibration?.shadowsTint ?? 0, 100),
      red: {
        hue: clampSigned(normalized.calibration?.red?.hue ?? 0, 100),
        saturation: clampSigned(normalized.calibration?.red?.saturation ?? 0, 100),
      },
      green: {
        hue: clampSigned(normalized.calibration?.green?.hue ?? 0, 100),
        saturation: clampSigned(normalized.calibration?.green?.saturation ?? 0, 100),
      },
      blue: {
        hue: clampSigned(normalized.calibration?.blue?.hue ?? 0, 100),
        saturation: clampSigned(normalized.calibration?.blue?.saturation ?? 0, 100),
      },
    },
  };

  return {
    ...result,
    swatchStyle: getSwatchStyle(result),
  };
}

const CURATED_SOURCE_ID_ALIASES = Object.freeze({
  kodak_portra_400: 'portra_400',
  solara_100: 'solara_100_cc',
  estera_500: 'estra_500',
  velvia_50: 'fuji_velvia_50',
});

function createCuratedProfiles(normalizedProfiles) {
  const bySourceId = new Map();
  normalizedProfiles.forEach((profile) => {
    bySourceId.set(profile.sourceId, profile);
  });

  const missingSourceIds = new Set();
  const curatedProfiles = [];

  CURATED_PROFILE_ENTRIES.forEach((entry) => {
    const sourceId = entry.sourceId;
    const resolvedSourceId = bySourceId.has(sourceId)
      ? sourceId
      : CURATED_SOURCE_ID_ALIASES[sourceId] ?? sourceId;
    const baseProfile = bySourceId.get(resolvedSourceId);

    if (!baseProfile) {
      missingSourceIds.add(sourceId);
      return;
    }

    const orderLabel = String(entry.order).padStart(2, '0');
    const description = String(entry.description ?? '').trim();

    curatedProfiles.push({
      ...baseProfile,
      name: `${orderLabel}_${entry.title}`,
      sub: description || baseProfile.sub || 'Master',
      cat: entry.group,
      catalogGroup: entry.group,
      catalogOrder: entry.order,
      marketingTitle: entry.title,
      marketingDescription: description,
      internalSourceId: sourceId,
      canonicalSourceId: resolvedSourceId,
    });
  });

  if (missingSourceIds.size > 0) {
    console.warn(
      `[filmProfiles] Missing source profiles for curated entries: ${[...missingSourceIds]
        .sort()
        .join(', ')}`
    );
  }

  return curatedProfiles;
}

const normalizedProfiles = generatedFilmStocks.map(normalizeProfile);
const curatedProfiles = createCuratedProfiles(normalizedProfiles);

export const filmStocks = [
  createInputProfile(),
  ...(curatedProfiles.length > 0 ? curatedProfiles : normalizedProfiles),
];
