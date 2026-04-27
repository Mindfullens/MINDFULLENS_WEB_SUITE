import { useEffect, useMemo, useRef, useState } from 'react';
import { filmStocks } from './engine/filmProfiles';
import { generatedFilmStocks } from './engine/filmProfiles.generated';
import { buildCurveLut } from './engine/curveInterpolation';
import { ingestUploadSource } from './engine/pipeline/ingestSource';
import {
  FILE_INPUT_ACCEPT,
  PIPELINE_KIND,
  PIPELINE_STATUS,
  SOURCE_KIND,
  getPipelineLabel,
} from './engine/pipeline/constants';
import './matcherPage.css';

const CATEGORY_DESCRIPTION = {
  neg: 'Analiza wykazała cechy negatywu kolorowego: miękkie przejścia tonalne i naturalny kolor skóry. Ten profil odtworzy autentyczny look analogu.',
  slide:
    'Wykryto nasycone barwy z mocnym kontrastem, typowe dla filmów slajdowych. Idealny wybór do krajobrazu i mocnego światła.',
  bw: 'Rozpoznano charakter fotografii czarno-białej: wyraźne tony i filmowe ziarno. Profil daje klasyczny, ponadczasowy efekt.',
  cine:
    'Obraz ma kinowy charakter: chłodniejsze cienie i ciepłe światła. Profil nadaje filmowy klimat znany z materiałów cinema.',
};

const HUE_SECTORS = [
  { id: 'red', center: 0, spread: 42 },
  { id: 'orange', center: 32, spread: 28 },
  { id: 'yellow', center: 58, spread: 26 },
  { id: 'green', center: 118, spread: 40 },
  { id: 'aqua', center: 182, spread: 32 },
  { id: 'blue', center: 232, spread: 36 },
  { id: 'purple', center: 278, spread: 24 },
  { id: 'magenta', center: 318, spread: 26 },
];

