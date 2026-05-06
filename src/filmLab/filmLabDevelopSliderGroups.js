/**
 * Jedno źródło kolejności suwaków jak w panelu „Edycja” (Basic / Color).
 * Maski używają równoległych kluczy `brushMask*` — ten sam układ, ten sam pipeline mapowań.
 */

/** Panel Basic → Światło (jak `FilmLabRightPanel` / zakładka tonalna) */
export const DEVELOP_BASIC_LIGHT_KEYS = Object.freeze([
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
]);

const DEVELOP_TO_MASK_LIGHT = Object.freeze({
  exposure: 'brushMaskExposure',
  contrast: 'brushMaskContrast',
  highlights: 'brushMaskHighlights',
  shadows: 'brushMaskShadows',
  whites: 'brushMaskWhites',
  blacks: 'brushMaskBlacks',
});

/** Suwaki tonacji przypisane do aktywnej maski (wartości w `adjustments`) */
export const MASK_BASIC_LIGHT_KEYS = Object.freeze(
  DEVELOP_BASIC_LIGHT_KEYS.map((k) => DEVELOP_TO_MASK_LIGHT[k]),
);

/** Panel Color → kolor bazowy: temp jako zwykły suwak Kelvin; tint/sat jak custom w panelu */
export const DEVELOP_BASE_COLOR_KEYS = Object.freeze(['temp', 'tint', 'saturation']);

const DEVELOP_TO_MASK_COLOR = Object.freeze({
  temp: 'brushMaskTemp',
  tint: 'brushMaskTint',
  saturation: 'brushMaskSaturation',
});

export const MASK_BASE_COLOR_KEYS = Object.freeze(
  DEVELOP_BASE_COLOR_KEYS.map((k) => DEVELOP_TO_MASK_COLOR[k]),
);

/** Które z koloru bazowego są obsługiwane przez `renderCustomSlider` (jak w `FilmLabRightPanel`) */
export const MASK_BASE_COLOR_CUSTOM_KEYS = Object.freeze(['brushMaskTint', 'brushMaskSaturation']);
