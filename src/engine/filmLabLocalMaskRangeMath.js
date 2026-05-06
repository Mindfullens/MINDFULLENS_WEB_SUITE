/**
 * Luma / hue-chroma / depth-proxy range weights dla lokalnych masek (CPU preview + eksport).
 * Depth (P2): proxy z luminancji sceny × pędzel — prawdziwa mapa głębi = osobna faza.
 * Jedna implementacja — preview i `computeLocalMaskWeightAtPixel` pozostają zsynchronizowane.
 */

import { clampUnit, rgbRec709LumaUnit, smoothstep } from './colorMathShared.js';

/**
 * Wartość „głębi” w zakresie 0–1 dla piksela: opcjonalny bufor per-piksel, inaczej luminancja Rec.709 (proxy).
 *
 * @param {{ depthProxyBuffer?: Float32Array | null }} maskEntry
 */
export function resolveDepthProxy01(maskEntry, pixelIdx, red, green, blue) {
  const buf = maskEntry?.depthProxyBuffer;
  if (buf instanceof Float32Array && pixelIdx >= 0 && pixelIdx < buf.length) {
    const raw = Number(buf[pixelIdx]);
    if (Number.isFinite(raw)) {
      return clampUnit(raw);
    }
  }
  return rgbRec709LumaUnit(red, green, blue);
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) {
    return [0, 0, lightness];
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
      break;
  }

  return [hue / 6, saturation, lightness];
}

function circularHueDistance(a, b) {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

/**
 * @param {object} maskEntry wpis jak ze `buildLocalMaskStackSnapshot` (luma i color: parametry 0–1, hue w stopniach).
 * @param {number} pixelIdx
 * @param {number} red 0–255
 * @param {number} green 0–255
 * @param {number} blue 0–255
 * @returns {number} waga 0–1
 */
export function computeLocalMaskWeightAtPixel(maskEntry, pixelIdx, red, green, blue) {
  /**
   * Geometria maski (pędzel / linear / radial / raster AI) — wyłącznie z bufora.
   * Brak ważnego bufora = 0 (np. tryb pędzla bez żadnego pociągnięcia), nie „pełna ramka” —
   * inaczej rubylith i podgląd pokazują całe zdjęcie na niebiesko.
   */
  let spatial = 0;
  const buf = maskEntry.buffer;
  if (buf instanceof Float32Array && pixelIdx >= 0 && pixelIdx < buf.length) {
    spatial = clampUnit(buf[pixelIdx]);
  } else if (maskEntry.mode === 'luma' || maskEntry.mode === 'color') {
    // Zakres Luma/Barwa bez warstwy geometrycznej = cały kadr (bufor tylko gdy jest pędzel/inna geometria).
    spatial = 1;
  }
  if (maskEntry.mode === 'luma') {
    const luma = rgbRec709LumaUnit(red, green, blue);
    const lumaMin = clampUnit(Math.min(maskEntry.lumaMin ?? 0, maskEntry.lumaMax ?? 1));
    const lumaMax = clampUnit(Math.max(maskEntry.lumaMin ?? 0, maskEntry.lumaMax ?? 1));
    const feather = clampUnit(maskEntry.lumaFeather ?? 0.35);
    const edge = Math.max(0.003, feather * 0.38);
    const left = smoothstep(lumaMin - edge, lumaMin + edge, luma);
    const right = 1 - smoothstep(lumaMax - edge, lumaMax + edge, luma);
    const rangeWeight = clampUnit(left * right);
    return clampUnit(spatial * rangeWeight);
  }
  if (maskEntry.mode === 'color') {
    const [hueUnit, sat] = rgbToHsl(red, green, blue);
    const hueDeg = hueUnit * 360;
    const center = ((Number(maskEntry.colorHueCenter ?? 210) % 360) + 360) % 360;
    const widthHue = Math.max(1, Math.min(180, Number(maskEntry.colorHueWidth ?? 90)));
    const feather = clampUnit(maskEntry.colorFeather ?? 0.35);
    const edge = Math.max(2, widthHue * (0.18 + feather * 0.48));
    const hueDist = circularHueDistance(hueDeg, center);
    const hueWeight = 1 - smoothstep(widthHue - edge, widthHue + edge, hueDist);

    const satMin = clampUnit(Number(maskEntry.colorChromaMin ?? 0));
    const satMax = clampUnit(Math.max(satMin, Number(maskEntry.colorChromaMax ?? 1)));
    const chromaEdge = Math.max(0.003, feather * 0.14);
    const left =
      satMin <= 0.00001 ? 1 : smoothstep(satMin - chromaEdge, satMin + chromaEdge, sat);
    const right =
      satMax >= 0.99999 ? 1 : 1 - smoothstep(satMax - chromaEdge, satMax + chromaEdge, sat);
    const chromaWeight = clampUnit(left * right);
    const rangeWeight = clampUnit(hueWeight * chromaWeight);
    return clampUnit(spatial * rangeWeight);
  }
  if (maskEntry.mode === 'depth') {
    const brushW = buf instanceof Float32Array && pixelIdx < buf.length ? buf[pixelIdx] : 0;
    const depthProxy = resolveDepthProxy01(maskEntry, pixelIdx, red, green, blue);
    const dMin = clampUnit(Math.min(maskEntry.depthMin ?? 0, maskEntry.depthMax ?? 1));
    const dMax = clampUnit(Math.max(maskEntry.depthMin ?? 0, maskEntry.depthMax ?? 1));
    const feather = clampUnit(maskEntry.depthFeather ?? 0.35);
    const edge = Math.max(0.005, feather * 0.42);
    const left = smoothstep(dMin - edge, dMin + edge, depthProxy);
    const right = 1 - smoothstep(dMax - edge, dMax + edge, depthProxy);
    const rangeW = clampUnit(left * right);
    return clampUnit(brushW * rangeW);
  }
  return spatial;
}
