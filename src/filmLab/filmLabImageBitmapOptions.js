/**
 * Dekodowanie ImageBitmap: domyślnie **`imageOrientation: 'from-image'`** — przeglądarka stosuje EXIF
 * na poziomie dekodera (C++); Canvas rysuje prostym „contain” bez podwójnego ctx.rotate.
 * Fallback: `'none'`, potem surowe opts, potem goły blob.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap
 */

/** Legacy: jawne wyłączenie auto-orientacji (np. testy / ścieżki wyjątkowe). */
export const FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE = Object.freeze({
  imageOrientation: 'none',
});

/**
 * Limit na jeden `createImageBitmap` call — chroni przed zawieszeniem natywnego dekodera na surowym RAW.
 */
const DECODE_ATTEMPT_TIMEOUT_MS = 5000;

/**
 * @param {Blob} blob
 * @param {ImageBitmapOptions} [opts]
 * @returns {Promise<ImageBitmap>}
 */
function createImageBitmapWithTimeout(blob, opts) {
  const call = opts !== undefined ? createImageBitmap(blob, opts) : createImageBitmap(blob);
  const timeout = new Promise((_, reject) => {
    const h = setTimeout(() => {
      reject(new Error(`createImageBitmap timed out after ${DECODE_ATTEMPT_TIMEOUT_MS}ms`));
    }, DECODE_ATTEMPT_TIMEOUT_MS);
    call.then(() => clearTimeout(h), () => clearTimeout(h));
  });
  return Promise.race([call, timeout]);
}

/**
 * @param {Blob} blob
 * @param {ImageBitmapOptions} [opts={}]
 * @returns {Promise<ImageBitmap>}
 */
export async function createFilmLabImageBitmap(blob, opts = {}) {
  if (!blob || blob.size === 0) {
    console.error('[ImageBitmap] Empty or invalid blob provided');
    throw new Error('Invalid Blob');
  }
  try {
    return await createImageBitmapWithTimeout(blob, {
      ...opts,
      imageOrientation: 'from-image',
    });
  } catch (_err1) {
    try {
      return await createImageBitmapWithTimeout(blob, {
        ...opts,
        imageOrientation: 'none',
      });
    } catch (_err2) {
      try {
        return await createImageBitmapWithTimeout(blob, opts);
      } catch (_err3) {
        return await createImageBitmapWithTimeout(blob);
      }
    }
  }
}

/**
 * Piksele dokładnie jak w pliku (bez EXIF transform). Używane np. gdy orientacja EXIF 1–8
 * jest stosowana osobno przez `drawImageBitmapToRectWithOrientation` (DNG: tag w TIFF, brak w JPEG).
 */
export async function createFilmLabImageBitmapAsStoredInFile(blob, opts = {}) {
  if (!blob || blob.size === 0) {
    console.error('[ImageBitmap] Empty or invalid blob provided');
    throw new Error('Invalid Blob');
  }
  try {
    return await createImageBitmapWithTimeout(blob, {
      ...opts,
      imageOrientation: 'none',
    });
  } catch (_err1) {
    try {
      return await createImageBitmapWithTimeout(blob, opts);
    } catch (_err2) {
      return await createImageBitmapWithTimeout(blob);
    }
  }
}