function clamp(value, min = 0, max = 255) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function rgbHex(red, green, blue) {
  const r = clamp(Math.round(red));
  const g = clamp(Math.round(green));
  const b = clamp(Math.round(blue));
  return `#${(1 << 24 | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function rgbToHsl(red, green, blue) {
  const r = clamp01(red / 255);
  const g = clamp01(green / 255);
  const b = clamp01(blue / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case r:
        hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        hue = ((b - r) / delta + 2) / 6;
        break;
      default:
        hue = ((r - g) / delta + 4) / 6;
        break;
    }
  }

  return [hue, saturation, lightness];
}

function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 1) + 1) % 1;
  const s = clamp01(saturation);
  const l = clamp01(lightness);

  if (s === 0) {
    const gray = clamp(Math.round(l * 255));
    return [gray, gray, gray];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const red = clamp(Math.round(hue2rgb(h + 1 / 3) * 255));
  const green = clamp(Math.round(hue2rgb(h) * 255));
  const blue = clamp(Math.round(hue2rgb(h - 1 / 3) * 255));
  return [red, green, blue];
}

function rgbToYCbCr(red, green, blue) {
  const y = red * 0.299 + green * 0.587 + blue * 0.114;
  const cb = 128 - red * 0.168736 - green * 0.331264 + blue * 0.5;
  const cr = 128 + red * 0.5 - green * 0.418688 - blue * 0.081312;
  return [y, cb, cr];
}

function yCbCrToRgb(y, cb, cr) {
  const red = y + 1.402 * (cr - 128);
  const green = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
  const blue = y + 1.772 * (cb - 128);
  return [clamp(red), clamp(green), clamp(blue)];
}

function getHueWeight(hueDegrees, center, spread) {
  const normalized = ((hueDegrees % 360) + 360) % 360;
  const distance = Math.abs((((normalized - center) % 360) + 540) % 360 - 180);
  if (distance >= spread) {
    return 0;
  }
  return 1 - smoothstep(0, spread, distance);
}

function createRegionalAdjustmentsMatcher(hsl, strength) {
  const safeHsl = hsl ?? {};
  const hue = safeHsl.hue ?? {};
  const saturation = safeHsl.saturation ?? {};
  const luminance = safeHsl.luminance ?? {};
  const hasAdjustments = HUE_SECTORS.some((sector) => {
    const id = sector.id;
    return (
      Math.abs(Number(hue[id] ?? 0)) > 0 ||
      Math.abs(Number(saturation[id] ?? 0)) > 0 ||
      Math.abs(Number(luminance[id] ?? 0)) > 0
    );
  });

  return {
    enabled: hasAdjustments && strength > 0,
    strength: clamp01(0.55 + strength * 0.35),
    hue,
    saturation,
    luminance,
  };
}

function createCalibrationAdjustmentsMatcher(calibration, strength) {
  const safe = calibration ?? {};
  const red = safe.red ?? {};
  const green = safe.green ?? {};
  const blue = safe.blue ?? {};
  const hasAdjustments =
    Math.abs(Number(safe.shadowsTint ?? 0)) > 0 ||
    Math.abs(Number(red.hue ?? 0)) > 0 ||
    Math.abs(Number(red.saturation ?? 0)) > 0 ||
    Math.abs(Number(green.hue ?? 0)) > 0 ||
    Math.abs(Number(green.saturation ?? 0)) > 0 ||
    Math.abs(Number(blue.hue ?? 0)) > 0 ||
    Math.abs(Number(blue.saturation ?? 0)) > 0;

  return {
    enabled: hasAdjustments && strength > 0,
    strength: clamp01(0.5 + strength * 0.35),
    calibration: {
      shadowsTint: Number(safe.shadowsTint ?? 0),
      red: {
        hue: Number(red.hue ?? 0),
        saturation: Number(red.saturation ?? 0),
      },
      green: {
        hue: Number(green.hue ?? 0),
        saturation: Number(green.saturation ?? 0),
      },
      blue: {
        hue: Number(blue.hue ?? 0),
        saturation: Number(blue.saturation ?? 0),
      },
    },
  };
}

function applyToneTintMatcher(red, green, blue, hue, saturation, luminanceShift, mask, strength) {
  if ((saturation <= 0 && luminanceShift === 0) || mask <= 0 || strength <= 0) {
    return [red, green, blue];
  }

  let nextRed = red;
  let nextGreen = green;
  let nextBlue = blue;

  if (saturation > 0) {
    const [toneRed, toneGreen, toneBlue] = hslToRgb(
      (((hue % 360) + 360) % 360) / 360,
      clamp01(saturation / 100),
      0.5
    );
    const tintMix = clamp01((saturation / 100) * mask * strength * 0.4);
    nextRed = nextRed * (1 - tintMix) + toneRed * tintMix;
    nextGreen = nextGreen * (1 - tintMix) + toneGreen * tintMix;
    nextBlue = nextBlue * (1 - tintMix) + toneBlue * tintMix;
  }

  if (luminanceShift !== 0) {
    const luminanceOffset = (luminanceShift / 100) * mask * strength * 10;
    nextRed += luminanceOffset;
    nextGreen += luminanceOffset;
    nextBlue += luminanceOffset;
  }

  return [nextRed, nextGreen, nextBlue];
}

function applyColorGradingMatcher(red, green, blue, colorGrade, strength) {
  if (!colorGrade || strength <= 0) {
    return [red, green, blue];
  }

  const [, baseSaturation] = rgbToHsl(red, green, blue);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  const chromaMask = 0.18 + smoothstep(0.02, 0.24, baseSaturation) * 0.52;
  const balance = Number(colorGrade.balance ?? 0) / 100;
  const blending = clamp01(Number(colorGrade.blending ?? 50) / 100);
  const shadowMask =
    1 - smoothstep(0.24 + balance * 0.18, 0.58 + balance * 0.12, luminance);
  const highlightMask = smoothstep(
    0.42 + balance * 0.12,
    0.82 + balance * 0.18,
    luminance
  );
  const midBase = Math.max(0, 1 - Math.abs(luminance - 0.5 - balance * 0.08) * 2.25);
  const midMask = clamp01(midBase * (0.45 + blending * 0.35));

  let result = [red, green, blue];
  result = applyToneTintMatcher(
    result[0],
    result[1],
    result[2],
    Number(colorGrade.shadows?.hue ?? 0),
    Number(colorGrade.shadows?.saturation ?? 0),
    Number(colorGrade.shadows?.luminance ?? 0),
    shadowMask,
    strength * chromaMask
  );
  result = applyToneTintMatcher(
    result[0],
    result[1],
    result[2],
    Number(colorGrade.midtones?.hue ?? 0),
    Number(colorGrade.midtones?.saturation ?? 0),
    Number(colorGrade.midtones?.luminance ?? 0),
    midMask,
    strength * chromaMask
  );
  result = applyToneTintMatcher(
    result[0],
    result[1],
    result[2],
    Number(colorGrade.highlights?.hue ?? 0),
    Number(colorGrade.highlights?.saturation ?? 0),
    Number(colorGrade.highlights?.luminance ?? 0),
    highlightMask,
    strength * chromaMask
  );
  result = applyToneTintMatcher(
    result[0],
    result[1],
    result[2],
    Number(colorGrade.global?.hue ?? 0),
    Number(colorGrade.global?.saturation ?? 0),
    0,
    1,
    strength * chromaMask * 0.45
  );

  return result;
}

function applyCalibrationAdjustmentsMatcher(red, green, blue, calibrationAdjustments) {
  if (!calibrationAdjustments.enabled) {
    return [red, green, blue];
  }

  let nextRed = red;
  let nextGreen = green;
  let nextBlue = blue;
  const strength = calibrationAdjustments.strength;
  const total = red + green + blue + 1e-6;
  const redWeight = clamp01((red / total) * 2.2);
  const greenWeight = clamp01((green / total) * 2.2);
  const blueWeight = clamp01((blue / total) * 2.2);
  const calibration = calibrationAdjustments.calibration;
  const shadowsTint = Number(calibration?.shadowsTint ?? 0);

  if (shadowsTint !== 0) {
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    const shadowMask = 1 - smoothstep(0.2, 0.62, luminance);

    if (shadowMask > 0) {
      const tintStrength = (shadowsTint / 100) * strength * shadowMask * 10;
      nextRed += tintStrength;
      nextGreen -= tintStrength * 0.9;
      nextBlue += tintStrength * 0.85;
    }
  }

  const redHue = (Number(calibration?.red?.hue ?? 0) / 100) * strength;
  const greenHue = (Number(calibration?.green?.hue ?? 0) / 100) * strength;
  const blueHue = (Number(calibration?.blue?.hue ?? 0) / 100) * strength;
  const redSat = (Number(calibration?.red?.saturation ?? 0) / 100) * strength;
  const greenSat = (Number(calibration?.green?.saturation ?? 0) / 100) * strength;
  const blueSat = (Number(calibration?.blue?.saturation ?? 0) / 100) * strength;

  nextGreen += redWeight * redHue * 18;
  nextBlue -= redWeight * redHue * 16;
  nextBlue += greenWeight * greenHue * 17;
  nextRed -= greenWeight * greenHue * 15;
  nextRed += blueWeight * blueHue * 19;
  nextGreen -= blueWeight * blueHue * 17;

  const redSatAmount = redWeight * redSat * 24;
  nextRed += redSatAmount;
  nextGreen -= redSatAmount * 0.45;
  nextBlue -= redSatAmount * 0.45;

  const greenSatAmount = greenWeight * greenSat * 24;
  nextGreen += greenSatAmount;
  nextRed -= greenSatAmount * 0.45;
  nextBlue -= greenSatAmount * 0.45;

  const blueSatAmount = blueWeight * blueSat * 24;
  nextBlue += blueSatAmount;
  nextRed -= blueSatAmount * 0.45;
  nextGreen -= blueSatAmount * 0.45;

  return [nextRed, nextGreen, nextBlue];
}

function applyRegionalColorAdjustmentsMatcher(red, green, blue, regionalAdjustments) {
  if (!regionalAdjustments.enabled) {
    return [red, green, blue];
  }

  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  const chromaMask = smoothstep(0.03, 0.22, saturation);
  if (chromaMask <= 0) {
    return [red, green, blue];
  }

  const hueDegrees = hue * 360;
  let hueShift = 0;
  let saturationShift = 0;
  let luminanceShift = 0;
  let totalWeight = 0;

  HUE_SECTORS.forEach((sector) => {
    const weight = getHueWeight(hueDegrees, sector.center, sector.spread);
    if (weight <= 0) return;

    hueShift += weight * Number(regionalAdjustments.hue?.[sector.id] ?? 0);
    saturationShift += weight * Number(regionalAdjustments.saturation?.[sector.id] ?? 0);
    luminanceShift += weight * Number(regionalAdjustments.luminance?.[sector.id] ?? 0);
    totalWeight += weight;
  });

  if (totalWeight <= 0) {
    return [red, green, blue];
  }

  const mixStrength = regionalAdjustments.strength * chromaMask;
  const averagedHueShift = hueShift / totalWeight;
  const averagedSaturationShift = saturationShift / totalWeight;
  const averagedLuminanceShift = luminanceShift / totalWeight;
  const nextHue = (((hueDegrees + averagedHueShift * mixStrength * 0.62) % 360) + 360) % 360;
  const nextSaturation = clamp01(
    saturation + (averagedSaturationShift / 100) * mixStrength * 0.36
  );
  let [nextRed, nextGreen, nextBlue] = hslToRgb(nextHue / 360, nextSaturation, lightness);

  if (averagedLuminanceShift !== 0) {
    const [baseY, cb, cr] = rgbToYCbCr(nextRed, nextGreen, nextBlue);
    const luminanceDelta = averagedLuminanceShift * mixStrength * 0.34;
    const nextY = clamp(baseY + luminanceDelta);
    [nextRed, nextGreen, nextBlue] = yCbCrToRgb(nextY, cb, cr);
  }

  return [nextRed, nextGreen, nextBlue];
}

function applyToneAdjustmentsMatcher(red, green, blue, highlights, shadows, whites, blacks) {
  const luminance = clamp01((0.299 * red + 0.587 * green + 0.114 * blue) / 255);
  let nextRed = red;
  let nextGreen = green;
  let nextBlue = blue;

  if (shadows !== 0) {
    const shadowMask = 1 - smoothstep(0.1, 0.72, luminance);
    const shift = shadows * shadowMask * 122;
    nextRed += shift;
    nextGreen += shift;
    nextBlue += shift;
  }

  if (highlights !== 0) {
    const highlightMask = smoothstep(0.24, 0.88, luminance);
    const shift = highlights * highlightMask * 122;
    nextRed += shift;
    nextGreen += shift;
    nextBlue += shift;
  }

  if (blacks !== 0) {
    const blackMask = 1 - smoothstep(0.02, 0.5, luminance);
    const shift = blacks * blackMask * 108;
    nextRed += shift;
    nextGreen += shift;
    nextBlue += shift;
  }

  if (whites !== 0) {
    const whiteMask = smoothstep(0.5, 0.98, luminance);
    const shift = whites * whiteMask * 108;
    nextRed += shift;
    nextGreen += shift;
    nextBlue += shift;
  }

  return [nextRed, nextGreen, nextBlue];
}

function analyzeImage(imageData) {
  const data = imageData.data;
  const len = data.length;
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let satSum = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  const step = Math.max(4, Math.floor(len / 100000)) * 4;
  let samples = 0;

  for (let index = 0; index < len; index += step) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];

    totalRed += red;
    totalGreen += green;
    totalBlue += blue;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max > 0) {
      satSum += (max - min) / max;
    }

    const luma = red * 0.299 + green * 0.587 + blue * 0.114;
    if (luma < 50) darkPixels += 1;
    if (luma > 210) brightPixels += 1;

    samples += 1;
  }

  const avgRed = totalRed / samples;
  const avgGreen = totalGreen / samples;
  const avgBlue = totalBlue / samples;
  const brightness = (avgRed + avgGreen + avgBlue) / 3;
  const warmth = avgRed - avgBlue;
  const saturation = (satSum / samples) * 100;
  const contrast = ((brightPixels + darkPixels) / samples) * 100;
  const greenShift = avgGreen - (avgRed + avgBlue) / 2;

  return {
    avgRed,
    avgGreen,
    avgBlue,
    brightness,
    warmth,
    saturation,
    contrast,
    greenShift,
  };
}

function scoreFilmMatch(analysis, film) {
  let score = 52;

  const filmWarmth = (film.temperature ?? 0) * 2.4 + (film.tint ?? 0);
  const filmColorPower = (film.vibrance ?? 0) * 1.4 + (film.saturation ?? 0) * 1.2;
  const filmContrast = film.contrast ?? 0;

  if (film.bw) {
    if (analysis.saturation < 18) score += 36;
    else if (analysis.saturation < 35) score += 12;
    else score -= 22;

    if (analysis.contrast > 24) score += 10;
    if ((film.defaultGrainAmount ?? 0) > 20 && analysis.brightness < 115) score += 8;

    return clamp(Math.round(score), 0, 100);
  }

  const warmthDistance = Math.abs(analysis.warmth - filmWarmth);
  score += Math.max(-22, 18 - warmthDistance * 0.45);

  const satDistance = Math.abs(analysis.saturation - (38 + filmColorPower));
  score += Math.max(-18, 14 - satDistance * 0.4);

  const contrastDistance = Math.abs(Math.min(100, analysis.contrast * 2) - (48 + filmContrast));
  score += Math.max(-12, 11 - contrastDistance * 0.25);

  if (analysis.brightness < 105 && film.cat === 'cine') score += 12;
  if (analysis.saturation > 52 && film.cat === 'slide') score += 14;
  if (analysis.saturation < 34 && film.cat === 'neg') score += 8;
  if (analysis.greenShift > 10 && (film.name.toLowerCase().includes('velvia') || film.name.toLowerCase().includes('ektar'))) {
    score += 8;
  }

  return clamp(Math.round(score), 0, 100);
}

function buildFilmDiversitySignature(film, lut) {
  const hslSat = film?.hsl?.saturation ?? {};
  const hslHue = film?.hsl?.hue ?? {};
  const samplePoints = [24, 48, 80, 112, 144, 176, 208, 232];
  let curveEnergy = 0;

  samplePoints.forEach((sample) => {
    const delta =
      (lut.rgb[sample] - sample) * 0.6 +
      (lut.r[sample] - sample) * 0.4 +
      (lut.g[sample] - sample) * 0.3 +
      (lut.b[sample] - sample) * 0.4;
    curveEnergy += Math.abs(delta);
  });

  curveEnergy /= samplePoints.length;

  return {
    bw: Boolean(film.bw),
    sourceId: film.sourceId ?? '',
    contrast: film.contrast ?? 0,
    saturation: film.saturation ?? 0,
    vibrance: film.vibrance ?? 0,
    temperature: film.temperature ?? 0,
    tint: film.tint ?? 0,
    exposure: film.exposure ?? 0,
    highlights: film.highlights ?? 0,
    shadows: film.shadows ?? 0,
    whites: film.whites ?? 0,
    blacks: film.blacks ?? 0,
    grain: film.defaultGrainAmount ?? film.grain ?? 0,
    warmSat: (hslSat.red ?? 0) + (hslSat.orange ?? 0) + (hslSat.yellow ?? 0),
    coolSat: (hslSat.aqua ?? 0) + (hslSat.blue ?? 0) + (hslSat.purple ?? 0),
    greenSat: hslSat.green ?? 0,
    hueBias:
      (hslHue.red ?? 0) +
      (hslHue.orange ?? 0) -
      (hslHue.aqua ?? 0) -
      (hslHue.blue ?? 0),
    curveEnergy,
  };
}

function filmSignatureDistance(left, right) {
  if (left.bw !== right.bw) {
    return 999;
  }

  let distance = 0;
  distance += Math.abs(left.contrast - right.contrast) * 0.65;
  distance += Math.abs(left.saturation - right.saturation) * 0.55;
  distance += Math.abs(left.vibrance - right.vibrance) * 0.5;
  distance += Math.abs(left.temperature - right.temperature) * 0.8;
  distance += Math.abs(left.tint - right.tint) * 0.8;
  distance += Math.abs(left.exposure - right.exposure) * 14;
  distance += Math.abs(left.highlights - right.highlights) * 0.28;
  distance += Math.abs(left.shadows - right.shadows) * 0.28;
  distance += Math.abs(left.whites - right.whites) * 0.28;
  distance += Math.abs(left.blacks - right.blacks) * 0.28;
  distance += Math.abs(left.grain - right.grain) * 0.22;
  distance += Math.abs(left.warmSat - right.warmSat) * 0.18;
  distance += Math.abs(left.coolSat - right.coolSat) * 0.18;
  distance += Math.abs(left.greenSat - right.greenSat) * 0.2;
  distance += Math.abs(left.hueBias - right.hueBias) * 0.2;
  distance += Math.abs(left.curveEnergy - right.curveEnergy) * 1.2;

  return distance;
}

function selectDiverseMatches(rankedMatches, films, luts, limit = 10) {
  const selected = [];
  const selectedSourceIds = new Set();

  rankedMatches.forEach((entry) => {
    if (selected.length >= limit) {
      return;
    }

    const film = films[entry.index];
    const lut = luts[entry.index];
    if (!film || !lut) {
      return;
    }

    if (film.sourceId && selectedSourceIds.has(film.sourceId)) {
      return;
    }

    const signature = buildFilmDiversitySignature(film, lut);
    const similarityThreshold = signature.bw ? 16 : 22;
    const isTooSimilar = selected.some((picked) => {
      const distance = filmSignatureDistance(signature, picked._signature);
      return distance < similarityThreshold;
    });

    if (isTooSimilar) {
      return;
    }

    selected.push({
      ...entry,
      _signature: signature,
    });

    if (film.sourceId) {
      selectedSourceIds.add(film.sourceId);
    }
  });

  if (selected.length < limit) {
    rankedMatches.forEach((entry) => {
      if (selected.length >= limit) {
        return;
      }
      if (selected.some((picked) => picked.index === entry.index)) {
        return;
      }
      selected.push(entry);
    });
  }

  return selected.slice(0, limit).map((entry) => {
    if ('_signature' in entry) {
      const { _signature, ...rest } = entry;
      return rest;
    }
    return entry;
  });
}

function applyFilmToImageData(source, film, filmLut, strength = 1) {
  const data = new Uint8ClampedArray(source.data);
  const { rgb, r, g, b } = filmLut;
  const effectStrength = Math.max(0.4, Math.min(2.2, Number.isFinite(strength) ? strength : 1));

  const isBlackAndWhite = Boolean(film.bw);
  const contrast = 1 + ((film.contrast ?? 0) * effectStrength) / 220;
  const saturationMul = 1 + ((film.saturation ?? 0) * effectStrength) / 90;
  const vibrance = ((film.vibrance ?? 0) * effectStrength) / 90;
  const temperatureShift = (film.temperature ?? 0) * 0.45 * effectStrength;
  const tintShift = (film.tint ?? 0) * 0.35 * effectStrength;
  const exposureGain = Math.pow(2, (film.exposure ?? 0) * 0.35 * effectStrength);
  const highlightsAdjust = ((film.highlights ?? 0) / 100) * clamp01(0.72 + effectStrength * 0.28);
  const shadowsAdjust = ((film.shadows ?? 0) / 100) * clamp01(0.72 + effectStrength * 0.28);
  const whitesAdjust = ((film.whites ?? 0) / 100) * clamp01(0.72 + effectStrength * 0.28);
  const blacksAdjust = ((film.blacks ?? 0) / 100) * clamp01(0.72 + effectStrength * 0.28);
  const blackLift = (film.blacks ?? 0) * 0.18 * effectStrength;
  const regionalAdjustments = createRegionalAdjustmentsMatcher(film.hsl, effectStrength);
  const calibrationAdjustments = createCalibrationAdjustmentsMatcher(film.calibration, effectStrength);
  const colorGradeStrength = clamp01(0.45 + effectStrength * 0.35);

  for (let index = 0; index < data.length; index += 4) {
    let red = data[index];
    let green = data[index + 1];
    let blue = data[index + 2];

    red += temperatureShift;
    blue -= temperatureShift;
    green += tintShift;

    red = r[clamp(Math.round(red))];
    green = g[clamp(Math.round(green))];
    blue = b[clamp(Math.round(blue))];

    const lumaIndex = clamp(Math.round(red * 0.299 + green * 0.587 + blue * 0.114));
    const lumaShift = rgb[lumaIndex] - lumaIndex;
    red += lumaShift;
    green += lumaShift;
    blue += lumaShift;

    red *= exposureGain;
    green *= exposureGain;
    blue *= exposureGain;

    if (!isBlackAndWhite) {
      [red, green, blue] = applyRegionalColorAdjustmentsMatcher(
        red,
        green,
        blue,
        regionalAdjustments
      );
      [red, green, blue] = applyColorGradingMatcher(
        red,
        green,
        blue,
        film.colorGrade ?? null,
        colorGradeStrength
      );
      [red, green, blue] = applyCalibrationAdjustmentsMatcher(
        red,
        green,
        blue,
        calibrationAdjustments
      );
    }

    [red, green, blue] = applyToneAdjustmentsMatcher(
      red,
      green,
      blue,
      highlightsAdjust,
      shadowsAdjust,
      whitesAdjust,
      blacksAdjust
    );

    red = ((red / 255 - 0.5) * contrast + 0.5) * 255 - blackLift;
    green = ((green / 255 - 0.5) * contrast + 0.5) * 255 - blackLift;
    blue = ((blue / 255 - 0.5) * contrast + 0.5) * 255 - blackLift;

    if (isBlackAndWhite) {
      const mixer = film.grayMixer ?? {};
      const rw = 0.3 + (mixer.red ?? 0) * 0.003;
      const gw = 0.59 + (mixer.green ?? 0) * 0.003;
      const bw = 0.11 + (mixer.blue ?? 0) * 0.003;
      const sum = Math.max(0.001, rw + gw + bw);
      const gray = red * (rw / sum) + green * (gw / sum) + blue * (bw / sum);
      red = gray;
      green = gray;
      blue = gray;
    } else {
      const gray = red * 0.299 + green * 0.587 + blue * 0.114;
      let sat = saturationMul;
      if (vibrance !== 0) {
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        sat += vibrance * (1 - (max > 0 ? (max - min) / max : 0));
      }
      red = gray + (red - gray) * sat;
      green = gray + (green - gray) * sat;
      blue = gray + (blue - gray) * sat;
    }

    const grainAmount = (film.defaultGrainAmount ?? 0) * 0.18 * effectStrength;
    if (grainAmount > 0) {
      const noise = ((((index / 4) * 9301 + 49297) % 233280) / 233280 - 0.5) * grainAmount;
      red += noise;
      green += noise;
      blue += noise;
    }

    data[index] = clamp(Math.round(red));
    data[index + 1] = clamp(Math.round(green));
    data[index + 2] = clamp(Math.round(blue));
  }

  return new ImageData(data, source.width, source.height);
}

function measureImageDifference(baseImage, variantImage) {
  if (!baseImage || !variantImage || baseImage.data.length !== variantImage.data.length) {
    return 0;
  }

  const base = baseImage.data;
  const variant = variantImage.data;
  let sum = 0;
  let samples = 0;
  const step = 20; // sample every 5th pixel (RGBA => 4 channels)

  for (let index = 0; index < base.length; index += step) {
    sum += Math.abs(base[index] - variant[index]);
    sum += Math.abs(base[index + 1] - variant[index + 1]);
    sum += Math.abs(base[index + 2] - variant[index + 2]);
    samples += 3;
  }

  return samples > 0 ? sum / samples : 0;
}

function loadImageFromObjectUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nie udało się odczytać obrazu.'));
    image.src = url;
  });
}

export default function MatcherPage() {
  const fileInputRef = useRef(null);
  const baContainerRef = useRef(null);
  const draggingRef = useRef(false);
  const processingTimersRef = useRef([]);
  const logoTapTimerRef = useRef(null);
  const logoTapCountRef = useRef(0);
  const originalImageDataRef = useRef(null);
  const processCanvasRef = useRef(null);
  const hiddenCanvasRef = useRef(null);

  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);

  const [cart, setCart] = useState([]);
  const [phase, setPhase] = useState('upload');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [terminalLines, setTerminalLines] = useState(['> Uruchamianie silnika analizy kolorów...']);
  const [analysis, setAnalysis] = useState(null);
  const [_matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [processedUrl, setProcessedUrl] = useState(null);
  const [splitPosition, setSplitPosition] = useState(50);
  const [pipelineInfo, setPipelineInfo] = useState(null);
  const [comparisonSize, setComparisonSize] = useState({ width: 0, height: 0 });

  const matcherFilms = useMemo(() => {
    const generated = Array.isArray(generatedFilmStocks) ? generatedFilmStocks : [];
    const fallback = Array.isArray(filmStocks) ? filmStocks : [];
    const source = generated.length > 0 ? generated : fallback;
    return source.filter((film) => !film?.isInputProfile);
  }, []);

  const filmLuts = useMemo(
    () =>
      matcherFilms.map((film) => ({
        rgb: buildCurveLut(film.curves?.rgb ?? [[0, 0], [255, 255]], { resolution: 256, interpolation: 'monotonic', round: true }),
        r: buildCurveLut(film.curves?.r ?? [[0, 0], [255, 255]], { resolution: 256, interpolation: 'monotonic', round: true }),
        g: buildCurveLut(film.curves?.g ?? [[0, 0], [255, 255]], { resolution: 256, interpolation: 'monotonic', round: true }),
        b: buildCurveLut(film.curves?.b ?? [[0, 0], [255, 255]], { resolution: 256, interpolation: 'monotonic', round: true }),
      })),
    [matcherFilms]
  );

  const selectedFilm = useMemo(() => {
    if (!selectedMatch) return null;
    return matcherFilms[selectedMatch.index] ?? null;
  }, [matcherFilms, selectedMatch]);

  const matchScore = selectedMatch?.score ?? 0;

  const analysisBars = useMemo(() => {
    if (!analysis) {
      return [];
    }

    return [
      {
        label: 'Jasność',
        value: Math.round(analysis.brightness / 2.55),
        color: 'var(--t1)',
      },
      {
        label: 'Ciepło',
        value: clamp(Math.round(50 + analysis.warmth), 0, 100),
        color: '#e8a85d',
      },
      {
        label: 'Nasycenie',
        value: clamp(Math.round(analysis.saturation), 0, 100),
        color: 'var(--film)',
      },
      {
        label: 'Kontrast',
        value: clamp(Math.round(analysis.contrast * 2), 0, 100),
        color: '#5de88a',
      },
    ];
  }, [analysis]);

  const paletteColors = useMemo(() => {
    if (!analysis) {
      return [];
    }

    const shadow = rgbHex(analysis.avgRed * 0.4, analysis.avgGreen * 0.4, analysis.avgBlue * 0.4);
    const mid = rgbHex(analysis.avgRed, analysis.avgGreen, analysis.avgBlue);
    const accent = rgbHex(analysis.avgRed * 1.2, analysis.avgGreen * 0.85, analysis.avgBlue * 0.85);
    const highlights = rgbHex(analysis.avgRed * 1.4, analysis.avgGreen * 1.4, analysis.avgBlue * 1.4);

    return [shadow, mid, accent, highlights];
  }, [analysis]);

  const clearProcessingTimers = () => {
    processingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    processingTimersRef.current = [];
  };

  const cleanupPreviewUrl = (url) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  const generateProcessedPreview = (matchEntry) => {
    if (!matchEntry || !originalImageDataRef.current) return;

    const offscreen = processCanvasRef.current;
    if (!offscreen) return;

    const film = matcherFilms[matchEntry.index];
    const lut = filmLuts[matchEntry.index];
    if (!film || !lut) return;

    offscreen.width = originalImageDataRef.current.width;
    offscreen.height = originalImageDataRef.current.height;
    const context = offscreen.getContext('2d', { willReadFrequently: true });
    let processed = applyFilmToImageData(originalImageDataRef.current, film, lut, 1);
    let difference = measureImageDifference(originalImageDataRef.current, processed);
    if (difference < 4) {
      processed = applyFilmToImageData(originalImageDataRef.current, film, lut, 1.45);
      difference = measureImageDifference(originalImageDataRef.current, processed);
    }
    if (difference < 6) {
      processed = applyFilmToImageData(originalImageDataRef.current, film, lut, 1.85);
    }

    context.putImageData(processed, 0, 0);

    setProcessedUrl(offscreen.toDataURL('image/jpeg', 0.92));
  };

  useEffect(() => {
    const onScroll = () => {
      const nav = document.getElementById('mainNav');
      nav?.classList.toggle('scrolled', window.scrollY > 50);
    };

    onScroll();
    window.addEventListener('scroll', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const onDocClick = (event) => {
      const dropdown = document.getElementById('toolsDropdown');
      if (dropdown && !dropdown.contains(event.target)) {
        setIsToolsDropdownOpen(false);
      }
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setIsToolsDropdownOpen(false);
      }
    };

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);

    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const updateSplitFromClientX = (clientX) => {
    const container = baContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    const position = ((clientX - rect.left) / rect.width) * 100;
    setSplitPosition(clamp(Math.round(position), 0, 100));
  };

  const stopComparisonDrag = (event) => {
    draggingRef.current = false;
    const container = baContainerRef.current;
    if (!container) return;
    if (typeof event?.pointerId === 'number' && container.hasPointerCapture?.(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    if (phase !== 'results' || !selectedMatch) return;
    generateProcessedPreview(selectedMatch);
  }, [phase, selectedMatch]);

  useEffect(() => {
    document.title = isDevMode ? '🔓 Mindfullens — AI Style Matcher [DEV]' : 'Mindfullens — AI Style Matcher';
  }, [isDevMode]);

  useEffect(() => {
    return () => {
      clearProcessingTimers();
      cleanupPreviewUrl(previewUrl);
      if (logoTapTimerRef.current) {
        window.clearTimeout(logoTapTimerRef.current);
      }
    };
  }, [previewUrl]);

  const onLogoTap = (event) => {
    event.preventDefault();

    logoTapCountRef.current += 1;
    if (logoTapTimerRef.current) {
      window.clearTimeout(logoTapTimerRef.current);
    }

    logoTapTimerRef.current = window.setTimeout(() => {
      logoTapCountRef.current = 0;
    }, 1200);

    if (logoTapCountRef.current >= 7) {
      setIsDevMode(true);
      logoTapCountRef.current = 0;
    }
  };

  const addToCart = (name, price) => {
    setCart((current) => {
      if (current.some((item) => item.name === name)) return current;
      return [...current, { name, price }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (index) => {
    setCart((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const onFilePicked = async (file) => {
    if (!file) return;

    clearProcessingTimers();
    cleanupPreviewUrl(previewUrl);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPipelineInfo(null);
    setPhase('processing');
    setTerminalLines(['> Uruchamianie silnika analizy kolorów...']);
    setProcessedUrl(null);
    setSplitPosition(50);
    let asset = null;
    let activePipelineInfo = null;

    const runAnalysisFlow = (sourceImage, pipelineMeta) => {
      const sourceWidth = sourceImage.width || sourceImage.naturalWidth || 0;
      const sourceHeight = sourceImage.height || sourceImage.naturalHeight || 0;

      if (!sourceWidth || !sourceHeight) {
        throw new Error('Nie udało się odczytać wymiarów obrazu.');
      }

      const hiddenCanvas = hiddenCanvasRef.current ?? document.createElement('canvas');
      const processCanvas = processCanvasRef.current ?? document.createElement('canvas');
      hiddenCanvasRef.current = hiddenCanvas;
      processCanvasRef.current = processCanvas;

      const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
      const processCtx = processCanvas.getContext('2d', { willReadFrequently: true });

      const maxAnalysis = 220;
      let aWidth = sourceWidth;
      let aHeight = sourceHeight;
      if (aWidth > maxAnalysis || aHeight > maxAnalysis) {
        const ratio = Math.min(maxAnalysis / aWidth, maxAnalysis / aHeight);
        aWidth = Math.round(aWidth * ratio);
        aHeight = Math.round(aHeight * ratio);
      }

      hiddenCanvas.width = aWidth;
      hiddenCanvas.height = aHeight;
      hiddenCtx.drawImage(sourceImage, 0, 0, aWidth, aHeight);
      const smallData = hiddenCtx.getImageData(0, 0, aWidth, aHeight);

      const maxDisplay = 1000;
      let dWidth = sourceWidth;
      let dHeight = sourceHeight;
      if (dWidth > maxDisplay || dHeight > maxDisplay) {
        const ratio = Math.min(maxDisplay / dWidth, maxDisplay / dHeight);
        dWidth = Math.round(dWidth * ratio);
        dHeight = Math.round(dHeight * ratio);
      }

      processCanvas.width = dWidth;
      processCanvas.height = dHeight;
      processCtx.drawImage(sourceImage, 0, 0, dWidth, dHeight);
      originalImageDataRef.current = processCtx.getImageData(0, 0, dWidth, dHeight);
      setComparisonSize({ width: dWidth, height: dHeight });

      const analysisResult = analyzeImage(smallData);
      setAnalysis(analysisResult);

      const ranked = matcherFilms
        .map((film, index) => ({
          index,
          film,
          score: scoreFilmMatch(analysisResult, film),
        }))
        .sort((left, right) => right.score - left.score);
      const diverseMatches = selectDiverseMatches(ranked, matcherFilms, filmLuts, 10);
      const initialMatch = diverseMatches[0] ?? ranked[0] ?? null;

      setMatches(initialMatch ? [initialMatch] : []);
      setSelectedMatch(initialMatch);

      const pipelineLabel = getPipelineLabel(pipelineMeta);
      const pipelineMode = pipelineMeta?.pipelineKind === PIPELINE_KIND.RAW ? 'RAW' : 'Bitmap';
      const pipelineMessage =
        pipelineMeta?.status === PIPELINE_STATUS.READY
          ? pipelineMeta?.message || 'Źródło przygotowane.'
          : pipelineMeta?.message || 'Trwa przygotowanie źródła.';

      const steps = [
        { delay: 360, text: `> Pipeline: ${pipelineLabel} (${pipelineMode})` },
        {
          delay: 740,
          text: `> Jasność: ${analysisResult.brightness.toFixed(0)} | Ciepło: ${analysisResult.warmth >= 0 ? '+' : ''}${analysisResult.warmth.toFixed(0)} | Nasycenie: ${analysisResult.saturation.toFixed(0)}%`,
        },
        { delay: 1240, text: '> Skanowanie krzywych tonalnych RGB...' },
        { delay: 1780, text: '> Obliczanie histogramu i rozkładu barw...' },
        { delay: 2320, text: `> ${pipelineMessage}` },
        {
          delay: 2820,
          text: `> Dopasowywanie do bazy ${matcherFilms.length} profili filmowych...`,
        },
        {
          delay: 3480,
          text: initialMatch
            ? `> ★ Najlepsze dopasowanie: ${initialMatch.film.name} (${initialMatch.score}%)`
            : '> Brak dopasowania filmu.',
          highlight: true,
        },
      ];

      steps.forEach((step) => {
        const timer = window.setTimeout(() => {
          setTerminalLines((current) => [...current, step.text]);
        }, step.delay);
        processingTimersRef.current.push(timer);
      });

      processingTimersRef.current.push(
        window.setTimeout(() => {
          setPhase('results');
          if (initialMatch) {
            generateProcessedPreview(initialMatch);
          }
        }, 4200)
      );
    };

    try {
      const ingestResult = await ingestUploadSource({
        uploadedFile: file,
        uploadedImage: url,
        renderIntent: 'preview',
      });

      activePipelineInfo = ingestResult.pipelineInfo ?? null;
      setPipelineInfo(activePipelineInfo);
      asset = ingestResult.asset;
      let sourceImage = asset?.image ?? null;

      if (!sourceImage) {
        try {
          sourceImage = await loadImageFromObjectUrl(url);
          const fallbackInfo = {
            sourceKind: SOURCE_KIND.BITMAP,
            pipelineKind: PIPELINE_KIND.BITMAP,
            status: PIPELINE_STATUS.READY,
            message: 'Plik odczytany przez fallback bitmap.',
          };
          activePipelineInfo = fallbackInfo;
          setPipelineInfo(fallbackInfo);
        } catch (_fallbackError) {
          const message =
            activePipelineInfo?.message ||
            'Nie udało się przygotować tego pliku do analizy.';
          setTerminalLines((current) => [...current, `> ${message}`]);
          window.setTimeout(() => {
            window.alert(message);
            setPhase('upload');
            cleanupPreviewUrl(url);
            setPreviewUrl(null);
          }, 350);
          return;
        }
      }

      runAnalysisFlow(sourceImage, activePipelineInfo);
    } catch (error) {
      try {
        const fallbackImage = await loadImageFromObjectUrl(url);
        const fallbackInfo = {
          sourceKind: SOURCE_KIND.BITMAP,
          pipelineKind: PIPELINE_KIND.BITMAP,
          status: PIPELINE_STATUS.READY,
          message: 'Plik odczytany przez awaryjny fallback bitmap.',
        };
        setPipelineInfo(fallbackInfo);
        runAnalysisFlow(fallbackImage, fallbackInfo);
      } catch (_fallbackError) {
        window.alert(error?.message || 'Nie udało się odczytać obrazu. Spróbuj inny plik.');
        setPhase('upload');
        cleanupPreviewUrl(url);
        setPreviewUrl(null);
      }
    } finally {
      if (asset?.close) {
        asset.close();
      }
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    if (event.dataTransfer.files?.[0]) {
      onFilePicked(event.dataTransfer.files[0]);
    }
  };

  const resetMatcher = () => {
    clearProcessingTimers();
    cleanupPreviewUrl(previewUrl);
    setPreviewUrl(null);
    setPhase('upload');
    setTerminalLines(['> Uruchamianie silnika analizy kolorów...']);
    setAnalysis(null);
    setMatches([]);
    setSelectedMatch(null);
    setProcessedUrl(null);
    setPipelineInfo(null);
    setSplitPosition(50);
    setComparisonSize({ width: 0, height: 0 });
    originalImageDataRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);
  const comparisonAspectRatio =
    comparisonSize.width > 0 && comparisonSize.height > 0
      ? `${comparisonSize.width} / ${comparisonSize.height}`
      : '4 / 3';
  const comparisonMaxWidth =
    comparisonSize.width > 0 ? `${comparisonSize.width}px` : '100%';
  const matcherProfileCount = matcherFilms.length;

  return (
    <div className="matcher-page">
      <nav className="nav" id="mainNav">
        <div className="nav-inner">
          <a href="#" className="nav-logo" onClick={onLogoTap}>
            <img src="/logo.png" alt="Mindfullens Logo" />
            Mindfullens
          </a>

          <div className={`nav-links ${isMobileMenuOpen ? 'active' : ''}`} id="navLinks">
            <a href="https://mindfullens.pl" className="nav-link">
              Strona Główna
            </a>

            <div className={`nav-dropdown ${isToolsDropdownOpen ? 'open' : ''}`} id="toolsDropdown">
              <button
                className="nav-dropdown-trigger"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsToolsDropdownOpen((current) => !current);
                }}
              >
                Narzędzia <span className="nav-dropdown-arrow">▾</span>
              </button>

              <div className="mega-menu">
                <div className="mega-menu-grid">
                  <a href="https://mindfullens.pl/film-lab/" className="mega-item">
                    <div className="mega-item-icon">⚗️</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">Film Lab <span className="mega-item-tag mega-item-tag-free">Free</span></div>
                      <div className="mega-item-desc">Wgraj zdjęcie i nakładaj symulacje klisz</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/live/" className="mega-item">
                    <div className="mega-item-icon">📸</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">Live Cam <span className="mega-item-tag mega-item-tag-free">Free</span></div>
                      <div className="mega-item-desc">Testuj profile na żywo kamerą</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/timemachine/" className="mega-item">
                    <div className="mega-item-icon">⏳</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">Time Machine <span className="mega-item-tag mega-item-tag-new">Nowe</span></div>
                      <div className="mega-item-desc">Symulacja starzenia kliszy</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/matcher/" className="mega-item active-tool">
                    <div className="mega-item-icon">🧠</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">AI Matcher <span className="mega-item-tag mega-item-tag-pro">AI</span></div>
                      <div className="mega-item-desc">AI dopasuje idealny profil</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/ciemnia/" className="mega-item">
                    <div className="mega-item-icon">🧪</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">Wirtualna Ciemnia <span className="mega-item-tag mega-item-tag-new">Nowe</span></div>
                      <div className="mega-item-desc">Stwórz recepturę filmową od zera</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/blendstudio/" className="mega-item">
                    <div className="mega-item-icon">⚗️</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">Blend Studio <span className="mega-item-tag mega-item-tag-new">Nowe</span></div>
                      <div className="mega-item-desc">Miksuj dwie klisze w jedno zdjęcie</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/contact-sheet/" className="mega-item">
                    <div className="mega-item-icon">🎞️</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">Contact Sheet</div>
                      <div className="mega-item-desc">100+ profili na jednym arkuszu</div>
                    </div>
                  </a>
                  <a href="https://mindfullens.pl/color-sync/" className="mega-item">
                    <div className="mega-item-icon">🔄</div>
                    <div className="mega-item-text">
                      <div className="mega-item-name">Color Sync <span className="mega-item-tag mega-item-tag-pro">Pro</span></div>
                      <div className="mega-item-desc">Zrównaj kolory z 2-3 aparatów</div>
                    </div>
                  </a>
                </div>
                <div className="mega-footer">
                  <span className="mega-footer-text">Wszystkie narzędzia w jednym pakiecie</span>
                  <a href="https://mindfullens.pl/cennik/" className="mega-footer-btn">Complete Studio</a>
                </div>
              </div>
            </div>

            <a href="https://mindfullens.pl/analog-signature/" className="nav-link nav-link-red">
              Analog Signature
            </a>
          </div>

          <div className="nav-actions">
            <button
              className="nav-mobile-toggle"
              type="button"
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              aria-label="Menu"
            >
              ☰
            </button>
            <button className="nav-cta" type="button" onClick={() => setIsCartOpen((current) => !current)}>
              Koszyk <span className="cart-count">{cart.length}</span>
            </button>
          </div>
        </div>
      </nav>

      <section className="matcher-section">
        <div className="hero-glow-1" />
        <div className="hero-glow-2" />

        {phase === 'upload' ? (
          <>
            <div className="matcher-header" id="matcherHeader">
              <div className="matcher-badge"><span className="dot" />AI Style Matcher · {matcherProfileCount} profili</div>
              <h1>
                Odkryj tajemnicę <em>idealnego koloru</em>
              </h1>
              <p>
                Wgraj zdjęcie-inspirację. Algorytm przeanalizuje kolorystykę, światło i kontrast, a potem dobierze
                najlepsze profile z kolekcji Mindfullens.
              </p>
            </div>

            <div
              className="upload-area"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <div className="upload-icon">📸</div>
              <div className="upload-title">Upuść inspirację tutaj</div>
              <div className="upload-desc">RAW / DNG · JPG · PNG · TIFF · WebP</div>
              <button className="upload-btn" type="button">Wybierz z dysku</button>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_INPUT_ACCEPT}
                style={{ display: 'none' }}
                onChange={(event) => onFilePicked(event.target.files?.[0])}
              />
            </div>
          </>
        ) : null}

        {phase === 'processing' ? (
          <div className="processing-area">
            <div className="image-preview-wrapper">
              <img src={previewUrl ?? ''} alt="Analiza" />
              <div className="scanner-line" />
            </div>
            <div className="terminal">
              {terminalLines.map((line, index) => (
                <p key={`${line}-${index}`} className={line.startsWith('> ★') ? 'hi' : ''}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {phase === 'results' && analysis && selectedFilm ? (
          <div className="results-area">
            <div className="results-header">
              <h2>Analiza zakończona</h2>
              <p>Przesuń suwak, aby porównać oryginał z profilem filmowym</p>
            </div>

            <div className="results-grid">
              <div className="result-image-col">
                <div
                  className="ba-container"
                  style={{
                    aspectRatio: comparisonAspectRatio,
                    maxWidth: comparisonMaxWidth,
                  }}
                  ref={baContainerRef}
                  onPointerDown={(event) => {
                    draggingRef.current = true;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    updateSplitFromClientX(event.clientX);
                  }}
                  onPointerMove={(event) => {
                    if (!draggingRef.current) return;
                    updateSplitFromClientX(event.clientX);
                  }}
                  onPointerUp={stopComparisonDrag}
                  onPointerCancel={stopComparisonDrag}
                  onLostPointerCapture={() => {
                    draggingRef.current = false;
                  }}
                >
                  <img className="ba-image" src={processedUrl ?? previewUrl ?? ''} alt="Processed" id="processedImage" />

                  <div
                    className="ba-original"
                    style={{
                      clipPath: `inset(0 ${100 - splitPosition}% 0 0)`,
                      WebkitClipPath: `inset(0 ${100 - splitPosition}% 0 0)`,
                    }}
                  >
                    <img className="ba-image" src={previewUrl ?? ''} alt="Original" id="originalImage" />
                  </div>

                  <div className="ba-line" style={{ left: `${splitPosition}%` }} />
                  <div className="ba-handle" style={{ left: `${splitPosition}%` }} />
                  <div className="ba-label ba-label-before">Oryginał</div>
                  <div className="ba-label ba-label-after">Profil</div>
                </div>

                <div className="color-palette">
                  {paletteColors.map((hex) => (
                    <div key={hex} className="color-swatch" style={{ background: hex }}>
                      {hex}
                    </div>
                  ))}
                </div>

                <div className="analysis-panel">
                  <div className="analysis-title">Analiza obrazu</div>
                  {pipelineInfo ? (
                    <div className="pipeline-chip">
                      {getPipelineLabel(pipelineInfo)}
                      {pipelineInfo.pipelineKind === PIPELINE_KIND.RAW ? ' · RAW' : ' · Bitmap'}
                    </div>
                  ) : null}
                  <div className="analysis-bars">
                    {analysisBars.map((bar) => (
                      <div className="analysis-bar" key={bar.label}>
                        <span className="analysis-bar-label">{bar.label}</span>
                        <div className="analysis-bar-track">
                          <div className="analysis-bar-fill" style={{ width: `${bar.value}%`, background: bar.color }} />
                        </div>
                        <span className="analysis-bar-val">{bar.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="result-info-col">
                <span className="match-score">★ {matchScore}% Match</span>
                <h2 className="match-title">{selectedFilm.name}</h2>
                <div className="match-sub">{selectedFilm.sub}</div>
                <p className="match-desc">{CATEGORY_DESCRIPTION[selectedFilm.cat] ?? CATEGORY_DESCRIPTION.neg}</p>

                {selectedMatch ? (
                  <div className="top-matches">
                    <div className="top-matches-title">Najlepsze Dopasowanie</div>
                    <div className="match-item active">
                      <span className="match-rank">#1</span>
                      <span className="match-item-name">{selectedMatch.film.name}</span>
                      <span className="match-item-score">{selectedMatch.score}%</span>
                    </div>
                  </div>
                ) : null}

                <div className="recipes-locked">
                  <div className="recipes-title">
                    <span>Receptura Lightroom</span>
                    <span>{isDevMode ? '🔓' : '🔒'}</span>
                  </div>

                  <div className={`recipes-blur ${isDevMode ? 'unlocked' : ''}`}>
                    <div>Tone Curve: Custom S-Curve</div>
                    <div>HSL Red Hue: +15</div>
                    <div>Split Toning: Warm/Cool</div>
                    <div>Grain: 18 / Size 24</div>
                    <div>Vibrance: +30</div>
                    <div>Clarity: -5</div>
                  </div>

                  {!isDevMode ? (
                    <div className="lock-overlay">
                      <div className="lock-icon">🔒</div>
                      <div className="lock-text">Receptura zastrzeżona</div>
                    </div>
                  ) : null}
                </div>

                <div className="result-actions">
                  <button
                    className="btn-buy"
                    type="button"
                    onClick={() => document.getElementById('premium-offer')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Zdobądź profil w pakiecie
                  </button>
                  <button className="btn-secondary" type="button" onClick={resetMatcher}>
                    Przeanalizuj inne zdjęcie
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {!isDevMode ? (
        <section id="premium-offer" className="fade-element">
          <div className="offer-banner-wrapper">
            <div className="offer-banner">
              <div className="offer-content">
                <span className="offer-tag">✦ Odblokuj Pełną Moc</span>
                <h3>Wybierz swój pakiet</h3>
                <div className="offer-highlight">Profile Lightroom, receptury Camera App, system Analog Signature i 9 narzędzi AI.</div>
                <p>
                  Wybierz rozwiązanie idealne dla siebie. Kup pakiet <strong>Complete Studio</strong> i otrzymaj wszystkie
                  nasze produkty w jednym: potężny ekosystem do edycji plików RAW (.xmp), gotowe ustawienia JPEG
                  prosto z aparatu oraz dożywotni dostęp do wszystkich narzędzi webowych.
                </p>
              </div>
              <button className="offer-btn" type="button" onClick={() => window.open('https://mindfullens.pl/cennik/', '_self')}>
                Zobacz pakiety →
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <a href="https://mindfullens.pl/" className="nav-logo" onClick={(event) => event.preventDefault()}>
              <img src="/logo.png" alt="Mindfullens" />Mindfullens
            </a>
            <p className="footer-desc">Profile filmowe i narzędzia AI dla fotografów.</p>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Narzędzia</div>
            <a href="https://mindfullens.pl/produkty/">Presety</a>
            <a href="https://mindfullens.pl/film-lab/">Film Lab</a>
            <a href="https://mindfullens.pl/matcher/">AI Matcher</a>
            <a href="https://mindfullens.pl/live/">Live Cam</a>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Wsparcie</div>
            <a href="https://mindfullens.pl/cennik/">FAQ</a>
            <a href="https://mindfullens.pl/cennik/">Kontakt</a>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Bezpieczeństwo</div>
            <div className="footer-note">✔️ 30-dniowa gwarancja</div>
            <div className="footer-note">🔒 Bezpieczne płatności</div>
          </div>
        </div>

        <div className="footer-bottom">
          <div>© 2026 Mindfullens.</div>
          <div className="footer-legal">
            <a href="https://mindfullens.pl/cennik/">Regulamin</a>
            <a href="https://mindfullens.pl/cennik/">Prywatność</a>
          </div>
        </div>
      </footer>

      <div className={`cart-drawer ${isCartOpen ? 'open' : ''}`}>
        <div className="cart-drawer-header">
          <div className="cart-drawer-title">Koszyk</div>
          <button className="modal-close" type="button" onClick={() => setIsCartOpen(false)}>
            ✕
          </button>
        </div>
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="cart-empty">Koszyk pusty.</div>
          ) : (
            cart.map((item, index) => (
              <div className="cart-item" key={`${item.name}-${index}`}>
                <div>
                  <div className="cart-item-name">{item.name}</div>
                  <div className="cart-item-price">{item.price} PLN</div>
                </div>
                <button className="cart-item-remove" type="button" onClick={() => removeFromCart(index)}>
                  Usuń
                </button>
              </div>
            ))
          )}
        </div>
        <div className="cart-footer">
          <div className="cart-total">
            <span className="cart-total-label">Razem</span>
            <span>{cartTotal} PLN</span>
          </div>
          <button
            className="btn-buy-card"
            type="button"
            onClick={() => {
              if (cart.length === 0) return;
              window.open('https://mindfullens.pl/cennik/', '_self');
            }}
          >
            Przejdź do kasy →
          </button>
        </div>
      </div>

      {phase === 'results' ? (
        <button className="floating-buy" type="button" onClick={() => addToCart(`AI Match: ${selectedFilm.name}`, 19)}>
          Dodaj profil do koszyka · 19 PLN
        </button>
      ) : null}
    </div>
  );
}
