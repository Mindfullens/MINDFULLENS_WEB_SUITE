/**
 * Eksport DNG **wariant A** (derivative light) — kontener TIFF-like z tagami DNG (SPIKE §4.6).
 * Zapis przez `utif` (`UTIF.encode`), ten sam tor co `npm run spike:dng`.
 *
 * @see docs/hme/DNG-VARIANT-A-LICENSES-AND-PLAN.md
 * @see docs/hme/EXPORT-PSD-DNG-SPIKE.md §4.6–4.7
 */

import UTIF from 'utif';

/** Offset pierwszego bajtu strip RGB (nagłówek IFD musi się mieścić przed tą wartością — jak w SPIKE). */
export const FILMLAB_DNG_VARIANT_A_STRIP_BYTE_OFFSET = 1000;

let dngTagTypesRegistered = false;

/**
 * Rejestruje typy TIFF dla tagów DNG (50706, 50707, 50721), wymagane przez `utif` przy zapisie.
 */
export function ensureUtifDngTagTypesRegistered() {
  if (dngTagTypesRegistered) {
    return;
  }
  UTIF.ttypes[50706] = 4;
  UTIF.ttypes[50707] = 4;
  UTIF.ttypes[50721] = 2;
  dngTagTypesRegistered = true;
}

/** Domyślne tagi DNG dla derivative light (SPIKE binarny). */
export const FILMLAB_DNG_DERIVATIVE_LIGHT_TAGS_DEFAULT = Object.freeze({
  t50706: [0x01040000 >>> 0],
  t50707: [0x01010000 >>> 0],
  t50721: ['Mindfullens Film Lab'],
});

/**
 * @param {ImageData} imageData
 * @returns {Uint8Array} RGB packed, length width×height×3
 */
export function stripRgbPackedFromImageData(imageData) {
  const { width, height, data } = imageData;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return rgb;
}

/**
 * Niekompletowany TIFF RGB 8-bit, jeden strip, Photometric RGB — jak SPIKE `encodeRgbTiff`.
 *
 * @param {Uint8Array} stripRgb — dokładnie `width * height * 3` bajtów
 * @param {number} width
 * @param {number} height
 * @param {{ extraIfdFields?: Record<string, unknown>, software?: string }} [opts]
 * @returns {ArrayBuffer}
 */
export function encodeDerivativeLightRgbTiffArrayBuffer(stripRgb, width, height, opts = {}) {
  const expected = width * height * 3;
  if (!(stripRgb instanceof Uint8Array) || stripRgb.length !== expected) {
    throw new RangeError(`stripRgb length ${stripRgb?.length ?? 0}, expected ${expected}`);
  }
  ensureUtifDngTagTypesRegistered();
  const stripOffset = FILMLAB_DNG_VARIANT_A_STRIP_BYTE_OFFSET;
  const software = opts.software ?? 'Mindfullens Film Lab';
  const extraIfdFields = opts.extraIfdFields ?? {};

  const idf = {
    t256: [width],
    t257: [height],
    t258: [8, 8, 8],
    t259: [1],
    t262: [2],
    t273: [stripOffset],
    t274: [1],
    t277: [3],
    t278: [height],
    t279: [expected],
    t282: [72, 1],
    t283: [72, 1],
    t284: [1],
    t296: [1],
    t305: [software],
    t338: [1],
    ...extraIfdFields,
  };

  const prfx = new Uint8Array(UTIF.encode([idf]));
  const img = stripRgb;
  const data = new Uint8Array(stripOffset + img.length);
  for (let i = 0; i < prfx.length; i += 1) {
    data[i] = prfx[i];
  }
  for (let i = 0; i < img.length; i += 1) {
    data[stripOffset + i] = img[i];
  }
  return data.buffer;
}

/**
 * Plik `.dng` (derivative light): TIFF RGB + domyślne tagi DNG z {@link FILMLAB_DNG_DERIVATIVE_LIGHT_TAGS_DEFAULT}.
 *
 * @param {Uint8Array} stripRgb
 * @param {number} width
 * @param {number} height
 * @param {{ extraIfdFields?: Record<string, unknown>, software?: string }} [opts]
 * — `extraIfdFields` scala się **nad** domyślne tagi DNG (nadpisanie `t50721` itd.).
 * @returns {ArrayBuffer}
 */
export function encodeDerivativeLightDngArrayBuffer(stripRgb, width, height, opts = {}) {
  const merged = {
    ...FILMLAB_DNG_DERIVATIVE_LIGHT_TAGS_DEFAULT,
    ...(opts.extraIfdFields ?? {}),
  };
  return encodeDerivativeLightRgbTiffArrayBuffer(stripRgb, width, height, {
    software: opts.software,
    extraIfdFields: merged,
  });
}

/** MIME dla pobrania `.dng` (kontener TIFF-like). */
export const FILMLAB_EXPORT_DNG_MIME_TYPE = 'image/x-adobe-dng';

/**
 * Ekspozycja na podglądzie eksportu — ten sam canvas co PSD/raster (po ostrzeniu).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ software?: string, extraIfdFields?: Record<string, unknown> }} [opts]
 * @returns {{ bytes: Uint8Array, extension: 'dng', mimeType: string }}
 */
export function encodeFilmLabExportDngDerivativeLightFromCanvas(canvas, opts = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx =
    canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Film Lab DNG export: 2D context unavailable');
  }
  const imageData = ctx.getImageData(0, 0, w, h);
  const strip = stripRgbPackedFromImageData(imageData);
  const buf = encodeDerivativeLightDngArrayBuffer(strip, w, h, {
    software: opts.software ?? 'Mindfullens Film Lab',
    extraIfdFields: opts.extraIfdFields,
  });
  return {
    bytes: new Uint8Array(buf),
    extension: 'dng',
    mimeType: FILMLAB_EXPORT_DNG_MIME_TYPE,
  };
}
