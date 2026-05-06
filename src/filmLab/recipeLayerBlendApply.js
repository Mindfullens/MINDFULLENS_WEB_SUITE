/**
 * Recipe layers v0 — mieszanie tonacji z maską (normal / multiply / screen).
 */

import { clamp } from '../engine/colorMathShared.js';
import { applyExposureGainWithShoulder } from '../engine/filmLabExposureGainShoulder.js';

export const RECIPE_LAYER_BLEND_MODES = ['normal', 'multiply', 'screen'];

/**
 * @param {unknown} raw
 * @returns {'normal' | 'multiply' | 'screen'}
 */
export function normalizeRecipeLayerBlendMode(raw) {
  const s = String(raw ?? 'normal').toLowerCase();
  return RECIPE_LAYER_BLEND_MODES.includes(s) ? s : 'normal';
}

/**
 * @param {number} red 0..255
 * @param {number} green
 * @param {number} blue
 * @param {number} maskWeight 0..1 — waga maski na piksel
 * @param {object} layer — wpis recipeLayersV0 (exposure, opacity, blendMode)
 */
export function applyRecipeLayerToneRgb(red, green, blue, maskWeight, layer) {
  const exp = Number(layer?.exposure ?? 0);
  const layerOpacity = Math.max(0, Math.min(1, Number(layer?.opacity ?? 100) / 100));
  const w = Number(maskWeight);
  const strength = w * layerOpacity;
  if (strength <= 1e-6 || Math.abs(exp) < 0.01) {
    return [red, green, blue];
  }

  const mode = normalizeRecipeLayerBlendMode(layer?.blendMode);

  if (mode === 'normal') {
    const localGain = Math.pow(2, (exp / 100) * strength * 0.75);
    return applyExposureGainWithShoulder(red, green, blue, localGain);
  }

  if (mode === 'multiply') {
    const k = Math.pow(2, (exp / 100) * 0.72);
    const m = 1 + (k - 1) * strength;
    return [clamp(red * m), clamp(green * m), clamp(blue * m)];
  }

  let r = red;
  let g = green;
  let b = blue;
  const kPos = Math.pow(2, Math.max(0, exp / 100) * 0.62);
  const tLift = strength * Math.min(0.85, Math.max(0, kPos - 1));
  r += (255 - r) * tLift * 0.55;
  g += (255 - g) * tLift * 0.55;
  b += (255 - b) * tLift * 0.55;
  if (exp < 0) {
    const km = Math.pow(2, (exp / 100) * 0.72);
    const mm = 1 + (km - 1) * strength;
    r *= mm;
    g *= mm;
    b *= mm;
  }
  return [clamp(r), clamp(g), clamp(b)];
}
